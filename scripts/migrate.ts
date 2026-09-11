/**
 * Aplica las migraciones de db/migrations en orden alfabetico y anota cada una en la
 * tabla `_migrations`, para que volver a correrlo sea seguro. Reemplaza a psql, que
 * no hace falta tener instalado.
 */
import 'dotenv/config'
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { neon } from '@neondatabase/serverless'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('Falta DATABASE_URL. Copia .env.example a .env y pega la cadena de Neon.')
  process.exit(1)
}

const sql = neon(connectionString)
const migrationsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'db', 'migrations')

await sql`
  create table if not exists _migrations (
    name       text primary key,
    applied_at timestamptz not null default now()
  )
`

const applied = new Set(
  ((await sql`select name from _migrations`) as Array<{ name: string }>).map((row) => row.name),
)

const files = (await readdir(migrationsDir)).filter((file) => file.endsWith('.sql')).sort()

let count = 0
for (const file of files) {
  if (applied.has(file)) {
    console.log(`  ya aplicada  ${file}`)
    continue
  }
  const statements = await readFile(join(migrationsDir, file), 'utf8')
  // El driver HTTP de Neon manda una sentencia por request, asi que separamos el archivo.
  for (const statement of statements.split(/;\s*\n/)) {
    const trimmed = statement.trim()
    if (trimmed && !trimmed.startsWith('--')) await sql.query(trimmed)
  }
  await sql`insert into _migrations (name) values (${file})`
  console.log(`  aplicada     ${file}`)
  count += 1
}

console.log(count === 0 ? 'Sin migraciones pendientes.' : `Listo: ${count} migracion(es).`)
