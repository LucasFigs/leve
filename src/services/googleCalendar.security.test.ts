import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calendarBackend } from './googleCalendarBackend';
import { connectGoogleCalendar, deleteGoogleEvent, disconnectGoogleCalendar, getGoogleCalendarState, initGoogleCalendarListener, resetGoogleCalendarSession, restoreGoogleCalendarConnection, setGoogleTargetCalendar, syncTaskToGoogle } from './googleCalendar';
import { actions, emptyState, replaceState } from '../store/store';
import type { Task } from '../domain/types';
vi.mock('./googleCalendarBackend', () => ({ calendarBackend: vi.fn() }));
vi.mock('../store/persistence', async importOriginal => ({...await importOriginal<typeof import('../store/persistence')>(),storageIssue:()=>undefined}));
const task: Task = { id: 'a', title: 'Privada', kind: 'task', status: 'active', date: '2026-11-04', time: '14:00', subtasks: [], postponed: 0, createdAt: 1, updatedAt: 1, googleEventId: 'event-a' };
let storage: Map<string, string>;
beforeEach(() => {
  storage = new Map();
  vi.stubGlobal('localStorage', { getItem: (k: string) => storage.get(k) ?? null, setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) });
  vi.stubGlobal('window', { location: { hash: '', search: '', pathname: '/', assign: vi.fn() }, history: { replaceState: vi.fn() } });
  vi.mocked(calendarBackend).mockReset();
  vi.mocked(calendarBackend).mockImplementation(async action => action === 'token'
    ? { connected: true, accessToken: 'private-token', expiresIn: 3600 }
    : { connected: true, email: 'a@example.test', calendarId: 'primary', autoSync: true });
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ items: [] })));
  resetGoogleCalendarSession(); replaceState(emptyState());
});
afterEach(() => { resetGoogleCalendarSession(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function connect() { await restoreGoogleCalendarConnection(); expect(getGoogleCalendarState().connected).toBe(true); }

describe('isolamento do Google Agenda persistente', () => {
  it('repete envio transitório sem perder a alteração da fila', async () => {
    vi.useFakeTimers(); await connect();replaceState({...emptyState(),tasks:[task]});
    const unsubscribe=initGoogleCalendarListener();
    const request=vi.fn().mockResolvedValueOnce(Response.json({}, {status:503})).mockResolvedValue(Response.json({id:'event-a'}));
    vi.stubGlobal('fetch',request);
    actions.update('a',{title:'Alteração fictícia'});
    await vi.advanceTimersByTimeAsync(701);
    await vi.waitFor(()=>expect(getGoogleCalendarState().status).toBe('error'));
    expect(request).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5001);
    await vi.waitFor(()=>expect(request).toHaveBeenCalledTimes(2));
    await vi.waitFor(()=>expect(getGoogleCalendarState().status).toBe('synced'));unsubscribe();
  });
  it('não trata uma exclusão 503 como confirmada',async()=>{
    await connect();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({}, {status:503})));
    expect(await deleteGoogleEvent('event-a')).toBe(false);
  });
  it('reconcilia vínculo de tarefa arquivada ao restaurar a conexão',async()=>{
    const state=emptyState();state.settings.onboarded=true;state.tasks=[{...task,status:'archived',googleCalendarId:'primary'}];replaceState(state);
    const request=vi.fn(async(_url:string,init?:RequestInit)=>init?.method==='DELETE'?new Response(null,{status:204}):Response.json({items:[]}));vi.stubGlobal('fetch',request);
    await connect();expect(request.mock.calls.some(([,init])=>init?.method==='DELETE')).toBe(true);
    const {getState}=await import('../store/store');expect(getState().tasks[0].googleEventId).toBeUndefined();
  });
  it('retém a exclusão na outbox ao falhar e desfazer cancela a exclusão remota',async()=>{
    vi.useFakeTimers();await connect();replaceState({...emptyState(),tasks:[{...task,googleCalendarId:'primary'}]});
    const unsubscribe=initGoogleCalendarListener();
    const request=vi.fn(async(_url: string,_init?: RequestInit)=>Response.json({}, {status:503}));vi.stubGlobal('fetch',request);
    actions.remove('a');await vi.advanceTimersByTimeAsync(701);
    const {getState}=await import('../store/store');expect(getState().googleDeletions).toHaveLength(1);
    actions.undo();request.mockClear();await vi.advanceTimersByTimeAsync(6000);
    expect(request.mock.calls.some(([,init])=>init?.method === 'DELETE')).toBe(false);expect(getState().googleDeletions ?? []).toHaveLength(0);unsubscribe();
  });
  it('mantém o calendário de eventos legados ao escolher outro destino',async()=>{
    await connect();replaceState({...emptyState(),tasks:[task]});
    setGoogleTargetCalendar('new-calendar');
    await vi.waitFor(()=>expect(getGoogleCalendarState().calendarId).toBe('new-calendar'));
    const {getState}=await import('../store/store');
    const bound=getState().tasks[0];expect(bound.googleCalendarId).toBe('primary');
    const request=vi.fn(async(_url: string)=>Response.json({id:'event-a'}));vi.stubGlobal('fetch',request);
    await syncTaskToGoogle(bound);
    expect(String(request.mock.calls[0][0])).toContain('/calendars/primary/events/event-a');
  });
  it('reutiliza o id de criação após falha de rede',async()=>{
    await connect();const fresh={...task,googleEventId:undefined};
    const bodies:string[]=[];
    vi.stubGlobal('fetch',vi.fn(async(_url,init)=>{bodies.push(init.body);throw new Error('rede simulada');}));
    await syncTaskToGoogle(fresh);await syncTaskToGoogle(fresh);
    expect(JSON.parse(bodies[0]).id).toMatch(/^[a-v0-9]{5,1024}$/);
    expect(JSON.parse(bodies[0]).id).toBe(JSON.parse(bodies[1]).id);
  });
  it('excluir durante a criação mantém um id de reconciliação na outbox',async()=>{
    await connect();const fresh={...task,googleEventId:undefined};replaceState({...emptyState(),tasks:[fresh]});
    const unsubscribe=initGoogleCalendarListener();
    let finish!: (r:Response)=>void;
    const request=vi.fn((_url:string,_init?:RequestInit)=>new Promise<Response>(resolve=>{finish=resolve;}));vi.stubGlobal('fetch',request);
    const pending=syncTaskToGoogle(fresh);await vi.waitFor(()=>expect(request).toHaveBeenCalled());
    const id=JSON.parse(request.mock.calls[0][1]!.body as string).id;
    actions.remove(fresh.id);const {getState}=await import('../store/store');
    expect(getState().googleDeletions).toContainEqual({eventId:id,calendarId:'primary'});
    finish(Response.json({id}));await pending;expect(getState().tasks).toEqual([]);unsubscribe();
  });
  it('restaura o vínculo pelo servidor mantendo access token somente em memória', async () => {
    await connect();
    expect([...storage.values()].join('')).not.toContain('private-token');
    expect(storage.has('leve.gcal.token.v1')).toBe(false);
    resetGoogleCalendarSession();
    expect(getGoogleCalendarState()).toMatchObject({ connected: false, calendarId: 'primary', calendars: [] });
    await connect();
    expect(vi.mocked(calendarBackend).mock.calls.filter(([action]) => action === 'token')).toHaveLength(2);
    expect(vi.mocked(calendarBackend).mock.calls.some(([action]) => action === 'disconnect')).toBe(false);
  });
  it('ignora restauração recebida depois de trocar de conta', async () => {
    let finish!: (value: { connected: boolean }) => void;
    vi.mocked(calendarBackend).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = restoreGoogleCalendarConnection();
    resetGoogleCalendarSession(); finish({ connected: true }); await pending;
    expect(getGoogleCalendarState().connected).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });
  it('substituir snapshot remoto não apaga eventos do calendário', async () => {
    await connect(); replaceState({ ...emptyState(), tasks: [task] });
    const unsubscribe = initGoogleCalendarListener();
    vi.mocked(fetch).mockClear(); vi.useFakeTimers();
    replaceState(emptyState()); await vi.advanceTimersByTimeAsync(1000);
    expect(fetch).not.toHaveBeenCalled(); unsubscribe();
  });
  it('aborta envio e ignora resposta tardia sem alterar tarefas da nova conta', async () => {
    await connect(); replaceState({ ...emptyState(), tasks: [task] });
    let finish!: (r: Response) => void;
    const request = vi.fn((_url: string, _init?: RequestInit) => new Promise<Response>(resolve => { finish = resolve; }));
    vi.stubGlobal('fetch', request);
    const update = vi.spyOn(actions, 'update');
    const pending = syncTaskToGoogle(task);
    await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
    const signal = request.mock.calls[0][1]?.signal;
    resetGoogleCalendarSession(); replaceState(emptyState()); expect(signal?.aborted).toBe(true);
    finish(Response.json({ id: 'old-event' }));
    expect(await pending).toBe(false); expect(update).not.toHaveBeenCalled();
  });
  it('não declara desconexão quando o servidor falha e permite tentar novamente', async () => {
    await connect(); vi.mocked(calendarBackend).mockRejectedValueOnce(new Error('Sem rede'));
    expect(await disconnectGoogleCalendar()).toBe(false);
    expect(getGoogleCalendarState()).toMatchObject({ connected: true, status: 'error' });
    expect(await disconnectGoogleCalendar()).toBe(true);
    expect(getGoogleCalendarState().connected).toBe(false);
  });
  it('renova um token expirado no servidor, sem abrir nova autorização', async () => {
    vi.useFakeTimers(); await connect(); await vi.advanceTimersByTimeAsync(3600000);
    vi.mocked(calendarBackend).mockClear();
    await syncTaskToGoogle(task);
    expect(calendarBackend).toHaveBeenCalledWith('token', {}, expect.any(AbortSignal));
    expect(window.location.assign).not.toHaveBeenCalled();
  });
  it('atualiza itens existentes ao restaurar pela primeira vez, sem marcar sucesso parcial', async () => {
    const state = emptyState(); state.settings.onboarded = true;
    replaceState({ ...state, tasks: [task] });
    vi.mocked(fetch).mockImplementation(async url => String(url).includes('/events/') ? Response.json({}, { status: 503 }) : Response.json({ items: [] }));
    await restoreGoogleCalendarConnection();
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes('/events/event-a'))).toBe(true);
    expect(getGoogleCalendarState().status).toBe('error');
  });
  it('rejeita retorno de autorização sem prova do navegador que iniciou o fluxo', async () => {
    window.location.hash = '#gcal_code=code&gcal_state=attacker';
    await restoreGoogleCalendarConnection();
    expect(calendarBackend).not.toHaveBeenCalled();
    expect(getGoogleCalendarState().connected).toBe(false);
    expect(window.history.replaceState).toHaveBeenCalled();
  });
  it('guarda somente prova temporária ao iniciar e conclui autenticado no retorno', async () => {
    vi.mocked(calendarBackend).mockResolvedValueOnce({ url: 'https://accounts.google.com/o/oauth2/v2/auth', state: 'state', proof: 'proof' });
    expect(await connectGoogleCalendar()).toBe(true);
    expect(storage.get('leve.gcal.pending.v1')).toContain('proof');
    window.location.hash = '#gcal_code=code&gcal_state=state';
    await restoreGoogleCalendarConnection();
    expect(calendarBackend).toHaveBeenCalledWith('complete', { code: 'code', state: 'state', proof: 'proof' }, expect.any(AbortSignal));
    expect(storage.has('leve.gcal.pending.v1')).toBe(false);
    expect([...storage.values()].join('')).not.toContain('private-token');
  });
});
