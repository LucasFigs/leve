/**
 * Função do Supabase chamada a cada minuto (pg_cron): envia push dos itens que estão para começar.
 *
 * Este é o código-fonte. O arquivo publicado é o `index.ts` ao lado, gerado por `npm run setup:push`
 * (junta este arquivo com as regras de `src/domain`, para servidor e app decidirem igual).
 */
import type { Task } from '../../../src/domain/types';
import { dueReminders, type ReminderPrefs } from '../../../src/domain/reminders';
import { sendPush, type VapidKeys } from './webpush';

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
      headers: { apikey: env.serviceKey, Authorization: `Bearer ${env.serviceKey}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    });

  const subs: SubRow[] = await (await rest('push_subscriptions?select=*&order=updated_at.desc')).json();
  const byUser = new Map<string, SubRow[]>();
  for (const s of Array.isArray(subs) ? subs : []) byUser.set(s.user_id, [...(byUser.get(s.user_id) ?? []), s]);

  let sent = 0;
  let removed = 0;
  for (const [userId, devices] of byUser) {
    const rows: RecordRow[] = await (await rest(`records?user_id=eq.${userId}&type=in.(task,meta)&select=id,type,data`)).json();
    if (!Array.isArray(rows)) continue;
    const meta = rows.find((r) => r.type === 'meta')?.data as { settings?: ReminderPrefs & { reminders?: boolean } } | undefined;
    if (!meta?.settings?.reminders) continue;
    const tasks = rows.filter((r) => r.type === 'task').map((r) => r.data as Task);
    // fuso do aparelho usado por último
    const { today, now } = localNow(devices[0].tz || 'America/Sao_Paulo', at);

    for (const r of dueReminders(tasks, meta.settings, today, now)) {
      // Só envia se conseguir registrar (a chave é única): evita repetir a cada minuto
      const mark = await rest('push_sent', {
        method: 'POST',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ user_id: userId, key: `${today}:${r.key}` }),
      });
      if (!mark.ok) continue;
      const payload = JSON.stringify({ title: r.title, body: r.body, tag: r.key, data: { taskId: r.taskId, date: r.date } });
      for (const d of devices) {
        const status = await sendPush(d, payload, env.vapid).catch(() => 0);
        if (status === 404 || status === 410) {
          await rest(`push_subscriptions?endpoint=eq.${encodeURIComponent(d.endpoint)}`, { method: 'DELETE' });
          removed++;
        } else if (status >= 200 && status < 300) sent++;
      }
    }
  }

  // Faxina de hora em hora: registros de envio com mais de 2 dias
  if (at.getUTCMinutes() === 0) {
    await rest(`push_sent?sent_at=lt.${new Date(at.getTime() - 2 * 86_400_000).toISOString()}`, { method: 'DELETE' });
  }
  return { users: byUser.size, sent, removed };
}

if (typeof Deno !== 'undefined') {
  Deno.serve(async (req: Request) => {
    if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
    try {
      const result = await run({
        supabaseUrl: Deno.env.get('SUPABASE_URL'),
        serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
        vapid: {
          publicKey: Deno.env.get('VAPID_PUBLIC_KEY'),
          privateKey: Deno.env.get('VAPID_PRIVATE_KEY'),
          subject: Deno.env.get('VAPID_SUBJECT') ?? 'mailto:contato@example.com',
        },
      });
      return Response.json(result);
    } catch (e) {
      return Response.json({ error: String(e) }, { status: 500 });
    }
  });
}
