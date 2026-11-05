/**
 * Função do Supabase chamada a cada minuto (pg_cron): envia push dos itens que estão para começar.
 *
 * Este é o código-fonte. O arquivo publicado é o `index.ts` ao lado, gerado por `npm run setup:push`
 * (junta este arquivo com as regras de `src/domain`, para servidor e app decidirem igual).
 */
import type { Task } from '../../../src/domain/types';
import { dueReminders, type ReminderPrefs } from '../../../src/domain/reminders';
import { sendPush, isAllowedPushEndpoint, b64urlEncode, type VapidKeys } from './webpush';
import { isTask, isMeta } from '../../../src/domain/validation';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

interface SubRow {
  endpoint: string;
  user_id: string;
  p256dh: string;
  auth: string;
  tz: string;
  updated_at: string;
}

interface RecordRow {
  id: string;
  type: 'task' | 'meta';
  data: unknown;
}

/** Data e minuto atuais no fuso do usuário. */
export function localNow(tz: string, at = new Date()): { today: string; now: number } {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    })
      .formatToParts(at)
      .map((p) => [p.type, p.value]),
  );
  return { today: `${parts.year}-${parts.month}-${parts.day}`, now: Number(parts.hour) * 60 + Number(parts.minute) };
}

export interface Env {
  supabaseUrl: string;
  serviceKey: string;
  vapid: VapidKeys;
}

export async function run(env: Env, at = new Date()): Promise<{ users: number; sent: number; removed: number }> {
  const rest = (path: string, init: RequestInit = {}) =>
    fetch(`${env.supabaseUrl}/rest/v1/${path}`, {
      ...init,
      signal: AbortSignal.timeout(5000),
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });

  const readRows = async <T>(path: string): Promise<T[]> => {
    const all: T[] = [];
    for (let offset = 0; offset < 100000; offset += 500) {
      const res = await rest(`${path}&limit=500&offset=${offset}`);
      if (!res.ok) throw new Error('Falha ao consultar lembretes.');
      const page = await res.json();
      if (!Array.isArray(page)) throw new Error('Resposta inválida.');
      all.push(...page);
      if (page.length < 500) return all;
    }
    throw new Error('Limite de processamento excedido.');
  };
  const subs = await readRows<SubRow>('push_subscriptions?select=*&order=endpoint.asc');
  const byUser = new Map<string, SubRow[]>();
  for (const s of subs) {
    if (typeof s.user_id !== 'string') continue;
    const devices = byUser.get(s.user_id) ?? [];
    if (devices.length < 10) devices.push(s);
    byUser.set(s.user_id, devices);
  }

  let sent = 0;
  let removed = 0;
  for (const [userId, devices] of byUser) {
    try {
    devices.sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
    const rows = await readRows<RecordRow>(`records?user_id=eq.${encodeURIComponent(userId)}&type=in.(task,meta)&select=id,type,data&order=id.asc`);
    if (!Array.isArray(rows)) continue;
    const rawMeta = rows.find((r) => r.id === 'meta' && r.type === 'meta')?.data;
    if (!isMeta(rawMeta)) continue;
    const meta = rawMeta as { settings?: ReminderPrefs & { reminders?: boolean } } | undefined;
    if (!meta?.settings?.reminders) continue;
    const tasks = rows.filter((r) => r.type === 'task').map((r) => r.data).filter(isTask) as Task[];
    // fuso do aparelho usado por último
    const { today, now } = localNow(devices[0].tz || 'America/Sao_Paulo', at);

    for (const r of dueReminders(tasks, meta.settings, today, now)) {
      const payload = JSON.stringify({ title: [...r.title].slice(0, 180).join(''), body: r.body, tag: r.key, data: { taskId: r.taskId, date: r.date, owner:userId } });
      for (const d of devices) {
        if (!isAllowedPushEndpoint(d.endpoint)) continue;
        const deviceKey = b64urlEncode(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(d.endpoint))));
        const key = `${today}:${r.key}:${deviceKey}`;
        // Deduplicação por aparelho: uma falha não repete envios que já deram certo.
        const mark = await rest('push_sent', {
          method: 'POST', headers: { Prefer: 'return=minimal' },
          body: JSON.stringify({ user_id: userId, key }),
        });
        if (!mark.ok) continue;
        const status = await sendPush(d, payload, env.vapid).catch(() => 0);
        if (status === 404 || status === 410) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(d.endpoint)}`, { method: 'DELETE' });
          removed++;
        } else if (status >= 200 && status < 300) sent++;
        if (status === 0 || status === 429 || status >= 500) {
          // Permite tentar de novo no próximo ciclo dentro da janela do lembrete.
          await rest(`push_sent?user_id=eq.${encodeURIComponent(userId)}&key=eq.${encodeURIComponent(key)}`, { method: 'DELETE' });
        }
      }
    }
    } catch {
      // Um registro/fuso inválido ou falha de um usuário não bloqueia os demais.
      console.warn('Não foi possível processar um grupo de lembretes.');
    }
  }

  // Faxina de hora em hora: registros de envio com mais de 2 dias
  if (at.getUTCMinutes() === 0) {
    await rest(`push_sent?sent_at=lt.${new Date(at.getTime() - 2 * 86_400_000).toISOString()}`, { method: 'DELETE' });
  }
  return { users: byUser.size, sent, removed };
}

export async function validCronSecret(actual: string | null, expected: string | undefined): Promise<boolean> {
  if (!actual || !expected || expected.length < 32 || actual.length > 256) return false;
  const digest = (s: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  const [a, b] = await Promise.all([digest(actual), digest(expected)]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

let running = false;
let lastRun = 0;
export async function handleRequest(req: Request, secret: string | undefined, env: () => Env): Promise<Response> {
    if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: { Allow: 'POST' } });
    if (!await validCronSecret(req.headers.get('x-cron-secret'), secret)) return new Response('forbidden', { status: 403 });
    if (running || Date.now() - lastRun < 30000) return new Response('busy', { status: 429 });
    running = true;
    lastRun = Date.now();
    try {
      return Response.json(await run(env()));
    } catch {
      return Response.json({ error: 'Falha ao processar lembretes.' }, { status: 500 });
    } finally { running = false; }
}

if (typeof Deno !== 'undefined') {
  Deno.serve((req: Request) => handleRequest(req, Deno.env.get('CRON_SECRET'), () => ({
        supabaseUrl: Deno.env.get('SUPABASE_URL'),
        serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        vapid: {
          publicKey: Deno.env.get('VAPID_PUBLIC_KEY'),
          privateKey: Deno.env.get('VAPID_PRIVATE_KEY'),
          subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@example.com',
        },
      })));
}
