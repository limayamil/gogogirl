import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { Task } from '../shared/types'
import styles from './TodayView.module.css'

const sortable = vi.hoisted(() => ({ isOver: false, isDragging: false }))

vi.mock('@dnd-kit/sortable', () => ({
  useSortable: () => ({
    attributes: { 'data-drag-attributes': 'true' },
    listeners: { 'data-drag-listeners': 'true' },
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: sortable.isDragging,
    isOver: sortable.isOver,
  }),
  SortableContext: ({ children }: { children: ReactNode }) => children,
  verticalListSortingStrategy: () => null,
}))

vi.mock('../app/modals', () => ({
  useModals: () => ({ openTask: () => {} }),
}))

vi.mock('../app/display-settings', () => ({
  useDisplaySettings: () => ({
    showListOnTask: false,
    suggestDueToday: true,
    completedLastOnHome: false,
    setShowListOnTask: () => {},
    setSuggestDueToday: () => {},
    setCompletedLastOnHome: () => {},
  }),
}))

vi.mock('../lib/store', () => ({
  useUpdateTask: () => ({ mutate: () => {} }),
  useUpdateSubtask: () => ({ mutate: () => {} }),
}))

vi.mock('../lib/palette', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/palette')>()
  return {
    ...actual,
    useColorOf: () => () => ({ bg: '#fff', soft: '#fff', dot: '#000', ink: '#000' }),
  }
})

import { TodayRow } from './TodayView'

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    categoryId: null,
    description: null,
    notes: null,
    urgency: 'media',
    deadline: null,
    status: 'pendiente',
    inToday: true,
    hiddenInToday: false,
    expired: false,
    todayPosition: 0,
    position: 0,
    createdAt: '2026-10-31T12:00:00.000Z',
    updatedAt: '2026-10-31T12:00:00.000Z',
    completedAt: null,
    subtasks: [],
    attachments: [],
    links: [],
    ...partial,
  }
}

function tagsWith(html: string, attr: string): string[] {
  return html.match(/<(?:button|div|li|span)\b[^>]*>/g)?.filter((tag) => tag.includes(attr)) ?? []
}

describe('manija de Hoy', () => {
  it('no usa la fila entera: los listeners quedan en la manija', () => {
    sortable.isOver = true
    sortable.isDragging = false
    const html = renderToStaticMarkup(
      <TodayRow task={task({ id: 'a', title: 'Regar' })} categories={[]} />,
    )

    const listeners = tagsWith(html, 'data-drag-listeners')
    expect(listeners).toHaveLength(1)
    expect(listeners[0]).toContain('aria-label="Reordenar"')
    expect(listeners[0]).toContain(styles.dragHandle)
    expect(listeners[0]).not.toContain(styles.todayRow)
    expect(listeners[0]).not.toContain(styles.todayRowMain)
    expect(listeners[0]).not.toContain(styles.rowTitle)
    expect(listeners[0]).not.toContain(styles.rowEye)

    const row = tagsWith(html, styles.todayRow).find((tag) => tag.includes(styles.todayRow))
    const main = tagsWith(html, styles.todayRowMain)
    const title = tagsWith(html, styles.rowTitle)
    const eye = tagsWith(html, styles.rowEye)
    const status = tagsWith(html, 'Estado:')
    expect(row).toBeDefined()
    expect(row).not.toContain('data-drag-listeners')
    expect(main).toHaveLength(1)
    expect(main[0]).not.toContain('data-drag-listeners')
    expect(title[0]).not.toContain('data-drag-listeners')
    expect(eye[0]).not.toContain('data-drag-listeners')
    expect(status[0]).not.toContain('data-drag-listeners')
    expect(html).toContain(styles.insertLine)
  })

  it('no dibuja la línea de inserción si la fila no es el destino', () => {
    sortable.isOver = false
    sortable.isDragging = false
    const html = renderToStaticMarkup(
      <TodayRow task={task({ id: 'b', title: 'Leer', status: 'hecha' })} categories={[]} />,
    )
    expect(html).not.toContain(styles.insertLine)
  })
})
