import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Handler } from './http.ts'
import { splitSqlStatements } from '../../scripts/sql-split.ts'

type SqlTag = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>

const { dbRef } = vi.hoisted(() => ({
  dbRef: { current: null as SqlTag | null },
}))

vi.mock('./db.ts', () => ({
  sql: (strings: TemplateStringsArray, ...values: unknown[]) => {
    const query = dbRef.current
    if (!query) throw new Error('Base de test sin iniciar')
    return query(strings, ...values)
  },
}))

import tabletSync from '../tablet-sync.ts'
import tabletSubtasksDone from '../tablet-subtasks-done.ts'
import { plainTextWithBreaks } from './plain-text.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationsDir = join(root, 'db', 'migrations')

const TOKEN = 'token-de-la-tablet-de-prueba-123'
const OWNER = 'dorotea'

let db: PGlite

function tag(database: PGlite): SqlTag {
  return async (strings, ...values) => {
    let text = ''
    const params: unknown[] = []
    strings.forEach((part, index) => {
      text += part
      if (index < values.length) {
        params.push(values[index])
        text += `$${params.length}`
      }
    })
    const result = await database.query(text, params)
    return result.rows as Record<string, unknown>[]
  }
}

async function applyMigrations(database: PGlite) {
  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    const source = await readFile(join(migrationsDir, file), 'utf8')
    for (const statement of splitSqlStatements(source)) {
      try {
        await database.exec(statement)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        if (/create extension/i.test(statement) && /pgcrypto|extension/i.test(message)) continue
        throw error
      }
    }
  }
}

async function call(
  handler: Handler,
  init: { method?: string; body?: unknown; token?: string | null } = {},
) {
  const headers: Record<string, string | undefined> = {}
  const token = init.token === undefined ? TOKEN : init.token
  if (token != null) headers.authorization = `Bearer ${token}`
  let status = 200
  let payload: unknown
  const res = {
    status(code: number) {
      status = code
      return res
    },
    json(body: unknown) {
      payload = body
    },
    send(body?: unknown) {
      payload = body
    },
    setHeader() {},
    end() {},
  }
  await handler({ method: init.method ?? 'GET', query: {}, headers, body: init.body }, res)
  return { status, payload }
}

async function insertUser(username: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into users (username, password_hash) values ($1, $2) returning id',
    [username, 'hash-que-no-sale'],
  )
  return rows[0].id
}

async function insertCategory(userId: string, name: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into categories (name, color_key, user_id) values ($1, $2, $3) returning id',
    [name, 'rosa', userId],
  )
  return rows[0].id
}

async function insertTask(
  userId: string,
  title: string,
  options: {
    status?: string
    completedAt?: string | null
    categoryId?: string | null
    deadline?: string | null
    position?: number
  } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into tasks (user_id, title, status, completed_at, category_id, deadline, position)
     values ($1, $2, $3, $4, $5, $6, $7) returning id`,
    [
      userId,
      title,
      options.status ?? 'pendiente',
      options.completedAt ?? null,
      options.categoryId ?? null,
      options.deadline ?? null,
      options.position ?? 0,
    ],
  )
  return rows[0].id
}




async function insertSubtask(taskId: string, title: string, position: number, done = false): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into subtasks (task_id, title, position, done) values ($1, $2, $3, $4) returning id',
    [taskId, title, position, done],
  )
  return rows[0].id
}

async function insertNote(
  userId: string,
  title: string,
  options: { kind?: string; description?: string | null; updatedAt?: string; tags?: string[] } = {},
): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `insert into notes (user_id, title, kind, description, username, password, updated_at)
     values ($1, $2, $3, $4, $5, $6, coalesce($7::timestamptz, now())) returning id`,
    [
      userId,
      title,
      options.kind ?? 'note',
      options.description ?? null,
      options.kind === 'password' ? 'vale' : null,
      options.kind === 'password' ? 'secreto-123' : null,
      options.updatedAt ?? null,
    ],
  )
  const id = rows[0].id
  for (const name of options.tags ?? []) {
    const tag = await db.query<{ id: string }>(
      'insert into note_tags (name, user_id) values ($1, $2) returning id',
      [name, userId],
    )
    await db.query('insert into note_tag_assignments (note_id, tag_id) values ($1, $2)', [id, tag.rows[0].id])
  }
  return id
}

type SyncPayload = {
  tasks: Array<Record<string, unknown> & { subtasks: Array<Record<string, unknown>>; links: Array<Record<string, unknown>> }>
  categories: Array<Record<string, unknown>>
  notes: Array<Record<string, unknown>>
  serverTime: string
}

describe('tablet sync', () => {
  let ownerId: string

  beforeAll(async () => {
    db = new PGlite()
    dbRef.current = tag(db)
    await applyMigrations(db)
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    process.env.TABLET_TOKEN = TOKEN
    process.env.TABLET_USERNAME = OWNER
    await db.exec('truncate table users restart identity cascade')
    ownerId = await insertUser(OWNER)
  })

  it('401 sin token', async () => {
    expect((await call(tabletSync, { token: null })).status).toBe(401)
    expect((await call(tabletSubtasksDone, { method: 'POST', token: null, body: { marks: [] } })).status).toBe(401)
  })

  it('devuelve tareas con datos de Hoy y su orden', async () => {
    const a = await insertTask(ownerId, 'Primera de hoy', { deadline: '2026-11-02' })
    await db.query('update tasks set in_today = true, today_position = 1, hidden_in_today = false where id = $1', [a])
    const b = await insertTask(ownerId, 'Oculta', {})
    await db.query('update tasks set in_today = true, today_position = 0, hidden_in_today = true where id = $1', [b])

    const response = await call(tabletSync)
    expect(response.status).toBe(200)
    const payload = response.payload as SyncPayload
    expect(Object.keys(payload).sort()).toEqual(['categories', 'notes', 'serverTime', 'tasks'])
    const first = payload.tasks.find((t) => t.id === a)!
    expect(first).toMatchObject({ title: 'Primera de hoy', done: false, inToday: true, hiddenInToday: false, todayPosition: 1, due: '2026-11-02' })
    expect(payload.tasks.find((t) => t.id === b)).toMatchObject({ inToday: true, hiddenInToday: true, todayPosition: 0 })
  })

  it('incluye subtareas y links ordenados', async () => {
    const id = await insertTask(ownerId, 'Con hijos')
    await insertSubtask(id, 'Segunda', 1, true)
    await insertSubtask(id, 'Primera', 0)
    await db.query('insert into task_links (task_id, url, title, position) values ($1, $2, $3, 0)', [id, 'https://a.com', 'A'])

    const task = (await call(tabletSync)).payload as SyncPayload
    const t = task.tasks.find((x) => x.id === id)!
    expect(t.subtasks.map((s) => [s.title, s.done])).toEqual([['Primera', false], ['Segunda', true]])
    expect(t.links).toEqual([{ url: 'https://a.com', title: 'A' }])
  })

  it('categorías en orden de la app', async () => {
    await insertCategory(ownerId, 'Zeta')
    await db.query("update categories set position = 0 where name = 'Zeta'")
    const casa = await insertCategory(ownerId, 'Casa')
    await db.query('update categories set position = 1 where id = $1', [casa])
    const id = await insertTask(ownerId, 'En casa', { categoryId: casa })

    const payload = (await call(tabletSync)).payload as SyncPayload
    expect(payload.categories.map((c) => c.name)).toEqual(['Zeta', 'Casa'])
    expect(payload.tasks.find((t) => t.id === id)!.categoryId).toBe(casa)
  })

  it('sync no incluye notas de contraseña', async () => {
    await insertNote(ownerId, 'Wifi de casa', { kind: 'password', description: 'la clave del router' })
    await insertNote(ownerId, 'Lista de libros')

    const payload = (await call(tabletSync)).payload as SyncPayload
    expect(payload.notes.map((n) => n.title)).toEqual(['Lista de libros'])
    const raw = JSON.stringify(payload)
    expect(raw).not.toContain('Wifi de casa')
    expect(raw).not.toContain('secreto-123')
    expect(raw).not.toContain('la clave del router')
  })

  it('notas en texto plano con etiquetas, más recientes primero', async () => {
    await insertNote(ownerId, 'Vieja', { updatedAt: '2026-01-01T00:00:00Z' })
    await insertNote(ownerId, 'Nueva', {
      updatedAt: '2026-10-01T00:00:00Z',
      description: '<p>Hola <strong>Vale</strong></p><p>Segundo &amp; párrafo</p>',
      tags: ['ideas'],
    })

    const payload = (await call(tabletSync)).payload as SyncPayload
    expect(payload.notes.map((n) => n.title)).toEqual(['Nueva', 'Vieja'])
    expect(payload.notes[0]).toMatchObject({ text: 'Hola Vale\nSegundo & párrafo', tags: ['ideas'] })
  })

  it('recorta textos largos', async () => {
    const long = '<p>' + 'a'.repeat(20_000) + '</p>'
    const id = await insertTask(ownerId, 'Larga')
    await db.query('update tasks set description = $2, notes = $2 where id = $1', [id, long])
    await insertNote(ownerId, 'Nota larga', { description: long })

    const payload = (await call(tabletSync)).payload as SyncPayload
    const task = payload.tasks.find((t) => t.id === id)!
    expect((task.description as string).length).toBeLessThanOrEqual(2000)
    expect((task.notes as string).length).toBeLessThanOrEqual(2000)
    expect((payload.notes[0].text as string).length).toBeLessThanOrEqual(4000)
  })

  it('tope de 200 tareas con abiertas primero', async () => {
    await db.query(
      `insert into tasks (user_id, title, status, completed_at)
       select $1, 'hecha ' || n, 'hecha', now() - interval '1 hour' from generate_series(1, 20) n`,
      [ownerId],
    )
    await db.query(`insert into tasks (user_id, title) select $1, 'abierta ' || n from generate_series(1, 195) n`, [ownerId])
    const payload = (await call(tabletSync)).payload as SyncPayload
    expect(payload.tasks).toHaveLength(200)
    expect(payload.tasks.filter((t) => !t.done)).toHaveLength(195)
  })

  it('texto plano conserva párrafos y saltos', () => {
    expect(plainTextWithBreaks('<p>uno</p><ul><li>dos</li><li>tres</li></ul>cuatro<br>cinco', 100)).toBe(
      'uno\ndos\ntres\ncuatro\ncinco',
    )
    expect(plainTextWithBreaks(null, 10)).toBe('')
    expect(plainTextWithBreaks('texto sin tags', 5)).toBe('texto')
  })

  it('marca subtarea hecha', async () => {
    const task = await insertTask(ownerId, 'Padre')
    const sub = await insertSubtask(task, 'Hija', 0)
    const response = await call(tabletSubtasksDone, { method: 'POST', body: { marks: [{ id: sub, doneAt: '' }] } })
    expect(response.status).toBe(200)
    expect(response.payload).toEqual({ applied: [sub], unknown: [] })
    const { rows } = await db.query<{ done: boolean }>('select done from subtasks where id = $1', [sub])
    expect(rows[0].done).toBe(true)
  })

  it('subtarea: dos veces da lo mismo', async () => {
    const task = await insertTask(ownerId, 'Padre')
    const sub = await insertSubtask(task, 'Hija', 0)
    const body = { marks: [{ id: sub }] }
    const first = await call(tabletSubtasksDone, { method: 'POST', body })
    const second = await call(tabletSubtasksDone, { method: 'POST', body })
    expect(second).toEqual(first)
  })

  it('subtarea de otra cuenta va a unknown', async () => {
    const other = await insertUser('otra')
    const foreignTask = await insertTask(other, 'Ajena')
    const foreign = await insertSubtask(foreignTask, 'Ajena hija', 0)
    const response = await call(tabletSubtasksDone, {
      method: 'POST',
      body: { marks: [{ id: foreign }, { id: 'no-es-uuid' }] },
    })
    expect(response.payload).toEqual({ applied: [], unknown: [foreign, 'no-es-uuid'] })
    const { rows } = await db.query<{ done: boolean }>('select done from subtasks where id = $1', [foreign])
    expect(rows[0].done).toBe(false)
  })
})
