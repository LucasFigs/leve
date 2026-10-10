-- Leve · lembretes por push (notificação com o app fechado)
-- Aplicado por `npm run setup:push` (ou cole no SQL Editor do Supabase).
-- O agendamento a cada minuto é criado pelo script, porque leva um segredo que não vai para o git.

-- Um registro por aparelho inscrito.
create table if not exists public.push_subscriptions (
  endpoint   text        primary key,
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh     text        not null,
  auth       text        not null,
  -- fuso do aparelho (ex.: America/Sao_Paulo), para o servidor saber que horas são aí
  tz         text        not null default 'America/Sao_Paulo',
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions: dono" on public.push_subscriptions;
create policy "push_subscriptions: dono" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Avisos já enviados (evita repetir a cada minuto). Só o servidor acessa: RLS ligado e sem políticas.
create table if not exists public.push_sent (
  user_id uuid        not null references auth.users (id) on delete cascade,
  key     text        not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key)
);

alter table public.push_sent enable row level security;

-- Extensões usadas pelo agendamento.
create extension if not exists pg_cron;
create extension if not exists pg_net;
