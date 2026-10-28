import { sql } from './_lib/db.ts'
import { badRequest, body, route } from './_lib/http.ts'
import { requireTabletUser } from './_lib/tablet-auth.ts'

type Row = Record<string, unknown>

const MAX_MARKS = 200
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Mark {
  id: string
  doneAt: string
}

/**
 * La hora la pone la tablet, que pudo tildar sin conexion horas antes de sincronizar.
 * Un reloj roto (o adelantado) no puede dejar una tarea hecha "en el futuro": en ese
 * caso vale la hora del servidor.
 */
function doneAtOrNow(value: unknown, now: Date): string {
  if (typeof value !== 'string') return now.toISOString()
  const at = Date.parse(value)
  if (!Number.isFinite(at) || at > now.getTime()) return now.toISOString()
  return new Date(at).toISOString()
}

function parseMarks(input: Record<string, unknown>, now: Date): Mark[] {
  const raw = input.marks
  if (!Array.isArray(raw)) badRequest('Falta marks')
  if (raw.length > MAX_MARKS) badRequest(`Como mucho ${MAX_MARKS} marcas por envio`)
  const marks: Mark[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== 'object' || item == null || typeof (item as Mark).id !== 'string') {
      badRequest('Cada marca necesita un id')
    }
    const id = (item as Mark).id
    if (seen.has(id)) continue
    seen.add(id)
    marks.push({ id, doneAt: doneAtOrNow((item as Mark).doneAt, now) })
  }
  return marks
}

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
