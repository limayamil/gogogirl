-- Cuentas. Una sola sentencia (bloque DO) para que el alta del dueno y el
-- backfill commiteen juntos: si algo no se puede asignar, no queda la columna
-- a medias.
--
-- Inventario (lo que existia antes de esta migracion):
--   categories, tasks, quick_tasks, notes, note_tags
--     filas de una persona -> user_id, backfill al unico dueno.
--   subtasks, task_links
--     cuelgan de una tarea (FK). No llevan user_id propio: se leen por el dueno
--     de la tarea. Si la tarea no tiene dueno, esta migracion aborta.
--   attachments
--     cuelgan de una tarea o de una nota. Misma regla.
--   note_tag_assignments
--     une una nota y una etiqueta. Las dos tienen que quedar con el mismo dueno.
--   _migrations
--     libro del runner, no es de una persona. Sin user_id.
--
-- Esta migracion no borra filas ni columnas. El unico drop es el indice unico
-- global de etiquetas: dos cuentas tienen que poder usar el mismo nombre sin
-- compartir la fila. Los datos de la etiqueta quedan.
--
-- La contrasena de la cuenta vive hasheada en users.password_hash.
-- notes.password es la contrasena que la persona guardo para leerla: no se toca.

do $accounts$
declare
  owner_id uuid;
  user_count bigint;
  unclaimed_count bigint;
  content_nulls bigint;
begin
  create table if not exists users (
    id            uuid primary key default gen_random_uuid(),
    username      text,
    password_hash text,
    created_at    timestamptz not null default now(),
    constraint users_credentials_chk check (
      (username is null and password_hash is null)
      or (username is not null and password_hash is not null)
    )
  );

  create unique index if not exists users_username_lower_idx
    on users (lower(username))
    where username is not null;

  create table if not exists sessions (
    id         uuid primary key default gen_random_uuid(),
    user_id    uuid not null references users (id),
    token_hash text not null unique,
    expires_at timestamptz not null,
    created_at timestamptz not null default now()
  );

  alter table categories  add column if not exists user_id uuid references users (id);
  alter table tasks       add column if not exists user_id uuid references users (id);
  alter table quick_tasks add column if not exists user_id uuid references users (id);
  alter table notes       add column if not exists user_id uuid references users (id);
  alter table note_tags   add column if not exists user_id uuid references users (id);

  select count(*) into user_count from users;
  select count(*) into unclaimed_count
    from users
    where username is null and password_hash is null;

  if user_count = 0 then
    insert into users (username, password_hash)
    values (null, null)
    returning id into owner_id;
  elsif user_count = 1 and unclaimed_count = 1 then
    select id into owner_id
      from users
      where username is null and password_hash is null;
  else
    select
      (select count(*) from categories  where user_id is null) +
      (select count(*) from tasks       where user_id is null) +
      (select count(*) from quick_tasks where user_id is null) +
      (select count(*) from notes       where user_id is null) +
      (select count(*) from note_tags   where user_id is null)
    into content_nulls;

    if content_nulls > 0 then
      raise exception
        'No se puede asignar el contenido existente: hay % cuentas y % filas sin dueno. No adivino a quien pertenecen.',
        user_count, content_nulls;
    end if;

    owner_id := null;
  end if;

  if owner_id is not null then
    update categories  set user_id = owner_id where user_id is null;
    update tasks       set user_id = owner_id where user_id is null;
    update quick_tasks set user_id = owner_id where user_id is null;
    update notes       set user_id = owner_id where user_id is null;
    update note_tags   set user_id = owner_id where user_id is null;
  end if;

  if exists (
    select 1
    from subtasks s
    left join tasks t on t.id = s.task_id
    where t.user_id is null
  ) then
    raise exception 'Hay subtareas cuya tarea no tiene dueno. No las asigno.';
  end if;

  if exists (
    select 1
    from task_links l
    left join tasks t on t.id = l.task_id
    where t.user_id is null
  ) then
    raise exception 'Hay links cuya tarea no tiene dueno. No los asigno.';
  end if;

  if exists (
    select 1
    from attachments a
    left join tasks t on t.id = a.task_id
    left join notes n on n.id = a.note_id
    where (a.task_id is not null and t.user_id is null)
       or (a.note_id is not null and n.user_id is null)
       or (a.task_id is null and a.note_id is null)
  ) then
    raise exception 'Hay adjuntos que no cuelgan de una tarea o nota con dueno. No los asigno.';
  end if;

  if exists (
    select 1
    from note_tag_assignments a
    left join notes n on n.id = a.note_id
    left join note_tags g on g.id = a.tag_id
    where n.user_id is null
       or g.user_id is null
       or n.user_id is distinct from g.user_id
  ) then
    raise exception 'Hay etiquetas de notas que no se pueden asignar a un solo dueno.';
  end if;

  if exists (select 1 from categories  where user_id is null)
     or exists (select 1 from tasks       where user_id is null)
     or exists (select 1 from quick_tasks where user_id is null)
     or exists (select 1 from notes       where user_id is null)
     or exists (select 1 from note_tags   where user_id is null)
  then
    raise exception 'Quedaron filas sin dueno despues del backfill.';
  end if;

  alter table categories  alter column user_id set not null;
  alter table tasks       alter column user_id set not null;
  alter table quick_tasks alter column user_id set not null;
  alter table notes       alter column user_id set not null;
  alter table note_tags   alter column user_id set not null;

  create index if not exists categories_user_idx  on categories (user_id, position);
  create index if not exists tasks_user_idx       on tasks (user_id, position);
  create index if not exists quick_tasks_user_idx on quick_tasks (user_id, position);
  create index if not exists notes_user_idx       on notes (user_id, updated_at desc);
  create index if not exists note_tags_user_idx   on note_tags (user_id, lower(name));

  drop index if exists note_tags_name_lower_idx;
  create unique index if not exists note_tags_user_name_lower_idx
    on note_tags (user_id, lower(name));
end
$accounts$;
