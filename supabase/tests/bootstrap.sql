-- Harness PostgreSQL local: reproduz somente os papéis e auth.uid() usados
-- pelas políticas. Não substitui testes da API Auth/Realtime do Supabase.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;
grant usage on schema public, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
create publication supabase_realtime;
