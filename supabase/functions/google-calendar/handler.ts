import { unseal } from './crypto.ts';
// Campos OAuth mantidos no contrato de configuração para instalações existentes.
export interface Config {
    supabaseUrl: string;
    serviceKey: string;
    clientId: string;
    clientSecret: string;
    encryptionKey: string;
    appOrigin: string;
}
interface Connection {
    user_id: string;
    generation: string;
    refresh_cipher: string | null;
    email: string;
}
class Failure extends Error {
    constructor(public status: number, message: string) { super(message); }
}
/** Modo de encerramento permanente nesta versão: nenhum caminho emite tokens. */
export function createHandler(config: Config, request: typeof fetch = fetch) {
    const origin = new URL(config.appOrigin).origin;
    if (origin !== config.appOrigin || (!origin.startsWith('https://') && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)))
        throw Error('Invalid app origin');
    const headers = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };
    const json = (value: unknown, status = 200) => Response.json(value, { status, headers });
    const network = (url: string, init: RequestInit = {}) => request(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(15000) });
    async function db(table: string, query: string, method = 'GET'): Promise<Connection[]> {
        const res = await network(`${config.supabaseUrl}/rest/v1/${table}?${query}`, { method, headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, Prefer: 'return=representation' } });
        if (!res.ok)
            throw new Failure(503, 'Não foi possível confirmar a operação. Tente novamente.');
        return res.status === 204 ? [] : res.json();
    }
    return async (req: Request): Promise<Response> => {
        const url = new URL(req.url);
        // Não transportar códigos pendentes ao app, trocar tokens ou aceitar replay.
        if (url.pathname.endsWith('/google-calendar/callback'))
            return json({ error: 'A integração Google Agenda foi descontinuada.' }, req.method === 'GET' ? 410 : 405);
        try {
            if (req.headers.get('origin') !== origin)
                return json({ error: 'Origem não permitida.' }, 403);
            if (req.method === 'OPTIONS')
                return new Response(null, { status: 204, headers });
            if (req.method !== 'POST')
                return json({ error: 'Método inválido.' }, 405);
            const auth = req.headers.get('authorization') ?? '';
            if (!auth.startsWith('Bearer '))
                return json({ error: 'Entre na sua conta do Leve.' }, 401);
            const check = await network(`${config.supabaseUrl}/auth/v1/user`, { headers: { apikey: config.serviceKey, Authorization: auth } });
            if (!check.ok)
                return json({ error: 'Sessão do Leve expirada. Entre novamente.' }, 401);
            const user = await check.json();
            if (typeof user.id !== 'string' || !/^[0-9a-f-]{36}$/.test(user.id))
                return json({ error: 'Sessão inválida.' }, 401);
            const raw = await req.text();
            if (raw.length > 4096)
                return json({ error: 'Pedido muito grande.' }, 413);
            let body: Record<string, unknown>;
            try {
                body = JSON.parse(raw);
            }
            catch {
                return json({ error: 'Pedido inválido.' }, 400);
            }
            if (!body || typeof body !== 'object' || Array.isArray(body))
                return json({ error: 'Pedido inválido.' }, 400);
            if (body.action !== 'status' && body.action !== 'disconnect')
                return json({ error: 'A integração Google Agenda foi descontinuada.' }, 410);
            const query = `user_id=eq.${user.id}`;
            const [connection] = await db('google_calendar_connections', `${query}&select=user_id,generation,email,refresh_cipher`);
            if (body.action === 'status')
                return json(connection?.refresh_cipher ? { retired: true, connected: true, email: connection.email } : { retired: true, connected: false });
            let revoked = false;
            if (connection?.refresh_cipher) {
                // Tentar revogar antes de remover o vínculo, somente por solicitação explícita.
                // AAD e filtro de conta impedem revogação de credenciais pertencentes a outro usuário.
                try {
                    const refresh = await unseal(connection.refresh_cipher, config.encryptionKey, user.id);
                    const revoke = await network('https://oauth2.googleapis.com/revoke', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: refresh }) });
                    revoked = revoke.ok;
                }
                catch { /* Informar que a revogação não pôde ser confirmada, sem expor credenciais. */ }
            }
            if (connection)
                await db('google_calendar_connections', `${query}&generation=eq.${connection.generation}`, 'DELETE');
            await db('google_calendar_oauth_states', query, 'DELETE');
            // Sem credencial armazenada não é possível comprovar revogação de permissão no Google.
            return json({ retired: true, disconnected: true, revoked });
        }
        catch (err) {
            return json({ error: err instanceof Failure ? err.message : 'Não foi possível confirmar a operação. Tente novamente.' }, err instanceof Failure ? err.status : 503);
        }
    };
}
