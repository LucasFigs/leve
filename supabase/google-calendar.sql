-- Credenciais acessíveis somente à Edge Function autenticada, nunca à API cliente.
create table if not exists public.google_calendar_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation uuid not null,
  refresh_cipher text,
  email text,
  calendar_id text not null default 'primary' check (length(calendar_id) between 1 and 1024),
  auto_sync boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.google_calendar_oauth_states (
  state_hash text primary key,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  generation uuid not null,
  verifier text not null,
  browser_hash text not null,
  expires_at timestamptz not null
);
alter table public.google_calendar_connections enable row level security;
alter table public.google_calendar_oauth_states enable row level security;
revoke all on public.google_calendar_connections, public.google_calendar_oauth_states from public, anon, authenticated;
grant select, insert, update, delete on public.google_calendar_connections, public.google_calendar_oauth_states to service_role;
-- Sem políticas cliente e sem publicação no Realtime. user_id vem do JWT validado.
