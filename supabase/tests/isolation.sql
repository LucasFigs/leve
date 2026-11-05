-- Executar em banco Supabase LOCAL/de teste após schema.sql e push.sql.
-- Usa usuários temporários e ROLLBACK; qualquer falha deve interromper o runner.
begin;
select set_config('leve.test.a', gen_random_uuid()::text, true);
select set_config('leve.test.b', gen_random_uuid()::text, true);
insert into auth.users (id) values (current_setting('leve.test.a')::uuid), (current_setting('leve.test.b')::uuid);
insert into public.records (user_id, id, type, data) values
  (current_setting('leve.test.a')::uuid, 'meta', 'meta', '{"settings":{}}'),
  (current_setting('leve.test.b')::uuid, 'meta', 'meta', '{"settings":{}}');
insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values
  ('https://fcm.googleapis.com/security-test-a', current_setting('leve.test.a')::uuid, repeat('A',87), repeat('A',22)),
  ('https://fcm.googleapis.com/security-test-b', current_setting('leve.test.b')::uuid, repeat('A',87), repeat('A',22));

set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('leve.test.b'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('leve.test.b'), 'role', 'authenticated')::text, true);
do $$
declare n integer;
begin
  if (select count(*) from public.records) <> 1 then raise exception 'RLS SELECT records falhou'; end if;
  if (select count(*) from public.push_subscriptions) <> 1 then raise exception 'RLS SELECT push falhou'; end if;
  update public.records set origin = 'attack' where user_id = current_setting('leve.test.a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS UPDATE cruzado falhou'; end if;
  delete from public.records where user_id = current_setting('leve.test.a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS DELETE cruzado falhou'; end if;
  update public.push_subscriptions set tz = 'UTC' where user_id = current_setting('leve.test.a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS UPDATE push cruzado falhou'; end if;
  delete from public.push_subscriptions where user_id = current_setting('leve.test.a')::uuid;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'RLS DELETE push cruzado falhou'; end if;
  begin
    insert into public.records (user_id, id, type, data) values (current_setting('leve.test.a')::uuid, 'attack', 'project', '{"id":"attack"}');
    raise exception 'RLS INSERT cruzado falhou';
  exception when insufficient_privilege then null; end;
  begin
    update public.records set user_id = current_setting('leve.test.a')::uuid;
    raise exception 'RLS WITH CHECK falhou';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.push_subscriptions (endpoint, user_id, p256dh, auth) values ('https://fcm.googleapis.com/attack', current_setting('leve.test.a')::uuid, repeat('A',87), repeat('A',22));
    raise exception 'RLS INSERT push cruzado falhou';
  exception when insufficient_privilege then null; end;
  begin
    update public.push_subscriptions set user_id = current_setting('leve.test.a')::uuid;
    raise exception 'RLS WITH CHECK push falhou';
  exception when insufficient_privilege then null; end;
  begin
    perform 1 from public.push_sent;
    raise exception 'Cliente acessou push_sent';
  exception when insufficient_privilege then null; end;
  insert into public.records (id, type, data) values ('own', 'project', '{"id":"own","name":"Teste","emoji":"x","color":"blue","createdAt":0}');
  update public.records set origin = 'own' where id = 'own';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'UPDATE próprio falhou'; end if;
  delete from public.records where id = 'own';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'DELETE próprio falhou'; end if;
end $$;

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
do $$
begin
  begin perform 1 from public.records; raise exception 'Anônimo acessou records'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.push_subscriptions; raise exception 'Anônimo acessou push'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.push_sent; raise exception 'Anônimo acessou push_sent'; exception when insufficient_privilege then null; end;
end $$;
rollback;
