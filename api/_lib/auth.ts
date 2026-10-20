// Sesion de la cuenta. La cookie guarda un token opaco; en la base queda solo
// su sha256. Cada lectura y escritura de datos pide requireUser y filtra por
// ese id: un id adivinado de otra cuenta no alcanza.

import { randomBytes } from 'node:crypto'
import type { AuthSession, AuthUser } from '../../src/shared/types.ts'
import { sql } from './db.ts'
import { HttpError, unauthorized, type ApiRequest, type ApiResponse } from './http.ts'
import {
  clearSessionCookie,
  cookieSecure,
  hashPassword,
  hashToken,
  passwordMatches,
  parseCredentials,
  sessionCookie,
  sessionTokenFromRequest,
  SESSION_MAX_AGE_SECONDS,
} from './passwords.ts'

type Row = Record<string, unknown>

export { parseCredentials }

function uniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error != null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  )
}

/**
 * La cuenta que creo la migracion, todavia sin usuario. Tiene que haber una
 * sola: si hay dos, no se puede saber cual es la de los datos viejos.
 */
export async function unclaimedOwnerId(): Promise<string | null> {
  const rows = (await sql`
    select id from users where username is null and password_hash is null
  `) as Row[]
  if (rows.length > 1) {
    throw new HttpError(
      500,
      'Hay mas de una cuenta sin usuario. No asigno los datos existentes porque no se puede saber de quien son.',
    )
  }
  return rows.length === 1 ? (rows[0].id as string) : null
}

export interface AccountSession {
  user: AuthUser
  impersonated: boolean
}

/**
 * La cookie de la cuenta, si sigue viva. `impersonated` sale de la fila: una
 * sesion de "Ver como" no tiene que contar como que esa persona uso la app.
 */
export async function readSession(req: ApiRequest): Promise<AccountSession | null> {
  const token = sessionTokenFromRequest(req)
  if (!token) return null
  const [row] = (await sql`
    select u.id, u.username, s.impersonated
    from sessions s
    join users u on u.id = s.user_id
    where s.token_hash = ${hashToken(token)}
      and s.expires_at > now()
      and u.username is not null
  `) as Row[]
  if (!row) return null
  return {
    user: { id: row.id as string, username: row.username as string },
    impersonated: Boolean(row.impersonated),
  }
}

export async function currentUser(req: ApiRequest): Promise<AuthUser | null> {
  const session = await readSession(req)
  return session?.user ?? null
}

/**
 * Cada request autenticado pasa por aca. La actividad se anota como mucho
 * cada 5 minutos: alcanza para "la ultima vez que uso la app" sin escribir
 * en cada tecla. Una sesion impersonada no cuenta, la cuenta no entro.
 */
export async function requireUser(req: ApiRequest): Promise<AuthUser> {
  const session = await readSession(req)
  if (!session) unauthorized()
  if (!session.impersonated) await touchLastSeen(session.user.id)
  return session.user
}

async function touchLastSeen(userId: string): Promise<void> {
  await sql`
    update users
    set last_seen_at = now()
    where id = ${userId}
      and (last_seen_at is null or last_seen_at < now() - interval '5 minutes')
  `
}

async function authMode(): Promise<AuthSession['mode']> {
  return (await unclaimedOwnerId()) ? 'claim' : 'login'
}

export async function sessionFor(
  user: AuthUser | null,
  impersonated = false,
): Promise<AuthSession> {
  return {
    user,
    mode: await authMode(),
    impersonating: impersonated && user ? { username: user.username } : null,
  }
}

export async function openSession(
  req: ApiRequest,
  res: ApiResponse,
  userId: string,
  options?: { impersonated?: boolean },
): Promise<void> {
  const impersonated = options?.impersonated === true
  const token = randomBytes(32).toString('base64url')
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000).toISOString()
  await sql`
    insert into sessions (user_id, token_hash, expires_at, impersonated)
    values (${userId}, ${hashToken(token)}, ${expires}, ${impersonated})
  `
  // Entrar (o registrarse) es usar la app. Ver la cuenta como admin no.
  if (!impersonated) {
    await sql`update users set last_seen_at = now() where id = ${userId}`
  }
  res.setHeader('Set-Cookie', sessionCookie(token, cookieSecure(req)))
}

/**
 * Borra la cookie de la cuenta. La del panel interno tiene otro nombre, asi
 * que "Volver" desde "Ver como" no cierra la sesion de admin.
 */
export async function closeSession(req: ApiRequest, res: ApiResponse): Promise<void> {
  const token = sessionTokenFromRequest(req)
  if (token) {
    await sql`delete from sessions where token_hash = ${hashToken(token)}`
  }
  res.setHeader('Set-Cookie', clearSessionCookie(cookieSecure(req)))
}

async function usernameTaken(username: string): Promise<boolean> {
  const [row] = (await sql`
    select id from users where lower(username) = lower(${username}) limit 1
  `) as Row[]
  return Boolean(row)
}

/**
 * Le pone usuario y contrasena a la cuenta que ya tiene los datos. No inserta
 * un usuario nuevo: si lo hiciera, las filas viejas quedarian huerfanas.
 */
export async function claimOwner(
  username: string,
  password: string,
): Promise<AuthUser> {
  const ownerId = await unclaimedOwnerId()
  if (!ownerId) {
    throw new HttpError(409, 'La cuenta que ya tenia los datos ya tiene usuario y contrasena.')
  }
  if (await usernameTaken(username)) throw new HttpError(409, 'Ese usuario ya existe.')

  const passwordHash = await hashPassword(password)
  try {
    const [row] = (await sql`
      update users
      set username = ${username}, password_hash = ${passwordHash}
      where id = ${ownerId}
        and username is null
        and password_hash is null
      returning id, username
    `) as Row[]
    if (!row) {
      throw new HttpError(409, 'La cuenta que ya tenia los datos ya tiene usuario y contrasena.')
    }
    return { id: row.id as string, username: row.username as string }
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (uniqueViolation(error)) throw new HttpError(409, 'Ese usuario ya existe.')
    throw error
  }
}

/** Cuenta nueva, sin filas. No copia tareas, notas ni nada de otra cuenta. */
export async function registerUser(username: string, password: string): Promise<AuthUser> {
  if (await usernameTaken(username)) throw new HttpError(409, 'Ese usuario ya existe.')
  const passwordHash = await hashPassword(password)
  try {
    const [row] = (await sql`
      insert into users (username, password_hash)
      values (${username}, ${passwordHash})
      returning id, username
    `) as Row[]
    return { id: row.id as string, username: row.username as string }
  } catch (error) {
    if (uniqueViolation(error)) throw new HttpError(409, 'Ese usuario ya existe.')
    throw error
  }
}

export async function loginUser(username: string, password: string): Promise<AuthUser> {
  const [row] = (await sql`
    select id, username, password_hash
    from users
    where lower(username) = lower(${username})
    limit 1
  `) as Row[]
  const hash = (row?.password_hash as string | null) ?? null
  const ok = await passwordMatches(password, hash)
  if (!row || !ok) throw new HttpError(401, 'Usuario o contrasena incorrectos.')
  return { id: row.id as string, username: row.username as string }
}
