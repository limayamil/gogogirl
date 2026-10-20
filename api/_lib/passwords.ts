// Usuario y contrasena de la cuenta. Puro: no toca la base, para poder testearlo
// sin DATABASE_URL. El hash es bcrypt (bcryptjs, puro JS: en Netlify no hay que
// compilar un binario nativo). La contrasena en claro no se guarda ni se loguea.
//
// notes.password es otra cosa: es el secreto que la persona anoto para volver a
// leerlo. Hashearlo lo haria irrecuperable. Eso no pasa por aca.

import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { badRequest, type ApiRequest } from './http.ts'

const BCRYPT_ROUNDS = 10

/**
 * Hash bcrypt de un string que no es contrasena de nadie. Sirve para que un
 * login con usuario inexistente tarde lo mismo que uno real. passwordMatches
 * igual devuelve false si la cuenta no tiene hash.
 */
const DUMMY_PASSWORD_HASH = '$2b$10$N4HGmfUXYqxIWqemHwrH8u.0A1wD8E4kQRN05ShNE3SxNUg9gGgbi'

const USERNAME_RE = /^[\p{L}\p{N}._-]+$/u

export const SESSION_COOKIE = 'gogogirl_session'
/** Otra cookie: el panel interno no es una fila de users y no comparte esta sesion. */
export const ADMIN_SESSION_COOKIE = 'gogogirl_admin'
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS)
}

export async function passwordMatches(password: string, hash: string | null): Promise<boolean> {
  const ok = await bcrypt.compare(password, hash ?? DUMMY_PASSWORD_HASH)
  return hash != null && ok
}

export interface Credentials {
  username: string
  password: string
}

export function parseCredentials(input: Record<string, unknown>): Credentials {
  if (typeof input.username !== 'string' || typeof input.password !== 'string') {
    badRequest('Usuario y contrasena tienen que ser texto')
  }
  const username = input.username.trim()
  const password = input.password
  if (username.length < 3 || username.length > 32 || !USERNAME_RE.test(username)) {
    badRequest('El usuario tiene que tener entre 3 y 32 caracteres, sin espacios')
  }
  if (password.length < 8 || password.length > 200) {
    badRequest('La contrasena tiene que tener entre 8 y 200 caracteres')
  }
  return { username, password }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {}
  if (!header) return cookies
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator === -1) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name) cookies[name] = value
  }
  return cookies
}

function header(req: ApiRequest, name: string): string | undefined {
  const value = req.headers[name] ?? req.headers[name.toLowerCase()]
  if (Array.isArray(value)) return value[0]
  return value
}

export function cookieSecure(req: ApiRequest): boolean {
  const proto = header(req, 'x-forwarded-proto')
  if (!proto) return false
  return proto.split(',')[0]?.trim() === 'https'
}

export function sessionTokenFromRequest(req: ApiRequest): string | null {
  const token = parseCookies(header(req, 'cookie'))[SESSION_COOKIE]
  return token || null
}

export function adminTokenFromRequest(req: ApiRequest): string | null {
  const token = parseCookies(header(req, 'cookie'))[ADMIN_SESSION_COOKIE]
  return token || null
}

function buildCookie(name: string, value: string, secure: boolean, maxAge: number): string {
  const parts = [`${name}=${value}`, 'HttpOnly', 'Path=/', 'SameSite=Lax', `Max-Age=${maxAge}`]
  if (secure) parts.push('Secure')
  return parts.join('; ')
}

export function sessionCookie(token: string, secure: boolean): string {
  return buildCookie(SESSION_COOKIE, token, secure, SESSION_MAX_AGE_SECONDS)
}

export function clearSessionCookie(secure: boolean): string {
  return buildCookie(SESSION_COOKIE, '', secure, 0)
}

export function adminSessionCookie(token: string, secure: boolean): string {
  return buildCookie(ADMIN_SESSION_COOKIE, token, secure, SESSION_MAX_AGE_SECONDS)
}

export function clearAdminSessionCookie(secure: boolean): string {
  return buildCookie(ADMIN_SESSION_COOKIE, '', secure, 0)
}
