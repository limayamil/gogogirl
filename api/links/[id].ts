import { requireUser } from '../_lib/auth.ts'
import { mapTaskLink, sql } from '../_lib/db.ts'
import { body, notFound, requireId, route } from '../_lib/http.ts'
import { httpUrl, optionalText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async PATCH(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const input = body(req)

    const [current] = (await sql`
      select l.*
      from task_links l
      join tasks t on t.id = l.task_id
      where l.id = ${id} and t.user_id = ${userId}
    `) as Row[]
    if (!current) notFound('Link no encontrado')

    const next = {
      url: 'url' in input ? httpUrl(input.url, 'url') : (current.url as string),
      title:
        'title' in input
          ? optionalText(input.title, 'title', 200)
          : ((current.title as string | null) ?? null),
    }

    const [row] = (await sql`
      update task_links l
      set url = ${next.url}, title = ${next.title}
      from tasks t
      where l.id = ${id} and l.task_id = t.id and t.user_id = ${userId}
      returning l.*
    `) as Row[]

    res.status(200).json(mapTaskLink(row))
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const rows = (await sql`
      delete from task_links l
      using tasks t
      where l.id = ${id} and l.task_id = t.id and t.user_id = ${userId}
      returning l.id
    `) as Row[]
    if (rows.length === 0) notFound('Link no encontrado')
    res.status(200).json({ ok: true })
  },
})
