import { requireUser } from '../_lib/auth.ts'
import { icalUrl, mapCalendar } from '../_lib/calendars.ts'
import { sql } from '../_lib/db.ts'
import { body, route } from '../_lib/http.ts'
import { requiredText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

/**
 * GET  /api/calendars  los calendarios de esta cuenta, con la direccion enmascarada.
 * POST /api/calendars  { name, colorKey, url }
 */
export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const rows = (await sql`
      select * from calendars where user_id = ${userId} order by position, created_at
    `) as Row[]
    res.status(200).json({ calendars: rows.map(mapCalendar) })
  },

  async POST(req, res) {
    const { id: userId } = await requireUser(req)
    const input = body(req)
    const name = requiredText(input.name, 'name', 80)
    const colorKey = requiredText(input.colorKey, 'colorKey', 40)
    const url = icalUrl(input.url)

    const [row] = (await sql`
      insert into calendars (user_id, name, color_key, ical_url, position)
      values (
        ${userId}, ${name}, ${colorKey}, ${url},
        (select coalesce(max(position), -1) + 1 from calendars where user_id = ${userId})
      )
      returning *
    `) as Row[]

    res.status(201).json(mapCalendar(row))
  },
})
