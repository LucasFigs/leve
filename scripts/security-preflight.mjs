// Consulta agregados/configurações, sem escrever no projeto Supabase.
import { readFileSync } from 'node:fs';
const env = Object.fromEntries(readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^\s*[A-Z_]+=/.test(l)).map(l => { const i=l.indexOf('='); return [l.slice(0,i).trim(),l.slice(i+1).trim()]; }));
const url = env.VITE_SUPABASE_URL;
if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url ?? '') || !env.SUPABASE_ACCESS_TOKEN) throw new Error('Configuração administrativa ausente/inválida.');
const ref = new URL(url).hostname.split('.')[0];
async function api(path, body) {
  const response = await fetch(`https://api.supabase.com/v1/projects/${ref}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`Consulta administrativa falhou (${response.status}); corpo omitido.`);
  return response.json();
}
const query = `
select 'tables' as section, coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity)), '[]') as checks
from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('records','push_subscriptions','push_sent')
union all
select 'policies',coalesce(jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'using',qual,'check',with_check)), '[]') from pg_policies where schemaname='public' and tablename in ('records','push_subscriptions','push_sent')
union all
select 'records',jsonb_build_object('count',count(*),'oversized',count(*) filter(where octet_length(data::text)>262144),'bad_ids',count(*) filter(where type in ('task','project') and (data->>'id') is distinct from id),'max_per_user',(select coalesce(max(n),0) from(select count(*) n from public.records group by user_id)s)) from public.records
union all
select 'push',jsonb_build_object('count',count(*),'invalid_tz',count(*) filter(where not exists(select 1 from pg_timezone_names where name=tz)),'max_per_user',(select coalesce(max(n),0) from(select count(*) n from public.push_subscriptions group by user_id)s)) from public.push_subscriptions;
`;
try {
  console.log(JSON.stringify({ target: new URL(url).host, app: env.APP_URL, database: await api('/database/query',{query}) },null,2));
  const auth = await api('/config/auth');
  console.log(JSON.stringify({auth:{site_url:auth.site_url,uri_allow_list:auth.uri_allow_list,password_min_length:auth.password_min_length,mailer_autoconfirm:auth.mailer_autoconfirm,external_google_enabled:auth.external_google_enabled}},null,2));
  try {
    const backups = await api('/database/backups');
    console.log(JSON.stringify({backup:{pitr_enabled:backups.pitr_enabled, entries:Array.isArray(backups.backups)?backups.backups.map(b=>({status:b.status,inserted_at:b.inserted_at})):[]}},null,2));
  } catch { console.log('Backup: não confirmado pela API; verificar no painel antes de aplicar.'); }
} catch (error) { console.error(error.message); process.exitCode=1; }
