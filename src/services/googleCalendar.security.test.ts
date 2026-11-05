import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { connectGoogleCalendar, getGoogleCalendarState, initGoogleCalendarListener, resetGoogleCalendarSession, syncTaskToGoogle } from './googleCalendar';
import { actions, emptyState, replaceState } from '../store/store';
import type { Task } from '../domain/types';

const task: Task = { id: 'a', title: 'Privada', kind: 'task', status: 'active', date: '2026-11-04', time: '14:00', subtasks: [], postponed: 0, createdAt: 1, updatedAt: 1, googleEventId: 'event-a' };
let callbacks: ((response: unknown) => Promise<void>)[];
let storage: Map<string, string>;

beforeEach(() => {
  callbacks = []; storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient: (options: any) => { callbacks.push(options.callback); return { requestAccessToken: vi.fn() }; } } } } });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [], email: 'a@example.test' })));
  resetGoogleCalendarSession(); replaceState(emptyState());
});
afterEach(() => { resetGoogleCalendarSession(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function connect() {
  const pending = connectGoogleCalendar();
  await vi.waitFor(() => expect(callbacks).toHaveLength(1));
  await callbacks[0]({ access_token: 'private-token', expires_in: 3600 });
  expect(await pending).toBe(true);
}

describe('isolamento do Google Agenda', () => {
  it('mantém token somente em memória e desconecta ao encerrar a sessão', async () => {
    await connect();
    expect([...storage.values()].join('')).not.toContain('private-token');
    expect(storage.has('leve.gcal.token.v1')).toBe(false);
    resetGoogleCalendarSession();
    expect(getGoogleCalendarState()).toMatchObject({ connected: false, calendarId: 'primary', calendars: [] });
  });

  it('ignora callback OAuth recebido depois de trocar de conta', async () => {
    const pending = connectGoogleCalendar();
    await vi.waitFor(() => expect(callbacks).toHaveLength(1));
    resetGoogleCalendarSession();
    await callbacks[0]({ access_token: 'old-token', expires_in: 3600 });
    expect(await pending).toBe(false);
    expect(getGoogleCalendarState().connected).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('substituir snapshot remoto não apaga eventos do calendário', async () => {
    await connect();
    replaceState({ ...emptyState(), tasks: [task] });
    const unsubscribe = initGoogleCalendarListener();
    vi.mocked(fetch).mockClear(); vi.useFakeTimers();
    replaceState(emptyState());
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('aborta envio e ignora resposta tardia sem alterar tarefas da nova conta', async () => {
    await connect();
    replaceState({ ...emptyState(), tasks: [task] });
    let finish!: (r: Response) => void;
    const request = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', request);
    const update = vi.spyOn(actions, 'update');
    const pending = syncTaskToGoogle(task);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const signal = request.mock.calls[0][1]?.signal;
    resetGoogleCalendarSession(); replaceState(emptyState());
    expect(signal?.aborted).toBe(true);
    finish(Response.json({ id: 'old-event' }));
    expect(await pending).toBe(false);
    expect(update).not.toHaveBeenCalled();
    expect(getGoogleCalendarState().connected).toBe(false);
  });
});
