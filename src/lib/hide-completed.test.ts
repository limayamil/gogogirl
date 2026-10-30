import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  HIDE_COMPLETED_ON_HOME_KEY,
  homeListStaysVisible,
  readHideCompletedOnHome,
  readHideCompletedPreference,
  visibleHomeListTasks,
  writeHideCompletedPreference,
} from './hide-completed'

const libDir = dirname(fileURLToPath(import.meta.url))

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

describe('la misma preferencia en Hoy y en Categorías', () => {
  function memoryStorage() {
    const memory = new Map<string, string>()
    return {
      memory,
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => {
        memory.set(key, value)
      },
    }
  }

  it('lo que guarda una vista lo lee la otra, y arranca apagado', () => {
    const storage = memoryStorage()
    expect(readHideCompletedPreference(storage.getItem)).toBe(false)

    writeHideCompletedPreference(storage.setItem, true)
    expect(readHideCompletedPreference(storage.getItem)).toBe(true)
    expect([...storage.memory.keys()]).toEqual([HIDE_COMPLETED_ON_HOME_KEY])
    expect(storage.memory.get(HIDE_COMPLETED_ON_HOME_KEY)).toBe('true')

    writeHideCompletedPreference(storage.setItem, false)
    expect(readHideCompletedPreference(storage.getItem)).toBe(false)
    expect(storage.memory.get(HIDE_COMPLETED_ON_HOME_KEY)).toBe('false')
  })

  it('las dos vistas usan el gancho y el predicado, sin otra clave', async () => {
    const hook = await readFile(join(libDir, 'use-hide-completed.ts'), 'utf8')
    expect(hook).toContain('readHideCompletedPreference')
    expect(hook).toContain('writeHideCompletedPreference')
    expect(hook).not.toMatch(/gogogirl\.hide/)

    for (const file of ['../views/TodayView.tsx', '../views/CategoriesView.tsx']) {
      const source = await readFile(join(libDir, file), 'utf8')
      expect(source).toContain('useHideCompletedLists')
      expect(source).toContain('homeListStaysVisible')
      expect(source).toContain('visibleHomeListTasks')
      expect(source).toContain('Ocultar hechas')
      expect(source).toContain('Ver hechas')
      expect(source).not.toContain('localStorage')
      expect(source).not.toMatch(/gogogirl\.hide/)
    }
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
