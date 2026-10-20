// Credenciales del panel interno. No viven en users: si lo hicieran, el
// registro podria crearlas y el listado las mostraria como una cuenta mas.
// Si falta el usuario o el hash, las rutas responden 404: /interno no existe.

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { AdminUserSummary, AuthUser } from '../../src/shared/types.ts'
import { sql } from './db.ts'
import { HttpError, notFound, unauthorized, type ApiRequest, type ApiResponse } from './http.ts'
import {
  adminSessionCookie,
  adminTokenFromRequest,
  clearAdminSessionCookie,
  cookieSecure,
  hashToken,
  passwordMatches,
  SESSION_MAX_AGE_SECONDS,
} from './passwords.ts'

type Row = Record<string, unknown>

const USERNAME_ENV = 'GOGOGIRL_ADMIN_USERNAME'
const HASH_ENV = 'GOGOGIRL_ADMIN_PASSWORD_HASH'

export function adminConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[USERNAME_ENV]?.trim() && env[HASH_ENV]?.trim())
}

/** 404 y no 401: sin las variables la ruta no esta, no es un login fallido. */
export function assertAdminEnabled(): void {
  if (!adminConfigured()) notFound()
}

function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest()
  const b = createHash('sha256').update(right).digest()
  return timingSafeEqual(a, b)
}

/**
 * Siempre corre bcrypt, coincida o no el usuario, para no avisar con el
 * tiempo de respuesta si el nombre existe. El mensaje lo pone el handler.
 */
export async function adminCredentialsMatch(username: string, password: string): Promise<boolean> {
  const expectedUser = process.env[USERNAME_ENV]?.trim() ?? ''
  const expectedHash = process.env[HASH_ENV]?.trim() ?? ''
  const userOk = safeEqual(username, expectedUser)
  const passwordOk = await passwordMatches(password, expectedHash || null)
  return userOk && passwordOk
}

export async function adminAuthenticated(req: ApiRequest): Promise<boolean> {
  const token = adminTokenFromRequest(req)
  if (!token) return false
  const [row] = (await sql`
    select id from admin_sessions
    where token_hash = ${hashToken(token)}
      and expires_at > now()
  `) as Row[]
  return Boolean(row)
}

export async function requireAdmin(req: ApiRequest): Promise<void> {
  assertAdminEnabled()
  if (!(await adminAuthenticated(req))) unauthorized()
}

export async function openAdminSession(req: ApiRequest, res: ApiResponse): Promise<void> {
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
  await sql`
    insert into admin_sessions (token_hash, expires_at)
    values (${hashToken(token)}, ${expires})
  `
  res.setHeader('Set-Cookie', adminSessionCookie(token, cookieSecure(req)))
}

export async function closeAdminSession(req: ApiRequest, res: ApiResponse): Promise<void> {
  const token = adminTokenFromRequest(req)
  if (token) {
    await sql`delete from admin_sessions where token_hash = ${hashToken(token)}`
  }
  res.setHeader('Set-Cookie', clearAdminSessionCookie(cookieSecure(req)))
}

function toIso(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

/** Conteos por cuenta. No selecciona hashes, cuerpos ni notes.password. */
export async function listUsers(): Promise<AdminUserSummary[]> {
  const rows = (await sql`
    select
      u.id,
      u.username,
      u.created_at,
      u.last_seen_at,
      (select count(*)::int from tasks t where t.user_id = u.id) as task_count,
      (select count(*)::int from notes n where n.user_id = u.id) as note_count
    from users u
    order by u.created_at asc, u.username asc nulls first
  `) as Row[]

  return rows.map((row) => ({
    id: row.id as string,
    username: (row.username as string | null) ?? null,
    createdAt: toIso(row.created_at) ?? '',
    lastSeenAt: toIso(row.last_seen_at),
    taskCount: Number(row.task_count),
    noteCount: Number(row.note_count),
  }))
}

export async function userForImpersonation(id: string): Promise<AuthUser | null> {
  const [row] = (await sql`
    select id, username
    from users
    where id = ${id}
      and username is not null
  `) as Row[]
  if (!row) return null
  return { id: row.id as string, username: row.username as string }
}

export function rejectAdminLogin(): never {
  throw new HttpError(401, 'Usuario o contrasena incorrectos.')
}
