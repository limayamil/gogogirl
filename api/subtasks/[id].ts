import { requireUser } from '../_lib/auth.ts'
import { mapSubtask, sql } from '../_lib/db.ts'
import { body, notFound, requireId, route } from '../_lib/http.ts'
import { bool, int, requiredText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async PATCH(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const input = body(req)

    const [current] = (await sql`
      select s.*
      from subtasks s
      join tasks t on t.id = s.task_id
      where s.id = ${id} and t.user_id = ${userId}
    `) as Row[]
    if (!current) notFound('Subtarea no encontrada')

    const next = {
      title: 'title' in input ? requiredText(input.title, 'title', 200) : (current.title as string),
      done: 'done' in input ? bool(input.done, 'done') : Boolean(current.done),
      position: 'position' in input ? int(input.position, 'position') : Number(current.position),
    }

    const [row] = (await sql`
      update subtasks s
      set title = ${next.title}, done = ${next.done}, position = ${next.position}
      from tasks t
      where s.id = ${id} and s.task_id = t.id and t.user_id = ${userId}
      returning s.*
    `) as Row[]

    res.status(200).json(mapSubtask(row))
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const rows = (await sql`
      delete from subtasks s
      using tasks t
      where s.id = ${id} and s.task_id = t.id and t.user_id = ${userId}
      returning s.id
    `) as Row[]
    if (rows.length === 0) notFound('Subtarea no encontrada')
    res.status(200).json({ ok: true })
  },
})
