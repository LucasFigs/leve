import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHandler, type Config } from './handler';
import { base64url, seal, unseal } from './crypto';

const userId = '11111111-1111-4111-8111-111111111111';
const origin = 'https://leve.example';
const config: Config = { supabaseUrl: 'https://project.supabase.co', serviceKey: 'server-only', clientId: 'client', clientSecret: 'secret', encryptionKey: base64url(new Uint8Array(32).fill(7)), appOrigin: origin };
let tables: Record<string, Record<string, any>[]>;
let network: ReturnType<typeof vi.fn>;
let handler: ReturnType<typeof createHandler>;
beforeEach(() => {
  tables = { google_calendar_connections: [], google_calendar_oauth_states: [] };
  network = vi.fn(async (address: string, init: RequestInit = {}) => {
    const url = new URL(address);
    if (url.pathname === '/auth/v1/user') return (init.headers as Record<string, string>).Authorization === 'Bearer user-session' ? Response.json({ id: userId }) : Response.json({}, { status: 401 });
    if (url.hostname === 'oauth2.googleapis.com') return url.pathname === '/revoke' ? Response.json({}) : Response.json({ access_token: 'short-access', refresh_token: 'long-refresh', expires_in: 3600, scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.calendarlist.readonly' });
    if (url.hostname === 'www.googleapis.com') return Response.json({ email: 'person@example.test', email_verified: true });
    const table = url.pathname.split('/').pop()!;
    const rows = tables[table];
    if (!rows) throw new Error(`Unexpected endpoint: ${url.pathname}`);
    const matches = (row: Record<string, any>) => [...url.searchParams].every(([key, value]) => {
      if (key === 'on_conflict' || key === 'select') return true;
      return value.startsWith('eq.') ? row[key] === value.slice(3) : value.startsWith('gt.') ? row[key] > value.slice(3) : true;
    });
    const found = rows.filter(matches);
    if (init.method === 'POST') {
      const body = JSON.parse(String(init.body));
      const old = rows.find(row => row.user_id === body.user_id);
      if (old) Object.assign(old, body);
      else rows.push({ calendar_id: 'primary', auto_sync: true, ...body });
      return Response.json([old ?? rows.at(-1)]);
    }
    if (init.method === 'DELETE') tables[table] = rows.filter(row => !matches(row));
    if (init.method === 'PATCH') for (const row of found) Object.assign(row, JSON.parse(String(init.body)));
    return Response.json(found);
  });
  handler = createHandler(config, network as typeof fetch);
});
const post = (body: unknown, overrides: Record<string, string> = {}) => handler(new Request(`${config.supabaseUrl}/functions/v1/google-calendar`, { method: 'POST', headers: { origin, authorization: 'Bearer user-session', ...overrides }, body: JSON.stringify(body) }));

async function existing(owner=userId){tables.google_calendar_connections.push({user_id:owner,generation:'fixture-generation',email:'person@example.test',refresh_cipher:await seal('fixture-refresh',config.encryptionKey,owner)});}
describe('Google Agenda encerrado: fronteira do servidor',()=>{
 it('mantém origem e autenticação antes de consultar vínculos',async()=>{
  expect((await post({action:'status'},{origin:'https://attacker.example'})).status).toBe(403);expect(network).not.toHaveBeenCalled();
  expect((await post({action:'disconnect'},{authorization:''})).status).toBe(401);expect((await post({action:'status'},{authorization:'Bearer invalid'})).status).toBe(401);
 });
 it.each(['begin','complete','token','preferences','sync','create','update','delete'])('cliente antigo não pode executar %s',async action=>{
  await existing();const before=JSON.stringify(tables);const response=await post({action,code:'old-code',state:'x'.repeat(43),proof:'y'.repeat(43),autoSync:true});expect(response.status).toBe(410);expect(JSON.stringify(tables)).toBe(before);expect(network.mock.calls.every(([url])=>String(url).includes('/auth/v1/user'))).toBe(true);
 });
 it('callback antigo não transporta código nem consome estado, inclusive replay',async()=>{
  tables.google_calendar_oauth_states.push({user_id:userId,verifier:'fixture-proof'});
  for(let i=0;i<2;i++){const response=await handler(new Request(config.supabaseUrl+'/functions/v1/google-calendar/callback?code=private-code&state='+('x'.repeat(43))));expect(response.status).toBe(410);expect(response.headers.get('location')).toBeNull();expect(await response.text()).not.toContain('private-code');}
  expect(network).not.toHaveBeenCalled();expect(tables.google_calendar_oauth_states).toHaveLength(1);
 });
 it('status mínimo não renova nem devolve tokens ou preferências de sincronização',async()=>{
  await existing();const response=await post({action:'status',user_id:'other'});expect(await response.json()).toEqual({retired:true,connected:true,email:'person@example.test'});expect(response.headers.get('cache-control')).toBe('no-store');expect(network.mock.calls.some(([url])=>String(url).includes('googleapis.com'))).toBe(false);
 });
 it('novo usuário e outra conta não obtêm metadados do vínculo anterior',async()=>{
  expect(await (await post({action:'status'})).json()).toEqual({retired:true,connected:false});await existing('22222222-2222-4222-8222-222222222222');expect(await (await post({action:'status'})).json()).toEqual({retired:true,connected:false});await post({action:'disconnect'});expect(tables.google_calendar_connections).toHaveLength(1);
 });
 it('desconexão explícita revoga somente o vínculo do usuário, sem eventos remotos',async()=>{
  await existing();await existing('22222222-2222-4222-8222-222222222222');tables.google_calendar_oauth_states.push({user_id:userId});
  expect(await (await post({action:'disconnect'})).json()).toEqual({retired:true,disconnected:true,revoked:true});expect(tables.google_calendar_connections).toHaveLength(1);expect(tables.google_calendar_oauth_states).toHaveLength(0);
  expect(network.mock.calls.filter(([url])=>String(url).includes('googleapis.com')).map(([url])=>url)).toEqual(['https://oauth2.googleapis.com/revoke']);
 });
 it.each(['offline','rejected'])('revogação %s nunca é declarada como confirmada',async failure=>{
  await existing();const base=network.getMockImplementation()!;network.mockImplementation(async(url,init)=>{if(String(url).endsWith('/revoke')){if(failure==='offline')throw Error('offline');return Response.json({},{status:503});}return base(url,init);});
  expect(await (await post({action:'disconnect'})).json()).toEqual({retired:true,disconnected:true,revoked:false});expect(tables.google_calendar_connections).toHaveLength(0);
 });
 it('sem token armazenado não comprova revogação externa',async()=>{expect(await (await post({action:'disconnect'})).json()).toEqual({retired:true,disconnected:true,revoked:false});});
 it('não decifra token de outra conta nem ciphertext adulterado',async()=>{
  const encrypted=await seal('private',config.encryptionKey,userId);await expect(unseal(encrypted,config.encryptionKey,'other-user')).rejects.toThrow();const parts=encrypted.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);await expect(unseal(parts.join('.'),config.encryptionKey,userId)).rejects.toThrow();
 });
 it('preserva limites de entrada e métodos',async()=>{
  expect((await post({action:'status',padding:'x'.repeat(5000)})).status).toBe(413);expect((await post([])).status).toBe(400);
  expect((await handler(new Request(config.supabaseUrl+'/functions/v1/google-calendar',{method:'GET',headers:{origin}}))).status).toBe(405);
 });
});
