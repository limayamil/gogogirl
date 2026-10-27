// Calendarios por direccion secreta iCal. La direccion es un secreto: se valida
// al guardarla, se usa solo aca para el fetch y nunca sale en una respuesta.

import { createHash } from 'node:crypto'
import type { CalendarFeed } from '../../src/shared/types.ts'
import { HttpError } from './http.ts'
import { parseCalendar } from './ics.ts'

type Row = Record<string, unknown>
type ParsedCalendar = ReturnType<typeof parseCalendar>

const ICAL_HOST = 'calendar.google.com'
const URL_MAX = 2000

/**
 * Solo la direccion iCal de Google: https, calendar.google.com, /calendar/ical/.
 * Cualquier otro host queda afuera para que el servidor no termine pidiendo una
 * URL arbitraria en nombre de la cuenta.
 */
export function icalUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, 'Pegá la dirección secreta en formato iCal.')
  }
  const raw = value.trim()
  if (raw.length > URL_MAX) throw new HttpError(400, 'La dirección es demasiado larga.')
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    throw new HttpError(400, 'Eso no es una dirección válida.')
  }
  if (
    url.protocol !== 'https:' ||
    url.hostname !== ICAL_HOST ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== '' ||
    !url.pathname.startsWith('/calendar/ical/')
  ) {
    throw new HttpError(
      400,
      'Tiene que ser la dirección secreta en formato iCal de Google Calendar (https://calendar.google.com/calendar/ical/…).',
    )
  }
  url.hash = ''
  return url.toString()
}

/**
 * Lo unico que el front ve de la direccion: el host y los ultimos cuatro
 * caracteres del tramo secreto, para poder distinguir dos calendarios.
 */
export function maskIcalUrl(url: string): string {
  try {
    const segments = new URL(url).pathname.split('/').filter(Boolean)
    const file = segments.at(-1) ?? ''
    const secret = segments.length >= 2 ? segments[segments.length - 2] : ''
    const tail = secret.length > 8 ? secret.slice(-4) : ''
    return `${ICAL_HOST}/…/••••${tail}/${file}`
  } catch {
    return `${ICAL_HOST}/…`
  }
}

/** Sin ical_url a proposito: esta es la forma que sale por la API. */
export function mapCalendar(row: Row): CalendarFeed {
  return {
    id: row.id as string,
    name: row.name as string,
    colorKey: row.color_key as string,
    maskedUrl: maskIcalUrl(row.ical_url as string),
    position: Number(row.position),
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const FETCH_TIMEOUT_MS = 10_000
const MAX_BYTES = 8 * 1024 * 1024
const MAX_REDIRECTS = 3

interface CacheEntry {
  at: number
  calendar: ParsedCalendar
}

// Por instancia de la funcion: alcanza para que el refresco de cada 5 minutos
// y abrir el panel no le peguen a Google cada vez. La clave lleva el hash de la
// direccion, asi que cambiarla invalida sola.
const cache = new Map<string, CacheEntry>()

function cacheKey(calendarId: string, url: string): string {
  return `${calendarId}:${createHash('sha256').update(url).digest('hex')}`
}

export function forgetCalendar(calendarId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(`${calendarId}:`)) cache.delete(key)
  }
}

export function clearCalendarCache(): void {
  cache.clear()
}

/** Error para mostrar en el panel. No lleva la direccion. */
export class FeedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedError'
  }
}

function redirectAllowed(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    (url.hostname === 'google.com' ||
      url.hostname.endsWith('.google.com') ||
      url.hostname.endsWith('.googleusercontent.com'))
  )
}

async function download(url: string): Promise<string> {
  let current = new URL(url)
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    let response: Response
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: { accept: 'text/calendar, text/plain;q=0.9, */*;q=0.1' },
      })
    } catch {
      throw new FeedError('Google no respondió a tiempo.')
    }
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location')
      const next = location ? new URL(location, current) : null
      if (!next || !redirectAllowed(next)) throw new FeedError('Google respondió con una redirección rara.')
      current = next
      continue
    }
    if (response.status === 404 || response.status === 403 || response.status === 401) {
      throw new FeedError('Google no encontró el calendario. Revisá la dirección secreta.')
    }
    if (!response.ok) throw new FeedError(`Google respondió con un error (${response.status}).`)
    const length = Number(response.headers.get('content-length') ?? 0)
    if (length > MAX_BYTES) throw new FeedError('El calendario es demasiado grande.')
    const text = await response.text()
    if (text.length > MAX_BYTES) throw new FeedError('El calendario es demasiado grande.')
    return text
  }
  throw new FeedError('Google respondió con demasiadas redirecciones.')
}

/** El feed ya parseado, del cache si tiene menos de 5 minutos. */
export async function loadFeed(
  calendarId: string,
  url: string,
  now = Date.now(),
): Promise<ParsedCalendar> {
  const key = cacheKey(calendarId, url)
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_TTL_MS) return hit.calendar

  const text = await download(url)
  let calendar: ParsedCalendar
  try {
    calendar = parseCalendar(text)
  } catch {
    throw new FeedError('Lo que devolvió Google no es un calendario iCal.')
  }

  for (const [other, entry] of cache) {
    if (now - entry.at >= CACHE_TTL_MS) cache.delete(other)
  }
  cache.set(key, { at: now, calendar })
  return calendar
}
