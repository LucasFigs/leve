begin;
insert into auth.users(id) values ('11111111-1111-4111-8111-111111111111');
insert into public.google_calendar_connections(user_id, generation, refresh_cipher)
values ('11111111-1111-4111-8111-111111111111', gen_random_uuid(), 'encrypted-fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
do $$ begin
  begin perform * from public.google_calendar_connections; raise exception 'Cliente leu credencial'; exception when insufficient_privilege then null; end;
  begin perform * from public.google_calendar_oauth_states; raise exception 'Cliente leu estado OAuth'; exception when insufficient_privilege then null; end;
  begin delete from public.google_calendar_connections; raise exception 'Cliente apagou vínculo'; exception when insufficient_privilege then null; end;
  begin insert into public.google_calendar_connections(user_id, generation) values (auth.uid(), gen_random_uuid()); raise exception 'Cliente inseriu vínculo'; exception when insufficient_privilege then null; end;
  begin update public.google_calendar_connections set email = 'changed'; raise exception 'Cliente alterou vínculo'; exception when insufficient_privilege then null; end;
end $$;
set local role anon;
do $$ begin
  begin perform * from public.google_calendar_connections; raise exception 'Anônimo leu credencial'; exception when insufficient_privilege then null; end;
  begin perform * from public.google_calendar_oauth_states; raise exception 'Anônimo leu estado OAuth'; exception when insufficient_privilege then null; end;
end $$;
set local role service_role;
do $$ begin
  if (select count(*) from public.google_calendar_connections) <> 1 then raise exception 'Servidor sem acesso ao vínculo'; end if;
end $$;
reset role;
delete from auth.users where id = '11111111-1111-4111-8111-111111111111';
do $$ begin
  if exists(select 1 from public.google_calendar_connections) then raise exception 'Credencial órfã após excluir conta'; end if;
end $$;
rollback;
