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

describe('migracion de calendarios', () => {
  it('solo agrega la tabla: no toca filas ni columnas que ya existen, y se puede repetir', async () => {
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    const migration = files.find((file) => file.endsWith('_calendars.sql'))
    expect(migration).toBe('008_calendars.sql')

    const source = await readFile(join(migrationsDir, migration!), 'utf8')
    const code = source.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/\b(delete|truncate|drop|update|alter)\b/i)

    const db = new PGlite()
    for (const file of files.filter((file) => file < migration!)) await applyFile(db, file)

    const ana = await db.query<{ id: string }>(
      `insert into users (username, password_hash) values ('ana', 'hash') returning id`,
    )
    await db.query(`insert into tasks (user_id, title) values ($1, 'vieja')`, [ana.rows[0].id])
    await db.query(
      `insert into sessions (user_id, token_hash, expires_at) values ($1, 'sesion', now() + interval '1 day')`,
      [ana.rows[0].id],
    )
    const snapshot = `
      select
        (select count(*)::int from users) as users,
        (select count(*)::int from sessions) as sessions,
        (select count(*)::int from tasks) as tasks,
        (select string_agg(table_name || '.' || column_name, ',' order by table_name, column_name)
         from information_schema.columns
         where table_schema = 'public' and table_name <> 'calendars') as columns
    `
    const before = await db.query(snapshot)

    await applyFile(db, migration!)
    await applyFile(db, migration!)

    const after = await db.query(snapshot)
    expect(after.rows).toEqual(before.rows)

    const columns = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
       where table_name = 'calendars' order by ordinal_position`,
    )
    expect(columns.rows.map((row) => row.column_name)).toEqual([
      'id',
      'user_id',
      'name',
      'color_key',
      'ical_url',
      'position',
      'created_at',
    ])

    await db.close()
  })
})
