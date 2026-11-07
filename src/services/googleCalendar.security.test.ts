import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {calendarBackend} from './googleCalendarBackend';
import {connectGoogleCalendar,deleteGoogleEvent,disconnectGoogleCalendar,getGoogleCalendarState,initGoogleCalendarListener,resetGoogleCalendarSession,restoreGoogleCalendarConnection,setGoogleTargetCalendar,toggleGoogleAutoSync,syncAllUpcomingTasks,syncTaskToGoogle} from './googleCalendar';
import {actions,emptyState,getState,newTask,replaceState} from '../store/store';
import {localRepository,recoveryExport} from '../store/persistence';
vi.mock('./googleCalendarBackend',()=>({calendarBackend:vi.fn()}));
let memory:Map<string,string>;
const legacy=()=>newTask({id:'legacy',title:'Compromisso antigo',status:'active',kind:'event',date:'2026-11-10',time:'08:30',googleEventId:'event-fixture',googleCalendarId:'calendar-fixture'});
beforeEach(()=>{
 memory=new Map();vi.stubGlobal('localStorage',{getItem:(key:string)=>memory.get(key)??null,setItem:(key:string,value:string)=>memory.set(key,value),removeItem:(key:string)=>memory.delete(key)});
 vi.stubGlobal('fetch',vi.fn());vi.mocked(calendarBackend).mockReset().mockResolvedValue({connected:true,email:'fixture@example.test'});resetGoogleCalendarSession();localRepository.clear();replaceState(emptyState());
});
afterEach(()=>{resetGoogleCalendarSession();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
describe('encerramento do Calendar sem efeitos remotos',()=>{
 it('status não solicita token nem lista calendários, mesmo após horas',async()=>{
  vi.useFakeTimers();await restoreGoogleCalendarConnection();await vi.advanceTimersByTimeAsync(3600000);expect(calendarBackend).toHaveBeenCalledTimes(1);expect(vi.mocked(calendarBackend).mock.calls[0][0]).toBe('status');expect(getGoogleCalendarState()).toMatchObject({connected:true,autoSync:false,status:'idle'});expect(fetch).not.toHaveBeenCalled();
 });
 it('conexão e preferências legadas são inertes, sem OAuth ou reatribuição de IDs',async()=>{
  replaceState({...emptyState(),tasks:[legacy()]});const before=JSON.stringify(getState());expect(await connectGoogleCalendar()).toBe(false);setGoogleTargetCalendar('new');toggleGoogleAutoSync(true);expect(calendarBackend).not.toHaveBeenCalled();expect(JSON.stringify(getState())).toBe(before);
 });
 it.each([204,404,410,401,403,429,503])('não tenta exclusão, independentemente de uma resposta Google %s',async status=>{
  vi.mocked(fetch).mockResolvedValue(new Response(null,{status}));expect(await deleteGoogleEvent('event-fixture','old-token')).toBe(false);expect(fetch).not.toHaveBeenCalled();expect(calendarBackend).not.toHaveBeenCalled();
 });
 it.each(['active','done','archived'] as const)('sincronização direta de registro %s não cria nem atualiza evento',async status=>{
  expect(await syncTaskToGoogle({...legacy(),status},'old-token')).toBe(false);expect(await syncAllUpcomingTasks(true,true)).toBe(0);expect(fetch).not.toHaveBeenCalled();expect(calendarBackend).not.toHaveBeenCalled();
 });
 it('criar, editar, concluir, reagendar, arquivar, excluir e desfazer não disparam observador ou timer',async()=>{
  vi.useFakeTimers();replaceState({...emptyState(),tasks:[legacy()],googleDeletions:[{eventId:'queued',calendarId:'calendar-fixture'}]});const stop=initGoogleCalendarListener();actions.capture('Primeiro passo');actions.update('legacy',{time:'08:00'});actions.complete('legacy','2026-11-10');actions.update('legacy',{date:'2026-11-11'});actions.update('legacy',{status:'archived'});actions.remove('legacy');actions.undo();await vi.advanceTimersByTimeAsync(3600000);stop();expect(fetch).not.toHaveBeenCalled();expect(calendarBackend).not.toHaveBeenCalled();expect(getState().googleDeletions).toContainEqual({eventId:'queued',calendarId:'calendar-fixture'});
 });
 it('série e exceção antigas preservam identidade e horário, sem POST/PATCH/DELETE',async()=>{
  const series={...legacy(),date:undefined,recurrence:{freq:'weekly' as const,weekdays:[2],anchor:'2026-11-03'}};replaceState({...emptyState(),tasks:[series]});const stop=initGoogleCalendarListener();actions.saveSeries('legacy',{...series,time:'08:00'},'one','2026-11-10');expect(getState().tasks.find(t=>t.id==='legacy')?.googleEventId).toBe('event-fixture');expect(getState().tasks.find(t=>t.seriesId==='legacy')).toMatchObject({time:'08:00',date:'2026-11-10'});expect(fetch).not.toHaveBeenCalled();stop();
 });
 it('backup/restauração e persistência mantêm IDs e fila sem executá-la',()=>{
  const snapshot={...emptyState(),tasks:[legacy()],googleDeletions:[{eventId:'queued',calendarId:'calendar-fixture'}]};replaceState(snapshot);const exported=JSON.parse(recoveryExport(getState())).current;replaceState(exported);expect(localRepository.load()).toEqual(snapshot);expect(fetch).not.toHaveBeenCalled();
 });
 it('troca de sessão aborta consulta e ignora resposta antiga',async()=>{
  let finish!:(r:{connected:boolean;email:string})=>void;let signal:AbortSignal|undefined;vi.mocked(calendarBackend).mockImplementationOnce((_action,_data,s)=>{signal=s;return new Promise(resolve=>{finish=resolve;});});const pending=restoreGoogleCalendarConnection();resetGoogleCalendarSession();finish({connected:true,email:'old@example.test'});await pending;expect(signal?.aborted).toBe(true);expect(getGoogleCalendarState().email).toBeUndefined();expect(getGoogleCalendarState().connected).toBe(false);
 });
 it('falha offline não aciona retries, refresh ou sincronização',async()=>{
  vi.useFakeTimers();vi.mocked(calendarBackend).mockRejectedValueOnce(Error('offline'));await restoreGoogleCalendarConnection();await vi.advanceTimersByTimeAsync(600000);expect(calendarBackend).toHaveBeenCalledTimes(1);expect(getGoogleCalendarState().status).toBe('error');expect(fetch).not.toHaveBeenCalled();
 });
 it('revogação só é confirmada quando backend confirma os dois resultados',async()=>{
  await restoreGoogleCalendarConnection();vi.mocked(calendarBackend).mockResolvedValueOnce({retired:true,disconnected:true,revoked:true});expect(await disconnectGoogleCalendar()).toBe(true);expect(getGoogleCalendarState().connected).toBe(false);expect(fetch).not.toHaveBeenCalled();
 });
 it('vínculo removido sem revogação confirmada mantém instrução precisa e sem falso sucesso',async()=>{
  await restoreGoogleCalendarConnection();vi.mocked(calendarBackend).mockResolvedValueOnce({retired:true,disconnected:true,revoked:false});expect(await disconnectGoogleCalendar()).toBe(false);expect(getGoogleCalendarState()).toMatchObject({connected:false,needsRevocation:true,status:'error'});expect(getGoogleCalendarState().error).toContain('Vínculo removido do Leve');resetGoogleCalendarSession();expect(getGoogleCalendarState().needsRevocation).toBeUndefined();
 });
 it('falha de rede ao desconectar mantém vínculo e não afirma sucesso',async()=>{
  await restoreGoogleCalendarConnection();vi.mocked(calendarBackend).mockRejectedValueOnce(Error('offline'));expect(await disconnectGoogleCalendar()).toBe(false);expect(getGoogleCalendarState().connected).toBe(true);expect(getGoogleCalendarState().error).toContain('pode continuar autorizado');
 });
});
it('consulta de status não comprova revogação nem apaga orientação manual pendente',async()=>{
 vi.mocked(calendarBackend).mockResolvedValueOnce({retired:true,connected:true});await restoreGoogleCalendarConnection();vi.mocked(calendarBackend).mockResolvedValueOnce({retired:true,disconnected:true,revoked:false});await disconnectGoogleCalendar();const error=getGoogleCalendarState().error;vi.mocked(calendarBackend).mockResolvedValueOnce({retired:true,connected:false});await restoreGoogleCalendarConnection();expect(getGoogleCalendarState()).toMatchObject({needsRevocation:true,status:'error',error});
});
it('backend antigo sem marcador não produz confirmação indevida de revogação',async()=>{
 vi.mocked(calendarBackend).mockResolvedValueOnce({connected:true});await restoreGoogleCalendarConnection();vi.mocked(calendarBackend).mockResolvedValueOnce({disconnected:true,revoked:true});expect(await disconnectGoogleCalendar()).toBe(false);expect(getGoogleCalendarState().needsRevocation).toBe(true);
});
