import { describe, expect, it } from 'vitest'
import {
  clearSessionCookie,
  cookieSecure,
  hashPassword,
  hashToken,
  parseCookies,
  parseCredentials,
  passwordMatches,
  sessionCookie,
  sessionTokenFromRequest,
  SESSION_COOKIE,
} from './passwords.ts'
import type { ApiRequest } from './http.ts'

const req = (headers: Record<string, string>): ApiRequest => ({
  query: {},
  headers,
})

describe('contrasena de la cuenta', () => {
  it('guarda bcrypt y no el texto', async () => {
    const password = 'correcta-123'
    const hash = await hashPassword(password)

    expect(hash).not.toContain(password)
    expect(hash.startsWith('$2')).toBe(true)
    expect(await passwordMatches(password, hash)).toBe(true)
    expect(await passwordMatches('otra-clave', hash)).toBe(false)
  })

  it('un usuario inexistente no coincide, aunque se compare igual', async () => {
    expect(await passwordMatches('correcta-123', null)).toBe(false)
  })

  it('rechaza usuario o contrasena que no sirven para entrar', () => {
    expect(() => parseCredentials({ username: 'ab', password: '12345678' })).toThrow(/3 y 32/)
    expect(() => parseCredentials({ username: 'ana', password: 'corta' })).toThrow(/8 y 200/)
    expect(() => parseCredentials({ username: 'ana maria', password: '12345678' })).toThrow(/espacios/)
    expect(parseCredentials({ username: '  Ana  ', password: '12345678' })).toEqual({
      username: 'Ana',
      password: '12345678',
    })
  })
})

describe('cookie de sesion', () => {
  it('es httpOnly y no se marca Secure en http local', () => {
    const header = sessionCookie('token-opaco', false)

    expect(header).toContain(`${SESSION_COOKIE}=token-opaco`)
    expect(header).toContain('HttpOnly')
    expect(header).toContain('SameSite=Lax')
    expect(header).not.toContain('Secure')
    expect(header).not.toContain('token-opaco-hash')
  })

  it('marca Secure detras de https', () => {
    expect(cookieSecure(req({ 'x-forwarded-proto': 'https' }))).toBe(true)
    expect(sessionCookie('t', true)).toContain('Secure')
    expect(clearSessionCookie(true)).toContain('Max-Age=0')
    expect(clearSessionCookie(true)).toContain('HttpOnly')
  })

  it('lee el token de la cookie y guarda solo su hash', () => {
    const token = 'abc.def'
    expect(parseCookies(`${SESSION_COOKIE}=${token}; otra=1`)[SESSION_COOKIE]).toBe(token)
    expect(sessionTokenFromRequest(req({ cookie: `${SESSION_COOKIE}=${token}` }))).toBe(token)
    expect(hashToken(token)).not.toBe(token)
    expect(hashToken(token)).toMatch(/^[a-f0-9]{64}$/)
  })
})
