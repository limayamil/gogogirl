import { requireUser } from '../_lib/auth.ts'
import { forgetCalendar, icalUrl, mapCalendar } from '../_lib/calendars.ts'
import { sql } from '../_lib/db.ts'
import { body, notFound, requireId, route } from '../_lib/http.ts'
import { requiredText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

/**
 * PATCH  /api/calendars/:id  { name?, colorKey?, url? }  sin url, la direccion no cambia.
 * DELETE /api/calendars/:id
 */
export default route({
  async PATCH(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const input = body(req)

    const [current] = (await sql`
      select * from calendars where id = ${id} and user_id = ${userId}
    `) as Row[]
    if (!current) notFound('Calendario no encontrado')

    const next = {
      name: 'name' in input ? requiredText(input.name, 'name', 80) : (current.name as string),
      colorKey:
        'colorKey' in input
          ? requiredText(input.colorKey, 'colorKey', 40)
          : (current.color_key as string),
      url: 'url' in input && input.url != null ? icalUrl(input.url) : (current.ical_url as string),
    }

    const [row] = (await sql`
      update calendars
      set name = ${next.name}, color_key = ${next.colorKey}, ical_url = ${next.url}
      where id = ${id} and user_id = ${userId}
      returning *
    `) as Row[]
    if (!row) notFound('Calendario no encontrado')
    if (next.url !== current.ical_url) forgetCalendar(id)

    res.status(200).json(mapCalendar(row))
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const rows = (await sql`
      delete from calendars where id = ${id} and user_id = ${userId} returning id
    `) as Row[]
    if (rows.length === 0) notFound('Calendario no encontrado')
    forgetCalendar(id)
    res.status(200).json({ ok: true })
  },
})
