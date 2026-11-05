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
async function begin() { return (await post({ action: 'begin' })).json(); }
async function complete(start: any) { return post({ action: 'complete', state: start.state, proof: start.proof, code: 'google-code' }); }

describe('Google Agenda: fronteira do servidor', () => {
  it('recusa origem estranha e sessões ausentes/inválidas antes de acessar credenciais', async () => {
    expect((await post({ action: 'token' }, { origin: 'https://attacker.example' })).status).toBe(403);
    expect(network).not.toHaveBeenCalled();
    expect((await post({ action: 'token' }, { authorization: '' })).status).toBe(401);
    expect((await post({ action: 'token' }, { authorization: 'Bearer invalid' })).status).toBe(401);
    expect(tables.google_calendar_connections).toHaveLength(0);
  });
  it('usa PKCE e estado único com expiração e não expõe o verificador na URL', async () => {
    const start = await begin();
    const url = new URL(start.url);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    const pending = tables.google_calendar_oauth_states[0];
    expect(url.href).not.toContain(pending.verifier);
    expect(pending.state_hash).not.toBe(start.state);
    expect(pending.browser_hash).not.toBe(start.proof);
    expect(Date.parse(pending.expires_at) - Date.now()).toBeLessThanOrEqual(600000);
    await begin(); expect(tables.google_calendar_oauth_states).toHaveLength(1);
  });
  it('retorno público somente redireciona código no fragmento, sem trocar tokens', async () => {
    const start = await begin(); network.mockClear();
    const response = await handler(new Request(`${config.supabaseUrl}/functions/v1/google-calendar/callback?code=test&state=${start.state}`));
    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe(`${origin}/#gcal_code=test&gcal_state=${start.state}`);
    expect(network).not.toHaveBeenCalled();
  });
  it('não aceita prova de outro navegador nem estado vencido, e impede replay', async () => {
    const start = await begin();
    expect((await post({ action: 'complete', state: start.state, proof: 'x'.repeat(43), code: 'code' })).status).toBe(409);
    expect((await complete(start)).status).toBe(200);
    expect((await complete(start)).status).toBe(409);
    const expired = await begin(); tables.google_calendar_oauth_states[0].expires_at = '2000-01-01T00:00:00.000Z';
    expect((await complete(expired)).status).toBe(409);
  });
  it('salva refresh token cifrado e entrega somente access token após autenticação', async () => {
    const start = await begin(); expect((await complete(start)).status).toBe(200);
    const connection = tables.google_calendar_connections[0];
    expect(JSON.stringify(tables)).not.toContain('long-refresh');
    expect(await unseal(connection.refresh_cipher, config.encryptionKey, userId)).toBe('long-refresh');
    const status = await post({ action: 'status', user_id: 'attacker' });
    expect(await status.json()).toMatchObject({ connected: true, email: 'person@example.test' });
    const response = await post({ action: 'token' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    const data = await response.json();
    expect(data.accessToken).toBe('short-access');
    expect(JSON.stringify(data)).not.toContain('long-refresh');
    expect(JSON.stringify(data)).not.toContain('refresh_cipher');
  });
  it('não revela vínculo de outro usuário e salva preferências sem expor credenciais', async () => {
    const start = await begin(); await complete(start);
    expect((await post({ action: 'preferences', calendarId: 'work', autoSync: false })).status).toBe(200);
    expect(await (await post({ action: 'status' })).json()).toMatchObject({ calendarId: 'work', autoSync: false });
    await begin();
    expect(tables.google_calendar_connections[0]).toMatchObject({ calendar_id: 'work', auto_sync: false });
    tables.google_calendar_connections[0].user_id = '22222222-2222-4222-8222-222222222222';
    expect(await (await post({ action: 'status' })).json()).toEqual({ connected: false });
  });
  it('desconectar remove credenciais e autorizações pendentes e solicita revogação', async () => {
    const start = await begin(); await complete(start); const next = await begin();
    expect(await (await post({ action: 'disconnect' })).json()).toMatchObject({ disconnected: true, revoked: true });
    expect(tables.google_calendar_connections).toHaveLength(0);
    expect(tables.google_calendar_oauth_states).toHaveLength(0);
    expect((await complete(next)).status).toBe(409);
  });
  it('não consegue decifrar token movido para outra conta nem ciphertext adulterado', async () => {
    const encrypted = await seal('private', config.encryptionKey, userId);
    await expect(unseal(encrypted, config.encryptionKey, 'other-user')).rejects.toThrow();
    const parts = encrypted.split('.'); parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    await expect(unseal(parts.join('.'), config.encryptionKey, userId)).rejects.toThrow();
  });
});
