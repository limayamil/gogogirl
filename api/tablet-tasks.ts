import { sql } from './_lib/db.ts'
import { route } from './_lib/http.ts'
import { requireTabletUser } from './_lib/tablet-auth.ts'

type Row = Record<string, unknown>

/** Tope de la lista: la tablet la guarda entera en memoria y en la SD. */
const MAX_TASKS = 200

/**
 * GET /api/tablet/tasks
 *
 * La lista que ve la tablet: abiertas mas las hechas en las ultimas 24 h, para que lo
 * recien tildado no desaparezca de golpe. Las abiertas van primero, asi el tope nunca
 * deja afuera una pendiente por culpa de una hecha. Forma minima a proposito: el lector
 * parsea esto con poca memoria.
 */
export default route({
  async GET(req, res) {
    const userId = await requireTabletUser(req)

    // to_char y no el Date de Postgres: el deadline es un dia calendario y asi no pasa
    // por ninguna zona horaria.
    const rows = (await sql`
      select
        t.id,
        t.title,
        t.status = 'hecha' as done,
        c.name as category,
        to_char(t.deadline, 'YYYY-MM-DD') as due
      from tasks t
      left join categories c on c.id = t.category_id
      where t.user_id = ${userId}
        and (t.status <> 'hecha' or t.completed_at > now() - interval '24 hours')
      order by (t.status = 'hecha'), t.position, t.created_at
      limit ${MAX_TASKS}
    `) as Row[]

    res.status(200).json({
      tasks: rows.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        done: Boolean(row.done),
        category: (row.category as string | null) ?? null,
        due: (row.due as string | null) ?? null,
      })),
      serverTime: new Date().toISOString(),
    })
  },
})
