import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../../src/domain/types';
import { dueReminders } from '../../../src/domain/reminders';
import { b64urlDecode, b64urlEncode, encryptPayload, vapidAuthorization, isAllowedPushEndpoint, sendPush, type VapidKeys } from './webpush';
import { localNow, run, validCronSecret, handleRequest } from './source';

const task = (o: Partial<Task>): Task => ({ id: 't', title: 'Tarefa', kind: 'task', status: 'active', subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0, ...o });

function newVapid(): VapidKeys & { publicJwk: JsonWebKey } {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const pub = publicKey.export({ format: 'jwk' });
  const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, 'base64url'), Buffer.from(pub.y!, 'base64url')]);
  return { publicKey: raw.toString('base64url'), privateKey: privateKey.export({ format: 'jwk' }).d!, subject: 'mailto:teste@exemplo.com', publicJwk: pub };
}

/** O lado do aparelho: decifra como o navegador faria (RFC 8291), com a API do Node. */
function deviceDecrypt(body: Uint8Array, ua: ReturnType<typeof createECDH>, auth: Buffer): string {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idLen = buf[20];
  const asPublic = buf.subarray(21, 21 + idLen);
  const cipher = buf.subarray(21 + idLen);
  const shared = ua.computeSecret(asPublic);
  const ikm = Buffer.from(hkdfSync('sha256', shared, auth, Buffer.concat([Buffer.from('WebPush: info\0'), ua.getPublicKey(), asPublic]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const d = createDecipheriv('aes-128-gcm', cek, nonce);
  d.setAuthTag(cipher.subarray(cipher.length - 16));
  const plain = Buffer.concat([d.update(cipher.subarray(0, cipher.length - 16)), d.final()]);
  expect(plain[plain.length - 1]).toBe(2);
  return plain.subarray(0, plain.length - 1).toString('utf8');
}

function newDevice() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  return { ua, auth, sub: { endpoint: 'https://fcm.googleapis.com/abc', p256dh: ua.getPublicKey().toString('base64url'), auth: auth.toString('base64url') } };
}

describe('lembretes', () => {
  it('avisa na janela certa e ignora o que já foi feito', () => {
    const tasks = [
      task({ id: 'a', title: 'Reunião', kind: 'event', date: '2026-10-10', time: '14:00' }),
      task({ id: 'b', title: 'Feita', date: '2026-10-10', time: '14:05', status: 'done' }),
      task({ id: 'c', title: 'Sem hora', date: '2026-10-10' }),
      task({ id: 'd', title: 'Quinzenal', time: '14:10', recurrence: { freq: 'daily', interval: 15, anchor: '2026-10-10' } }),
    ];
    const at = (h: number, m: number) => dueReminders(tasks, { reminderLead: 10 }, '2026-10-10', h * 60 + m).map((r) => r.key);
    expect(at(13, 49)).toEqual([]);
    expect(at(13, 50)).toEqual(['a:14:00']);
    expect(at(14, 2)).toEqual(['a:14:00', 'd:14:10']);
    expect(at(14, 6)).toEqual(['d:14:10']);
    expect(dueReminders(tasks, { reminderLead: 10 }, '2026-10-11', 14 * 60)).toEqual([]);
    expect(dueReminders(tasks, { reminderLead: 10 }, '2026-10-10', 13 * 60 + 55)[0].body).toBe('Começa às 14:00 (em 5 min)');
  });

  it('hora local respeita o fuso', () => {
    const at = new Date('2026-10-11T01:30:00Z');
    expect(localNow('America/Sao_Paulo', at)).toEqual({ today: '2026-10-10', now: 22 * 60 + 30 });
    expect(localNow('UTC', at)).toEqual({ today: '2026-10-11', now: 90 });
  });
});

describe('web push', () => {
  afterEach(() => vi.unstubAllGlobals());
  it.each([
    'http://fcm.googleapis.com/send', 'https://127.0.0.1/a', 'https://[::1]/a',
    'https://169.254.169.254/a', 'https://fcm.googleapis.com.evil.test/a',
    'https://user:pass@fcm.googleapis.com/a', 'https://fcm.googleapis.com:8443/a',
    'https://evil.test@localhost/a', 'https://fcm.googleapis.com/a#fragment', 'garbage',
  ])('rejeita destino SSRF %s antes de fazer requisições', async endpoint => {
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
    expect(isAllowedPushEndpoint(endpoint)).toBe(false);
    await expect(sendPush({ ...newDevice().sub, endpoint }, '{}', newVapid())).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('aceita provedores conhecidos e bloqueia redirects no fetch', async () => {
    for (const endpoint of ['https://fcm.googleapis.com/a', 'https://updates.push.services.mozilla.com/a', 'https://web.push.apple.com/a', 'https://abc.wns.windows.com/a']) expect(isAllowedPushEndpoint(endpoint)).toBe(true);
    const fetch = vi.fn(async () => new Response(null, { status: 201 })); vi.stubGlobal('fetch', fetch);
    await sendPush(newDevice().sub, '{}', newVapid());
    expect(fetch.mock.calls[0][1]).toMatchObject({ redirect: 'error', method: 'POST' });
    expect(fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it('o aparelho consegue decifrar a mensagem', async () => {
    const { ua, auth, sub } = newDevice();
    const text = JSON.stringify({ title: 'Reunião 1:1 — às 14:00', body: 'Começa em 10 min ✓' });
    expect(deviceDecrypt(await encryptPayload(sub, text), ua, auth)).toBe(text);
  });

  it('assinatura VAPID é válida para o serviço de push', async () => {
    const vapid = newVapid();
    const header = await vapidAuthorization('https://fcm.googleapis.com/fcm/send/xyz', vapid);
    const [, jwt, k] = /^vapid t=(.+), k=(.+)$/.exec(header)!;
    expect(k).toBe(vapid.publicKey);
    const [h, c, sig] = jwt.split('.');
    const claims = JSON.parse(Buffer.from(c, 'base64url').toString());
    expect(claims.aud).toBe('https://fcm.googleapis.com');
    expect(claims.exp).toBeGreaterThan(Date.now() / 1000);
    const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: createPublicKey({ key: vapid.publicJwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url'));
    expect(ok).toBe(true);
    expect(b64urlEncode(b64urlDecode(vapid.publicKey))).toBe(vapid.publicKey);
  });
});

describe('função do servidor', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('falha fechado sem segredo e restringe métodos antes de executar', async () => {
    const secret = 's'.repeat(32);
    expect(await validCronSecret(null, undefined)).toBe(false);
    expect(await validCronSecret('null', undefined)).toBe(false);
    expect(await validCronSecret(secret, secret)).toBe(true);
    expect(await validCronSecret('x'.repeat(32), secret)).toBe(false);
    const env = vi.fn();
    expect((await handleRequest(new Request('https://app.test', { method: 'GET' }), secret, env)).status).toBe(405);
    expect((await handleRequest(new Request('https://app.test', { method: 'POST' }), undefined, env)).status).toBe(403);
    expect(env).not.toHaveBeenCalled();
  });

  it('fuso inválido de uma conta não interrompe os lembretes da seguinte', async () => {
    const device = newDevice();
    const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
      if (url.includes('/push_subscriptions?')) return Response.json([
        { ...device.sub, user_id: 'bad', tz: 'invalid/timezone' },
        { ...device.sub, user_id: 'good', tz: 'UTC' },
      ]);
      if (url.includes('/records?')) return Response.json([
        { id: 'meta', type: 'meta', data: { settings: { reminders: true } } },
        { id: 't', type: 'task', data: task({ date: '2026-10-10', time: '14:00' }) },
        { id: 'invalid', type: 'task', data: { recurrence: { weekdays: 'invalid' } } },
      ]);
      if (url.includes('/push_sent')) return new Response(null, { status: 201 });
      expect(init.redirect).toBe('error');
      return new Response(null, { status: 201 });
    });
    vi.stubGlobal('fetch', fetch);
    expect((await run({ supabaseUrl: 'https://x.supabase.co', serviceKey: 'k', vapid: newVapid() }, new Date('2026-10-10T13:55:00Z'))).sent).toBe(1);
  });

  it('tenta novamente apenas o aparelho com falha temporária', async () => {
    const first = newDevice(), retry = newDevice();
    retry.sub.endpoint = 'https://fcm.googleapis.com/retry';
    const marks = new Set<string>();
    const pushes: string[] = [];
    let failing = true;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      if (url.includes('/push_subscriptions?')) return Response.json([first, retry].map(d => ({ ...d.sub, user_id: 'u1', tz: 'UTC' })));
      if (url.includes('/records?')) return Response.json([
        { id: 'meta', type: 'meta', data: { settings: { reminders: true } } },
        { id: 't', type: 'task', data: task({ date: '2026-10-10', time: '14:00' }) },
      ]);
      if (url.includes('/push_sent')) {
        if (init.method === 'DELETE') { marks.delete(new URL(url).searchParams.get('key')!.slice(3)); return new Response(null, { status: 204 }); }
        const { key } = JSON.parse(init.body as string);
        if (marks.has(key)) return new Response(null, { status: 409 });
        marks.add(key); return new Response(null, { status: 201 });
      }
      pushes.push(url);
      return new Response(null, { status: failing && url.endsWith('retry') ? 503 : 201 });
    });
    const env = { supabaseUrl: 'https://x.supabase.co', serviceKey: 'k', vapid: newVapid() };
    const at = new Date('2026-10-10T13:55:00Z');
    expect((await run(env, at)).sent).toBe(1);
    failing = false;
    expect((await run(env, at)).sent).toBe(1);
    expect((await run(env, at)).sent).toBe(0);
    expect(pushes).toEqual([first.sub.endpoint, retry.sub.endpoint, retry.sub.endpoint]);
  });

  it('envia uma vez por item, só para quem ligou os lembretes, e apaga inscrição morta', async () => {
    const alive = newDevice();
    const dead = newDevice();
    dead.sub.endpoint = 'https://fcm.googleapis.com/morto';
    const off = newDevice();
    off.sub.endpoint = 'https://fcm.googleapis.com/desligado';
    const row = (d: ReturnType<typeof newDevice>, user: string) => ({ ...d.sub, user_id: user, tz: 'America/Sao_Paulo', updated_at: '' });
    const records: Record<string, unknown[]> = {
      u1: [
        { id: 'meta', type: 'meta', data: { settings: { reminders: true, reminderLead: 10 } } },
        { id: 'a', type: 'task', data: task({ id: 'a', title: 'Dentista', kind: 'event', date: '2026-10-10', time: '14:00' }) },
      ],
      u2: [
        { id: 'meta', type: 'meta', data: { settings: { reminders: false } } },
        { id: 'b', type: 'task', data: task({ id: 'b', date: '2026-10-10', time: '14:00' }) },
      ],
    };
    const sentKeys = new Set<string>();
    const pushes: { url: string; body: Uint8Array; headers: Record<string, string> }[] = [];
    const deleted: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit = {}) => {
      const json = (v: unknown, status = 200) => new Response(JSON.stringify(v), { status });
      if (url.includes('/rest/v1/push_subscriptions')) {
        if (init.method === 'DELETE') {
          deleted.push(decodeURIComponent(url.split('endpoint=eq.')[1]));
          return json([]);
        }
        return json([row(alive, 'u1'), row(dead, 'u1'), row(off, 'u2')]);
      }
      if (url.includes('/rest/v1/records')) return json(records[/user_id=eq\.(\w+)/.exec(url)![1]]);
      if (url.includes('/rest/v1/push_sent')) {
        if (init.method === 'DELETE') return json([]);
        const { key } = JSON.parse(init.body as string);
        if (sentKeys.has(key)) return json({ message: 'duplicate' }, 409);
        sentKeys.add(key);
        return new Response(null, { status: 201 });
      }
      pushes.push({ url, body: new Uint8Array(init.body as ArrayBuffer), headers: init.headers as Record<string, string> });
      return new Response(null, { status: url.endsWith('morto') ? 410 : 201 });
    });

    const env = { supabaseUrl: 'https://x.supabase.co', serviceKey: 'k', vapid: newVapid() };
    // 13:52 em São Paulo
    const at = new Date('2026-10-10T16:52:00Z');
    expect(await run(env, at)).toEqual({ users: 2, sent: 1, removed: 1 });
    expect(pushes.map((p) => p.url)).toEqual([alive.sub.endpoint, dead.sub.endpoint]);
    expect(deleted).toEqual([dead.sub.endpoint]);
    expect(pushes[0].headers['Content-Encoding']).toBe('aes128gcm');
    expect(JSON.parse(deviceDecrypt(pushes[0].body, alive.ua, alive.auth))).toEqual({
      title: 'Dentista', body: 'Começa às 14:00 (em 8 min)', tag: 'a:14:00', data: { taskId: 'a', date: '2026-10-10', owner:'u1' },
    });
    // Um minuto depois: já avisou, não repete
    expect((await run(env, new Date('2026-10-10T16:53:00Z'))).sent).toBe(0);
  });
});
