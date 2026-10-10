/**
 * Push: inscreve este aparelho para receber lembretes mesmo com o app fechado.
 * O envio é feito pela função `send-reminders` do Supabase (ver supabase/functions).
 */
import { getState } from '../store/store';
import { supabase } from '../store/sync';

const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
const TABLE = 'push_subscriptions';

/** O projeto foi configurado para push (`npm run setup:push`) e há conta na nuvem. */
export const pushConfigured = !!VAPID && !!supabase;

const supported = () => typeof navigator !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

function keyBytes(b64url: string): Uint8Array {
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  const bin = atob((b64url + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export type PushResult = 'ok' | 'not-configured' | 'unsupported' | 'error';

/** Inscreve (ou renova) este aparelho e guarda a inscrição na conta. */
export async function enablePush(): Promise<PushResult> {
  if (!pushConfigured || !supabase || !VAPID) return 'not-configured';
  if (!supported()) return 'unsupported';
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return 'unsupported';
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID).buffer as ArrayBuffer });
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) return 'error';
    const { error } = await supabase.from(TABLE).upsert(
      {
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
        // o servidor usa o fuso para saber que horas são aí
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    );
    return error ? 'error' : 'ok';
  } catch {
    return 'error';
  }
}

/** Cancela a inscrição deste aparelho (ao desligar os lembretes ou sair da conta). */
export async function disablePush(): Promise<void> {
  if (!supported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabase?.from(TABLE).delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    /* noop */
  }
}

/** Ao abrir o app: mantém a inscrição em dia (fuso, renovação feita pelo navegador). */
export async function refreshPush(): Promise<void> {
  if (!pushConfigured || !supported()) return;
  if (!getState().settings.reminders || Notification.permission !== 'granted') return;
  await enablePush();
}
