import { describe, expect, it } from 'vitest'
import { APP_TIME_ZONE, dateKeyInAppZone } from '../shared/expiry'
import {
  dotCount,
  formatDayHeading,
  formatMonthTitle,
  groupTasksByDeadline,
  monthCells,
  monthOf,
  newTaskOnDay,
  shiftMonth,
} from './calendar'

describe('prefill del día', () => {
  it('abre la tarea nueva con la fecha límite de esa columna', () => {
    expect(newTaskOnDay('2026-11-06')).toEqual({
      taskId: null,
      defaults: { deadline: '2026-11-06' },
    })
  })

  it('conserva el día de la columna aunque esa medianoche UTC sea el día anterior en Buenos Aires', () => {
    const column = '2026-11-01'
    // new Date('2026-11-01T00:00:00Z') es el 31 de octubre a las 21:00 en Argentina.
    expect(APP_TIME_ZONE).toBe('America/Argentina/Buenos_Aires')
    expect(dateKeyInAppZone(new Date(`${column}T00:00:00.000Z`))).toBe('2026-10-31')
    expect(newTaskOnDay(column).defaults.deadline).toBe('2026-11-01')
  })
})

describe('agrupar tareas en el mes de Buenos Aires', () => {
  const tasks = [
    { id: 'a', deadline: '2026-11-01' },
    { id: 'b', deadline: '2026-11-01' },
    { id: 'c', deadline: '2026-11-01' },
    { id: 'd', deadline: '2026-11-01' },
    { id: 'oct', deadline: '2026-10-31' },
    { id: 'none', deadline: null },
  ]

  it('junta por el día de la fecha límite y no cuenta las que no tienen', () => {
    const grouped = groupTasksByDeadline(tasks)
    expect(grouped.get('2026-11-01')?.map((task) => task.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(grouped.get('2026-10-31')?.map((task) => task.id)).toEqual(['oct'])
    expect([...grouped.values()].flat()).toHaveLength(5)
    expect([...grouped.keys()]).not.toContain('none')
    // Reinterpretar la clave como instante UTC la correría al 31. El grupo no hace eso.
    expect(dateKeyInAppZone(new Date('2026-11-01T00:00:00.000Z'))).toBe('2026-10-31')
    expect(dotCount(grouped.get('2026-11-01')!.length)).toBe(3)
    expect(dotCount(grouped.get('2026-10-31')!.length)).toBe(1)
    expect(dotCount(0)).toBe(0)
  })

  it('el mes visible es el de Argentina cuando UTC ya cambió de mes', () => {
    // 1 nov 02:30 UTC = 31 oct 23:30 en Buenos Aires.
    const stillOctober = new Date('2026-11-01T02:30:00.000Z')
    expect(monthOf(stillOctober)).toEqual({ year: 2026, month: 10 })
    expect(formatMonthTitle(monthOf(stillOctober))).toBe('Octubre de 2026')

    // 1 nov 03:30 UTC = 1 nov 00:30 en Buenos Aires.
    const november = new Date('2026-11-01T03:30:00.000Z')
    expect(monthOf(november)).toEqual({ year: 2026, month: 11 })

    const october = monthCells(monthOf(stillOctober))
    const inMonth = october.filter((cell) => cell.inMonth).map((cell) => cell.key)
    expect(inMonth[0]).toBe('2026-10-01')
    expect(inMonth.at(-1)).toBe('2026-10-31')
    expect(october[0]).toEqual({ key: '2026-09-28', inMonth: false })
    expect(october.at(-1)).toEqual({ key: '2026-11-01', inMonth: false })
    expect(october.length % 7).toBe(0)

    const grouped = groupTasksByDeadline(tasks)
    const oct31 = october.find((cell) => cell.key === '2026-10-31')
    expect(oct31?.inMonth).toBe(true)
    expect(grouped.get('2026-10-31')).toHaveLength(1)
    expect(grouped.get('2026-11-01')).toHaveLength(4)
  })

  it('empieza el mes en lunes y cruza el cambio de año', () => {
    const november = monthCells({ year: 2026, month: 11 })
    expect(november[0].key).toBe('2026-10-26')
    expect(november.find((cell) => cell.key === '2026-11-01')?.inMonth).toBe(true)
    expect(formatDayHeading('2026-11-06')).toBe('Viernes, 6 de noviembre')
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
  })
})
