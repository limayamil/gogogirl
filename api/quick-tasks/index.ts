import { requireUser } from '../_lib/auth.ts'
import { mapQuickTask, sql } from '../_lib/db.ts'
import { body, route } from '../_lib/http.ts'
import { requiredText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

/** Tareas rapidas: viven solo en el popover del FAB, sin categoria ni campos extra. */
export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const rows = (await sql`
      select * from quick_tasks where user_id = ${userId} order by position, created_at
    `) as Row[]
    res.status(200).json(rows.map(mapQuickTask))
  },

  async POST(req, res) {
    const { id: userId } = await requireUser(req)
    const title = requiredText(body(req).title, 'title', 200)

    const [{ next }] = (await sql`
      select coalesce(max(position), -1) + 1 as next
      from quick_tasks
      where user_id = ${userId}
    `) as Row[]

    const [row] = (await sql`
      insert into quick_tasks (title, position, user_id)
      values (${title}, ${Number(next)}, ${userId})
      returning *
    `) as Row[]

    res.status(201).json(mapQuickTask(row))
  },
})
