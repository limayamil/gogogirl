-- Calendarios de Google por direccion secreta iCal. Solo agrega una tabla: el
-- codigo anterior no la lee, asi que aplicar esto antes del deploy no cambia
-- nada de lo que ya esta en linea.
--
-- ical_url es un secreto (quien la tiene lee el calendario). La API nunca la
-- devuelve despues de guardarla: el front ve una version enmascarada.

create table if not exists calendars (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id),
  name       text not null,
  color_key  text not null,
  ical_url   text not null,
  position   integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists calendars_user_idx on calendars (user_id, position);
