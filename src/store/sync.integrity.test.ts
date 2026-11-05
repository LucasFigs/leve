// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({
  authChange: undefined as undefined | ((event: string, session: unknown) => void),
  upsert: vi.fn(), signOut: vi.fn(), rows: [] as unknown[],
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { onAuthStateChange: (fn: typeof backend.authChange) => { backend.authChange = fn; }, signOut: backend.signOut },
  from: () => ({
    select: () => ({eq: () => ({order: () => ({range: async () => ({data:backend.rows,error:null})})})}),
    upsert: backend.upsert,
    delete: () => ({eq: () => ({in: async () => ({error:null})})}),
  }),
  channel: () => ({on() {return this;},subscribe() {return this;}}), removeChannel: vi.fn(),
}) }));
vi.mock('../services/googleCalendar', () => ({resetGoogleCalendarSession:vi.fn()}));
vi.mock('../services/push', () => ({disablePush:vi.fn(async()=>{})}));
beforeEach(() => {
  vi.resetModules(); vi.useFakeTimers(); localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL','https://example.test'); vi.stubEnv('VITE_SUPABASE_ANON_KEY','fixture-only');
  backend.rows=[]; backend.upsert.mockReset().mockResolvedValue({error:null}); backend.signOut.mockReset().mockResolvedValue({error:null});
  vi.spyOn(window,'confirm').mockReturnValue(false);
});
afterEach(() => {vi.clearAllTimers();vi.useRealTimers();vi.unstubAllEnvs();vi.restoreAllMocks();});
async function ready() {
  const store=await import('./store'); const state=store.emptyState(); state.settings.onboarded=true;
  localStorage.setItem('leve.sync.v1',JSON.stringify({owner:'owner-a',dirty:[],deleted:[]}));
  store.replaceState(state);
  const sync=await import('./sync');
  backend.authChange!('SIGNED_IN',{user:{id:'owner-a',email:'fixture@example.test',user_metadata:{},app_metadata:{}}});
  await vi.advanceTimersByTimeAsync(1);
  return {store,sync};
}
describe('saída sem perda de dados',()=>{
  it('grava o journal da captura antes do debounce do envio',async()=>{
    const {store}=await ready();const task=store.actions.capture('Precisa sobreviver ao reload')!;
    expect(JSON.parse(localStorage.getItem('leve.sync.v1')!).dirty).toContain(task.id);
  });
  it('não declara saída concluída se o Auth falhar',async()=>{
    const {store,sync}=await ready();store.actions.capture('Fictícia');backend.signOut.mockResolvedValue({error:{message:'Auth indisponível'}});
    expect(await sync.signOut()).toBe(false);expect(store.getState().tasks).toHaveLength(1);
  });
  it('falha isolada do journal fica visível e bloqueia logout destrutivo',async()=>{
    const {store,sync}=await ready();const setter=Storage.prototype.setItem;
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this: Storage,key,value){if(key==='leve.sync.v1')throw new DOMException('Quota','QuotaExceededError');setter.call(this,key,value);});
    store.actions.capture('Fictícia');const {storageIssue}=await import('./persistence');expect(storageIssue()).toBe('journal');
    expect(await sync.signOut()).toBe(false);expect(store.getState().tasks).toHaveLength(1);
  });
  it('só descarta alterações não enviadas após a escolha explícita de sair mesmo assim',async()=>{
    const {store,sync}=await ready();store.actions.capture('Fictícia');backend.upsert.mockResolvedValue({error:{message:'503'}});
    vi.mocked(window.confirm).mockReturnValueOnce(true).mockReturnValueOnce(false);
    expect(await sync.confirmSignOut()).toBe(false);expect(store.getState().tasks).toHaveLength(1);
    vi.mocked(window.confirm).mockReturnValue(true);expect(await sync.confirmSignOut()).toBe(true);expect(store.getState().tasks).toEqual([]);
  });
  it('não limpa dados quando a primeira leitura da conta nunca foi confirmada',async()=>{
    const store=await import('./store');const state=store.emptyState();state.settings.onboarded=true;store.replaceState(state);
    backend.rows=[{id:'invalid',type:'task',data:null}];const sync=await import('./sync');
    backend.authChange!('SIGNED_IN',{user:{id:'new-owner',user_metadata:{},app_metadata:{}}});await vi.advanceTimersByTimeAsync(1);
    store.actions.capture('Ainda não enviada');
    expect(await sync.signOut()).toBe(false);expect(store.getState().tasks).toHaveLength(1);
  });
  it.each([401,403,503])('preserva alterações e sessão quando o envio falha com %s',async status=>{
    const {store,sync}=await ready(); store.actions.capture('Captura fictícia');
    backend.upsert.mockResolvedValue({error:{message:`HTTP ${status}`}});
    const result=await sync.signOut();
    expect(store.getState().tasks).toHaveLength(1); expect(sync.hasPending()).toBe(true);
    expect(result).toBe(false);
    expect(backend.signOut).not.toHaveBeenCalled();
  });
  it('permite tentar novamente e só limpa após confirmação do envio',async()=>{
    const {store,sync}=await ready();store.actions.capture('Captura fictícia');
    backend.upsert.mockResolvedValueOnce({error:{message:'offline'}});
    expect(await sync.signOut()).toBe(false);
    expect(await sync.signOut()).toBe(true);
    expect(backend.signOut).toHaveBeenCalledOnce();expect(store.getState().tasks).toEqual([]);
  });
  it('não limpa capturas feitas durante o envio',async()=>{
    const {store,sync}=await ready();store.actions.capture('Primeira');
    backend.upsert.mockImplementationOnce(async()=>{store.actions.capture('Segunda');return {error:null};});
    expect(await sync.signOut()).toBe(false);expect(store.getState().tasks).toHaveLength(2);
  });
  it('retorna do timeout mantendo a captura e sem encerrar sessão',async()=>{
    const {store,sync}=await ready();store.actions.capture('Captura fictícia');
    backend.upsert.mockImplementationOnce(()=>new Promise(()=>{}));
    const exit=sync.signOut();await vi.advanceTimersByTimeAsync(15_001);
    expect(await exit).toBe(false);expect(store.getState().tasks).toHaveLength(1);expect(backend.signOut).not.toHaveBeenCalled();
  });
  it('não apaga os dados da conta anterior ao receber outra sessão com pendências',async()=>{
    const {store}=await ready();store.actions.capture('Da conta original');
    backend.authChange!('SIGNED_IN',{user:{id:'owner-b',user_metadata:{},app_metadata:{}}});
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getState().tasks).toHaveLength(1);
    expect(localStorage.getItem('leve.sync.v1')).toContain('owner-a');
  });
});
