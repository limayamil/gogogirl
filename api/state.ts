import { requireUser } from './_lib/auth.ts'
import {
  mapAttachment,
  mapCategory,
  mapNote,
  mapNoteTag,
  mapQuickTask,
  mapSubtask,
  mapTask,
  mapTaskLink,
  sql,
} from './_lib/db.ts'
import { expireCompletedTasks } from './_lib/expiry.ts'
import { route } from './_lib/http.ts'
import { stateVersion } from './_lib/version.ts'
import { storageConfigured } from './_lib/storage-config.ts'
import type { AppState, Attachment, NoteTag, Subtask, TaskLink } from '../src/shared/types.ts'

type Row = Record<string, unknown>

/**
 * GET /api/state
 *
 * Todo el estado de la cuenta que entro, en una sola llamada. El volumen de
 * una cuenta es chico: un solo cache hace simples las mutaciones optimistas.
 */
export default route({
  async GET(req, res) {
    const { id: userId } = await requireUser(req)
    await expireCompletedTasks(userId)

    const [
      categories,
      tasks,
      subtasks,
      attachments,
      links,
      quickTasks,
      notes,
      noteTags,
      noteTagAssignments,
      version,
    ] = (await Promise.all([
      sql`select * from categories where user_id = ${userId} order by position, created_at`,
      sql`select * from tasks where user_id = ${userId} order by position, created_at`,
      sql`
        select s.*
        from subtasks s
        join tasks t on t.id = s.task_id
        where t.user_id = ${userId}
        order by s.position, s.title
      `,
      sql`
        select a.*
        from attachments a
        left join tasks t on t.id = a.task_id
        left join notes n on n.id = a.note_id
        where t.user_id = ${userId} or n.user_id = ${userId}
        order by a.created_at
      `,
      sql`
        select l.*
        from task_links l
        join tasks t on t.id = l.task_id
        where t.user_id = ${userId}
        order by l.position, l.created_at
      `,
      sql`select * from quick_tasks where user_id = ${userId} order by position, created_at`,
      sql`
        select * from notes
        where user_id = ${userId}
        order by updated_at desc, created_at desc
      `,
      sql`select * from note_tags where user_id = ${userId} order by name`,
      sql`
        select a.*
        from note_tag_assignments a
        join notes n on n.id = a.note_id
        where n.user_id = ${userId}
      `,
      stateVersion(userId),
    ])) as [Row[], Row[], Row[], Row[], Row[], Row[], Row[], Row[], Row[], string]

    const subtasksByTask = new Map<string, Subtask[]>()
    for (const row of subtasks) {
      const subtask = mapSubtask(row)
      const list = subtasksByTask.get(subtask.taskId)
      if (list) list.push(subtask)
      else subtasksByTask.set(subtask.taskId, [subtask])
    }

    const attachmentsByTask = new Map<string, Attachment[]>()
    const attachmentsByNote = new Map<string, Attachment[]>()
    for (const row of attachments) {
      const attachment = mapAttachment(row)
      if (attachment.taskId) {
        const list = attachmentsByTask.get(attachment.taskId)
        if (list) list.push(attachment)
        else attachmentsByTask.set(attachment.taskId, [attachment])
      } else if (attachment.noteId) {
        const list = attachmentsByNote.get(attachment.noteId)
        if (list) list.push(attachment)
        else attachmentsByNote.set(attachment.noteId, [attachment])
      }
    }

    const linksByTask = new Map<string, TaskLink[]>()
    for (const row of links) {
      const link = mapTaskLink(row)
      const list = linksByTask.get(link.taskId)
      if (list) list.push(link)
      else linksByTask.set(link.taskId, [link])
    }

    const tagsById = new Map<string, NoteTag>()
    for (const row of noteTags) {
      const tag = mapNoteTag(row)
      tagsById.set(tag.id, tag)
    }

    const tagsByNote = new Map<string, NoteTag[]>()
    for (const row of noteTagAssignments) {
      const tag = tagsById.get(row.tag_id as string)
      if (!tag) continue
      const noteId = row.note_id as string
      const list = tagsByNote.get(noteId)
      if (list) list.push(tag)
      else tagsByNote.set(noteId, [tag])
    }

    const state: AppState = {
      categories: categories.map(mapCategory),
      tasks: tasks.map((row) =>
        mapTask(
          row,
          subtasksByTask.get(row.id as string) ?? [],
          attachmentsByTask.get(row.id as string) ?? [],
          linksByTask.get(row.id as string) ?? [],
        ),
      ),
      notes: notes.map((row) =>
        mapNote(
          row,
          (tagsByNote.get(row.id as string) ?? []).sort((a, b) => a.name.localeCompare(b.name, 'es')),
          attachmentsByNote.get(row.id as string) ?? [],
        ),
      ),
      quickTasks: quickTasks.map(mapQuickTask),
      storageConfigured,
      version,
    }

    res.status(200).json(state)
  },
})
