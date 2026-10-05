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
