import { describe, expect, it } from 'vitest'
import { meetingTime, personLabel, RESPONSE_LABELS } from './meetings'

describe('meetingTime', () => {
  it('muestra la hora de Buenos Aires aunque cruce la medianoche UTC', () => {
    expect(
      meetingTime({ start: '2026-10-28T02:30:00.000Z', end: '2026-10-28T02:59:00.000Z', allDay: false }),
    ).toBe('23:30 – 23:59')
    expect(
      meetingTime({ start: '2026-10-27T12:00:00.000Z', end: '2026-10-27T12:00:00.000Z', allDay: false }),
    ).toBe('09:00')
  })

  it('un dia completo no tiene hora', () => {
    expect(
      meetingTime({ start: '2026-10-27T03:00:00.000Z', end: '2026-10-28T03:00:00.000Z', allDay: true }),
    ).toBe('Todo el día')
  })
})

describe('asistentes', () => {
  it('traduce la respuesta y cae en el mail si no hay nombre', () => {
    expect(RESPONSE_LABELS).toEqual({
      si: 'Sí',
      no: 'No',
      'tal-vez': 'Tal vez',
      'sin-responder': 'Sin responder',
    })
    expect(personLabel({ name: 'Ana', email: 'ana@example.com' })).toBe('Ana')
    expect(personLabel({ name: null, email: 'beto@example.com' })).toBe('beto@example.com')
  })
})
