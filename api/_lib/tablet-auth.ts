// Acceso de la tablet e-ink ("Gogogirl - to go!"). El lector no puede loguearse con la
// cookie de la app, asi que manda un token fijo como Bearer. El token no dice de quien es
// la lista: eso lo fija TABLET_USERNAME, y la tablet ve solo las tareas de esa cuenta.
// Si falta cualquiera de las dos variables, las rutas responden 404: la tablet no existe.

import { createHash, timingSafeEqual } from 'node:crypto'
import { sql } from './db.ts'
import { HttpError, notFound, unauthorized, type ApiRequest } from './http.ts'

type Row = Record<string, unknown>

const TOKEN_ENV = 'TABLET_TOKEN'
const USERNAME_ENV = 'TABLET_USERNAME'

export function tabletConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env[TOKEN_ENV]?.trim() && env[USERNAME_ENV]?.trim())
}

/** Compara hashes de largo fijo: timingSafeEqual exige largos iguales y no debe filtrar el largo. */
function safeEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest()
  const b = createHash('sha256').update(right).digest()
  return timingSafeEqual(a, b)
}

/** True solo si el header es `Bearer <TABLET_TOKEN>`. Sin token configurado no acepta nada. */
export function requireTabletToken(req: ApiRequest): boolean {
  const expected = process.env[TOKEN_ENV]?.trim() ?? ''
  if (!expected) return false
  const raw = req.headers.authorization
  const header = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? ''
  const match = /^Bearer\s+(.+)$/i.exec(header)
  if (!match) return false
  return safeEqual(match[1].trim(), expected)
}

/** El id de la cuenta de la tablet, o corta con 404/401/503. */
export async function requireTabletUser(req: ApiRequest): Promise<string> {
  if (!tabletConfigured()) notFound()
  if (!requireTabletToken(req)) unauthorized('Token de la tablet invalido')
  const username = process.env[USERNAME_ENV]?.trim() ?? ''
  const [row] = (await sql`
    select id from users where lower(username) = lower(${username}) limit 1
  `) as Row[]
  // 503 y no 404: la ruta existe, pero esta mal configurada del lado del servidor.
  if (!row) throw new HttpError(503, 'TABLET_USERNAME no corresponde a ninguna cuenta')
  return row.id as string
}
