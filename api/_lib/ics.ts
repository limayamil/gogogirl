// Lectura de un feed iCal de Google: expande recurrencias y se queda con lo que
// cae en el dia de hoy en Buenos Aires. Funciones puras, sin red: el fetch y el
// cache viven en calendars.ts.

import ICAL from 'ical.js'
import sanitizeHtml from 'sanitize-html'
import type {
  Meeting,
  MeetingAttachment,
  MeetingAttendee,
  MeetingPerson,
  MeetingResponse,
} from '../../src/shared/types.ts'

type Component = InstanceType<typeof ICAL.Component>
type Time = InstanceType<typeof ICAL.Time>
type IcalEvent = InstanceType<typeof ICAL.Event>

export const MEETINGS_TIME_ZONE = 'America/Argentina/Buenos_Aires'

// Argentina no tiene horario de verano: el dia arranca siempre a las 00:00 -03:00.
const OFFSET_MS = 3 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

// Una serie diaria de hace diez anos son unas 3650 vueltas. El tope corta una
// regla absurda (cada minuto, sin fin) antes de que cuelgue la funcion.
const MAX_OCCURRENCES = 20_000

const DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: MEETINGS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

// Google manda los VTIMEZONE que usa, pero no hace falta depender de eso para la
// zona de la app.
ICAL.TimezoneService.register(
  ICAL.Component.fromString(`BEGIN:VTIMEZONE
TZID:${MEETINGS_TIME_ZONE}
BEGIN:STANDARD
TZOFFSETFROM:-0300
TZOFFSETTO:-0300
TZNAME:-03
DTSTART:19700101T000000
END:STANDARD
END:VTIMEZONE`),
)

export interface DayWindow {
  date: string
  startMs: number
  endMs: number
}

/** Hoy en Buenos Aires, sin importar la zona del servidor ni la del navegador. */
export function buenosAiresDay(now: Date): DayWindow {
  const date = DAY_FORMAT.format(now)
  const startMs = Date.parse(`${date}T00:00:00-03:00`)
  return { date, startMs, endMs: startMs + DAY_MS }
}

export function parseCalendar(text: string): Component {
  const calendar = new ICAL.Component(ICAL.parse(text))
  if (calendar.name !== 'vcalendar') throw new Error('No es un calendario iCal')
  for (const zone of calendar.getAllSubcomponents('vtimezone')) {
    ICAL.TimezoneService.register(zone)
  }
  return calendar
}

/**
 * Un dia completo o una hora sin zona (flotante) se leen como hora de Buenos
 * Aires. Si no, toJSDate usaria la zona del servidor, que en Netlify es UTC.
 */
function toMs(time: Time): number {
  if (time.isDate || !time.zone || time.zone.tzid === 'floating') {
    const hour = time.isDate ? 0 : time.hour
    const minute = time.isDate ? 0 : time.minute
    const second = time.isDate ? 0 : time.second
    return Date.UTC(time.year, time.month - 1, time.day, hour, minute, second) + OFFSET_MS
  }
  return time.toJSDate().getTime()
}

function overlapsDay(startMs: number, endMs: number, day: DayWindow): boolean {
  // Un evento sin duracion igual ocupa su instante.
  return startMs < day.endMs && Math.max(endMs, startMs + 1) > day.startMs
}

function cancelled(component: Component): boolean {
  const status = component.getFirstPropertyValue('status')
  return typeof status === 'string' && status.toUpperCase() === 'CANCELLED'
}

function textValue(component: Component, name: string): string | null {
  const value = component.getFirstPropertyValue(name)
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const MEET_RE = /https:\/\/meet\.google\.com\/[a-z0-9][a-z0-9-]*(?:\?[^\s"'<>]*)?/i

function meetHost(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' && parsed.hostname === 'meet.google.com'
  } catch {
    return false
  }
}

/**
 * El link de Meet: primero el campo propio de Google, despues el que aparece en
 * el lugar o en la descripcion. Solo https://meet.google.com, para que el boton
 * "Unirme" no abra cualquier cosa que venga en el feed.
 */
export function meetLink(component: Component): string | null {
  const conference = textValue(component, 'x-google-conference')
  if (conference && meetHost(conference)) return conference
  for (const field of ['location', 'description']) {
    const match = textValue(component, field)?.match(MEET_RE)
    if (match && meetHost(match[0])) return match[0]
  }
  return null
}

function stripMailto(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const email = value.replace(/^mailto:/i, '').trim()
  return email === '' ? null : email
}

function person(property: InstanceType<typeof ICAL.Property>): MeetingPerson {
  const cn = property.getParameter('cn')
  const name = typeof cn === 'string' && cn.trim() !== '' ? cn.trim() : null
  const email = stripMailto(property.getFirstValue())
  return { name: name && name !== email ? name : null, email }
}

const RESPONSES: Record<string, MeetingResponse> = {
  ACCEPTED: 'si',
  DECLINED: 'no',
  TENTATIVE: 'tal-vez',
}

export function attendees(component: Component): MeetingAttendee[] {
  return component.getAllProperties('attendee').map((property) => {
    const partstat = property.getParameter('partstat')
    const key = typeof partstat === 'string' ? partstat.toUpperCase() : ''
    return { ...person(property), response: RESPONSES[key] ?? 'sin-responder' }
  })
}

function organizer(component: Component): MeetingPerson | null {
  const property = component.getFirstProperty('organizer')
  if (!property) return null
  const value = person(property)
  return value.name || value.email ? value : null
}

/** Solo adjuntos por link (Drive). Un ATTACH en base64 no se manda al front. */
function attachments(component: Component): MeetingAttachment[] {
  const result: MeetingAttachment[] = []
  for (const property of component.getAllProperties('attach')) {
    const url = property.getFirstValue()
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue
    const filename = property.getParameter('filename')
    result.push({
      url,
      title: typeof filename === 'string' && filename.trim() !== '' ? filename.trim() : null,
    })
  }
  return result
}

const URL_IN_ESCAPED_RE = /https?:\/\/(?:(?!&(?:quot|lt|gt|#39);)[^\s<>"'])+/g

function escapeText(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Texto plano a HTML: escapado, con saltos y con las URLs sueltas como links. */
function plainToHtml(text: string): string {
  return escapeText(text)
    .replace(URL_IN_ESCAPED_RE, (raw) => {
      const url = raw.replace(/[.,;:!?)\]]+$/, '')
      return `<a href="${url}">${url}</a>${raw.slice(url.length)}`
    })
    .replace(/\r?\n/g, '<br>')
}

/**
 * Las notas de Google llegan como texto o como HTML. Las dos terminan en el
 * mismo sanitizador con una lista corta de tags; los links abren en otra pestana.
 */
export function notesHtml(text: string | null): string | null {
  if (!text || text.trim() === '') return null
  const source = /<\/?[a-z][^>]*>/i.test(text) ? text : plainToHtml(text)
  const clean = sanitizeHtml(source, {
    allowedTags: ['a', 'b', 'strong', 'i', 'em', 'u', 'br', 'p', 'div', 'span', 'ul', 'ol', 'li'],
    allowedAttributes: { a: ['href', 'target', 'rel'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { target: '_blank', rel: 'noopener noreferrer' }),
    },
  }).trim()
  return clean === '' ? null : clean
}

function toMeeting(
  calendarId: string,
  item: IcalEvent,
  startMs: number,
  endMs: number,
  allDay: boolean,
): Meeting {
  const component = item.component
  return {
    id: `${calendarId}:${item.uid ?? ''}:${startMs}`,
    calendarId,
    title: textValue(component, 'summary') ?? '(Sin título)',
    start: new Date(startMs).toISOString(),
    end: new Date(endMs).toISOString(),
    allDay,
    location: textValue(component, 'location'),
    meetUrl: meetLink(component),
    organizer: organizer(component),
    attendees: attendees(component),
    descriptionHtml: notesHtml(textValue(component, 'description')),
    attachments: attachments(component),
  }
}

/** Fin de un evento suelto. Un dia completo sin DTEND dura ese dia (RFC 5545). */
function endMsOf(event: IcalEvent, startMs: number): number {
  const component = event.component
  if (!component.hasProperty('dtend') && !component.hasProperty('duration')) {
    return event.startDate.isDate ? startMs + DAY_MS : startMs
  }
  return toMs(event.endDate)
}

function durationMs(event: IcalEvent): number {
  return endMsOf(event, toMs(event.startDate)) - toMs(event.startDate)
}

/**
 * Las reuniones del dia en un calendario. Una serie se expande desde su DTSTART
 * con RRULE/RDATE/EXDATE (ical.js). Las ocurrencias que tienen un RECURRENCE-ID
 * propio se leen de esa version: puede haberse movido de dia o cancelado.
 */
export function meetingsForDay(calendar: Component, day: DayWindow, calendarId: string): Meeting[] {
  const masters = new Map<string, Component>()
  const overrides = new Map<string, Component[]>()
  const loose: Component[] = []

  for (const component of calendar.getAllSubcomponents('vevent')) {
    const uid = textValue(component, 'uid')
    if (!uid) {
      loose.push(component)
    } else if (component.hasProperty('recurrence-id')) {
      overrides.set(uid, [...(overrides.get(uid) ?? []), component])
    } else if (!masters.has(uid)) {
      masters.set(uid, component)
    }
  }

  const result: Meeting[] = []

  function consider(event: IcalEvent, startMs: number, endMs: number) {
    if (cancelled(event.component)) return
    if (!overlapsDay(startMs, endMs, day)) return
    result.push(toMeeting(calendarId, event, startMs, endMs, event.startDate.isDate))
  }

  function single(component: Component) {
    const event = new ICAL.Event(component)
    const startMs = toMs(event.startDate)
    consider(event, startMs, endMsOf(event, startMs))
  }

  for (const component of loose) single(component)

  for (const [uid, master] of masters) {
    const own = overrides.get(uid) ?? []
    const event = new ICAL.Event(master)
    if (!event.isRecurring()) {
      single(master)
      continue
    }

    const overridden = new Set(
      own.map((component) => toMs(component.getFirstPropertyValue('recurrence-id') as Time)),
    )
    const length = durationMs(event)
    const iterator = event.iterator()
    for (let count = 0; count < MAX_OCCURRENCES; count += 1) {
      const next = iterator.next()
      if (!next) break
      const startMs = toMs(next)
      if (startMs >= day.endMs) break
      if (overridden.has(startMs)) continue
      consider(event, startMs, startMs + length)
    }
  }

  // Las versiones propias van aparte del recorrido: una ocurrencia de manana
  // movida a hoy tiene que aparecer aunque la serie ya haya cortado.
  for (const list of overrides.values()) {
    for (const component of list) single(component)
  }

  return result
}

/** Orden del panel: primero los de todo el dia, despues por hora. */
export function sortMeetings(meetings: Meeting[]): Meeting[] {
  return [...meetings].sort((a, b) => {
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    if (a.start !== b.start) return a.start < b.start ? -1 : 1
    return a.title.localeCompare(b.title, 'es')
  })
}
