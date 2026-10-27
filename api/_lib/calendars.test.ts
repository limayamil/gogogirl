import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Handler } from './http.ts'
import type { CalendarFeed, MeetingsOfDay } from '../../src/shared/types.ts'
import { hashToken } from './passwords.ts'
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

import calendars from '../calendars/index.ts'
import calendarById from '../calendars/[id].ts'
import meetings from '../meetings.ts'
import { clearCalendarCache, icalUrl, maskIcalUrl } from './calendars.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'db', 'migrations')

const SECRET_A = 'f3a9c1d2e4b5a6978877665544332211'
const SECRET_B = '0011223344556677889900aabbccddee'
const URL_A = `https://calendar.google.com/calendar/ical/ana%40example.com/private-${SECRET_A}/basic.ics`
const URL_A2 = `https://calendar.google.com/calendar/ical/equipo%40example.com/private-${SECRET_A}x/basic.ics`
const URL_B = `https://calendar.google.com/calendar/ical/beto%40example.com/private-${SECRET_B}/basic.ics`
const URL_BROKEN = 'https://calendar.google.com/calendar/ical/roto%40example.com/private-deadbeefdeadbeef/basic.ics'
const URL_GARBAGE = 'https://calendar.google.com/calendar/ical/basura%40example.com/private-cafecafecafecafe/basic.ics'

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
  init: { method?: string; body?: unknown; cookie: string; id?: string },
) {
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
  await handler(
    {
      method: init.method ?? 'GET',
      query: init.id ? { id: init.id } : {},
      headers: { cookie: init.cookie },
      body: init.body,
    },
    res,
  )
  return { status, payload, raw: JSON.stringify(payload) }
}

async function account(username: string, impersonated = false): Promise<{ id: string; cookie: string }> {
  const { rows } = await db.query<{ id: string }>(
    `insert into users (username, password_hash) values ($1, 'hash') returning id`,
    [username],
  )
  const token = `token-${username}-${impersonated}`
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at, impersonated)
     values ($1, $2, now() + interval '1 day', $3)`,
    [rows[0].id, hashToken(token), impersonated],
  )
  return { id: rows[0].id, cookie: `gogogirl_session=${token}` }
}

async function sessionFor(userId: string, impersonated: boolean): Promise<string> {
  const token = `extra-${userId}-${impersonated}`
  await db.query(
    `insert into sessions (user_id, token_hash, expires_at, impersonated)
     values ($1, $2, now() + interval '1 day', $3)`,
    [userId, hashToken(token), impersonated],
  )
  return `gogogirl_session=${token}`
}

function feed(title: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'BEGIN:VEVENT',
    `UID:${title}`,
    `SUMMARY:${title}`,
    'DTSTART;TZID=America/Argentina/Buenos_Aires:20261027T100000',
    'DTEND;TZID=America/Argentina/Buenos_Aires:20261027T110000',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

const fetchMock = vi.fn(async (input: string | URL) => {
  const url = String(input)
  if (url === URL_A) return new Response(feed('Reunión de Ana'), { status: 200 })
  if (url === URL_A2) return new Response(feed('Equipo de Ana'), { status: 200 })
  if (url === URL_B) return new Response(feed('Reunión de Beto'), { status: 200 })
  if (url === URL_BROKEN) return new Response('Not found', { status: 404 })
  if (url === URL_GARBAGE) return new Response('<html>hola</html>', { status: 200 })
  throw new Error(`fetch inesperado a ${url}`)
})

async function addCalendar(cookie: string, url: string, name = 'Trabajo') {
  const response = await call(calendars, {
    method: 'POST',
    cookie,
    body: { name, colorKey: 'lila', url },
  })
  expect(response.status).toBe(201)
  return response.payload as CalendarFeed
}

function expectNoSecret(raw: string) {
  for (const secret of [SECRET_A, SECRET_B, 'deadbeefdeadbeef', 'cafecafecafecafe', 'private-']) {
    expect(raw).not.toContain(secret)
  }
  expect(raw).not.toContain('%40example.com')
}

describe('calendarios por iCal', () => {
  beforeAll(async () => {
    db = new PGlite()
    dbRef.current = tag(db)
    await applyMigrations(db)
  })

  afterAll(async () => {
    await db.close()
  })

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T15:00:00Z'))
    vi.stubGlobal('fetch', fetchMock)
    fetchMock.mockClear()
    clearCalendarCache()
    await db.exec('truncate table users restart identity cascade')
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('solo acepta https://calendar.google.com/calendar/ical/', () => {
    expect(icalUrl(`  ${URL_A}#x `)).toBe(URL_A)
    for (const bad of [
      URL_A.replace('https:', 'http:'),
      URL_A.replace('calendar.google.com', 'calendar.google.com.evil.example'),
      URL_A.replace('calendar.google.com', 'evil.example'),
      URL_A.replace('calendar.google.com', 'calendar.google.com:8443'),
      URL_A.replace('https://', 'https://user:pass@'),
      'https://calendar.google.com/calendar/embed?src=ana',
      'webcal://calendar.google.com/calendar/ical/x/basic.ics',
      'no es una url',
      '',
      null,
    ]) {
      expect(() => icalUrl(bad)).toThrow()
    }
    expect(maskIcalUrl(URL_A)).toBe('calendar.google.com/…/••••2211/basic.ics')
  })

  it('nunca devuelve la direccion secreta despues de guardarla', async () => {
    const ana = await account('ana')
    const created = await addCalendar(ana.cookie, URL_A)
    expect(created).toEqual({
      id: created.id,
      name: 'Trabajo',
      colorKey: 'lila',
      maskedUrl: 'calendar.google.com/…/••••2211/basic.ics',
      position: 0,
    })

    const { rows } = await db.query<{ ical_url: string }>('select ical_url from calendars')
    expect(rows[0].ical_url).toBe(URL_A)

    const responses = [
      await call(calendars, { cookie: ana.cookie }),
      await call(calendarById, {
        method: 'PATCH',
        cookie: ana.cookie,
        id: created.id,
        body: { name: 'Laburo', colorKey: 'menta' },
      }),
      await call(calendarById, {
        method: 'PATCH',
        cookie: ana.cookie,
        id: created.id,
        body: { url: URL_A2 },
      }),
      await call(meetings, { cookie: ana.cookie }),
      await call(calendars, { method: 'POST', cookie: ana.cookie, body: { name: 'x', colorKey: 'lila', url: 'http://calendar.google.com/calendar/ical/a/basic.ics' } }),
    ]
    for (const response of responses) expectNoSecret(response.raw)
    expect(responses[4].status).toBe(400)

    const list = responses[0].payload as { calendars: CalendarFeed[] }
    expect(list.calendars).toHaveLength(1)
    expect(responses[1].payload).toMatchObject({ name: 'Laburo', colorKey: 'menta' })
    expect((responses[3].payload as MeetingsOfDay).meetings.map((m) => m.title)).toEqual(['Equipo de Ana'])
  })

  it('una cuenta no ve, cambia ni borra los calendarios de otra', async () => {
    const ana = await account('ana')
    const beto = await account('beto')
    const anaCalendar = await addCalendar(ana.cookie, URL_A, 'De Ana')
    await addCalendar(beto.cookie, URL_B, 'De Beto')

    const betoList = (await call(calendars, { cookie: beto.cookie })).payload as { calendars: CalendarFeed[] }
    expect(betoList.calendars.map((c) => c.name)).toEqual(['De Beto'])

    const patch = await call(calendarById, {
      method: 'PATCH',
      cookie: beto.cookie,
      id: anaCalendar.id,
      body: { name: 'Robado', url: URL_B },
    })
    const remove = await call(calendarById, { method: 'DELETE', cookie: beto.cookie, id: anaCalendar.id })
    expect(patch.status).toBe(404)
    expect(remove.status).toBe(404)

    const { rows } = await db.query<{ name: string; ical_url: string }>(
      'select name, ical_url from calendars where id = $1',
      [anaCalendar.id],
    )
    expect(rows[0]).toEqual({ name: 'De Ana', ical_url: URL_A })

    const betoDay = (await call(meetings, { cookie: beto.cookie })).payload as MeetingsOfDay
    expect(betoDay.meetings.map((m) => m.title)).toEqual(['Reunión de Beto'])
    expect(betoDay.calendars.map((c) => c.name)).toEqual(['De Beto'])
    expect(fetchMock.mock.calls.map(([url]) => String(url))).toEqual([URL_B])

    const anonymous = await call(meetings, { cookie: 'gogogirl_session=otro' })
    expect(anonymous.status).toBe(401)
  })

  it('"Ver como" muestra las reuniones de la cuenta pero no su direccion', async () => {
    const ana = await account('ana')
    await addCalendar(ana.cookie, URL_A)
    const viewing = await sessionFor(ana.id, true)

    const list = await call(calendars, { cookie: viewing })
    const day = await call(meetings, { cookie: viewing })
    expectNoSecret(list.raw)
    expectNoSecret(day.raw)
    expect((day.payload as MeetingsOfDay).meetings.map((m) => m.title)).toEqual(['Reunión de Ana'])
  })

  it('un feed roto no corta los demas y dice cual fallo', async () => {
    const ana = await account('ana')
    await addCalendar(ana.cookie, URL_BROKEN, 'Roto')
    await addCalendar(ana.cookie, URL_A, 'Bien')
    await addCalendar(ana.cookie, URL_GARBAGE, 'Basura')

    const response = await call(meetings, { cookie: ana.cookie })
    expect(response.status).toBe(200)
    const day = response.payload as MeetingsOfDay
    expect(day.date).toBe('2026-10-27')
    expect(day.timeZone).toBe('America/Argentina/Buenos_Aires')
    expect(day.meetings.map((m) => m.title)).toEqual(['Reunión de Ana'])
    expect(day.calendars.map((c) => [c.name, c.ok, c.error])).toEqual([
      ['Roto', false, 'Google no encontró el calendario. Revisá la dirección secreta.'],
      ['Bien', true, null],
      ['Basura', false, 'Lo que devolvió Google no es un calendario iCal.'],
    ])
    expectNoSecret(response.raw)
  })

  it('guarda el feed unos minutos y lo vuelve a pedir despues', async () => {
    const ana = await account('ana')
    await addCalendar(ana.cookie, URL_A)

    await call(meetings, { cookie: ana.cookie })
    await call(meetings, { cookie: ana.cookie })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-10-27T15:06:00Z'))
    await call(meetings, { cookie: ana.cookie })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
