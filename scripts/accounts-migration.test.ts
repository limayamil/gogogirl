import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PGlite } from '@electric-sql/pglite'
import { describe, expect, it } from 'vitest'
import { splitSqlStatements } from './sql-split.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

const OWNED = ['categories', 'tasks', 'quick_tasks', 'notes', 'note_tags'] as const
const CHILDREN = ['subtasks', 'task_links', 'attachments', 'note_tag_assignments'] as const
const CONTENT = [...OWNED, ...CHILDREN] as const

const BEFORE = {
  categories: 3,
  tasks: 5,
  subtasks: 4,
  quick_tasks: 2,
  notes: 3,
  note_tags: 2,
  note_tag_assignments: 2,
  attachments: 2,
  task_links: 2,
} as const

type Sql = Pick<PGlite, 'exec' | 'query'>

async function applyFile(db: Sql, file: string) {
  const source = await readFile(join(migrationsDir, file), 'utf8')
  for (const statement of splitSqlStatements(source)) {
    try {
      await db.exec(statement)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      // PGlite ya trae gen_random_uuid. Si el extension no esta empaquetado,
      // el resto del esquema igual se puede crear.
      if (/create extension/i.test(statement) && /pgcrypto|extension/i.test(message)) continue
      throw error
    }
  }
}

async function applyThrough(db: Sql, last: string) {
  const files = ['001_init.sql', '002_task_links.sql', '003_task_expired.sql', '004_notes.sql', '005_note_passwords.sql', '006_accounts.sql']
  for (const file of files) {
    await applyFile(db, file)
    if (file === last) return
  }
}

async function counts(db: Sql): Promise<Record<(typeof CONTENT)[number], number>> {
  const out = {} as Record<(typeof CONTENT)[number], number>
  for (const table of CONTENT) {
    const { rows } = await db.query<{ n: number }>(`select count(*)::int as n from ${table}`)
    out[table] = Number(rows[0].n)
  }
  return out
}

async function tables(db: Sql): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name
  `)
  return rows.map((row) => row.table_name)
}

async function userIdTables(db: Sql): Promise<string[]> {
  const { rows } = await db.query<{ table_name: string }>(`
    select table_name
    from information_schema.columns
    where table_schema = 'public' and column_name = 'user_id'
    order by table_name
  `)
  return rows.map((row) => row.table_name)
}

async function seed(db: Sql) {
  const casa = await id(db, `insert into categories (name, color_key, position) values ('Casa', 'rose', 0) returning id`)
  const trabajo = await id(db, `insert into categories (name, color_key, position) values ('Trabajo', 'mint', 1) returning id`)
  await id(db, `insert into categories (name, color_key, position) values ('Salud', 'lilac', 2) returning id`)

  const regar = await id(db, `insert into tasks (category_id, title) values ($1, 'Regar') returning id`, [casa])
  const comprar = await id(db, `insert into tasks (category_id, title) values ($1, 'Comprar') returning id`, [casa])
  await id(db, `insert into tasks (category_id, title, status) values ($1, 'Enviar', 'hecha') returning id`, [trabajo])
  const llamar = await id(db, `insert into tasks (title) values ('Llamar') returning id`)
  await id(db, `insert into tasks (title, status) values ('Pagar', 'en_progreso') returning id`)

  await db.exec(`
    insert into subtasks (task_id, title, position) values
      ('${regar}', 'maceta', 0),
      ('${regar}', 'balcon', 1),
      ('${comprar}', 'leche', 0),
      ('${llamar}', 'mama', 0)
  `)
  await db.exec(`
    insert into quick_tasks (title, position) values ('Agua', 0), ('Llaves', 1)
  `)

  const lista = await id(db, `insert into notes (title, description) values ('lista', 'compras') returning id`)
  await id(db, `insert into notes (title) values ('idea') returning id`)
  await id(
    db,
    `insert into notes (title, kind, username, password) values ('banco', 'password', 'ana', 'secreto-guardado') returning id`,
  )

  const casaTag = await id(db, `insert into note_tags (name) values ('casa') returning id`)
  const trabajoTag = await id(db, `insert into note_tags (name) values ('trabajo') returning id`)
  await db.query(`insert into note_tag_assignments (note_id, tag_id) values ($1, $2)`, [lista, casaTag])
  await db.query(`insert into note_tag_assignments (note_id, tag_id) values ($1, $2)`, [lista, trabajoTag])

  await db.query(
    `insert into attachments (task_id, object_key, file_name, content_type, size_bytes) values ($1, 'tasks/viejo/foto.png', 'foto.png', 'image/png', 12)`,
    [regar],
  )
  await db.query(
    `insert into attachments (note_id, object_key, file_name, content_type, size_bytes) values ($1, 'notes/viejo/nota.pdf', 'nota.pdf', 'application/pdf', 20)`,
    [lista],
  )
  await db.query(`insert into task_links (task_id, url, title) values ($1, 'https://example.com/a', 'a')`, [regar])
  await db.query(`insert into task_links (task_id, url) values ($1, 'https://example.com/b')`, [comprar])
}

function id(db: Sql, sql: string, params?: unknown[]): Promise<string> {
  return db.query<{ id: string }>(sql, params).then((result) => result.rows[0].id)
}

async function migrationSql(): Promise<string> {
  const [statement] = splitSqlStatements(await readFile(join(migrationsDir, '006_accounts.sql'), 'utf8'))
  return statement
}

describe('migracion de cuentas', () => {
  it('no borra filas ni columnas de datos', async () => {
    const sql = await readFile(join(migrationsDir, '006_accounts.sql'), 'utf8')
    const code = sql.replace(/--[^\n]*/g, '')
    expect(code).not.toMatch(/\bdelete\b/i)
    expect(code).not.toMatch(/\btruncate\b/i)
    expect(code).not.toMatch(/drop\s+table/i)
    expect(code).not.toMatch(/drop\s+column/i)
    expect(code).toMatch(/drop\s+index\s+if\s+exists\s+note_tags_name_lower_idx/i)
  })

  it('hace rollback y despues asigna todo a una sola cuenta vacia de credenciales', async () => {
    const db = new PGlite()
    await applyThrough(db, '005_note_passwords.sql')

    expect(await tables(db)).toEqual([
      'attachments',
      'categories',
      'note_tag_assignments',
      'note_tags',
      'notes',
      'quick_tasks',
      'subtasks',
      'task_links',
      'tasks',
    ])

    await seed(db)
    const before = await counts(db)
    expect(before).toEqual(BEFORE)

    const migration = await migrationSql()
    await db.exec('begin')
    await db.exec(migration)
    const during = await counts(db)
    const duringUsers = await db.query<{ n: number; username: string | null }>(`
      select count(*)::int as n, max(username) as username from users
    `)
    await db.exec('rollback')
    const afterRollback = await counts(db)
    const usersLeft = await tables(db)

    await db.exec(migration)
    const after = await counts(db)
    const owners = await db.query<{ id: string; username: string | null; password_hash: string | null }>(
      `select id, username, password_hash from users`,
    )
    const ownerId = owners.rows[0].id
    const saved = await db.query<{ password: string }>(`select password from notes where title = 'banco'`)
    const distinct = await db.query<{ n: number }>(`
      select (
        (select count(distinct user_id) from categories) +
        (select count(distinct user_id) from tasks) +
        (select count(distinct user_id) from quick_tasks) +
        (select count(distinct user_id) from notes) +
        (select count(distinct user_id) from note_tags)
      )::int as n
    `)

    await db.exec(migration)
    const rerun = await counts(db)

    const created = await db.query<{ id: string }>(
      `insert into users (username, password_hash) values ('nueva', 'hash') returning id`,
    )
    const empty = await db.query<{ n: number }>(
      `select (
        (select count(*) from categories where user_id = $1) +
        (select count(*) from tasks where user_id = $1) +
        (select count(*) from quick_tasks where user_id = $1) +
        (select count(*) from notes where user_id = $1) +
        (select count(*) from note_tags where user_id = $1) +
        (select count(*) from subtasks s join tasks t on t.id = s.task_id where t.user_id = $1) +
        (select count(*) from task_links l join tasks t on t.id = l.task_id where t.user_id = $1) +
        (select count(*) from attachments a
          left join tasks t on t.id = a.task_id
          left join notes n on n.id = a.note_id
          where t.user_id = $1 or n.user_id = $1) +
        (select count(*) from note_tag_assignments a join notes n on n.id = a.note_id where n.user_id = $1)
      )::int as n`,
      [created.rows[0].id],
    )

    const report = {
      tablesAfter: await tables(db),
      userIdOn: await userIdTables(db),
      before,
      duringTransaction: during,
      afterRollback,
      after,
      rerun,
      owner: {
        count: owners.rows.length,
        username: owners.rows[0].username,
        passwordHashIsNull: owners.rows[0].password_hash == null,
      },
      savedPasswordUntouched: saved.rows[0].password,
      newAccountRows: Number(empty.rows[0].n),
    }
    console.info(`[cuentas] ${JSON.stringify(report)}`)

    expect(during).toEqual(BEFORE)
    expect(Number(duringUsers.rows[0].n)).toBe(1)
    expect(duringUsers.rows[0].username).toBeNull()
    expect(afterRollback).toEqual(BEFORE)
    expect(usersLeft).not.toContain('users')
    expect(after).toEqual(BEFORE)
    expect(rerun).toEqual(BEFORE)
    expect(owners.rows).toHaveLength(1)
    expect(owners.rows[0].username).toBeNull()
    expect(owners.rows[0].password_hash).toBeNull()
    expect(saved.rows[0].password).toBe('secreto-guardado')
    expect(Number(distinct.rows[0].n)).toBe(OWNED.length)
    expect(Number(empty.rows[0].n)).toBe(0)
    expect(await userIdTables(db)).toEqual([
      'categories',
      'note_tags',
      'notes',
      'quick_tasks',
      'sessions',
      'tasks',
    ])

    for (const table of OWNED) {
      const { rows } = await db.query<{ n: number }>(
        `select count(*)::int as n from ${table} where user_id = $1`,
        [ownerId],
      )
      expect(Number(rows[0].n), table).toBe(BEFORE[table])
    }
  }, 120_000)

  it('aborta y no deja columnas si las filas viejas no tienen un unico dueno', async () => {
    const db = new PGlite()
    await applyThrough(db, '005_note_passwords.sql')
    await seed(db)
    const before = await counts(db)

    await db.exec(`
      create table users (
        id uuid primary key default gen_random_uuid(),
        username text,
        password_hash text,
        created_at timestamptz not null default now()
      )
    `)
    await db.exec(`
      insert into users (username, password_hash) values
        ('una', 'hash-1'),
        ('otra', 'hash-2')
    `)

    const migration = await migrationSql()
    await expect(db.exec(migration)).rejects.toThrow(/No adivino/)

    expect(await counts(db)).toEqual(before)
    expect(await userIdTables(db)).toEqual([])
    const users = await db.query<{ n: number }>(`select count(*)::int as n from users`)
    expect(Number(users.rows[0].n)).toBe(2)
  }, 120_000)
})
