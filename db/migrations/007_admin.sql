-- Panel interno. No es una fila de users: sessions.user_id es not null y esa
-- cuenta no se puede crear por el registro. admin_sessions guarda solo el hash
-- del token, igual que sessions.
--
-- last_seen_at es la ultima vez que la cuenta uso la app, no solo el login.
-- Antes no se anotaba en cada request, asi que el backfill toma la sesion mas
-- nueva y no pisa un valor que ya exista.
--
-- impersonated marca la sesion que abre "Ver como". Esa no mueve last_seen_at:
-- la cuenta no entro.

alter table users add column if not exists last_seen_at timestamptz;

update users u
set last_seen_at = s.last_seen
from (
  select user_id, max(created_at) as last_seen
  from sessions
  group by user_id
) s
where u.id = s.user_id
  and u.last_seen_at is null;

alter table sessions
  add column if not exists impersonated boolean not null default false;

create table if not exists admin_sessions (
  id         uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
