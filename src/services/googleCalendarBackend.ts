/** Fronteira de encerramento: somente status e desconexão; nunca solicita tokens. */
export interface GoogleConnection {
  connected?: boolean;
  email?: string;
  calendarId?: string;
  autoSync?: boolean;
  accessToken?: string;
  expiresIn?: number;
  url?: string;
  revoked?: boolean;
  disconnected?: boolean;
  retired?: boolean;
  proof?: string;
  state?: string;
}
export async function calendarBackend(action: string, data: Record<string, unknown> = {}, signal?: AbortSignal): Promise<GoogleConnection> {
  if (action !== 'status' && action !== 'disconnect') throw Object.assign(new Error('A integração Google Agenda foi descontinuada.'), {status:410});
  // Import tardio evita um ciclo de inicialização com o gerenciador de sessão.
  const { supabase } = await import('../store/sync');
  if (!supabase) throw new Error('A integração persistente requer uma conta do Leve.');
  const apiKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  if (!apiKey) throw new Error('Configuração da integração indisponível.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Entre na sua conta do Leve para gerenciar o vínculo antigo.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  signal?.addEventListener('abort',abort,{once:true});
  const timer = setTimeout(abort,15_000);
  try {
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-calendar`, {
      method: 'POST', signal:controller.signal,
      headers: { Authorization: `Bearer ${session.access_token}`, apikey: apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...data, action }),
      cache: 'no-store',
    });
    let result;
    try { result = await response.json(); } catch { /* gateway indisponível */ }
    if (!response.ok) throw Object.assign(new Error(result?.error || 'Integração indisponível. Verifique a conexão ou tente novamente mais tarde.'), { status: response.status });
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort',abort);
  }
}
