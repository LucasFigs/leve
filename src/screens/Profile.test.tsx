// @vitest-environment jsdom
import {act,useSyncExternalStore} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {ProfileScreen} from './Profile';
import {actions,emptyState,getState,replaceState} from '../store/store';
import {localRepository,reportStorageConflict} from '../store/persistence';
import {getUI} from '../store/ui';

const fixture=vi.hoisted(()=>({
  cloud:{userId:'owner-a',status:'synced',email:'fixture@example.test',user:{fullName:'Pessoa de teste',provider:'google'},lastSync:1,error:undefined as string|undefined},
  google:{needsRevocation:false,connected:false,email:'fixture@example.test',calendarId:'primary',autoSync:true,status:'idle',error:undefined as string|undefined,calendars:[{id:'primary',summary:'Teste'},{id:'other',summary:'Outra'}]},
  listeners:new Set<()=>void>(),permission:'default',connect:vi.fn(),disconnect:vi.fn(),sync:vi.fn(),target:vi.fn(),toggle:vi.fn(),signOut:vi.fn(),accountSync:vi.fn(),request:vi.fn(),enable:vi.fn(),disable:vi.fn(),updateUser:vi.fn(),
}));
vi.mock('../store/sync',()=>({cloudEnabled:true,useCloud:(select:(c:typeof fixture.cloud)=>unknown)=>useSyncExternalStore(fn=>{fixture.listeners.add(fn);return()=>{fixture.listeners.delete(fn);};},()=>select(fixture.cloud)),confirmSignOut:fixture.signOut,syncNow:fixture.accountSync,supabase:{auth:{updateUser:fixture.updateUser}}}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select?:(c:typeof fixture.google)=>unknown)=>useSyncExternalStore(fn=>{fixture.listeners.add(fn);return()=>{fixture.listeners.delete(fn);};},()=>select?select(fixture.google):fixture.google),getGoogleCalendarState:()=>fixture.google,connectGoogleCalendar:fixture.connect,disconnectGoogleCalendar:fixture.disconnect,setGoogleTargetCalendar:fixture.target,toggleGoogleAutoSync:fixture.toggle,restoreGoogleCalendarConnection:fixture.sync,syncAllUpcomingTasks:fixture.sync}));
vi.mock('../services/reminders',()=>({reminderPermission:()=>fixture.permission,requestReminderPermission:fixture.request}));
vi.mock('../services/push',()=>({pushConfigured:true,enablePush:fixture.enable,disablePush:fixture.disable}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.spyOn(window,'confirm').mockReturnValue(false);
  fixture.google={...fixture.google,connected:false,needsRevocation:false,status:'idle',error:undefined};fixture.cloud={...fixture.cloud,status:'synced',error:undefined};fixture.permission='default';
  fixture.connect.mockReset().mockResolvedValue(false);fixture.disconnect.mockReset().mockResolvedValue(true);fixture.sync.mockReset().mockResolvedValue(undefined);fixture.target.mockReset();fixture.toggle.mockReset();fixture.signOut.mockReset();fixture.accountSync.mockReset();fixture.request.mockReset().mockResolvedValue(false);fixture.enable.mockReset().mockResolvedValue('ok');fixture.disable.mockReset().mockResolvedValue(undefined);fixture.updateUser.mockReset().mockResolvedValue({error:null});
  localStorage.clear();sessionStorage.clear();localRepository.clear();replaceState(emptyState());
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
  act(()=>root.render(<ProfileScreen/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();localRepository.clear();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const dialog=()=>host.querySelector<HTMLElement>('[role="dialog"]')!;
function open(label:string){if(label==='Google Agenda'){open('Dados e privacidade');act(()=>host.querySelector<HTMLButtonElement>('[data-legacy-connections]')!.click());return;}act(()=>{const b=Array.from(host.querySelectorAll<HTMLButtonElement>('.profile-setting-row')).find(e=>e.querySelector('.profile-setting-title')?.textContent===label)!;b.focus();b.click();});}
function click(label:string){act(()=>Array.from((dialog()??host).querySelectorAll<HTMLButtonElement>('button')).find(e=>e.textContent===label)!.click());}
function change(el:HTMLInputElement,value:string){act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
function close(){act(()=>{dialog().querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.click();vi.advanceTimersByTime(201);});}
const emit=()=>act(()=>fixture.listeners.forEach(fn=>fn()));

it('identifica opções e valores sem expandir grupos e sem formulário permanente',()=>{
  expect(host.querySelectorAll('details')).toHaveLength(0);expect(host.querySelectorAll('input')).toHaveLength(0);
  expect(host.querySelectorAll('.profile-setting-row')).toHaveLength(6);
  expect(host.textContent).not.toContain('Google Agenda');expect(host.textContent).toContain('Desativado');
});
it('conta, dados e Google não têm rodapé de retorno redundante',()=>{
  fixture.google={...fixture.google,connected:true};emit();for(const title of ['Conta e sincronização','Dados e privacidade','Google Agenda']){
    open(title);expect(dialog().querySelector('.sheet-foot')).toBeNull();expect(dialog().querySelector('[aria-label="Fechar"]')).not.toBeNull();close();
  }
  open('Meu tempo');expect(dialog().querySelector('.sheet-foot')?.textContent).toContain('Salvar alterações');
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

it('conta nova não exibe conexão Calendar nem erro técnico; login e sync Leve permanecem',()=>{
 expect(host.textContent).not.toContain('Google Agenda');expect(host.textContent).not.toContain('Conectar');open('Conta e sincronização');expect(dialog().textContent).toContain('Tudo sincronizado');
});
it('conta antiga oferece apenas gerenciar vínculo, não conexão, destino ou sincronizar eventos',async()=>{
 fixture.google={...fixture.google,connected:true,status:'idle',error:undefined};emit();open('Google Agenda');expect(dialog().textContent).toContain('não apaga atividades do Leve');expect(dialog().querySelector('select')).toBeNull();expect(dialog().querySelector('[role=switch]')).toBeNull();expect(dialog().textContent).not.toContain('Reconectar');
 vi.mocked(window.confirm).mockReturnValue(true);click('Revogar acesso');await act(async()=>{await Promise.resolve();});expect(fixture.disconnect).toHaveBeenCalledTimes(1);expect(fixture.connect).not.toHaveBeenCalled();expect(fixture.target).not.toHaveBeenCalled();expect(fixture.toggle).not.toHaveBeenCalled();
});
it('erro de desconexão tem instrução manual e não vira sucesso nem reconexão',async()=>{
 fixture.google={...fixture.google,connected:true,status:'error',error:'Não foi possível confirmar a revogação.'};fixture.disconnect.mockResolvedValue(false);emit();open('Google Agenda');expect(dialog().querySelector('[role=alert]')!.textContent).toContain('confirmar');expect(dialog().querySelector('a[href="https://myaccount.google.com/connections"]')).not.toBeNull();expect(dialog().textContent).not.toContain('Reconectar');
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
it('troca de conta fecha gerenciamento e remove metadados da conta anterior',()=>{
 fixture.google={...fixture.google,connected:true,email:'old-calendar@example.test'};emit();open('Google Agenda');expect(dialog().textContent).toContain('old-calendar@example.test');fixture.cloud={...fixture.cloud,userId:'owner-b',email:'new@example.test'};fixture.google={...fixture.google,connected:false,email:'',error:undefined};emit();expect(dialog()).toBeNull();expect(host.textContent).not.toContain('old-calendar@example.test');expect(host.textContent).not.toContain('Google Agenda');
});
it('IDs históricos não exibem conexão nem são apagados, mesmo com falha de consulta',()=>{
 const task={id:'legacy',title:'Antiga',kind:'event' as const,status:'active' as const,googleEventId:'fixture-event',subtasks:[],postponed:0,createdAt:1,updatedAt:1};act(()=>replaceState({...getState(),tasks:[task]}));fixture.google={...fixture.google,connected:false,status:'error',error:'Não foi possível consultar o vínculo antigo.'};emit();open('Dados e privacidade');expect(dialog().querySelector('[data-legacy-connections]')).toBeNull();expect(getState().tasks[0].googleEventId).toBe('fixture-event');expect(dialog().querySelector('a[href="https://myaccount.google.com/connections"]')).not.toBeNull();
});
it('revogação pendente sem conexão mantém caminho contextual, sem afirmar sucesso',()=>{
 fixture.google={...fixture.google,connected:false,needsRevocation:true,status:'error',error:'Não foi possível confirmar a revogação.'};emit();open('Google Agenda');expect(dialog().textContent).toContain('Acessos autorizados');expect(dialog().textContent).not.toContain('revogação confirmadas');expect(dialog().querySelector('[role=alert]')?.textContent).toContain('confirmar');expect(dialog().querySelector('a[href="https://myaccount.google.com/connections"]')).not.toBeNull();
});
it('vínculo antigo só aparece dentro de Dados e privacidade e permite voltar com foco',async()=>{
 fixture.google={...fixture.google,connected:true};emit();expect(host.querySelector('.profile-settings-group')?.textContent).not.toContain('Google Agenda');
 expect([...host.querySelectorAll('.profile-setting-title')].map(e=>e.textContent)).not.toContain('Google Agenda');
 open('Dados e privacidade');expect(dialog().textContent).toContain('Acessos autorizados');act(()=>host.querySelector<HTMLButtonElement>('[data-legacy-connections]')!.click());expect(dialog().textContent).toContain('Revogar acesso');click('Dados e privacidade');await act(async()=>{await Promise.resolve();});expect(document.activeElement).toBe(host.querySelector('[data-legacy-connections]'));
});
it('conta sem vínculo não oferece Acessos autorizados',()=>{open('Dados e privacidade');expect(host.querySelector('[data-legacy-connections]')).toBeNull();});
