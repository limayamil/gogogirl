import { requireUser } from '../_lib/auth.ts'
import { loadNote, replaceNoteTags, sql } from '../_lib/db.ts'
import { body, notFound, requireId, route } from '../_lib/http.ts'
import { parseNotePatch } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const note = await loadNote(requireId(req), userId)
    if (!note) notFound('Nota no encontrada')
    res.status(200).json(note)
  },

  async PATCH(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const patch = parseNotePatch(body(req))

    const current = await loadNote(id, userId)
    if (!current) notFound('Nota no encontrada')

    const isPassword = current.kind === 'password'
    const merged = {
      title: patch.title ?? current.title,
      description: isPassword
        ? null
        : 'description' in patch
          ? (patch.description ?? null)
          : current.description,
      username: isPassword
        ? 'username' in patch
          ? (patch.username ?? null)
          : current.username
        : null,
      password: isPassword ? (patch.password ?? current.password) : null,
    }

    await sql`
      update notes set
        title       = ${merged.title},
        description = ${merged.description},
        username    = ${merged.username},
        password    = ${merged.password},
        updated_at  = now()
      where id = ${id} and user_id = ${userId}
    `

    if (!isPassword && patch.tags) await replaceNoteTags(id, patch.tags, userId)

    res.status(200).json(await loadNote(id, userId))
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const rows = (await sql`
      delete from notes where id = ${id} and user_id = ${userId} returning id
    `) as Row[]
    if (rows.length === 0) notFound('Nota no encontrada')
    await sql`
      delete from note_tags
      where user_id = ${userId}
        and not exists (
          select 1 from note_tag_assignments a where a.tag_id = note_tags.id
        )
    `
    res.status(200).json({ ok: true })
  },
})
