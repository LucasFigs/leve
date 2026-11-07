// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
const backend = vi.hoisted(() => ({
  authChange: undefined as undefined | ((event: string, session: unknown) => void),
  realtime: undefined as undefined | ((value: {eventType: string;new?: Record<string,unknown>;old?: Record<string,unknown>}) => void),
  upsert: vi.fn(), signOut: vi.fn(), rows: [] as unknown[],
}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  auth: { onAuthStateChange: (fn: typeof backend.authChange) => { backend.authChange = fn; }, signOut: backend.signOut },
  from: () => ({
    select: () => ({eq: () => ({order: () => ({range: async () => ({data:backend.rows,error:null})})})}),
    upsert: backend.upsert,
    delete: () => ({eq: () => ({in: async () => ({error:null})})}),
  }),
  channel: () => ({on(_event: string,_filter: unknown,fn: typeof backend.realtime) {backend.realtime=fn;return this;},subscribe() {return this;}}), removeChannel: vi.fn(),
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
  it('sincroniza prioridade/categoria escolhidas e a remoção delas em nova sessão simulada',async()=>{
    const {store,sync}=await ready();
    const task=store.newTask({title:'Compromisso fictício',kind:'event',status:'active',date:'2026-11-10',time:'09:00',duration:30,priority:'essential',category:'trabalho'});
    store.actions.add(task);sync.syncNow();await vi.advanceTimersByTimeAsync(601);
    const row=backend.upsert.mock.calls.flatMap(c=>c[0]).find(r=>r.id===task.id)!;
    expect(row.data).toMatchObject({priority:'essential',category:'trabalho',time:'09:00'});
    vi.resetModules();localStorage.clear();backend.rows=JSON.parse(JSON.stringify([row]));
    localStorage.setItem('leve.sync.v1',JSON.stringify({owner:'owner-a',dirty:[],deleted:[]}));
    const other=await import('./store');const otherSync=await import('./sync');
    backend.authChange!('SIGNED_IN',{user:{id:'owner-a',email:'fixture@example.test',user_metadata:{},app_metadata:{}}});await vi.advanceTimersByTimeAsync(1);
    expect(other.getState().tasks[0]).toMatchObject({priority:'essential',category:'trabalho',time:'09:00'});
    backend.upsert.mockClear();other.actions.saveTask(task.id,{...other.getState().tasks[0],priority:undefined,category:undefined});
    otherSync.syncNow();await vi.advanceTimersByTimeAsync(601);
    const cleared=JSON.parse(JSON.stringify(backend.upsert.mock.calls.flatMap(c=>c[0]).find(r=>r.id===task.id)!.data));
    expect(cleared).not.toHaveProperty('priority');expect(cleared).not.toHaveProperty('category');expect(cleared.time).toBe('09:00');
  });
  it('envia série e exceção e as restaura em outra sessão sem reintroduzir o horário original',async()=>{
    const {store,sync}=await ready();
    const series=store.newTask({id:'recurring-fixture',title:'Reunião semanal',kind:'event',status:'active',time:'10:00',duration:60,category:'trabalho',recurrence:{freq:'weekly',weekdays:[2],anchor:'2026-11-03'}});
    store.actions.add(series);sync.syncNow();await vi.advanceTimersByTimeAsync(601);backend.upsert.mockClear();
    store.actions.saveSeries(series.id,{...series,time:'08:30',duration:30,category:'saude'},'one','2026-11-10');
    sync.syncNow();await vi.advanceTimersByTimeAsync(601);
    const rows=backend.upsert.mock.calls.flatMap(call=>call[0]).filter(row=>row.type==='task');
    expect(rows).toHaveLength(2);
    const exception=rows.find(row=>row.data.seriesId===series.id)!;
    expect(exception.data).toMatchObject({time:'08:30',duration:30,category:'saude',seriesDate:'2026-11-10'});
    expect(rows.find(row=>row.id===series.id)?.data.skipDates).toEqual(['2026-11-10']);
    const {itemsForDate}=await import('../domain/selectors');
    // Nova sessão, com armazenamento próprio e dados vindos apenas do servidor mockado.
    vi.resetModules();localStorage.clear();backend.rows=[{...rows.find(row=>row.id===series.id),data:series}];
    localStorage.setItem('leve.sync.v1',JSON.stringify({owner:'owner-a',dirty:[],deleted:[]}));
    const nextStore=await import('./store');const nextSync=await import('./sync');
    backend.authChange!('SIGNED_IN',{user:{id:'owner-a',email:'fixture@example.test',user_metadata:{},app_metadata:{}}});
    await vi.advanceTimersByTimeAsync(1);
    // A exceção chega antes da atualização de skipDates da série.
    backend.realtime!({eventType:'INSERT',new:{...exception,user_id:'owner-a',origin:'device-b'}});
    expect(nextStore.getState().tasks).toHaveLength(2);
    expect(itemsForDate(nextStore.getState().tasks,'2026-11-10')).toMatchObject([{time:'08:30',duration:30}]);
    backend.realtime!({eventType:'UPDATE',new:{...rows.find(row=>row.id===series.id),user_id:'owner-a',origin:'device-b'}});
    backend.rows=JSON.parse(JSON.stringify(rows));nextSync.syncNow();await vi.advanceTimersByTimeAsync(601);
    expect(itemsForDate(nextStore.getState().tasks,'2026-11-10')).toMatchObject([{time:'08:30',duration:30}]);
    expect(itemsForDate(nextStore.getState().tasks,'2026-11-17')).toMatchObject([{time:'10:00',duration:60}]);
    expect(nextSync.localDataOwner()).toBe('owner-a');
  });
  it('sincroniza expediente opcional como meta sem alterar tarefas e rejeita dias inválidos remotos',async()=>{
    const {store,sync}=await ready();
    const workSchedule={enabled:true,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00'};
    store.actions.updateSettings({workSchedule});sync.syncNow();await vi.advanceTimersByTimeAsync(601);
    const rows=backend.upsert.mock.calls.flatMap(call=>call[0]);
    expect(rows.filter(row=>row.type==='meta').pop()?.data.settings.workSchedule).toEqual(workSchedule);
    backend.realtime!({eventType:'UPDATE',new:{user_id:'owner-a',id:'meta',type:'meta',data:{settings:{...store.getState().settings,workSchedule:{...workSchedule,start:'10:00'}}},origin:'device-b'}});
    expect(store.getState().settings.workSchedule?.start).toBe('10:00');
    backend.realtime!({eventType:'UPDATE',new:{user_id:'owner-a',id:'meta',type:'meta',data:{settings:{workSchedule:{...workSchedule,weekdays:[9]}}},origin:'device-b'}});
    expect(store.getState().settings.workSchedule?.start).toBe('10:00');
    expect(store.getState().tasks).toEqual([]);
  });
  it('normaliza listas ausentes do journal legado sem falhar na inicialização',async()=>{
    localStorage.setItem('leve.sync.v1',JSON.stringify({owner:'owner-a',dirty:null,deleted:null}));
    const sync=await import('./sync');expect(sync.localDataOwner()).toBe('owner-a');
  });
  it('coloca journal malformado em quarentena sem substituí-lo',async()=>{
    const raw=JSON.stringify({owner:'owner-a',dirty:['ok'],deleted:'invalid'});localStorage.setItem('leve.sync.v1',raw);
    await import('./sync');const {storageIssue}=await import('./persistence');expect(storageIssue()).toBe('conflict');
    expect(localStorage.getItem('leve.sync.v1')).toBe(raw);
  });
  it('aplica uma alteração confirmada de outro dispositivo, sem sobrescrever uma edição local pendente',async()=>{
    const {store}=await ready();const remote=store.newTask({id:'remote',title:'Do dispositivo B',status:'active'});
    const deliver=(title:string)=>backend.realtime!({eventType:'UPDATE',new:{user_id:'owner-a',id:remote.id,type:'task',data:{...remote,title},origin:'device-b'}});
    deliver('Primeira versão B');expect(store.getState().tasks[0].title).toBe('Primeira versão B');
    deliver('Segunda versão B');expect(store.getState().tasks[0].title).toBe('Segunda versão B');
    store.actions.update(remote.id,{title:'Edição pendente A'});deliver('Terceira versão B');
    expect(store.getState().tasks[0].title).toBe('Edição pendente A');
  });
  it('ignora realtime de outra conta e preserva edição local diante de exclusão remota',async()=>{
    const {store}=await ready();const remote=store.newTask({id:'remote',title:'Fictícia',status:'active'});
    backend.realtime!({eventType:'INSERT',new:{user_id:'owner-b',id:remote.id,type:'task',data:remote,origin:'device-b'}});
    expect(store.getState().tasks).toHaveLength(0);
    backend.realtime!({eventType:'INSERT',new:{user_id:'owner-a',id:remote.id,type:'task',data:remote,origin:'device-b'}});
    store.actions.update(remote.id,{title:'Local pendente'});
    backend.realtime!({eventType:'DELETE',old:{user_id:'owner-a',id:remote.id}});
    expect(store.getState().tasks[0].title).toBe('Local pendente');
  });
  it('não sobrescreve o journal alterado por outra aba antes de receber storage',async()=>{
    const {store}=await ready();
    const external=JSON.stringify({owner:'owner-b',dirty:['external-task'],deleted:[]});
    localStorage.setItem('leve.sync.v1',external);
    store.actions.capture('Ainda na conta A');
    expect(localStorage.getItem('leve.sync.v1')).toBe(external);
    const {storageIssue}=await import('./persistence');expect(storageIssue()).toBe('conflict');
  });
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
    let signal: AbortSignal | undefined;
    backend.upsert.mockImplementationOnce(()=>{const work=new Promise(()=>{});return Object.assign(work,{abortSignal:(value:AbortSignal)=>{signal=value;return work;}});});
    const exit=sync.signOut();await vi.advanceTimersByTimeAsync(15_001);
    expect(await exit).toBe(false);expect(store.getState().tasks).toHaveLength(1);expect(backend.signOut).not.toHaveBeenCalled();
    expect(signal?.aborted).toBe(true);
  });
  it('não apaga os dados da conta anterior ao receber outra sessão com pendências',async()=>{
    const {store}=await ready();store.actions.capture('Da conta original');
    backend.authChange!('SIGNED_IN',{user:{id:'owner-b',user_metadata:{},app_metadata:{}}});
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getState().tasks).toHaveLength(1);
    expect(localStorage.getItem('leve.sync.v1')).toContain('owner-a');
  });
});
