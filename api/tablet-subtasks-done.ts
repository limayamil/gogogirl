import { sql } from './_lib/db.ts'
import { body, route } from './_lib/http.ts'
import { requireTabletUser } from './_lib/tablet-auth.ts'
import { parseMarks, UUID } from './_lib/tablet-marks.ts'

type Row = Record<string, unknown>

/**
 * POST /api/tablet/subtasks/done  { marks: [{ id, doneAt }] }
 *
 * Igual que el de tareas: idempotente, una subtarea ya hecha cuenta como aplicada y lo
 * que no es de esta cuenta vuelve en `unknown`. Toca updated_at de la tarea madre para
 * que la firma de version de la web note el cambio.
 */
export default route({
  async POST(req, res) {
    const userId = await requireTabletUser(req)
    const marks = parseMarks(body(req), new Date())

    const ids = marks.filter((mark) => UUID.test(mark.id)).map((mark) => mark.id)
    const known = new Set<string>()
    if (ids.length > 0) {
      const rows = (await sql`
        select s.id from subtasks s
        join tasks t on t.id = s.task_id
        where t.user_id = ${userId} and s.id = any(${ids}::uuid[])
      `) as Row[]
      for (const row of rows) known.add(String(row.id).toLowerCase())

      const changed = (await sql`
        update subtasks s set done = true
        from tasks t
        where t.id = s.task_id and t.user_id = ${userId}
          and s.id = any(${ids}::uuid[]) and s.done = false
        returning s.task_id
      `) as Row[]
      const parents = [...new Set(changed.map((row) => row.task_id as string))]
      if (parents.length > 0) {
        await sql`update tasks set updated_at = now() where user_id = ${userId} and id = any(${parents}::uuid[])`
      }
    }

    const applied: string[] = []
    const unknown: string[] = []
    for (const mark of marks) {
      if (known.has(mark.id.toLowerCase())) applied.push(mark.id)
      else unknown.push(mark.id)
    }
    res.status(200).json({ applied, unknown })
  },
})
