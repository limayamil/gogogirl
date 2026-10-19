import { sql } from './db.ts'

type Row = Record<string, unknown>

/**
 * Firma barata del estado completo: una sola sentencia, un solo round-trip.
 *
 * Los `count(*)` son los que detectan los borrados — que no dejan rastro en ningun
 * `max` — y los `max` detectan las ediciones. Subtareas y links no tienen `updated_at`
 * propio, pero cualquier cambio en ellos o cambia su count o pasa por un PATCH de su
 * tarea, asi que la firma igual se mueve.
 *
 * Vive en un solo lugar a proposito: la consumen `GET /api/state` (que la devuelve
 * junto al estado) y `GET /api/version` (que devuelve solo esto). Si se calcularan por
 * separado, cualquier diferencia entre las dos haria aparecer el aviso de novedades
 * para siempre.
 */
export async function stateVersion(userId: string): Promise<string> {
  const [row] = (await sql`
    select
      (select count(*) from tasks where user_id = ${userId}) as tasks_n,
      (select max(updated_at) from tasks where user_id = ${userId}) as tasks_at,
      (select count(*) from categories where user_id = ${userId}) as cat_n,
      (select max(created_at) from categories where user_id = ${userId}) as cat_at,
      (select count(*) from subtasks s
        join tasks t on t.id = s.task_id
        where t.user_id = ${userId}) as sub_n,
      (select count(*) from quick_tasks where user_id = ${userId}) as quick_n,
      (select max(created_at) from quick_tasks where user_id = ${userId}) as quick_at,
      (select count(*) from task_links l
        join tasks t on t.id = l.task_id
        where t.user_id = ${userId}) as link_n,
      (select count(*) from attachments a
        where exists (
          select 1 from tasks t where t.id = a.task_id and t.user_id = ${userId}
        ) or exists (
          select 1 from notes n where n.id = a.note_id and n.user_id = ${userId}
        )) as att_n,
      (select count(*) from notes where user_id = ${userId}) as notes_n,
      (select max(updated_at) from notes where user_id = ${userId}) as notes_at,
      (select count(*) from note_tags where user_id = ${userId}) as tag_n,
      (select count(*) from note_tag_assignments a
        join notes n on n.id = a.note_id
        where n.user_id = ${userId}) as tag_assign_n
  `) as Row[]

  return [
    row.tasks_n,
    row.tasks_at,
    row.cat_n,
    row.cat_at,
    row.sub_n,
    row.quick_n,
    row.quick_at,
    row.link_n,
    row.att_n,
    row.notes_n,
    row.notes_at,
    row.tag_n,
    row.tag_assign_n,
  ]
    .map((value) => (value instanceof Date ? value.getTime() : String(value ?? '')))
    .join('.')
}
