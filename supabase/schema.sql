-- Leve · esquema do Supabase
-- Rode uma vez em: Supabase → SQL Editor → New query → cole tudo → Run.

-- Uma linha por tarefa, projeto e uma linha "meta" (preferências) por usuário.
create table if not exists public.records (
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  id         text        not null,
  type       text        not null check (type in ('task', 'project', 'meta')),
  data       jsonb       not null,
  -- aparelho que fez a última alteração (evita eco no tempo real)
  origin     text,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

-- Cada usuário só enxerga e altera os próprios dados.
alter table public.records enable row level security;

drop policy if exists "records: dono" on public.records;
create policy "records: dono" on public.records
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Sincronização em tempo real entre aparelhos.
do $$
begin
  alter publication supabase_realtime add table public.records;
exception when duplicate_object then null;
end $$;

-- Somente CRUD autenticado; operações administrativas ficam fora da API cliente.
revoke all on public.records from public, anon, authenticated;
grant select, insert, update, delete on public.records to authenticated;

create or replace function public.validate_leve_record() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'INSERT' then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 1));
    if (select count(*) from public.records where user_id = new.user_id and id <> new.id) >= 10000 then
      raise exception 'Limite de 10000 registros atingido' using errcode = '23514';
    end if;
  end if;
  if length(new.id) not between 1 and 200 or octet_length(new.data::text) > 262144
     or jsonb_typeof(new.data) is distinct from 'object' then
    raise exception 'Registro inválido ou muito grande' using errcode = '23514';
  end if;
  if new.type in ('task', 'project') and (new.data->>'id') is distinct from new.id then
    raise exception 'Identificador inconsistente' using errcode = '23514';
  end if;
  if new.type = 'task' and (
    jsonb_typeof(new.data->'title') is distinct from 'string' or length(new.data->>'title') > 1000
    or coalesce(new.data->>'status', '') not in ('inbox', 'active', 'done', 'archived')
    or coalesce(new.data->>'kind', '') not in ('task', 'event', 'habit')
    or jsonb_typeof(new.data->'subtasks') is distinct from 'array'
    or jsonb_typeof(new.data->'createdAt') is distinct from 'number'
    or jsonb_typeof(new.data->'updatedAt') is distinct from 'number'
  ) then
    raise exception 'Tarefa inválida' using errcode = '23514';
  end if;
  if new.type = 'meta' and (new.id <> 'meta' or jsonb_typeof(new.data->'settings') is distinct from 'object') then
    raise exception 'Preferências inválidas' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.validate_leve_record() from public;
drop trigger if exists validate_leve_record on public.records;
create trigger validate_leve_record before insert or update on public.records
for each row execute function public.validate_leve_record();
