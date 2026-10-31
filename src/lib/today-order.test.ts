import { describe, expect, it } from 'vitest'
import { nextTodayPositions, reorderVisibleToday, sortTodayTasks } from './today-order'

describe('nextTodayPositions', () => {
  it('mueve una tarea hacia arriba y reindexa 0..n-1', () => {
    expect(nextTodayPositions(['a', 'b', 'c'], 'c', 'a')).toEqual([
      { id: 'c', todayPosition: 0 },
      { id: 'a', todayPosition: 1 },
      { id: 'b', todayPosition: 2 },
    ])
  })

  it('mueve una tarea hacia abajo', () => {
    expect(nextTodayPositions(['a', 'b', 'c'], 'a', 'c')).toEqual([
      { id: 'b', todayPosition: 0 },
      { id: 'c', todayPosition: 1 },
      { id: 'a', todayPosition: 2 },
    ])
  })

  it('deja las ocultas en su hueco si no son el origen ni el destino', () => {
    expect(nextTodayPositions(['a', 'hidden', 'b'], 'b', 'a')).toEqual([
      { id: 'b', todayPosition: 0 },
      { id: 'a', todayPosition: 1 },
      { id: 'hidden', todayPosition: 2 },
    ])
  })

  it('no hace nada si origen y destino son la misma tarea', () => {
    expect(nextTodayPositions(['a', 'b'], 'a', 'a')).toBeNull()
  })

  it('no hace nada si alguna de las tareas no está en Hoy', () => {
    expect(nextTodayPositions(['a', 'b'], 'a', 'zona-hoy')).toBeNull()
    expect(nextTodayPositions(['a', 'b'], 'faltante', 'b')).toBeNull()
  })

  it('no muta el array original', () => {
    const ids = ['a', 'b', 'c']
    nextTodayPositions(ids, 'c', 'a')
    expect(ids).toEqual(['a', 'b', 'c'])
  })
})

describe('sortTodayTasks', () => {
  const tasks = [
    { id: 'cerrar', status: 'hecha', todayPosition: 0 },
    { id: 'curso', status: 'en_progreso', todayPosition: 1 },
    { id: 'alfa', status: 'pendiente', todayPosition: 2 },
    { id: 'archivar', status: 'hecha', todayPosition: 3 },
  ]

  it('apagado respeta todayPosition', () => {
    expect(sortTodayTasks(tasks, false).map((task) => task.id)).toEqual([
      'cerrar',
      'curso',
      'alfa',
      'archivar',
    ])
  })

  it('prende y manda las hechas al final sin mezclar el resto', () => {
    expect(sortTodayTasks(tasks, true).map((task) => task.id)).toEqual([
      'curso',
      'alfa',
      'cerrar',
      'archivar',
    ])
  })

  it('no esconde las hechas: eso lo sigue haciendo Ocultar hechas', () => {
    const sorted = sortTodayTasks(tasks, true)
    expect(sorted.filter((task) => task.status === 'hecha').map((task) => task.id)).toEqual([
      'cerrar',
      'archivar',
    ])
    expect(sorted).toHaveLength(tasks.length)
  })
})

describe('reorderVisibleToday', () => {
  it('reordena el orden visible y deja las ocultas en su hueco', () => {
    expect(reorderVisibleToday(['a', 'hidden', 'b'], ['a', 'b'], 'b', 'a')).toEqual([
      { id: 'b', todayPosition: 0 },
      { id: 'hidden', todayPosition: 1 },
      { id: 'a', todayPosition: 2 },
    ])
  })

  it('mueve dentro del orden en pantalla, no del guardado', () => {
    // Guardado: hecha, p1, p2. En pantalla, con completadas al final: p1, p2, hecha.
    const stored = ['hecha', 'p1', 'p2']
    const visible = ['p1', 'p2', 'hecha']
    const positions = reorderVisibleToday(stored, visible, 'p2', 'p1')
    expect(positions).toEqual([
      { id: 'p2', todayPosition: 0 },
      { id: 'p1', todayPosition: 1 },
      { id: 'hecha', todayPosition: 2 },
    ])

    const byId = new Map(
      [
        { id: 'hecha', status: 'hecha', todayPosition: 0 },
        { id: 'p1', status: 'pendiente', todayPosition: 1 },
        { id: 'p2', status: 'pendiente', todayPosition: 2 },
      ].map((task) => [task.id, task]),
    )
    const resorted = sortTodayTasks(
      (positions ?? []).map((item) => ({ ...byId.get(item.id)!, todayPosition: item.todayPosition })),
      true,
    )
    expect(resorted.map((task) => task.id)).toEqual(['p2', 'p1', 'hecha'])
  })

  it('no hace nada si el destino es la misma fila visible', () => {
    expect(reorderVisibleToday(['a', 'b'], ['a', 'b'], 'a', 'a')).toBeNull()
  })
})
