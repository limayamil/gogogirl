import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Handler } from './http.ts'
import { impersonationBanner } from '../../src/lib/impersonation.ts'
import { hashPassword, hashToken } from './passwords.ts'
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

import adminSession from '../admin/session.ts'
import adminLogin from '../admin/login.ts'
import adminUsers from '../admin/users.ts'
import adminImpersonate from '../admin/impersonate.ts'
import authLogin from '../auth/login.ts'
import authLogout from '../auth/logout.ts'
import authSession from '../auth/session.ts'
import version from '../version.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migrationsDir = join(root, 'db', 'migrations')

const ADMIN_USER = 'interno'
const ADMIN_PASSWORD = 'clave-admin-123'

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
  init: { method?: string; body?: unknown; cookie?: string } = {},
) {
  const headers: Record<string, string | undefined> = {}
  if (init.cookie) headers.cookie = init.cookie
  let status = 200
  let payload: unknown
  const responseHeaders: Record<string, string> = {}
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
    setHeader(name: string, value: string) {
      responseHeaders[name.toLowerCase()] = value
    },
    end() {},
  }
  await handler({ method: init.method ?? 'GET', query: {}, headers, body: init.body }, res)
  return { status, payload, headers: responseHeaders }
}

function cookiePair(setCookie: string | undefined): string {
  if (!setCookie) throw new Error('falta Set-Cookie')
  return setCookie.split(';')[0]
}

function millis(value: unknown): number | null {
  if (value == null) return null
  return new Date(value as string).getTime()
}

async function userCount(): Promise<number> {
  const { rows } = await db.query<{ n: number }>('select count(*)::int as n from users')
  return Number(rows[0].n)
}

async function hashes(): Promise<string[]> {
  const { rows } = await db.query<{ password_hash: string | null }>(
    'select password_hash from users order by username nulls first',
  )
  return rows.map((row) => row.password_hash ?? '')
}

async function lastSeen(id: string): Promise<number | null> {
  const { rows } = await db.query<{ last_seen_at: unknown }>(
    'select last_seen_at from users where id = $1',
    [id],
  )
  return millis(rows[0]?.last_seen_at)
}

async function insertUser(username: string, passwordHash = 'hash-que-no-sale'): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    'insert into users (username, password_hash) values ($1, $2) returning id',
    [username, passwordHash],
  )
  return rows[0].id
}

describe('panel interno', () => {
  beforeAll(async () => {
    db = new PGlite()
    dbRef.current = tag(db)
    await applyMigrations(db)
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    delete process.env.GOGOGIRL_ADMIN_USERNAME
    delete process.env.GOGOGIRL_ADMIN_PASSWORD_HASH
    await db.exec('truncate table users, admin_sessions restart identity cascade')
  })

  it('sin variables responde 404 y no manda datos de formulario', async () => {
    const handlers = [adminSession, adminLogin, adminUsers, adminImpersonate]
    for (const handler of handlers) {
      const response = await call(handler, {
        method: handler === adminSession || handler === adminUsers ? 'GET' : 'POST',
        body: { username: 'interno', password: 'clave-admin-123', userId: 'x' },
        cookie: 'gogogirl_admin=token-viejo',
      })
      expect(response.status).toBe(404)
      expect(response.payload).toEqual({ error: 'No encontrado' })
      const keys = Object.keys(response.payload as object)
      expect(keys).not.toContain('username')
      expect(keys).not.toContain('password')
      expect(keys).not.toContain('users')
    }

    process.env.GOGOGIRL_ADMIN_USERNAME = '   '
    process.env.GOGOGIRL_ADMIN_PASSWORD_HASH = ''
    const empty = await call(adminSession)
    expect(empty.status).toBe(404)
    expect(empty.payload).toEqual({ error: 'No encontrado' })
  })

  it('rechaza una contrasena mala sin tocar users ni abrir sesion', async () => {
    process.env.GOGOGIRL_ADMIN_USERNAME = ADMIN_USER
    process.env.GOGOGIRL_ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_PASSWORD)
    const id = await insertUser('ana', 'hash-ana')
    const beforeCount = await userCount()
    const beforeHashes = await hashes()

    const wrongPassword = await call(adminLogin, {
      method: 'POST',
      body: { username: ADMIN_USER, password: 'otra-clave-distinta' },
    })
    const wrongUser = await call(adminLogin, {
      method: 'POST',
      body: { username: 'otra-persona', password: ADMIN_PASSWORD },
    })

    expect(wrongPassword.status).toBe(401)
    expect(wrongUser.status).toBe(401)
    expect(wrongPassword.payload).toEqual(wrongUser.payload)
    expect(wrongPassword.payload).toEqual({ error: 'Usuario o contrasena incorrectos.' })
    expect(wrongPassword.headers['set-cookie']).toBeUndefined()
    expect(await userCount()).toBe(beforeCount)
    expect(await hashes()).toEqual(beforeHashes)
    expect(await lastSeen(id)).toBeNull()

    const sessions = await db.query('select id from admin_sessions')
    expect(sessions.rows).toHaveLength(0)
  })

  it('lista tareas y notas de cada cuenta, sin secretos', async () => {
    process.env.GOGOGIRL_ADMIN_USERNAME = ADMIN_USER
    process.env.GOGOGIRL_ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_PASSWORD)
    const ana = await insertUser('ana', 'hash-ana-no-sale')
    const bela = await insertUser('bela', 'hash-bela-no-sale')
    await db.query(`insert into tasks (user_id, title) values ($1, 'regar'), ($1, 'comprar')`, [ana])
    await db.query(`insert into quick_tasks (user_id, title) values ($1, 'agua')`, [ana])
    await db.query(
      `insert into notes (user_id, title, description) values ($1, 'lista', 'cuerpo-secreto-de-la-nota')`,
      [ana],
    )
    await db.query(
      `insert into notes (user_id, title, kind, username, password)
       values ($1, 'banco', 'password', 'ana', 'clave-de-la-nota')`,
      [ana],
    )
    await db.query(`insert into tasks (user_id, title) values ($1, 'llamar')`, [bela])

    const login = await call(adminLogin, {
      method: 'POST',
      body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
    })
    expect(login.status).toBe(200)
    const cookie = cookiePair(login.headers['set-cookie'])
    expect(login.headers['set-cookie']).toContain('HttpOnly')
    const token = cookie.split('=')[1]
    const stored = await db.query<{ token_hash: string }>('select token_hash from admin_sessions')
    expect(stored.rows[0].token_hash).toBe(hashToken(token))
    expect(stored.rows[0].token_hash).not.toBe(token)
    expect(await userCount()).toBe(2)

    const listed = await call(adminUsers, { cookie })
    expect(listed.status).toBe(200)
    const users = (listed.payload as { users: Array<Record<string, unknown>> }).users
    const allowed = ['createdAt', 'id', 'lastSeenAt', 'noteCount', 'taskCount', 'username']
    for (const user of users) expect(Object.keys(user).sort()).toEqual(allowed)

    const byName = new Map(users.map((user) => [user.username, user]))
    expect(byName.get('ana')).toMatchObject({ taskCount: 2, noteCount: 2 })
    expect(byName.get('bela')).toMatchObject({ taskCount: 1, noteCount: 0 })

    const raw = JSON.stringify(listed.payload)
    expect(raw).not.toContain('hash-ana-no-sale')
    expect(raw).not.toContain('hash-bela-no-sale')
    expect(raw).not.toContain('cuerpo-secreto-de-la-nota')
    expect(raw).not.toContain('clave-de-la-nota')
    expect(raw).not.toContain('password')
  })

  it('entrar anota last_seen y un request propio lo refresca, ver como no', async () => {
    process.env.GOGOGIRL_ADMIN_USERNAME = ADMIN_USER
    process.env.GOGOGIRL_ADMIN_PASSWORD_HASH = await hashPassword(ADMIN_PASSWORD)
    const passwordHash = await hashPassword('usuario-clave-123')
    const ana = await insertUser('ana', passwordHash)
    await db.query(`update users set last_seen_at = '2020-01-01T00:00:00Z' where id = $1`, [ana])
    const frozen = await lastSeen(ana)

    const admin = await call(adminLogin, {
      method: 'POST',
      body: { username: ADMIN_USER, password: ADMIN_PASSWORD },
    })
    const adminCookie = cookiePair(admin.headers['set-cookie'])
    expect(await lastSeen(ana)).toBe(frozen)

    const impersonated = await call(adminImpersonate, {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: ana },
    })
    expect(impersonated.status).toBe(200)
    expect(impersonated.payload).toMatchObject({
      impersonating: { username: 'ana' },
      user: { username: 'ana' },
    })
    expect(impersonationBanner(impersonated.payload as { impersonating: { username: string } })).toEqual({
      username: 'ana',
    })
    expect(await lastSeen(ana)).toBe(frozen)

    const userCookie = cookiePair(impersonated.headers['set-cookie'])
    const flags = await db.query<{ impersonated: boolean; token_hash: string }>(
      'select impersonated, token_hash from sessions where user_id = $1',
      [ana],
    )
    expect(flags.rows).toHaveLength(1)
    expect(flags.rows[0].impersonated).toBe(true)
    expect(flags.rows[0].token_hash).not.toBe(userCookie.split('=')[1])

    const whileViewing = await call(version, { cookie: userCookie })
    expect(whileViewing.status).toBe(200)
    expect(await lastSeen(ana)).toBe(frozen)

    const sessionWhileViewing = await call(authSession, { cookie: userCookie })
    expect(sessionWhileViewing.payload).toMatchObject({ impersonating: { username: 'ana' } })
    expect(
      impersonationBanner(sessionWhileViewing.payload as { impersonating: { username: string } | null }),
    ).toEqual({ username: 'ana' })

    const back = await call(authLogout, { method: 'POST', cookie: userCookie })
    expect(back.status).toBe(200)
    expect(back.payload).toMatchObject({ user: null, impersonating: null })
    expect(impersonationBanner(back.payload as { impersonating: null })).toBeNull()
    expect(back.headers['set-cookie']).toContain('gogogirl_session=')
    expect(back.headers['set-cookie']).not.toContain('gogogirl_admin')
    expect(await call(adminUsers, { cookie: adminCookie })).toMatchObject({ status: 200 })
    const gone = await db.query('select id from sessions')
    expect(gone.rows).toHaveLength(0)

    const login = await call(authLogin, {
      method: 'POST',
      body: { username: 'ana', password: 'usuario-clave-123' },
    })
    expect(login.status).toBe(200)
    expect(login.payload).toMatchObject({ impersonating: null, user: { username: 'ana' } })
    expect(impersonationBanner(login.payload as { impersonating: null })).toBeNull()
    const ownCookie = cookiePair(login.headers['set-cookie'])
    const loggedAt = await lastSeen(ana)
    expect(loggedAt).not.toBeNull()
    expect(loggedAt).not.toBe(frozen)

    const ownSession = await call(authSession, { cookie: ownCookie })
    expect(ownSession.payload).toMatchObject({ impersonating: null })
    expect(impersonationBanner(ownSession.payload as { impersonating: null })).toBeNull()

    const fresh = await call(version, { cookie: ownCookie })
    expect(fresh.status).toBe(200)
    expect(await lastSeen(ana)).toBe(loggedAt)

    await db.query(`update users set last_seen_at = now() - interval '10 minutes' where id = $1`, [ana])
    const stale = await lastSeen(ana)
    const bumped = await call(version, { cookie: ownCookie })
    expect(bumped.status).toBe(200)
    const next = await lastSeen(ana)
    expect(next).not.toBeNull()
    expect(stale).not.toBeNull()
    expect(next!).toBeGreaterThan(stale!)
  })

  it('registra las rutas de admin en el servidor de desarrollo y en Netlify', async () => {
    const dev = await readFile(join(root, 'scripts', 'dev-server.ts'), 'utf8')
    const netlify = await readFile(join(root, 'netlify', 'functions', 'api.mts'), 'utf8')
    for (const route of [
      '/api/admin/session',
      '/api/admin/login',
      '/api/admin/logout',
      '/api/admin/users',
      '/api/admin/impersonate',
    ]) {
      expect(dev).toContain(route)
      expect(netlify).toContain(route)
    }
    expect(netlify).toContain("from '../../api/admin/session.ts'")
  })
})
