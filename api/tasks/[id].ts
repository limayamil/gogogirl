import { requireUser } from '../_lib/auth.ts'
import { loadTask, loadTaskChildren, loadTaskRow, mapTask, sql } from '../_lib/db.ts'
import { body, notFound, requireId, route } from '../_lib/http.ts'
import { parseTaskPatch } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const task = await loadTask(requireId(req), userId)
    if (!task) notFound('Tarea no encontrada')
    res.status(200).json(task)
  },

  /**
   * Lee la tarea de esta cuenta, mezcla el patch en memoria y reescribe las
   * columnas. El where repite user_id para que un id de otra cuenta no escriba.
   */
  async PATCH(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const patch = parseTaskPatch(body(req))

    const row = await loadTaskRow(id, userId)
    if (!row) notFound('Tarea no encontrada')

    const current = mapTask(row)
    const merged = { ...current, ...patch }

    if (merged.inToday === false) {
      merged.hiddenInToday = false
      merged.todayPosition = null
    }

    if (merged.categoryId) {
      const [category] = (await sql`
        select id from categories where id = ${merged.categoryId} and user_id = ${userId}
      `) as Row[]
      if (!category) notFound('Categoria no encontrada')
    }

    if (merged.inToday && merged.todayPosition == null) {
      const [{ next }] = (await sql`
        select coalesce(max(today_position), -1) + 1 as next
        from tasks
        where user_id = ${userId} and in_today = true
      `) as Row[]
      merged.todayPosition = Number(next)
    }

    const completedAt =
      merged.status === 'hecha'
        ? (current.completedAt ?? new Date().toISOString())
        : null
    const expired =
      merged.status === 'hecha'
        ? current.status === 'hecha'
          ? current.expired
          : false
        : false

    const children = loadTaskChildren(id)

    const [updated] = (await sql`
      update tasks set
        category_id     = ${merged.categoryId},
        title           = ${merged.title},
        description     = ${merged.description},
        notes           = ${merged.notes},
        urgency         = ${merged.urgency},
        deadline        = ${merged.deadline},
        status          = ${merged.status},
        in_today        = ${merged.inToday},
        hidden_in_today = ${merged.hiddenInToday},
        today_position  = ${merged.todayPosition},
        position        = ${merged.position},
        completed_at    = ${completedAt},
        expired         = ${expired},
        updated_at      = now()
      where id = ${id} and user_id = ${userId}
      returning *
    `) as Row[]

    if (!updated) notFound('Tarea no encontrada')

    const [subtasks, attachments, links] = await children
    res.status(200).json(mapTask(updated, subtasks, attachments, links))
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const rows = (await sql`
      delete from tasks where id = ${id} and user_id = ${userId} returning id
    `) as Row[]
    if (rows.length === 0) notFound('Tarea no encontrada')
    res.status(200).json({ ok: true })
  },
})
