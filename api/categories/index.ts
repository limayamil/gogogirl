import { requireUser } from '../_lib/auth.ts'
import { mapCategory, sql } from '../_lib/db.ts'
import { body, route } from '../_lib/http.ts'
import { parseCategoryInput } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const rows = (await sql`
      select * from categories where user_id = ${userId} order by position, created_at
    `) as Row[]
    res.status(200).json(rows.map(mapCategory))
  },

  async POST(req, res) {
    const { id: userId } = await requireUser(req)
    const input = parseCategoryInput(body(req))

    const position =
      input.position ??
      Number(
        ((await sql`
          select coalesce(max(position), -1) + 1 as next
          from categories
          where user_id = ${userId}
        `) as Row[])[0].next,
      )

    const [row] = (await sql`
      insert into categories (name, color_key, position, user_id)
      values (${input.name}, ${input.colorKey}, ${position}, ${userId})
      returning *
    `) as Row[]

    res.status(201).json(mapCategory(row))
  },
})
