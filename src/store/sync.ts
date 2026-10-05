/**
 * Sincronização com o Supabase.
 *
 * O app continua local-first: tudo é salvo no aparelho na hora (funciona offline).
 * Este módulo espelha o estado na nuvem, item a item (uma linha por tarefa/projeto
 * + uma linha "meta" com as preferências), e recebe alterações de outros aparelhos
 * em tempo real.
 *
 * Regra de conflito: alteração local ainda não enviada vence; o resto vem da nuvem.
 */
import { createClient, type RealtimeChannel, type Session } from '@supabase/supabase-js';
import { useSyncExternalStore } from 'react';
import type { AppState, Project, Settings, Task } from '../domain/types';
import { localRepository } from './persistence';
import { emptyState, getState, replaceState, subscribe, uid } from './store';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = url && key ? createClient(url, key) : undefined;
export const cloudEnabled = !!supabase;

const TABLE = 'records';
const PAGE = 1000;
/** Identifica este aparelho/aba para ignorar o eco das próprias alterações. */
const CLIENT_ID = uid();

/* ------------------------------------------------------------------ */
/* Estado observável (para a UI)                                       */
/* ------------------------------------------------------------------ */

export type SyncStatus = 'idle' | 'loading' | 'syncing' | 'synced' | 'offline' | 'error';

export interface CloudUser {
  fullName?: string;
  preferredName?: string;
  phone?: string;
  avatarUrl?: string;
  /** 'email' ou 'google' */
  provider: string;
}

export interface CloudState {
  auth: 'loading' | 'in' | 'out';
  email?: string;
  user?: CloudUser;
  status: SyncStatus;
  error?: string;
  lastSync?: number;
  /** usuário abriu o link de “esqueci a senha” */
  recovery: boolean;
}

let cloud: CloudState = { auth: cloudEnabled ? 'loading' : 'out', status: 'idle', recovery: false };
const cloudListeners = new Set<() => void>();

function setCloud(patch: Partial<CloudState>) {
  cloud = { ...cloud, ...patch };
  cloudListeners.forEach((l) => l());
}

export function useCloud<T>(selector: (c: CloudState) => T): T {
  return useSyncExternalStore(
    (l) => {
      cloudListeners.add(l);
      return () => cloudListeners.delete(l);
    },
    () => selector(cloud),
  );
}

/* ------------------------------------------------------------------ */
/* Diário local: o que ainda não foi enviado                           */
/* ------------------------------------------------------------------ */

const JOURNAL_KEY = 'leve.sync.v1';

interface Journal {
  /** conta dona dos dados deste aparelho */
  owner?: string;
  /** ids alterados localmente e ainda não enviados ('meta' = preferências) */
  dirty: string[];
  /** ids excluídos localmente e ainda não enviados */
  deleted: string[];
}

function readJournal(): Journal {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    if (raw) return { dirty: [], deleted: [], ...JSON.parse(raw) };
  } catch {
    /* noop */
  }
  return { dirty: [], deleted: [] };
}

function writeJournal(j: Journal) {
  journal = j;
  try {
    localStorage.setItem(JOURNAL_KEY, JSON.stringify(j));
  } catch {
    /* noop */
  }
}

let journal = readJournal();

/* ------------------------------------------------------------------ */
/* Espelho do que está na nuvem                                        */
/* ------------------------------------------------------------------ */

type Entity = Task | Project;
interface Meta {
  settings: Settings;
  dismissed: AppState['dismissed'];
  focus?: AppState['focus'];
}
interface Row {
  id: string;
  type: 'task' | 'project' | 'meta';
  data: unknown;
}

/**
 * Último valor confirmado na nuvem para cada item. A comparação é por referência:
 * o store é imutável, então um objeto diferente significa alteração local pendente.
 * `null` marca um item que existe na nuvem mas foi excluído aqui (exclusão pendente).
 */
const known = new Map<string, Entity | null>();
let knownMeta: Meta | undefined;

const metaOf = (s: AppState): Meta => ({ settings: s.settings, dismissed: s.dismissed, focus: s.focus });
const metaDirty = (s: AppState) =>
  !knownMeta || knownMeta.settings !== s.settings || knownMeta.dismissed !== s.dismissed || knownMeta.focus !== s.focus;

/** Reconstrói o espelho a partir do diário salvo (ao abrir o app). */
function restoreKnown() {
  known.clear();
  knownMeta = undefined;
  if (!journal.owner) return; // nunca sincronizou: tudo local é pendente
  const s = getState();
  const dirty = new Set(journal.dirty);
  for (const e of [...s.tasks, ...s.projects]) if (!dirty.has(e.id)) known.set(e.id, e);
  for (const id of journal.deleted) known.set(id, null);
  if (!dirty.has('meta')) knownMeta = metaOf(s);
}
restoreKnown();

/** Item alterado desde a última confirmação da nuvem? Reaproveita a referência se o conteúdo for igual. */
function changed(e: Entity) {
  const k = known.get(e.id);
  if (k === e) return false;
  if (k && JSON.stringify(k) === JSON.stringify(e)) {
    known.set(e.id, e);
    return false;
  }
  return true;
}

function diff(s: AppState) {
  const upserts: Row[] = [];
  const deletes: string[] = [];
  const seen = new Set<string>();
  for (const t of s.tasks) {
    seen.add(t.id);
    if (changed(t)) upserts.push({ id: t.id, type: 'task', data: t });
  }
  for (const p of s.projects) {
    seen.add(p.id);
    if (changed(p)) upserts.push({ id: p.id, type: 'project', data: p });
  }
  for (const id of known.keys()) if (!seen.has(id)) deletes.push(id);
  const meta = metaOf(s);
  if (metaDirty(s)) upserts.push({ id: 'meta', type: 'meta', data: meta });
  return { upserts, deletes, meta };
}

function saveJournal() {
  if (!journal.owner) return;
  const { upserts, deletes } = diff(getState());
  writeJournal({ owner: journal.owner, dirty: upserts.map((r) => r.id), deleted: deletes });
}

/* ------------------------------------------------------------------ */
/* Fila: envio e recebimento nunca rodam ao mesmo tempo                */
/* ------------------------------------------------------------------ */

let userId: string | undefined;
let channel: RealtimeChannel | undefined;
let chain: Promise<void> = Promise.resolve();
let pushQueued = false;
let pushTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = 5_000;
let pulling = false;
let buffered: (() => void)[] = [];
let lastPull = 0;

function enqueue(job: () => Promise<void>) {
  chain = chain.then(job).catch(() => {});
  return chain;
}

function schedulePush(delay = 600) {
  if (!userId) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    if (pushQueued) return;
    pushQueued = true;
    enqueue(async () => {
      pushQueued = false;
      await push();
    });
  }, delay);
}

function scheduleRetry() {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => {
    retryDelay = Math.min(retryDelay * 2, 60_000);
    syncNow();
  }, retryDelay);
}

const errorMessage = (e: unknown) => {
  const msg = (e as { message?: string })?.message ?? String(e);
  if (/relation .*records.* does not exist|Could not find the table/i.test(msg)) {
    return 'Tabela não encontrada no Supabase — rode o arquivo supabase/schema.sql.';
  }
  return msg;
};

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function push() {
  const uidNow = userId;
  // Só envia depois de ter mesclado com a nuvem ao menos uma vez nesta conta
  if (!supabase || !uidNow || journal.owner !== uidNow) return;
  const { upserts, deletes, meta } = diff(getState());
  saveJournal();
  if (!upserts.length && !deletes.length) {
    if (cloud.status !== 'synced') setCloud({ status: 'synced', error: undefined, lastSync: cloud.lastSync ?? Date.now() });
    return;
  }
  if (!navigator.onLine) {
    setCloud({ status: 'offline' });
    return;
  }
  setCloud({ status: 'syncing' });
  try {
    const stamp = new Date().toISOString();
    for (const part of chunk(upserts, 500)) {
      const { error } = await supabase.from(TABLE).upsert(
        part.map((r) => ({ user_id: uidNow, id: r.id, type: r.type, data: r.data, origin: CLIENT_ID, updated_at: stamp })),
      );
      if (error) throw error;
    }
    for (const part of chunk(deletes, 200)) {
      const { error } = await supabase.from(TABLE).delete().in('id', part);
      if (error) throw error;
    }
    if (uidNow !== userId) return; // saiu da conta no meio do envio
    for (const r of upserts) {
      if (r.type === 'meta') knownMeta = meta;
      else known.set(r.id, r.data as Entity);
    }
    for (const id of deletes) known.delete(id);
    saveJournal();
    retryDelay = 5_000;
    setCloud({ status: 'synced', error: undefined, lastSync: Date.now() });
    // Alterações feitas durante o envio
    const rest = diff(getState());
    if (rest.upserts.length || rest.deletes.length) schedulePush(200);
  } catch (e) {
    setCloud({ status: navigator.onLine ? 'error' : 'offline', error: errorMessage(e) });
    scheduleRetry();
  }
}

async function fetchAll(): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase!.from(TABLE).select('id,type,data').order('id').range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

/** Baixa tudo da nuvem e mescla com o que há no aparelho. */
async function pull() {
  const uidNow = userId;
  if (!supabase || !uidNow) return;
  if (!navigator.onLine) {
    setCloud({ status: 'offline' });
    return;
  }
  pulling = true;
  try {
    const rows = await fetchAll();
    if (uidNow !== userId) return;
    lastPull = Date.now();
    const firstSync = journal.owner !== uidNow;
    const remote = new Map<string, Row>(rows.map((r) => [r.id, r]));
    const s = getState();

    const merge = <T extends Entity>(local: T[], type: 'task' | 'project'): T[] => {
      const out: T[] = [];
      for (const l of local) {
        const r = remote.get(l.id);
        if (known.get(l.id) !== l) out.push(l); // alteração local pendente: vence
        else if (r) {
          // mantém a referência se o conteúdo for igual (evita re-render)
          const same = JSON.stringify(r.data) === JSON.stringify(l);
          const v = same ? l : (r.data as T);
          known.set(l.id, v);
          out.push(v);
        } else known.delete(l.id); // excluído em outro aparelho
      }
      const localIds = new Set(local.map((l) => l.id));
      const added: T[] = [];
      for (const r of rows) {
        if (r.type !== type || localIds.has(r.id)) continue;
        if (known.has(r.id)) continue; // exclusão local pendente
        known.set(r.id, r.data as T);
        added.push(r.data as T);
      }
      if (type === 'task') added.sort((a, b) => (b as Task).createdAt - (a as Task).createdAt);
      return [...added, ...out];
    };

    let next: AppState = { ...s, tasks: merge(s.tasks, 'task'), projects: merge(s.projects, 'project') };
    const rm = remote.get('meta')?.data as Meta | undefined;
    if (rm && (firstSync || !metaDirty(s))) {
      next = {
        ...next,
        settings: { ...s.settings, ...rm.settings },
        dismissed: rm.dismissed ?? {},
        focus: rm.focus ?? undefined,
      };
      knownMeta = metaOf(next);
    }
    replaceState(next);
    writeJournal({ ...journal, owner: uidNow });
    saveJournal();
    setCloud({ status: 'synced', error: undefined, lastSync: Date.now() });
  } catch (e) {
    setCloud({ status: navigator.onLine ? 'error' : 'offline', error: errorMessage(e) });
    scheduleRetry();
  } finally {
    pulling = false;
    const pending = buffered;
    buffered = [];
    pending.forEach((fn) => fn());
  }
  await push();
}

/* ------------------------------------------------------------------ */
/* Tempo real                                                          */
/* ------------------------------------------------------------------ */

interface RtRow extends Row {
  user_id: string;
  origin?: string;
}

function applyRemoteRow(row: RtRow) {
  const s = getState();
  if (row.type === 'meta') {
    if (metaDirty(s)) return;
    const m = row.data as Meta;
    const next = { ...s, settings: { ...s.settings, ...m.settings }, dismissed: m.dismissed ?? {}, focus: m.focus ?? undefined };
    knownMeta = metaOf(next);
    replaceState(next);
    return;
  }
  const field = row.type === 'task' ? 'tasks' : 'projects';
  const list = s[field] as Entity[];
  const local = list.find((e) => e.id === row.id);
  if (local && known.get(row.id) !== local) return; // pendente aqui: vence
  if (!local && known.has(row.id)) return; // exclusão pendente aqui
  const v = row.data as Entity;
  known.set(row.id, v);
  const nextList = local ? list.map((e) => (e.id === row.id ? v : e)) : [v, ...list];
  replaceState({ ...s, [field]: nextList });
}

function applyRemoteDelete(id: string) {
  const s = getState();
  const task = s.tasks.find((t) => t.id === id);
  const project = s.projects.find((p) => p.id === id);
  const local = task ?? project;
  if (!local) {
    known.delete(id);
    return;
  }
  if (known.get(id) !== local) return; // alteração local pendente: mantém
  known.delete(id);
  replaceState(
    task ? { ...s, tasks: s.tasks.filter((t) => t.id !== id) } : { ...s, projects: s.projects.filter((p) => p.id !== id) },
  );
}

function listen(uidNow: string) {
  channel = supabase!
    .channel(`records-${CLIENT_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (payload) => {
      const run = () => {
        if (userId !== uidNow) return;
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<RtRow>;
          if (old.user_id === uidNow && old.id) applyRemoteDelete(old.id);
        } else {
          const row = payload.new as RtRow;
          if (row.user_id === uidNow && row.origin !== CLIENT_ID) applyRemoteRow(row);
        }
        saveJournal();
      };
      if (pulling) buffered.push(run);
      else run();
    })
    .subscribe((status) => {
      // Ao reconectar, busca o que pode ter passado enquanto estava desconectado
      if (status === 'SUBSCRIBED' && lastPull && Date.now() - lastPull > 5_000) syncNow();
    });
}

/* ------------------------------------------------------------------ */
/* Ciclo de vida                                                       */
/* ------------------------------------------------------------------ */

function userInfo(session: Session): CloudUser {
  const m = (session.user.user_metadata ?? {}) as Record<string, string | undefined>;
  const fullName = m.full_name || m.name;
  return {
    fullName,
    preferredName: m.preferred_name || fullName?.split(' ')[0],
    phone: m.phone,
    avatarUrl: m.avatar_url || m.picture,
    provider: session.user.app_metadata?.provider ?? 'email',
  };
}

function start(session: Session) {
  const id = session.user.id;
  setCloud({ auth: 'in', email: session.user.email ?? undefined, user: userInfo(session) });
  if (userId === id) return;
  stop();
  userId = id;

  if (journal.owner && journal.owner !== id) {
    // Outra conta usou este aparelho: começa limpo
    writeJournal({ dirty: [], deleted: [] });
    replaceState(emptyState(), { resetUndo: true });
    restoreKnown();
  }
  // Sem dados prontos neste aparelho: segura a tela até baixar da nuvem
  const ready = journal.owner === id && getState().settings.onboarded;
  setCloud({ status: ready ? 'syncing' : 'loading' });
  listen(id);
  enqueue(pull);
}

function stop() {
  userId = undefined;
  clearTimeout(pushTimer);
  clearTimeout(retryTimer);
  if (channel) supabase?.removeChannel(channel);
  channel = undefined;
}

/** Envia o pendente e busca novidades. */
export function syncNow() {
  if (!userId) return;
  enqueue(pull);
}

/** Há alterações neste aparelho que ainda não chegaram à nuvem? */
export function hasPending() {
  if (!journal.owner) return false;
  const { upserts, deletes } = diff(getState());
  return upserts.length > 0 || deletes.length > 0;
}

/** Usuário pode usar o app sem login quando está offline e já tem dados aqui. */
export const canUseOffline = () => !!journal.owner && typeof navigator !== 'undefined' && !navigator.onLine;

/** Confirma e sai da conta (avisa se há alterações que ainda não subiram). */
export async function confirmSignOut(switching = false) {
  const msg = hasPending() && !navigator.onLine
    ? 'Há alterações que ainda não foram enviadas (você está sem internet). Se sair agora, elas serão perdidas. Sair mesmo assim?'
    : switching
      ? 'Sair desta conta para entrar com outra? Seus dados continuam salvos na nuvem.'
      : 'Sair da conta neste aparelho? Seus dados continuam salvos na nuvem.';
  if (!confirm(msg)) return false;
  await signOut();
  return true;
}

export async function signOut() {
  if (!supabase) return;
  // Envia o que faltava antes de sair
  await enqueue(push);
  stop();
  await supabase.auth.signOut().catch(() => {});
  writeJournal({ dirty: [], deleted: [] });
  localRepository.clear();
  replaceState(emptyState(), { resetUndo: true });
  restoreKnown();
  setCloud({ auth: 'out', email: undefined, user: undefined, status: 'idle', error: undefined, lastSync: undefined, recovery: false });
}

/** Quais formas de login estão ligadas no Supabase (ex.: Google). */
export async function authProviders(): Promise<{ google: boolean }> {
  if (!url || !key) return { google: false };
  try {
    const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key } });
    const j = await r.json();
    return { google: !!j?.external?.google };
  } catch {
    return { google: false };
  }
}

export async function signInWithGoogle() {
  if (!supabase) return;
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    // sempre pergunta qual conta Google usar (permite trocar de conta)
    options: { redirectTo: window.location.origin, queryParams: { prompt: 'select_account' } },
  });
  if (error) throw error;
}

export function endRecovery() {
  setCloud({ recovery: false });
}

if (supabase && typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event, session) => {
    // Chamadas ao Supabase fora do callback (recomendação da biblioteca)
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') setCloud({ recovery: true });
      if (session) start(session);
      else {
        // Sessão expirou/encerrada: mantém os dados locais até a pessoa entrar de novo
        stop();
        setCloud({ auth: 'out', email: undefined, status: 'idle' });
      }
    }, 0);
  });

  subscribe(() => schedulePush());
  window.addEventListener('online', () => syncNow());
  window.addEventListener('offline', () => userId && setCloud({ status: 'offline' }));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastPull > 15_000) syncNow();
    if (document.visibilityState === 'hidden') saveJournal();
  });
  window.addEventListener('pagehide', () => saveJournal());
}
