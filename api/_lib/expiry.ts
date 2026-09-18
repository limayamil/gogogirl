import { sql } from './db.ts'
import { shouldExpireCompleted } from '../../src/shared/expiry.ts'

type Row = Record<string, unknown>

function completedAtIso(value: unknown): string | null {
  if (value == null) return null
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * Marca hechas cuya semana ya cerro. Se llama al cargar el estado: no hay cron.
 * Devuelve cuantas filas paso a expired, por si un test quiere asertarlo.
 */
export async function expireCompletedTasks(now = new Date()): Promise<number> {
  const rows = (await sql`
    select id, status, completed_at
    from tasks
    where status = 'hecha' and expired = false
  `) as Row[]

  const ids = rows
    .filter((row) =>
      shouldExpireCompleted(String(row.status), completedAtIso(row.completed_at), now),
    )
    .map((row) => row.id as string)

  if (ids.length === 0) return 0

  await sql`
    update tasks
    set expired = true, updated_at = now()
    where id = any(${ids}::uuid[])
  `
  return ids.length
}
