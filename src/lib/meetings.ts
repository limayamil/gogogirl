/**
 * Formato de las reuniones del panel. La hora se muestra siempre en Buenos
 * Aires, igual que el dia que arma el servidor: no se usa la zona del navegador.
 */
import { MEETINGS_TIME_ZONE, type Meeting, type MeetingResponse } from '../shared/types'

/** El panel se refresca solo cada 5 minutos, lo mismo que dura el cache del servidor. */
export const MEETINGS_REFRESH_MS = 5 * 60 * 1000

const TIME = new Intl.DateTimeFormat('es-AR', {
  timeZone: MEETINGS_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

export function meetingTime(meeting: Pick<Meeting, 'start' | 'end' | 'allDay'>): string {
  if (meeting.allDay) return 'Todo el día'
  const start = TIME.format(new Date(meeting.start))
  if (meeting.end === meeting.start) return start
  return `${start} – ${TIME.format(new Date(meeting.end))}`
}

export const RESPONSE_LABELS: Record<MeetingResponse, string> = {
  si: 'Sí',
  no: 'No',
  'tal-vez': 'Tal vez',
  'sin-responder': 'Sin responder',
}

export function personLabel(person: { name: string | null; email: string | null }): string {
  return person.name ?? person.email ?? 'Sin nombre'
}

/** Con la cuenta en la clave: cambiar de cuenta o entrar con "Ver como" nunca reusa el cache de otra. */
export const calendarsKey = (userId: string) => ['calendars', userId] as const
export const meetingsKey = (userId: string) => ['meetings', userId] as const
