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

revoke all on public.push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
revoke all on public.push_sent from public, anon, authenticated;

create or replace function public.validate_leve_push() returns trigger
language plpgsql set search_path = '' as $$
begin
  if length(new.endpoint) > 2048 or new.endpoint !~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|([a-z0-9-]+\.)*wns\.windows\.com)/[^#[:space:]]+$'
     or new.p256dh !~ '^[A-Za-z0-9_-]{87}={0,1}$'
     or new.auth !~ '^[A-Za-z0-9_-]{22}={0,2}$'
     or not exists (select 1 from pg_catalog.pg_timezone_names where name = new.tz) then
    raise exception 'Inscrição push inválida' using errcode = '23514';
  end if;
  -- Serializa inscrições por usuário para a quota não sofrer corrida.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.push_subscriptions where user_id = new.user_id and endpoint <> new.endpoint) >= 10 then
    raise exception 'Limite de 10 aparelhos atingido' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.validate_leve_push() from public;
drop trigger if exists validate_leve_push on public.push_subscriptions;
create trigger validate_leve_push before insert or update on public.push_subscriptions
for each row execute function public.validate_leve_push();
