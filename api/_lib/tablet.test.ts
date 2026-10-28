import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequest, Handler } from './http.ts'
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

import tabletTasks from '../tablet-tasks.ts'
import tabletTasksDone from '../tablet-tasks-done.ts'
import { requireTabletToken } from './tablet-auth.ts'

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

async function taskRow(id: string) {
  const { rows } = await db.query<{ status: string; completed_at: unknown; updated_at: unknown }>(
    'select status, completed_at, updated_at from tasks where id = $1',
    [id],
  )
  return rows[0]
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString()
}

function request(authorization?: string): ApiRequest {
  return { method: 'GET', query: {}, headers: authorization ? { authorization } : {} }
}

describe('tablet', () => {
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

  describe('requireTabletToken', () => {
    it('acepta solo el token configurado como Bearer', () => {
      expect(requireTabletToken(request(`Bearer ${TOKEN}`))).toBe(true)
      expect(requireTabletToken(request(`bearer ${TOKEN}`))).toBe(true)
      expect(requireTabletToken(request(`Bearer ${TOKEN}x`))).toBe(false)
      expect(requireTabletToken(request(TOKEN))).toBe(false)
      expect(requireTabletToken(request())).toBe(false)
    })

    it('sin TABLET_TOKEN no acepta nada, ni siquiera un Bearer vacio', () => {
      process.env.TABLET_TOKEN = '  '
      expect(requireTabletToken(request('Bearer '))).toBe(false)
      expect(requireTabletToken(request('Bearer   '))).toBe(false)
    })
  })

  it('sin token o con uno malo responde 401 y no toca nada', async () => {
    const id = await insertTask(ownerId, 'Comprar leche')
    const before = await taskRow(id)

    for (const token of [null, 'token-equivocado']) {
      const list = await call(tabletTasks, { token })
      const done = await call(tabletTasksDone, {
        method: 'POST',
        token,
        body: { marks: [{ id, doneAt: new Date().toISOString() }] },
      })
      expect(list.status).toBe(401)
      expect(done.status).toBe(401)
      expect(list.payload).not.toHaveProperty('tasks')
    }

    expect(await taskRow(id)).toEqual(before)
  })

  it('sin las variables de la tablet la ruta no existe', async () => {
    delete process.env.TABLET_TOKEN
    expect((await call(tabletTasks)).status).toBe(404)
    process.env.TABLET_TOKEN = TOKEN
    delete process.env.TABLET_USERNAME
    expect((await call(tabletTasks)).status).toBe(404)
  })

  it('GET devuelve abiertas y hechas en las ultimas 24 h, con la forma exacta', async () => {
    const super_ = await insertCategory(ownerId, 'Súper')
    const open = await insertTask(ownerId, 'Comprar ñandú de peluche ¡ya!', {
      categoryId: super_,
      deadline: '2026-11-02',
    })
    const recent = await insertTask(ownerId, 'Regar plantas', {
      status: 'hecha',
      completedAt: hoursAgo(2),
    })
    await insertTask(ownerId, 'Hecha hace mucho', { status: 'hecha', completedAt: hoursAgo(30) })
    const other = await insertUser('otra')
    await insertTask(other, 'De otra cuenta')

    const response = await call(tabletTasks)
    expect(response.status).toBe(200)
    const payload = response.payload as { tasks: Record<string, unknown>[]; serverTime: string }
    expect(Object.keys(payload).sort()).toEqual(['serverTime', 'tasks'])
    expect(Number.isNaN(Date.parse(payload.serverTime))).toBe(false)

    expect(payload.tasks).toEqual([
      { id: open, title: 'Comprar ñandú de peluche ¡ya!', done: false, category: 'Súper', due: '2026-11-02' },
      { id: recent, title: 'Regar plantas', done: true, category: null, due: null },
    ])
  })

  it('GET corta en 200 tareas y prioriza las abiertas', async () => {
    await db.query(
      `insert into tasks (user_id, title, status, completed_at)
       select $1, 'hecha ' || n, 'hecha', now() - interval '1 hour' from generate_series(1, 20) n`,
      [ownerId],
    )
    await db.query(
      `insert into tasks (user_id, title, position)
       select $1, 'abierta ' || n, n from generate_series(1, 195) n`,
      [ownerId],
    )

    const response = await call(tabletTasks)
    const tasks = (response.payload as { tasks: { done: boolean }[] }).tasks
    expect(tasks).toHaveLength(200)
    expect(tasks.filter((task) => !task.done)).toHaveLength(195)
  })

  it('POST marca hecha con la hora de la tablet', async () => {
    const id = await insertTask(ownerId, 'Comprar pan')
    const doneAt = hoursAgo(3)

    const response = await call(tabletTasksDone, { method: 'POST', body: { marks: [{ id, doneAt }] } })

    expect(response.status).toBe(200)
    expect(response.payload).toEqual({ applied: [id], unknown: [] })
    const row = await taskRow(id)
    expect(row.status).toBe('hecha')
    expect(new Date(row.completed_at as string).toISOString()).toBe(doneAt)
  })

  it('POST dos veces con el mismo id da el mismo resultado y no mueve la hora', async () => {
    const id = await insertTask(ownerId, 'Comprar pan')
    const body = { marks: [{ id, doneAt: hoursAgo(1) }] }

    const first = await call(tabletTasksDone, { method: 'POST', body })
    const afterFirst = await taskRow(id)
    const second = await call(tabletTasksDone, { method: 'POST', body })

    expect(second).toEqual(first)
    expect((await taskRow(id)).completed_at).toEqual(afterFirst.completed_at)
  })

  it('POST no pisa la hora de una tarea que ya estaba hecha', async () => {
    const completedAt = hoursAgo(5)
    const id = await insertTask(ownerId, 'Ya hecha en la web', { status: 'hecha', completedAt })

    const response = await call(tabletTasksDone, {
      method: 'POST',
      body: { marks: [{ id, doneAt: hoursAgo(1) }] },
    })

    expect(response.payload).toEqual({ applied: [id], unknown: [] })
    expect(new Date((await taskRow(id)).completed_at as string).toISOString()).toBe(completedAt)
  })

  it('POST manda a unknown los ids que no son de la cuenta o no existen', async () => {
    const mine = await insertTask(ownerId, 'Mía')
    const other = await insertUser('otra')
    const foreign = await insertTask(other, 'Ajena')
    const missing = '00000000-0000-4000-8000-000000000000'
    const doneAt = hoursAgo(1)

    const response = await call(tabletTasksDone, {
      method: 'POST',
      body: {
        marks: [
          { id: mine, doneAt },
          { id: foreign, doneAt },
          { id: missing, doneAt },
          { id: 'no-es-un-uuid', doneAt },
        ],
      },
    })

    expect(response.status).toBe(200)
    expect(response.payload).toEqual({
      applied: [mine],
      unknown: [foreign, missing, 'no-es-un-uuid'],
    })
    expect((await taskRow(foreign)).status).toBe('pendiente')
  })

  it('POST con una hora invalida o futura usa la hora del servidor', async () => {
    const bad = await insertTask(ownerId, 'Hora rota')
    const future = await insertTask(ownerId, 'Hora del futuro')
    const before = Date.now()

    await call(tabletTasksDone, {
      method: 'POST',
      body: {
        marks: [
          { id: bad, doneAt: 'ayer a la tarde' },
          { id: future, doneAt: new Date(Date.now() + 86_400_000).toISOString() },
        ],
      },
    })

    for (const id of [bad, future]) {
      const at = new Date((await taskRow(id)).completed_at as string).getTime()
      expect(at).toBeGreaterThanOrEqual(before - 1000)
      expect(at).toBeLessThanOrEqual(Date.now() + 1000)
    }
  })

  it('POST rechaza un cuerpo sin marks o con demasiadas', async () => {
    expect((await call(tabletTasksDone, { method: 'POST', body: {} })).status).toBe(400)
    expect((await call(tabletTasksDone, { method: 'POST', body: { marks: 'x' } })).status).toBe(400)
    const many = Array.from({ length: 201 }, () => ({ id: 'x', doneAt: hoursAgo(1) }))
    expect((await call(tabletTasksDone, { method: 'POST', body: { marks: many } })).status).toBe(400)
  })
})
