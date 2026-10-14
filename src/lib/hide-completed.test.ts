import { describe, expect, it } from 'vitest'
import {
  HIDE_COMPLETED_ON_HOME_KEY,
  homeListStaysVisible,
  readHideCompletedOnHome,
  visibleHomeListTasks,
} from './hide-completed'

const pendiente = { id: 'p', status: 'pendiente' }
const progreso = { id: 'e', status: 'en_progreso' }
const hecha = { id: 'h', status: 'hecha' }

describe('readHideCompletedOnHome', () => {
  it('usa la clave pedida y arranca apagado', () => {
    expect(HIDE_COMPLETED_ON_HOME_KEY).toBe('gogogirl.hideCompletedOnHome')
    expect(readHideCompletedOnHome(null)).toBe(false)
    expect(readHideCompletedOnHome('false')).toBe(false)
    expect(readHideCompletedOnHome('')).toBe(false)
    expect(readHideCompletedOnHome('true')).toBe(true)
  })
})

describe('listas de Hoy al ocultar hechas', () => {
  it('no esconde una lista mixta: solo saca las hechas', () => {
    const tasks = [pendiente, hecha, progreso]
    expect(homeListStaysVisible(tasks, true)).toBe(true)
    expect(visibleHomeListTasks(tasks, true)).toEqual([pendiente, progreso])
  })

  it('esconde la lista solo cuando todas las tareas estan hechas', () => {
    const tasks = [hecha, { id: 'h2', status: 'hecha' }]
    expect(homeListStaysVisible(tasks, true)).toBe(false)
    expect(visibleHomeListTasks(tasks, true)).toEqual([])
  })

  it('deja visible una lista vacia', () => {
    expect(homeListStaysVisible([], true)).toBe(true)
    expect(visibleHomeListTasks([], true)).toEqual([])
  })

  it('deja visible una lista que solo tiene trabajo pendiente o en progreso', () => {
    const tasks = [pendiente, progreso]
    expect(homeListStaysVisible(tasks, true)).toBe(true)
    expect(visibleHomeListTasks(tasks, true)).toEqual(tasks)
  })

  it('con el toggle apagado no cambia nada', () => {
    const tasks = [pendiente, hecha]
    expect(homeListStaysVisible(tasks, false)).toBe(true)
    expect(homeListStaysVisible([hecha], false)).toBe(true)
    expect(visibleHomeListTasks(tasks, false)).toBe(tasks)
  })
})
