// @vitest-environment jsdom
import {act,useSyncExternalStore} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {ProfileScreen} from './Profile';
import {actions,emptyState,getState,replaceState} from '../store/store';
import {localRepository,reportStorageConflict} from '../store/persistence';
import {getUI} from '../store/ui';

const fixture=vi.hoisted(()=>({
  cloud:{status:'synced',email:'fixture@example.test',user:{fullName:'Pessoa de teste',provider:'google'},lastSync:1,error:undefined as string|undefined},
  google:{connected:false,email:'fixture@example.test',calendarId:'primary',autoSync:true,status:'idle',error:undefined as string|undefined,calendars:[{id:'primary',summary:'Teste'},{id:'other',summary:'Outra'}]},
  listeners:new Set<()=>void>(),permission:'default',connect:vi.fn(),disconnect:vi.fn(),sync:vi.fn(),target:vi.fn(),toggle:vi.fn(),signOut:vi.fn(),accountSync:vi.fn(),request:vi.fn(),enable:vi.fn(),disable:vi.fn(),updateUser:vi.fn(),
}));
vi.mock('../store/sync',()=>({cloudEnabled:true,useCloud:(select:(c:typeof fixture.cloud)=>unknown)=>useSyncExternalStore(fn=>{fixture.listeners.add(fn);return()=>{fixture.listeners.delete(fn);};},()=>select(fixture.cloud)),confirmSignOut:fixture.signOut,syncNow:fixture.accountSync,supabase:{auth:{updateUser:fixture.updateUser}}}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select?:(c:typeof fixture.google)=>unknown)=>useSyncExternalStore(fn=>{fixture.listeners.add(fn);return()=>{fixture.listeners.delete(fn);};},()=>select?select(fixture.google):fixture.google),getGoogleCalendarState:()=>fixture.google,connectGoogleCalendar:fixture.connect,disconnectGoogleCalendar:fixture.disconnect,setGoogleTargetCalendar:fixture.target,toggleGoogleAutoSync:fixture.toggle,syncAllUpcomingTasks:fixture.sync}));
vi.mock('../services/reminders',()=>({reminderPermission:()=>fixture.permission,requestReminderPermission:fixture.request}));
vi.mock('../services/push',()=>({pushConfigured:true,enablePush:fixture.enable,disablePush:fixture.disable}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.spyOn(window,'confirm').mockReturnValue(false);
  fixture.google={...fixture.google,connected:false,status:'idle',error:undefined};fixture.cloud={...fixture.cloud,status:'synced',error:undefined};fixture.permission='default';
  fixture.connect.mockReset().mockResolvedValue(false);fixture.disconnect.mockReset().mockResolvedValue(true);fixture.sync.mockReset().mockResolvedValue(undefined);fixture.target.mockReset();fixture.toggle.mockReset();fixture.signOut.mockReset();fixture.accountSync.mockReset();fixture.request.mockReset().mockResolvedValue(false);fixture.enable.mockReset().mockResolvedValue('ok');fixture.disable.mockReset().mockResolvedValue(undefined);fixture.updateUser.mockReset().mockResolvedValue({error:null});
  localStorage.clear();sessionStorage.clear();localRepository.clear();replaceState(emptyState());
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<ProfileScreen/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();localRepository.clear();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const dialog=()=>host.querySelector<HTMLElement>('[role="dialog"]')!;
function open(label:string){act(()=>{const b=Array.from(host.querySelectorAll<HTMLButtonElement>('.profile-setting-row')).find(e=>e.querySelector('.profile-setting-title')?.textContent===label)!;b.focus();b.click();});}
function click(label:string){act(()=>Array.from((dialog()??host).querySelectorAll<HTMLButtonElement>('button')).find(e=>e.textContent===label)!.click());}
function change(el:HTMLInputElement,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
function close(){act(()=>{dialog().querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.click();vi.advanceTimersByTime(201);});}
const emit=()=>act(()=>fixture.listeners.forEach(fn=>fn()));

it('identifica opções e valores sem expandir grupos e sem formulário permanente',()=>{
  expect(host.querySelectorAll('details')).toHaveLength(0);expect(host.querySelectorAll('input')).toHaveLength(0);
  expect(host.querySelectorAll('.profile-setting-row')).toHaveLength(7);
  expect(host.textContent).toContain('Não conectado');expect(host.textContent).toContain('Desativado');
});
it('edita expediente em uma etapa, salva e devolve foco à linha original',()=>{
  act(()=>actions.updateSettings({workSchedule:{enabled:true,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00'}}));
  open('Horário de trabalho');expect(dialog().querySelectorAll('details')).toHaveLength(0);
  act(()=>dialog().querySelector<HTMLButtonElement>('[aria-label="sábado"]')!.click());
  const inputs=dialog().querySelectorAll<HTMLInputElement>('input');change(inputs[0],'08:00');change(inputs[1],'17:00');click('Salvar expediente');
  expect(dialog()).toBeNull();expect(getState().settings.workSchedule).toMatchObject({weekdays:[1,2,3,4,5,6],start:'08:00',end:'17:00'});
  expect(document.activeElement?.textContent).toContain('Horário de trabalho');
  expect(getUI().toasts.some(t=>t.message==='Expediente salvo')).toBe(true);
});
it('protege rascunho de horários ao fechar, cancelar e receber preferências remotas',()=>{
  open('Meu tempo');change(dialog().querySelector<HTMLInputElement>('input')!,'09:00');close();
  expect(dialog()).not.toBeNull();click('Cancelar');expect(dialog()).not.toBeNull();
  expect(getState().settings.dayStart).toBe('08:00');
  act(()=>actions.updateSettings({dayEnd:'21:00'}));click('Salvar alterações');
  expect(dialog().textContent).toContain('outra sessão');expect(getState().settings.dayStart).toBe('08:00');
  vi.mocked(window.confirm).mockReturnValue(true);click('Cancelar');expect(dialog()).toBeNull();
});
it('não salva intervalo inválido nem almoço parcial e aplica horários juntos',()=>{
  open('Meu tempo');const inputs=dialog().querySelectorAll<HTMLInputElement>('input');change(inputs[1],'07:00');
  expect(Array.from(dialog().querySelectorAll('button')).find(b=>b.textContent==='Salvar alterações')!.disabled).toBe(true);
  expect(getState().settings.dayEnd).toBe(emptyState().settings.dayEnd);
  change(inputs[1],'22:00');change(inputs[0],'09:00');click('Salvar alterações');
  expect(getState().settings).toMatchObject({dayStart:'09:00',dayEnd:'22:00'});expect(localRepository.load()?.settings.dayEnd).toBe('22:00');
});
it('não fecha com falso sucesso ao desativar almoço depois de limpar um horário',()=>{
  open('Meu tempo');
  change(dialog().querySelectorAll<HTMLInputElement>('input')[2],'');
  act(()=>dialog().querySelector<HTMLButtonElement>('[aria-label="Proteger almoço"]')!.click());
  expect(Array.from(dialog().querySelectorAll('button')).find(b=>b.textContent==='Salvar alterações')!.disabled).toBe(true);
  expect(getState().settings.protectLunch).toBe(true);
});
it('muda tema imediatamente, preserva valor ao voltar e permite desfazer a escolha',()=>{
  open('Aparência');click('Escuro');expect(getState().settings.theme).toBe('dark');click('Automático');close();
  expect(getState().settings.theme).toBe('system');expect(host.textContent).toContain('Automático');
});
it('mantém detalhes técnicos Google só no editor, uma vez, e acompanha resolução do erro',()=>{
  fixture.google={...fixture.google,status:'error',error:'Falha fictícia de autorização'};emit();
  expect(host.textContent).toContain('Requer atenção');expect(host.textContent).not.toContain('Falha fictícia');
  open('Google Agenda');expect(dialog().textContent!.split('Falha fictícia').length-1).toBe(1);
  close();fixture.google={...fixture.google,status:'synced',connected:true,error:undefined};emit();open('Google Agenda');
  expect(dialog().textContent).not.toContain('Falha fictícia');expect(dialog().textContent).toContain('Conectado');
});
it('preserva conectar, desconectar, destino e sincronização, sem toast de erro antigo',async()=>{
  open('Google Agenda');click('Conectar');await act(async()=>{await Promise.resolve();});expect(fixture.connect).toHaveBeenCalledTimes(1);
  close();fixture.google={...fixture.google,connected:true,status:'synced'};emit();open('Google Agenda');click('Sincronizar');await act(async()=>{await Promise.resolve();});expect(fixture.sync).toHaveBeenCalledWith(true,true);
  act(()=>{const select=dialog().querySelector('select')!;select.value='other';select.dispatchEvent(new Event('change',{bubbles:true}));});expect(fixture.target).toHaveBeenCalledWith('other');
  vi.mocked(window.confirm).mockReturnValue(true);click('Desconectar Google Agenda');await act(async()=>{await Promise.resolve();});expect(fixture.disconnect).toHaveBeenCalledTimes(1);
});
it('Google com status de erro sem detalhe ainda oferece uma ação corretiva',()=>{
  fixture.google={...fixture.google,connected:true,status:'error',error:undefined};emit();open('Google Agenda');
  expect(dialog().querySelector('[role="alert"]')?.textContent).toContain('Não foi possível confirmar');
  expect(dialog().textContent).toContain('Reconectar Google Agenda');
});
it('preferência de lembrete não é confundida com permissão ou garantia de entrega',async()=>{
  fixture.request.mockImplementation(async()=>{fixture.permission='granted';return true;});
  open('Lembretes');act(()=>dialog().querySelector<HTMLButtonElement>('[aria-label="Avisar antes do horário"]')!.click());
  await act(async()=>{await Promise.resolve();await Promise.resolve();});
  click('15 min');expect(getState().settings).toMatchObject({reminders:true,reminderLead:15});
  expect(dialog().textContent).not.toContain('chegam mesmo');
  close();fixture.permission='denied';act(()=>window.dispatchEvent(new Event('focus')));
  expect(host.textContent).toContain('Permissão bloqueada');
});
it('permite tentar novamente após recusa de permissão sem falsear preferência',async()=>{
  fixture.permission='denied';open('Lembretes');act(()=>dialog().querySelector<HTMLButtonElement>('[aria-label="Avisar antes do horário"]')!.click());
  await act(async()=>{await Promise.resolve();});expect(getState().settings.reminders).not.toBe(true);expect(dialog().textContent).toContain('Libere as notificações');
});
it('sair enquanto a permissão está pendente não aplica preferência tardiamente',async()=>{
  let resolve!:(granted:boolean)=>void;
  fixture.request.mockImplementation(()=>new Promise<boolean>(done=>{resolve=done;}));
  open('Lembretes');act(()=>dialog().querySelector<HTMLButtonElement>('[aria-label="Avisar antes do horário"]')!.click());
  close();expect(dialog()).toBeNull();
  await act(async()=>{fixture.permission='granted';resolve(true);await Promise.resolve();});
  expect(getState().settings.reminders).not.toBe(true);expect(fixture.enable).not.toHaveBeenCalled();
});
it('ao editar identidade pela conta mantém um único modal e retorna à linha da conta',async()=>{
  open('Conta e sincronização');
  act(()=>Array.from(dialog().querySelectorAll('button')).find(b=>b.textContent?.includes('Pessoa de teste'))!.click());
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);close();
  await act(async()=>{await Promise.resolve();});
  expect(document.activeElement?.textContent).toContain('Conta e sincronização');
});
it('mantém logout seguro e erros da conta separados dos erros Google',()=>{
  fixture.cloud={...fixture.cloud,status:'error',error:'Falha fictícia da nuvem'};emit();
  expect(host.textContent).toContain('Erro ao sincronizar');open('Conta e sincronização');
  expect(dialog().textContent).toContain('Falha fictícia da nuvem');click('Sair da conta');expect(fixture.signOut).toHaveBeenCalledWith(false);
});
it('avisa recuperação e não apaga dados sem confirmação',()=>{
  act(()=>reportStorageConflict('fixture'));expect(host.textContent).toContain('Recuperação de dados requer atenção');
  open('Dados e privacidade');expect(dialog().textContent).toContain('exportar');
  const previous=getState();click('Apagar tudo');expect(getState()).toBe(previous);
});
it('rascunho da identidade exige confirmação e erro de conta permite tentar de novo',async()=>{
  act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Editar perfil"]')!.click());
  const name=dialog().querySelector<HTMLInputElement>('input')!;change(name,'Nome fictício');click('Cancelar');expect(dialog()).not.toBeNull();
  fixture.updateUser.mockRejectedValue(new Error('offline'));click('Salvar alterações');await act(async()=>{await Promise.resolve();});
  expect(dialog().textContent).toContain('Suas alterações continuam aqui');expect(dialog().querySelector<HTMLInputElement>('input')!.value).toBe('Nome fictício');
});
