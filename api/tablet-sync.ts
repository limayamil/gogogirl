import { sql } from './_lib/db.ts'
import { route } from './_lib/http.ts'
import { plainTextWithBreaks } from './_lib/plain-text.ts'
import { requireTabletUser } from './_lib/tablet-auth.ts'

type Row = Record<string, unknown>

// Topes para que todo entre en la memoria y la SD de la tablet.
const MAX_TASKS = 200
const MAX_SUBTASKS = 30
const MAX_LINKS = 10
const MAX_NOTES = 100
const MAX_TASK_TEXT = 2000
const MAX_NOTE_TEXT = 4000

function textOrNull(html: unknown, max: number): string | null {
  const text = plainTextWithBreaks((html as string | null) ?? null, max)
  return text.length > 0 ? text : null
}

function iso(value: unknown): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * GET /api/tablet/sync
 *
 * Todo lo que la tablet muestra, en una llamada, para guardarlo en la SD y usarlo sin
 * conexion: tareas (abiertas + hechas en 24 h) con los datos de Hoy, sus subtareas y
 * links, las categorias y las notas. Las notas de contrasena no salen nunca: lo que baja
 * a la tablet queda legible en la SD.
 */
export default route({
  async GET(req, res) {
    const userId = await requireTabletUser(req)

    const [tasks, subtasks, links, categories, notes, tags] = (await Promise.all([
      sql`
        select
          t.id, t.title, t.status = 'hecha' as done, t.category_id,
          to_char(t.deadline, 'YYYY-MM-DD') as due,
          t.in_today, t.hidden_in_today, t.today_position, t.position,
          t.description, t.notes
        from tasks t
        where t.user_id = ${userId}
          and (t.status <> 'hecha' or t.completed_at > now() - interval '24 hours')
        order by (t.status = 'hecha'), t.position, t.created_at
        limit ${MAX_TASKS}
      `,
      sql`
        select s.id, s.task_id, s.title, s.done
        from subtasks s
        join tasks t on t.id = s.task_id
        where t.user_id = ${userId}
        order by s.position, s.title
      `,
      sql`
        select l.task_id, l.url, l.title
        from task_links l
        join tasks t on t.id = l.task_id
        where t.user_id = ${userId}
        order by l.position, l.created_at
      `,
      sql`
        select id, name, position from categories
        where user_id = ${userId}
        order by position, created_at
      `,
      sql`
        select id, title, description, updated_at from notes
        where user_id = ${userId} and kind <> 'password'
        order by updated_at desc, created_at desc
        limit ${MAX_NOTES}
      `,
      sql`
        select a.note_id, g.name
        from note_tag_assignments a
        join note_tags g on g.id = a.tag_id
        join notes n on n.id = a.note_id
        where n.user_id = ${userId} and n.kind <> 'password'
        order by g.name
      `,
    ])) as Row[][]

    const subtasksByTask = new Map<string, { id: string; title: string; done: boolean }[]>()
    for (const row of subtasks) {
      const list = subtasksByTask.get(row.task_id as string) ?? []
      if (list.length < MAX_SUBTASKS) list.push({ id: row.id as string, title: row.title as string, done: Boolean(row.done) })
      subtasksByTask.set(row.task_id as string, list)
    }
    const linksByTask = new Map<string, { url: string; title: string | null }[]>()
    for (const row of links) {
      const list = linksByTask.get(row.task_id as string) ?? []
      if (list.length < MAX_LINKS) list.push({ url: row.url as string, title: (row.title as string | null) ?? null })
      linksByTask.set(row.task_id as string, list)
    }
    const tagsByNote = new Map<string, string[]>()
    for (const row of tags) {
      const list = tagsByNote.get(row.note_id as string) ?? []
      list.push(row.name as string)
      tagsByNote.set(row.note_id as string, list)
    }

    res.status(200).json({
      tasks: tasks.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        done: Boolean(row.done),
        categoryId: (row.category_id as string | null) ?? null,
        due: (row.due as string | null) ?? null,
        inToday: Boolean(row.in_today),
        hiddenInToday: Boolean(row.hidden_in_today),
        todayPosition: row.today_position == null ? null : Number(row.today_position),
        position: Number(row.position),
        description: textOrNull(row.description, MAX_TASK_TEXT),
        notes: textOrNull(row.notes, MAX_TASK_TEXT),
        subtasks: subtasksByTask.get(row.id as string) ?? [],
        links: linksByTask.get(row.id as string) ?? [],
      })),
      categories: categories.map((row) => ({
        id: row.id as string,
        name: row.name as string,
        position: Number(row.position),
      })),
      notes: notes.map((row) => ({
        id: row.id as string,
        title: row.title as string,
        text: plainTextWithBreaks((row.description as string | null) ?? null, MAX_NOTE_TEXT),
        tags: tagsByNote.get(row.id as string) ?? [],
        updatedAt: iso(row.updated_at),
      })),
      serverTime: new Date().toISOString(),
    })
  },
})
