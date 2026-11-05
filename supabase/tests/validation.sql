-- Validação/quotas em banco de teste, sem dados permanentes.
begin;
select set_config('leve.test.a', gen_random_uuid()::text, true);
insert into auth.users(id) values (current_setting('leve.test.a')::uuid);
set local role authenticated;
select set_config('request.jwt.claim.sub', current_setting('leve.test.a'), true);
select set_config('request.jwt.claims', json_build_object('sub', current_setting('leve.test.a'), 'role', 'authenticated')::text, true);
do $$
declare endpoint_value text; i integer; n integer;
begin
  foreach endpoint_value in array array[
    'http://fcm.googleapis.com/a', 'https://127.0.0.1/a',
    'https://169.254.169.254/a', 'https://fcm.googleapis.com.evil.test/a',
    'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a',
    'https://fcm.googleapis.com/a#fragment'
  ] loop
    begin
      insert into public.push_subscriptions(endpoint,p256dh,auth) values(endpoint_value,repeat('A',87),repeat('A',22));
      raise exception 'Endpoint perigoso aceito';
    exception when check_violation then null; end;
  end loop;
  begin
    insert into public.push_subscriptions(endpoint,p256dh,auth,tz) values('https://fcm.googleapis.com/invalid-tz',repeat('A',87),repeat('A',22),'Invalid/Timezone');
    raise exception 'Fuso inválido aceito';
  exception when check_violation then null; end;
  for i in 1..10 loop
    insert into public.push_subscriptions(endpoint,p256dh,auth) values('https://fcm.googleapis.com/test-'||i,repeat('A',87),repeat('A',22));
  end loop;
  begin
    insert into public.push_subscriptions(endpoint,p256dh,auth) values('https://fcm.googleapis.com/eleven',repeat('A',87),repeat('A',22));
    raise exception 'Quota push ultrapassada';
  exception when check_violation then null; end;
  update public.push_subscriptions set tz='UTC' where endpoint='https://fcm.googleapis.com/test-1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'UPDATE próprio de push falhou'; end if;
  delete from public.push_subscriptions where endpoint='https://fcm.googleapis.com/test-1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'DELETE próprio de push falhou'; end if;
  begin
    insert into public.records(id,type,data) values('wrong','project','{"id":"other"}');
    raise exception 'ID inconsistente aceito';
  exception when check_violation then null; end;
  begin
    insert into public.records(id,type,data) values('large','project',jsonb_build_object('id','large','notes',repeat('x',262144)));
    raise exception 'Registro excessivo aceito';
  exception when check_violation then null; end;
  begin
    insert into public.records(id,type,data) values('bad','task','{"id":"bad","title":"bad"}');
    raise exception 'Tarefa inválida aceita';
  exception when check_violation then null; end;
end $$;
-- Preenche quota como administrador sem custo quadrático nos fixtures.
reset role;
alter table public.records disable trigger validate_leve_record;
insert into public.records(user_id,id,type,data)
select current_setting('leve.test.a')::uuid,'quota-'||n,'project',jsonb_build_object('id','quota-'||n)
from generate_series(1,10000) n;
alter table public.records enable trigger validate_leve_record;
set local role authenticated;
do $$
begin
  begin
    insert into public.records(id,type,data) values('over-quota','project','{"id":"over-quota"}');
    raise exception 'Quota de registros ultrapassada';
  exception when check_violation then null; end;
  update public.records set origin='test' where id='quota-1';
  if not found then raise exception 'Atualização na quota falhou'; end if;
end $$;
rollback;
