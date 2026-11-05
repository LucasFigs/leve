import { hash, randomSecret, seal, unseal } from './crypto.ts';

export interface Config { supabaseUrl: string; serviceKey: string; clientId: string; clientSecret: string; encryptionKey: string; appOrigin: string }
const scopes = ['email', 'https://www.googleapis.com/auth/calendar.events', 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'];
interface Connection { user_id: string; generation: string; refresh_cipher: string | null; email: string; calendar_id: string; auto_sync: boolean }
interface OAuthState { user_id: string; generation: string; verifier: string }
class Failure extends Error { constructor(public status: number, message: string) { super(message); } }

export function createHandler(config: Config, request: typeof fetch = fetch) {
  const origin = new URL(config.appOrigin).origin;
  if (origin !== config.appOrigin || (!origin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin))) throw new Error('Invalid app origin');
  const callback = `${config.supabaseUrl}/functions/v1/google-calendar/callback`;
  const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
  const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
  const network = (url: string, init: RequestInit = {}) => request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
  async function db<T>(table: string, query: string, method = 'GET', body?: unknown): Promise<T[]> {
    const response = await network(`${config.supabaseUrl}/rest/v1/${table}?${query}`, { method, headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Content-Type': 'application/json', Prefer: 'return=representation,resolution=merge-duplicates' }, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!response.ok) throw new Failure(503, 'Não foi possível acessar a integração. Tente novamente.');
    return response.status === 204 ? [] : response.json();
  }
  async function token(body: Record<string, string>) {
    const response = await network('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...body, client_id: config.clientId, client_secret: config.clientSecret }) });
    const data = await response.json();
    if (!response.ok) {
      if (data.error === 'invalid_grant') throw new Failure(409, 'A autorização do Google foi revogada ou expirou. Conecte novamente.');
      throw new Failure(503, 'O Google não respondeu à renovação. Tente novamente.');
    }
    if (typeof data.access_token !== 'string' || !Number.isFinite(data.expires_in) || data.expires_in <= 0) throw new Failure(503, 'Resposta inválida do Google.');
    return data;
  }
  const redirect = (result: string) => new Response(null, { status: 303, headers: { ...headers, Location: `${origin}/?gcal=${result}` } });

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url);
    const isCallback = url.pathname.endsWith('/google-calendar/callback');
    try {
      if (isCallback) {
        if (req.method !== 'GET') return json({ error: 'Método inválido.' }, 405);
        const state = url.searchParams.get('state') ?? '';
        if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return redirect('error');
        const code = url.searchParams.get('code');
        if (url.searchParams.has('error') || !code || code.length > 4096) return redirect('error');
        // Apenas transporta o código ao app pelo fragmento, não enviado ao hosting/referrer.
        // A troca exige JWT + prova do navegador que iniciou o fluxo. Isso impede vinculação
        // da conta Google de uma vítima à conta Leve de quem compartilhou uma URL de consentimento.
        return new Response(null, { status: 303, headers: { ...headers, Location: `${origin}/#${new URLSearchParams({ gcal_code: code, gcal_state: state })}` } });
      }
      if (req.headers.get('origin') !== origin) return json({ error: 'Origem não permitida.' }, 403);
      if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
      if (req.method !== 'POST') return json({ error: 'Método inválido.' }, 405);
      const auth = req.headers.get('authorization') ?? '';
      if (!auth.startsWith('Bearer ')) return json({ error: 'Entre na sua conta do Leve.' }, 401);
      const check = await network(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.serviceKey, Authorization: auth } });
      if (!check.ok) return json({ error: 'Sessão do Leve expirada. Entre novamente.' }, 401);
      const user = await check.json();
      if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/.test(user.id)) return json({ error: 'Sessão inválida.' }, 401);
      const userId = user.id;
      // Limite também para requests sem Content-Length.
      const raw = await req.text();
      if (raw.length > 4096) return json({ error: 'Pedido muito grande.' }, 413);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return json({ error: 'Pedido inválido.' }, 400); }
      if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Pedido inválido.' }, 400);
      const query = `user_id=eq.${userId}`;
      if (body.action === 'begin') {
        const state = randomSecret();
        const verifier = randomSecret();
        const generation = crypto.randomUUID();
        const proof = randomSecret();
        // Uma tentativa por usuário; registros vencidos não acumulam.
        const [existing] = await db<Connection>('google_calendar_connections', query);
        if (existing) await db('google_calendar_connections', query, 'PATCH', { generation });
        else await db('google_calendar_connections', '', 'POST', { user_id: userId, generation });
        await db('google_calendar_oauth_states', 'on_conflict=user_id', 'POST', { user_id: userId, generation, state_hash: await hash(state), browser_hash: await hash(proof), verifier, expires_at: new Date(Date.now() + 10 * 60000).toISOString() });
        const target = new URL('https://accounts.google.com/o/oauth2/v2/auth');
        target.search = new URLSearchParams({ client_id: config.clientId, redirect_uri: callback, response_type: 'code', scope: scopes.join(' '), access_type: 'offline', prompt: 'consent select_account', state, code_challenge: await hash(verifier), code_challenge_method: 'S256' }).toString();
        return json({ url: target.href, proof, state });
      }
      if (body.action === 'complete') {
        if (typeof body.state !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.state) || typeof body.proof !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(body.proof) || typeof body.code !== 'string' || !body.code || body.code.length > 3000) return json({ error: 'Autorização inválida. Conecte novamente.' }, 400);
        // DELETE RETURNING atômico: expiração, dono, prova de origem e uso único.
        const [pending] = await db<OAuthState>('google_calendar_oauth_states', `${query}&state_hash=eq.${await hash(body.state)}&browser_hash=eq.${await hash(body.proof)}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`, 'DELETE');
        if (!pending) return json({ error: 'Autorização expirada ou já utilizada. Conecte novamente.' }, 409);
        const credentials = await token({ grant_type: 'authorization_code', code: body.code, code_verifier: pending.verifier, redirect_uri: callback });
        if (!credentials.refresh_token || !scopes.slice(1).every(scope => String(credentials.scope ?? '').split(' ').includes(scope))) return json({ error: 'Autorize o acesso solicitado ao Google Agenda.' }, 409);
        const profile = await network('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${credentials.access_token}` } });
        if (!profile.ok) throw new Failure(503, 'Não foi possível confirmar a conta Google.');
        const googleUser = await profile.json();
        if (typeof googleUser.email !== 'string' || googleUser.email_verified !== true) throw new Failure(409, 'Confirme seu e-mail no Google antes de conectar.');
        const rows = await db<Connection>('google_calendar_connections', `${query}&generation=eq.${pending.generation}`, 'PATCH', { refresh_cipher: await seal(credentials.refresh_token, config.encryptionKey, userId), email: googleUser.email, updated_at: new Date().toISOString() });
        if (!rows.length) return json({ error: 'O vínculo foi removido. Conecte novamente.' }, 409);
        return json({ connected: true });
      }
      if (body.action === 'disconnect') {
        const [old] = await db<Connection>('google_calendar_connections', query, 'DELETE');
        await db('google_calendar_oauth_states', query, 'DELETE');
        if (old?.refresh_cipher) {
          try {
            const refresh = await unseal(old.refresh_cipher, config.encryptionKey, userId);
            const revoked = await network('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) });
            return json({ disconnected: true, revoked: revoked.ok });
          } catch { return json({ disconnected: true, revoked: false }); }
        }
        return json({ disconnected: true, revoked: true });
      }
      const [connection] = await db<Connection>('google_calendar_connections', `${query}&select=*`);
      if (!connection?.refresh_cipher) return json({ connected: false });
      if (body.action === 'preferences') {
        const patch: Record<string, unknown> = {};
        if (typeof body.autoSync === 'boolean') patch.auto_sync = body.autoSync;
        if (typeof body.calendarId === 'string' && body.calendarId.length > 0 && body.calendarId.length <= 1024) patch.calendar_id = body.calendarId;
        if (!Object.keys(patch).length) return json({ error: 'Preferências inválidas.' }, 400);
        await db('google_calendar_connections', `${query}&generation=eq.${connection.generation}`, 'PATCH', patch);
        return json({ saved: true });
      }
      if (body.action !== 'token' && body.action !== 'status') return json({ error: 'Ação inválida.' }, 400);
      const publicState = { connected: true, email: connection.email, calendarId: connection.calendar_id, autoSync: connection.auto_sync };
      if (body.action === 'status') return json(publicState);
      const refresh = await unseal(connection.refresh_cipher, config.encryptionKey, userId);
      const credentials = await token({ grant_type: 'refresh_token', refresh_token: refresh });
      // Revalida o vínculo após a chamada externa para não responder a desconexão concorrente.
      const [current] = await db<Connection>('google_calendar_connections', `${query}&generation=eq.${connection.generation}&select=user_id`);
      if (!current) return json({ connected: false });
      return json({ ...publicState, accessToken: credentials.access_token, expiresIn: credentials.expires_in });
    } catch (err) {
      // Não registrar URL de callback, códigos, respostas OAuth ou credenciais.
      if (isCallback) return redirect('error');
      return json({ error: err instanceof Failure ? err.message : 'Não foi possível acessar a integração. Tente novamente.' }, err instanceof Failure ? err.status : 503);
    }
  };
}
