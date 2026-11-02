import { describe, expect, it } from 'vitest'
import {
  COMPLETED_LAST_ON_HOME_KEY,
  SHOW_LIST_ON_TASK_KEY,
  SUGGEST_DUE_TODAY_KEY,
  dueTodaySuggestions,
  readCompletedLastOnHome,
  readShowListOnTask,
  readSuggestDueToday,
  takeForTodayPatch,
  taskListName,
} from './display-settings'

const TODAY = '2026-10-24'

type Row = {
  id: string
  title: string
  deadline: string | null
  status: string
  inToday: boolean
  hiddenInToday?: boolean
}

function row(partial: Partial<Row> & Pick<Row, 'id'>): Row {
  return {
    title: partial.title ?? partial.id,
    deadline: TODAY,
    status: 'pendiente',
    inToday: false,
    ...partial,
  }
}

describe('lista bajo el titulo', () => {
  it('queda oculta por defecto y se muestra solo con el ajuste prendido', () => {
    expect(SHOW_LIST_ON_TASK_KEY).toBe('gogogirl.showListOnTask')
    expect(readShowListOnTask(null)).toBe(false)
    expect(readShowListOnTask('')).toBe(false)
    expect(readShowListOnTask('false')).toBe(false)
    expect(readShowListOnTask('true')).toBe(true)
    expect(taskListName('Galeón', false)).toBeNull()
    expect(taskListName('Galeón', true)).toBe('Galeón')
  })

  it('no agrega linea si la tarea no tiene lista', () => {
    expect(taskListName(null, true)).toBeNull()
    expect(taskListName('   ', true)).toBeNull()
    expect(taskListName(null, false)).toBeNull()
  })
})

describe('completadas al final', () => {
  it('viene apagado y solo se prende con true', () => {
    expect(COMPLETED_LAST_ON_HOME_KEY).toBe('gogogirl.completedLastOnHome')
    expect(readCompletedLastOnHome(null)).toBe(false)
    expect(readCompletedLastOnHome('')).toBe(false)
    expect(readCompletedLastOnHome('false')).toBe(false)
    expect(readCompletedLastOnHome('true')).toBe(true)
  })
})

describe('sugerencias de las que vencen hoy', () => {
  const galeon = row({
    id: 'galeon',
    title: 'Galeón: definir propuesta de mantenimiento preventivo',
  })

  it('solo sugiere las que vencen hoy, no estan en Hoy y no estan hechas', () => {
    expect(SUGGEST_DUE_TODAY_KEY).toBe('gogogirl.suggestDueToday')
    expect(readSuggestDueToday(null)).toBe(true)
    expect(readSuggestDueToday('true')).toBe(true)
    expect(readSuggestDueToday('')).toBe(true)
    expect(readSuggestDueToday('false')).toBe(false)

    const tasks = [
      galeon,
      row({ id: 'manana', deadline: '2026-10-25' }),
      row({ id: 'sin-fecha', deadline: null }),
      row({ id: 'ya-en-hoy', inToday: true }),
      row({ id: 'escondida-en-hoy', inToday: true, hiddenInToday: true }),
      row({ id: 'hecha', status: 'hecha' }),
      row({ id: 'curso', status: 'en_progreso' }),
    ]

    expect(dueTodaySuggestions(tasks, TODAY, true).map((task) => task.id)).toEqual([
      'galeon',
      'curso',
    ])
  })

  it('Tomar para hoy usa el parche de agregar a hoy y la saca de la tira', () => {
    const [suggested] = dueTodaySuggestions([galeon], TODAY, true)
    const patch = takeForTodayPatch()
    expect(patch).toEqual({ inToday: true, hiddenInToday: false })

    const taken = { ...suggested, ...patch }
    expect(dueTodaySuggestions([taken], TODAY, true)).toEqual([])
    expect(taken.inToday).toBe(true)
  })

  it('con el ajuste apagado no hay tira', () => {
    expect(dueTodaySuggestions([galeon], TODAY, false)).toEqual([])
  })
})
