import { sql } from './_lib/db.ts'
import { body, route } from './_lib/http.ts'
import { requireTabletUser } from './_lib/tablet-auth.ts'
import { parseMarks, UUID } from './_lib/tablet-marks.ts'

type Row = Record<string, unknown>

/**
 * POST /api/tablet/tasks/done  { marks: [{ id, doneAt }] }
 *
 * Idempotente: la tablet reintenta lo que no sabe si llego, asi que mandar dos veces
 * la misma marca da la misma respuesta y no mueve completed_at. Una tarea ya hecha
 * (en la web o en un envio anterior) cuenta como aplicada. Lo que no es de esta cuenta
 * vuelve en `unknown` para que la tablet lo saque de su cola.
 */
export default route({
  async POST(req, res) {
    const userId = await requireTabletUser(req)
    const marks = parseMarks(body(req), new Date())

    const candidates = marks.filter((mark) => UUID.test(mark.id))
    const known = new Set<string>()
    if (candidates.length > 0) {
      const ids = candidates.map((mark) => mark.id)
      const rows = (await sql`
        select id from tasks where user_id = ${userId} and id = any(${ids}::uuid[])
      `) as Row[]
      for (const row of rows) known.add(String(row.id).toLowerCase())

      // Igual que el PATCH de la web: pasar a hecha limpia expired. Las que ya estaban
      // hechas no se tocan, asi la primera hora registrada es la que queda.
      await sql`
        update tasks t set
          status       = 'hecha',
          completed_at = m.done_at,
          expired      = false,
          updated_at   = now()
        from unnest(${ids}::uuid[], ${candidates.map((mark) => mark.doneAt)}::timestamptz[])
          as m(id, done_at)
        where t.id = m.id and t.user_id = ${userId} and t.status <> 'hecha'
      `
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
