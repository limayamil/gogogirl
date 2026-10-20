import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { splitSqlStatements } from './sql-split.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

async function applyFile(db: PGlite, file: string) {
  const source = await readFile(join(migrationsDir, file), 'utf8')
  for (const statement of splitSqlStatements(source)) {
    try {
      await db.exec(statement)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (/create extension/i.test(statement) && /pgcrypto|extension/i.test(message)) continue
      throw error
    }
  }
}

function millis(value: unknown): number | null {
  if (value == null) return null
  return new Date(value as string).getTime()
}

describe('migracion del panel interno', () => {
  it('solo agrega columna, marca y tabla, y rellena last_seen con la sesion mas nueva', async () => {
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    let adminMigration = ''
    for (const file of files) {
      const source = await readFile(join(migrationsDir, file), 'utf8')
      if (source.includes('last_seen_at') && source.includes('admin_sessions')) adminMigration = file
    }
    expect(adminMigration > '006_accounts.sql').toBe(true)

    const source = await readFile(join(migrationsDir, adminMigration), 'utf8')
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/\bdelete\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
    expect(code).not.toMatch(/\bdrop\b/i)

    const db = new PGlite()
    for (const file of files) {
      if (file >= adminMigration) break
      await applyFile(db, file)
    }

    const owner = await db.query<{ id: string }>(
      'select id from users where username is null',
    )
    const ownerId = owner.rows[0].id
    await db.query(`insert into tasks (user_id, title) values ($1, 'vieja')`, [ownerId])

    const ana = await db.query<{ id: string }>(
      `insert into users (username, password_hash) values ('ana', 'hash') returning id`,
    )
    const anaId = ana.rows[0].id
    await db.query(
      `insert into sessions (user_id, token_hash, expires_at, created_at) values
        ($1, 'vieja', now() + interval '1 day', '2024-03-01T10:00:00Z'),
        ($1, 'nueva', now() + interval '1 day', '2024-05-02T15:30:00Z')`,
      [anaId],
    )
    await db.query(`insert into notes (user_id, title) values ($1, 'lista')`, [anaId])

    const before = await db.query<{ tasks: number; notes: number; users: number }>(`
      select
        (select count(*)::int from tasks) as tasks,
        (select count(*)::int from notes) as notes,
        (select count(*)::int from users) as users
    `)

    await applyFile(db, adminMigration)

    const after = await db.query<{ tasks: number; notes: number; users: number }>(`
      select
        (select count(*)::int from tasks) as tasks,
        (select count(*)::int from notes) as notes,
        (select count(*)::int from users) as users
    `)
    expect(after.rows[0]).toEqual(before.rows[0])

    const seen = await db.query<{ id: string; last_seen_at: unknown }>(
      'select id, last_seen_at from users order by username nulls first',
    )
    const byId = new Map(seen.rows.map((row) => [row.id, row.last_seen_at]))
    expect(millis(byId.get(ownerId))).toBeNull()
    expect(millis(byId.get(anaId))).toBe(Date.parse('2024-05-02T15:30:00Z'))

    const flags = await db.query<{ impersonated: boolean }>(
      'select impersonated from sessions order by created_at',
    )
    expect(flags.rows.map((row) => row.impersonated)).toEqual([false, false])

    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = 'admin_sessions'`,
    )
    expect(tables.rows).toHaveLength(1)

    const title = await db.query<{ title: string }>('select title from tasks')
    expect(title.rows[0].title).toBe('vieja')

    await db.close()
  })
})
