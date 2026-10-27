import { describe, expect, it } from 'vitest'
import {
  buenosAiresDay,
  meetingsForDay,
  notesHtml,
  parseCalendar,
  sortMeetings,
} from './ics.ts'

const TZ = 'America/Argentina/Buenos_Aires'

function calendar(...events: string[]): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
    'BEGIN:VTIMEZONE',
    `TZID:${TZ}`,
    'BEGIN:STANDARD',
    'TZOFFSETFROM:-0300',
    'TZOFFSETTO:-0300',
    'TZNAME:-03',
    'DTSTART:19700101T000000',
    'END:STANDARD',
    'END:VTIMEZONE',
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}

function vevent(lines: string[]): string {
  return ['BEGIN:VEVENT', ...lines, 'END:VEVENT'].join('\r\n')
}

// Martes 27/10/2026, 12:00 en Buenos Aires.
const NOW = new Date('2026-10-27T15:00:00Z')
const TODAY = buenosAiresDay(NOW)

function today(...events: string[]) {
  return sortMeetings(meetingsForDay(parseCalendar(calendar(...events)), TODAY, 'cal-1'))
}

describe('buenosAiresDay', () => {
  it('usa GMT-3 y no la zona del servidor', () => {
    expect(TODAY).toEqual({
      date: '2026-10-27',
      startMs: Date.parse('2026-10-27T03:00:00Z'),
      endMs: Date.parse('2026-10-28T03:00:00Z'),
    })
    // 23:50 en Buenos Aires ya es el 28 en UTC, pero sigue siendo hoy.
    expect(buenosAiresDay(new Date('2026-10-28T02:50:00Z')).date).toBe('2026-10-27')
    expect(buenosAiresDay(new Date('2026-10-28T03:00:00Z')).date).toBe('2026-10-28')
  })
})

describe('meetingsForDay', () => {
  it('23:30 GMT-3 es hoy y 00:30 del dia siguiente no', () => {
    const meetings = today(
      vevent(['UID:tarde', 'SUMMARY:Tarde', `DTSTART;TZID=${TZ}:20261027T233000`, `DTEND;TZID=${TZ}:20261027T235900`]),
      vevent(['UID:manana', 'SUMMARY:Mañana', `DTSTART;TZID=${TZ}:20261028T003000`, `DTEND;TZID=${TZ}:20261028T013000`]),
      vevent(['UID:utc', 'SUMMARY:En UTC 23:59', 'DTSTART:20261028T025900Z', 'DTEND:20261028T032000Z']),
      vevent(['UID:utc-fuera', 'SUMMARY:En UTC 00:00', 'DTSTART:20261028T030000Z', 'DTEND:20261028T033000Z']),
      vevent(['UID:ayer', 'SUMMARY:Ayer', `DTSTART;TZID=${TZ}:20261026T220000`, `DTEND;TZID=${TZ}:20261026T230000`]),
    )
    expect(meetings.map((m) => m.title)).toEqual(['Tarde', 'En UTC 23:59'])
    expect(meetings[0].start).toBe('2026-10-28T02:30:00.000Z')
  })

  it('una hora sin zona se lee como Buenos Aires', () => {
    const [meeting] = today(
      vevent(['UID:flotante', 'SUMMARY:Flotante', 'DTSTART:20261027T100000', 'DTEND:20261027T110000']),
    )
    expect(meeting.start).toBe('2026-10-27T13:00:00.000Z')
  })

  it('expande RRULE y respeta EXDATE y RECURRENCE-ID', () => {
    const meetings = today(
      // Diaria, hoy excluida con EXDATE.
      vevent([
        'UID:excluida',
        'SUMMARY:Daily excluida',
        `DTSTART;TZID=${TZ}:20261020T090000`,
        `DTEND;TZID=${TZ}:20261020T091500`,
        'RRULE:FREQ=DAILY',
        `EXDATE;TZID=${TZ}:20261027T090000`,
      ]),
      // Semanal de los martes desde hace meses.
      vevent([
        'UID:semanal',
        'SUMMARY:Semanal',
        `DTSTART;TZID=${TZ}:20260106T110000`,
        `DTEND;TZID=${TZ}:20260106T120000`,
        'RRULE:FREQ=WEEKLY;BYDAY=TU',
      ]),
      // Diaria con la de hoy movida a la tarde.
      vevent([
        'UID:movida',
        'SUMMARY:Daily',
        `DTSTART;TZID=${TZ}:20261001T100000`,
        `DTEND;TZID=${TZ}:20261001T103000`,
        'RRULE:FREQ=DAILY',
      ]),
      vevent([
        'UID:movida',
        `RECURRENCE-ID;TZID=${TZ}:20261027T100000`,
        'SUMMARY:Daily (movida)',
        `DTSTART;TZID=${TZ}:20261027T160000`,
        `DTEND;TZID=${TZ}:20261027T163000`,
      ]),
      // La de manana se adelanto a hoy, la de hoy se cancelo.
      vevent([
        'UID:adelantada',
        'SUMMARY:Retro',
        `DTSTART;TZID=${TZ}:20261001T080000`,
        `DTEND;TZID=${TZ}:20261001T083000`,
        'RRULE:FREQ=DAILY',
      ]),
      vevent([
        'UID:adelantada',
        `RECURRENCE-ID;TZID=${TZ}:20261027T080000`,
        'STATUS:CANCELLED',
        'SUMMARY:Retro',
        `DTSTART;TZID=${TZ}:20261027T080000`,
        `DTEND;TZID=${TZ}:20261027T083000`,
      ]),
      vevent([
        'UID:adelantada',
        'RECURRENCE-ID:20261028T110000Z',
        'SUMMARY:Retro de mañana, hoy',
        `DTSTART;TZID=${TZ}:20261027T190000`,
        `DTEND;TZID=${TZ}:20261027T193000`,
      ]),
      // Termino la semana pasada.
      vevent([
        'UID:terminada',
        'SUMMARY:Terminada',
        `DTSTART;TZID=${TZ}:20261001T120000`,
        `DTEND;TZID=${TZ}:20261001T130000`,
        'RRULE:FREQ=DAILY;UNTIL=20261020T150000Z',
      ]),
      // Cada dos dias desde el 26: hoy no toca.
      vevent([
        'UID:alterna',
        'SUMMARY:Alterna',
        `DTSTART;TZID=${TZ}:20261026T140000`,
        `DTEND;TZID=${TZ}:20261026T143000`,
        'RRULE:FREQ=DAILY;INTERVAL=2',
      ]),
    )

    expect(meetings.map((m) => [m.title, m.start])).toEqual([
      ['Semanal', '2026-10-27T14:00:00.000Z'],
      ['Daily (movida)', '2026-10-27T19:00:00.000Z'],
      ['Retro de mañana, hoy', '2026-10-27T22:00:00.000Z'],
    ])
    expect(meetings[0].end).toBe('2026-10-27T15:00:00.000Z')
  })

  it('maneja todo el dia, de varios dias y cancelados', () => {
    const meetings = today(
      vevent(['UID:feriado', 'SUMMARY:Todo el día', 'DTSTART;VALUE=DATE:20261027', 'DTEND;VALUE=DATE:20261028']),
      vevent(['UID:viaje', 'SUMMARY:Viaje', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261030']),
      vevent(['UID:sin-fin', 'SUMMARY:Sin DTEND', 'DTSTART;VALUE=DATE:20261027']),
      vevent(['UID:ayer-dia', 'SUMMARY:Ayer entero', 'DTSTART;VALUE=DATE:20261026', 'DTEND;VALUE=DATE:20261027']),
      vevent(['UID:cumple', 'SUMMARY:Cumple', 'DTSTART;VALUE=DATE:20201027', 'RRULE:FREQ=YEARLY']),
      vevent([
        'UID:cancelada',
        'SUMMARY:Cancelada',
        'STATUS:CANCELLED',
        `DTSTART;TZID=${TZ}:20261027T150000`,
        `DTEND;TZID=${TZ}:20261027T160000`,
      ]),
      vevent(['UID:hora', 'SUMMARY:Con hora', `DTSTART;TZID=${TZ}:20261027T090000`, `DTEND;TZID=${TZ}:20261027T093000`]),
    )

    expect(meetings.map((m) => [m.title, m.allDay])).toEqual([
      ['Viaje', true],
      ['Cumple', true],
      ['Sin DTEND', true],
      ['Todo el día', true],
      ['Con hora', false],
    ])
    expect(meetings.find((m) => m.title === 'Todo el día')?.start).toBe('2026-10-27T03:00:00.000Z')
  })

  it('saca el link de Meet del campo de Google, del lugar o de la descripcion', () => {
    const meetings = today(
      vevent([
        'UID:conf',
        'SUMMARY:A conferencia',
        `DTSTART;TZID=${TZ}:20261027T090000`,
        'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
        'DESCRIPTION:Otra cosa https://meet.google.com/zzz-zzzz-zzz',
      ]),
      vevent([
        'UID:lugar',
        'SUMMARY:B lugar',
        `DTSTART;TZID=${TZ}:20261027T100000`,
        'LOCATION:https://meet.google.com/lug-arlu-gar',
      ]),
      vevent([
        'UID:desc',
        'SUMMARY:C descripcion',
        `DTSTART;TZID=${TZ}:20261027T110000`,
        'DESCRIPTION:Unite con Google Meet: https://meet.google.com/des-cdes-cde?authuser=0\\nO por teléfono',
      ]),
      vevent([
        'UID:falso',
        'SUMMARY:D falso',
        `DTSTART;TZID=${TZ}:20261027T120000`,
        'X-GOOGLE-CONFERENCE:https://evil.example.com/abc',
        'LOCATION:https://meet.google.com.evil.example/abc',
      ]),
      vevent(['UID:nada', 'SUMMARY:E sin link', `DTSTART;TZID=${TZ}:20261027T130000`]),
    )
    expect(meetings.map((m) => m.meetUrl)).toEqual([
      'https://meet.google.com/abc-defg-hij',
      'https://meet.google.com/lug-arlu-gar',
      'https://meet.google.com/des-cdes-cde?authuser=0',
      null,
      null,
    ])
  })

  it('lee asistentes con su respuesta, organizador y adjuntos', () => {
    const [meeting] = today(
      vevent([
        'UID:gente',
        'SUMMARY:Con gente',
        `DTSTART;TZID=${TZ}:20261027T150000`,
        'ORGANIZER;CN=Yamil Lima:mailto:yamil@example.com',
        'ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=ACCEPTED;CN=Ana;X-NUM-GUESTS=0:mailto:ana@example.com',
        'ATTENDEE;PARTSTAT=DECLINED;CN=beto@example.com:mailto:beto@example.com',
        'ATTENDEE;PARTSTAT=TENTATIVE;CN=Caro:mailto:caro@example.com',
        'ATTENDEE;PARTSTAT=NEEDS-ACTION;CN=Dani:mailto:dani@example.com',
        'ATTENDEE:mailto:eli@example.com',
        'ATTACH;FILENAME=Minuta.pdf;FMTTYPE=application/pdf:https://drive.google.com/open?id=123',
        'ATTACH;ENCODING=BASE64;VALUE=BINARY:SG9sYQ==',
      ]),
    )
    expect(meeting.organizer).toEqual({ name: 'Yamil Lima', email: 'yamil@example.com' })
    expect(meeting.attendees).toEqual([
      { name: 'Ana', email: 'ana@example.com', response: 'si' },
      { name: null, email: 'beto@example.com', response: 'no' },
      { name: 'Caro', email: 'caro@example.com', response: 'tal-vez' },
      { name: 'Dani', email: 'dani@example.com', response: 'sin-responder' },
      { name: null, email: 'eli@example.com', response: 'sin-responder' },
    ])
    expect(meeting.attachments).toEqual([
      { url: 'https://drive.google.com/open?id=123', title: 'Minuta.pdf' },
    ])
  })
})

describe('notesHtml', () => {
  it('texto plano: escapa, respeta saltos y hace clickeables los links', () => {
    expect(notesHtml('Agenda: 3 < 5 & "más"\nVer https://example.com/doc?a=1&b=2.')).toBe(
      'Agenda: 3 &lt; 5 &amp; "más"<br />Ver <a href="https://example.com/doc?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">https://example.com/doc?a=1&amp;b=2</a>.',
    )
  })

  it('HTML: saca scripts, handlers y javascript:', () => {
    const html = notesHtml(
      '<p onclick="x()">Hola<script>alert(1)</script></p><a href="javascript:alert(1)">mal</a><a href="https://ok.example">bien</a><img src=x onerror=alert(1)>',
    )
    expect(html).toBe(
      '<p>Hola</p><a target="_blank" rel="noopener noreferrer">mal</a><a href="https://ok.example" target="_blank" rel="noopener noreferrer">bien</a>',
    )
  })

  it('vacio es null', () => {
    expect(notesHtml(null)).toBeNull()
    expect(notesHtml('   ')).toBeNull()
  })
})
