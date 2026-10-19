import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { splitSqlStatements } from './sql-split.ts'

const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

describe('splitSqlStatements', () => {
  it('no parte un bloque do por los punto y coma de adentro', () => {
    const sql = `
      -- comentario
      do $accounts$
      begin
        insert into users (username) values ('ana');
        update tasks set user_id = 'x' where user_id is null;
      end
      $accounts$;
    `
    const statements = splitSqlStatements(sql)
    expect(statements).toHaveLength(1)
    expect(statements[0]).toContain('insert into users')
    expect(statements[0]).toContain('update tasks')
  })

  it('separa sentencias normales y respeta strings', () => {
    const statements = splitSqlStatements("select 'a; b';\nselect 2;\n")
    expect(statements).toEqual(["select 'a; b'", 'select 2'])
  })

  it('deja la migracion de cuentas en una sola sentencia', async () => {
    const sql = await readFile(join(migrationsDir, '006_accounts.sql'), 'utf8')
    expect(splitSqlStatements(sql)).toHaveLength(1)
  })

  it('sigue encontrando el SQL de las migraciones anteriores', async () => {
    const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()
    expect(files[0]).toBe('001_init.sql')

    for (const file of files) {
      const statements = splitSqlStatements(await readFile(join(migrationsDir, file), 'utf8'))
      expect(statements.length, file).toBeGreaterThan(0)
      expect(statements.every((statement) => statement.length > 0)).toBe(true)
    }

    const init = splitSqlStatements(await readFile(join(migrationsDir, '001_init.sql'), 'utf8'))
    expect(init.some((statement) => /create extension/i.test(statement))).toBe(true)
    expect(init.some((statement) => /create table if not exists tasks/i.test(statement))).toBe(true)
  })
})
