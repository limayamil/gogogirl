import { requireUser } from '../_lib/auth.ts'
import { loadTask, sql } from '../_lib/db.ts'
import { body, notFound, route } from '../_lib/http.ts'
import { httpUrl, optionalText, parseTaskCreate, requiredText } from '../_lib/validate.ts'

type Row = Record<string, unknown>

export default route({
  async POST(req, res) {
    const { id: userId } = await requireUser(req)
    const raw = body(req)
    const input = parseTaskCreate(raw)

    if (input.categoryId) {
      const [category] = (await sql`
        select id from categories where id = ${input.categoryId} and user_id = ${userId}
      `) as Row[]
      if (!category) notFound('Categoria no encontrada')
    }

    const rawSubtasks = Array.isArray(raw.subtasks) ? raw.subtasks : []
    const subtaskTitles = rawSubtasks.map((item, index) =>
      requiredText(
        typeof item === 'string' ? item : (item as Record<string, unknown>)?.title,
        `subtasks[${index}].title`,
        200,
      ),
    )

    const rawLinks = Array.isArray(raw.links) ? raw.links : []
    const links = rawLinks.map((item, index) => {
      const entry = typeof item === 'string' ? { url: item } : ((item ?? {}) as Record<string, unknown>)
      return {
        url: httpUrl(entry.url, `links[${index}].url`),
        title: optionalText(entry.title, `links[${index}].title`, 200),
      }
    })

    // La posicion se numera dentro de la cuenta: dos personas pueden tener
    // tareas sin categoria y no tienen que pisarse el orden.
    const [[{ next: position }], [{ next: todayPosition }]] = (await Promise.all([
      sql`
        select coalesce(max(position), -1) + 1 as next
        from tasks
        where user_id = ${userId}
          and category_id is not distinct from ${input.categoryId ?? null}
      `,
      sql`
        select coalesce(max(today_position), -1) + 1 as next
        from tasks
        where user_id = ${userId} and in_today = true
      `,
    ])) as Row[][]

    const [created] = (await sql`
      insert into tasks (
        category_id, title, description, notes, urgency, deadline, status,
        in_today, today_position, position, user_id
      )
      values (
        ${input.categoryId ?? null}, ${input.title}, ${input.description ?? null},
        ${input.notes ?? null}, ${input.urgency ?? 'media'}, ${input.deadline ?? null},
        ${input.status ?? 'pendiente'}, ${input.inToday ?? false},
        ${input.inToday ? Number(todayPosition) : null}, ${Number(position)}, ${userId}
      )
      returning id
    `) as Row[]

    const taskId = created.id as string

    const inserts: Promise<unknown>[] = []

    if (subtaskTitles.length > 0) {
      inserts.push(sql`
        insert into subtasks (task_id, title, position)
        select ${taskId}, title, position
        from unnest(
          ${subtaskTitles}::text[],
          ${subtaskTitles.map((_, index) => index)}::int[]
        ) as t(title, position)
      `)
    }

    if (links.length > 0) {
      inserts.push(sql`
        insert into task_links (task_id, url, title, position)
        select ${taskId}, url, title, position
        from unnest(
          ${links.map((link) => link.url)}::text[],
          ${links.map((link) => link.title)}::text[],
          ${links.map((_, index) => index)}::int[]
        ) as t(url, title, position)
      `)
    }

    await Promise.all(inserts)

    res.status(201).json(await loadTask(taskId, userId))
  },
})
