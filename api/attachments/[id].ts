import { requireUser } from '../_lib/auth.ts'
import { sql } from '../_lib/db.ts'
import { notFound, requireId, route } from '../_lib/http.ts'
import { deleteObject, signDownload } from '../_lib/storage.ts'

type Row = Record<string, unknown>

async function ownedAttachment(id: string, userId: string): Promise<Row | null> {
  const [row] = (await sql`
    select a.object_key
    from attachments a
    left join tasks t on t.id = a.task_id
    left join notes n on n.id = a.note_id
    where a.id = ${id}
      and (t.user_id = ${userId} or n.user_id = ${userId})
  `) as Row[]
  return row ?? null
}

export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    const row = await ownedAttachment(requireId(req), userId)
    if (!row) notFound('Adjunto no encontrado')
    res.status(200).json({ url: await signDownload(row.object_key as string) })
  },

  async DELETE(req, res) {
    const { id: userId } = await requireUser(req)
    const id = requireId(req)
    const row = await ownedAttachment(id, userId)
    if (!row) notFound('Adjunto no encontrado')

    await sql`delete from attachments where id = ${id}`

    try {
      await deleteObject(row.object_key as string)
    } catch (error) {
      console.error('[attachments] no se pudo borrar del bucket:', error)
    }

    res.status(200).json({ ok: true })
  },
})
