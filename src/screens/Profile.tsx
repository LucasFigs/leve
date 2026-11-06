import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDuration, WEEKDAYS_SHORT } from '../domain/dates';
import type { Settings } from '../domain/types';
import { actions, useStore } from '../store/store';
import { goTo, toast } from '../store/ui';
import { cloudEnabled, confirmSignOut, supabase, syncNow, useCloud, type SyncStatus } from '../store/sync';
import { useInstall } from '../hooks/install';
import { BottomSheet } from '../components/BottomSheet';
import { Segmented, SectionHead, Switch } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { WorkScheduleEditor } from '../components/WorkScheduleEditor';
import { formatPhone } from '../domain/phone';
import { reminderPermission } from '../services/reminders';
import { useStorageIssue } from '../store/persistence';
import { LocalIdentitySheet, ReminderSettingsSheet, remindersSummary, TimeSettingsSheet } from './ProfilePreferences';
import { rememberCalendarSettingsReturn, clearCalendarSettingsReturn, consumeCalendarSettingsReturn } from '../services/settingsNavigation';
import {
  connectGoogleCalendar, disconnectGoogleCalendar, setGoogleTargetCalendar,
  syncAllUpcomingTasks, toggleGoogleAutoSync, useGoogleCalendar,
  getGoogleCalendarState,
} from '../services/googleCalendar';

type SettingsPage = 'identity'|'time'|'work'|'appearance'|'reminders'|'google'|'account'|'data'|'install';
const THEME_LABEL = {system:'Automático',light:'Claro',dark:'Escuro'};
const PAGE_LABEL: Record<SettingsPage,string> = {identity:'Meu perfil',time:'Meu tempo',work:'Horário de trabalho',appearance:'Aparência',reminders:'Lembretes',google:'Google Agenda',account:'Conta e sincronização',data:'Dados e privacidade',install:'Usar como app'};
export function workSummary(work: Settings['workSchedule']) {
  if(!work?.enabled)return 'Desativado';
  const days=work.weekdays;
  const label=days.length===5&&[1,2,3,4,5].every(d=>days.includes(d))?'Seg–Sex':days.length===7?'Todos os dias':[1,2,3,4,5,6,0].filter(d=>days.includes(d)).map(d=>WEEKDAYS_SHORT[d]).join(', ');
  return `${label} · ${work.start}–${work.end}`;
}
function SettingsRow({title,value,icon,onClick,attention=false}:{title:string;value:string;icon:IconName;onClick:(trigger:HTMLButtonElement)=>void;attention?:boolean}) {
  return <button type="button" className="profile-setting-row" onClick={event=>onClick(event.currentTarget)}>
    <Icon name={icon} size={20}/><span className="profile-setting-copy"><span className="profile-setting-title">{title}</span><span className={`profile-setting-value${attention?' warn-text':''}`}>{value}</span></span><Icon name="chevron-right" size={17}/>
  </button>;
}
export function ProfileScreen() {
  const settings=useStore(s=>s.settings);
  const user=useCloud(c=>c.user);
  const status=useCloud(c=>c.status);
  const email=useCloud(c=>c.email);
  const gcal=useGoogleCalendar();
  const install=useInstall();
  const issue=useStorageIssue();
  const [page,setPage]=useState<SettingsPage>();
  const trigger=useRef<HTMLElement|null>(null);
  const open=(next:SettingsPage,element:HTMLElement)=>{trigger.current=element;setPage(next);};
  const [permission,setPermission]=useState(reminderPermission());
  useEffect(()=>{if(consumeCalendarSettingsReturn())setPage('google');},[]);
  useEffect(()=>{const refresh=()=>setPermission(reminderPermission());window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const close=()=>{setPage(undefined);setPermission(reminderPermission());queueMicrotask(()=>{if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
  const googleStatus=gcal.status==='syncing'?'Verificando conexão…':gcal.status==='error'||gcal.error?'Requer atenção':gcal.connected?'Conectado':'Não conectado · integração em testes';
  return <div className="screen profile-settings">
    <div className="topbar"><div className="row"><button className="icon-btn mobile-only" aria-label="Voltar" onClick={()=>goTo('today')}><Icon name="chevron-left"/></button><h1 className="page-title">Configurações</h1></div></div>
    <button className="profile-identity" onClick={e=>open('identity',e.currentTarget)} aria-label="Editar perfil">
      <UserAvatar size={46}/><span className="profile-setting-copy"><strong>{settings.name||user?.fullName||'Seu perfil'}</strong><span className="profile-setting-value">Editar seus dados</span></span><Icon name="edit" size={18}/>
    </button>
    <section className="profile-settings-group" aria-labelledby="profile-preferences"><h2 id="profile-preferences">Preferências</h2><div className="profile-settings-list">
      <SettingsRow title="Meu tempo" icon="clock" value={`${settings.dayStart}–${settings.dayEnd} · tarefas de ${formatDuration(settings.defaultDuration)}`} onClick={el=>open('time',el)}/>
      <SettingsRow title="Horário de trabalho" icon="briefcase" value={workSummary(settings.workSchedule)} onClick={el=>open('work',el)}/>
      <SettingsRow title="Aparência" icon="sun" value={THEME_LABEL[settings.theme]} onClick={el=>open('appearance',el)}/>
      <SettingsRow title="Lembretes" icon="bell" value={remindersSummary(settings.reminders,permission)} onClick={el=>open('reminders',el)}/>
    </div></section>
    <section className="profile-settings-group" aria-labelledby="profile-connections"><h2 id="profile-connections">Conexões e dados</h2><div className="profile-settings-list">
      <SettingsRow title="Google Agenda" icon="calendar" value={googleStatus} attention={!!gcal.error||gcal.status==='error'} onClick={el=>open('google',el)}/>
      <SettingsRow title="Conta e sincronização" icon="cloud" value={cloudEnabled?`${STATUS_LABEL[status]}${email?` · ${email}`:''}`:'Dados neste aparelho · sem nuvem'} attention={status==='error'} onClick={el=>open('account',el)}/>
      <SettingsRow title="Dados e privacidade" icon="folder" value={issue?'Recuperação de dados requer atenção':'Gerenciamento, privacidade e termos'} attention={!!issue} onClick={el=>open('data',el)}/>
    </div></section>
    {!install.installed&&(install.canPrompt||install.ios)&&<button type="button" className="profile-install" onClick={e=>open('install',e.currentTarget)}><Icon name="download" size={18}/>Adicionar à tela inicial<Icon name="chevron-right" size={16}/></button>}
    {page==='identity'&&(cloudEnabled?<AccountSheet onClose={close}/>:<LocalIdentitySheet onClose={close}/>)}
    {page==='time'&&<TimeSettingsSheet onClose={close}/>}
    {page==='work'&&<WorkScheduleEditor onClose={close}/>}
    {page==='reminders'&&<ReminderSettingsSheet onClose={close}/>}
    {page&&['appearance','google','account','data','install'].includes(page)&&<BottomSheet key={page} className="settings-sheet" title={PAGE_LABEL[page]} onClose={close} footer={<button className="btn btn-secondary grow" onClick={close}>Voltar às configurações</button>}>
      {page==='appearance'&&<><p className="small muted">Escolha como o Leve aparece. A mudança é aplicada na hora.</p><Segmented<Settings['theme']> label="Tema" value={settings.theme} onChange={theme=>{actions.updateSettings({theme});toast(`Tema: ${THEME_LABEL[theme]}`);}} options={[{value:'system',label:'Automático'},{value:'light',label:'Claro'},{value:'dark',label:'Escuro'}]}/></>}
      {page==='google'&&<GoogleCalendarSection/>}
      {page==='account'&&(cloudEnabled?<AccountSection onEdit={()=>setPage('identity')}/>:<p className="small muted">Este ambiente salva os dados somente neste aparelho. Não há uma conta conectada para sincronizar.</p>)}
      {page==='data'&&<DataSettings onClose={close}/>}
      {page==='install'&&<InstallSection/>}
    </BottomSheet>}
  </div>;
}
function DataSettings({onClose}:{onClose:()=>void}) {
  const count=useStore(s=>s.tasks.filter(t=>t.id.startsWith('demo-')).length+s.projects.filter(p=>p.id.startsWith('demo-')).length);
  const issue=useStorageIssue();
  return <div className="settings-data">
    {issue&&<div role="note"><p>Há dados locais que precisam de atenção. Use o aviso de recuperação para exportar as versões antes de fechar o app.</p><button className="btn btn-soft" onClick={onClose}>Ver opções de recuperação</button></div>}
    <div className="list">
      {count>0&&<button className="settings-row" onClick={()=>{if(confirm(`Remover os ${count} itens de exemplo? Seus itens continuam intactos.`)){actions.removeDemo();toast('Exemplos removidos',{label:'Desfazer',run:()=>actions.undo()});}}}><span>Remover dados de exemplo</span><Icon name="trash" size={18}/></button>}
      <button className="settings-row" onClick={()=>{actions.updateSettings({onboarded:false});onClose();}}><span>Ver introdução novamente</span><Icon name="chevron-right" size={18}/></button>
      <a className="settings-row" href="/privacidade.html" target="_blank" rel="noopener">Política de privacidade<Icon name="arrow-right" size={18}/></a>
      <a className="settings-row" href="/termos.html" target="_blank" rel="noopener">Termos de uso<Icon name="arrow-right" size={18}/></a>
    </div>
    <p className="small muted">{cloudEnabled?'Alterações ficam neste aparelho até a sincronização ser confirmada.':'Seus dados ficam neste aparelho e funcionam offline.'}</p>
    <div className="settings-danger"><h3>Apagar dados</h3><p className="small muted">Esta ação remove tarefas, projetos e preferências. Na conta conectada, afeta os outros aparelhos.</p><button className="btn btn-danger" onClick={()=>{if(confirm(cloudEnabled?'Apagar todas as tarefas, projetos e preferências da sua conta em todos os aparelhos?':'Apagar todas as tarefas, projetos e preferências deste aparelho?')){actions.reset();onClose();}}}>Apagar tudo</button></div>
  </div>;
}
const STATUS_LABEL: Record<SyncStatus, string> = {
  idle: 'Desconectado',
  loading: 'Carregando…',
  syncing: 'Sincronizando…',
  synced: 'Tudo sincronizado',
  offline: 'Sem internet — salvo no aparelho',
  error: 'Erro ao sincronizar',
};

function timeAgo(ms?: number) {
  if (!ms) return '';
  const min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `às ${new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

function AccountSection({onEdit}: {onEdit:()=>void}) {
  const email = useCloud((c) => c.email);
  const user = useCloud((c) => c.user);
  const status = useCloud((c) => c.status);
  const error = useCloud((c) => c.error);
  const lastSync = useCloud((c) => c.lastSync);
  const tone = status === 'error' ? 'var(--red)' : status === 'synced' ? 'var(--green)' : 'var(--text-3)';

  return (
    <section className="section">
      <SectionHead title="Conta" />
      <div className="list">
        <button className="settings-row" style={{ width: '100%', textAlign: 'left' }} onClick={onEdit}>
          <span className="row grow" style={{ gap: 12 }}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" width={40} height={40} style={{ borderRadius: '50%' }} referrerPolicy="no-referrer" />
            ) : (
              <span className="avatar" style={{ width: 40, height: 40 }} aria-hidden="true">
                {(user?.fullName || email || '?').charAt(0).toUpperCase()}
              </span>
            )}
            <span className="grow">
              <span className="truncate" style={{ display: 'block', fontWeight: 600 }}>{user?.fullName || 'Complete seu cadastro'}</span>
              <span className="xs faint truncate" style={{ display: 'block' }}>
                {email}
                {user?.phone ? ` · ${user.phone}` : ''}
                {user?.provider === 'google' ? ' · Google' : ''}
              </span>
            </span>
          </span>
          <Icon name="edit" size={18} className="faint" />
        </button>
        <div className="settings-row">
          <span className="row grow" style={{ gap: 12 }}>
            <Icon name="cloud" size={20} className="faint" />
            <span className="grow">
              <span className="small" style={{ display: 'block', color: tone }}>
                {STATUS_LABEL[status]}
                {status === 'synced' && lastSync ? ` · ${timeAgo(lastSync)}` : ''}
              </span>
              {status === 'error' && error && <span className="xs faint" style={{ display: 'block' }}>{error}</span>}
            </span>
          </span>
          <button className="btn btn-sm btn-soft" onClick={() => { syncNow(); toast('Sincronizando…'); }} disabled={status === 'syncing'}>
            Sincronizar
          </button>
        </div>
        <button className="settings-row" style={{ width: '100%' }} onClick={() => confirmSignOut(true)}>
          <span>Trocar de conta</span>
          <Icon name="user" size={18} className="faint" />
        </button>
        <button className="settings-row" style={{ width: '100%', color: 'var(--red)' }} onClick={() => confirmSignOut(false)}>
          <span>Sair da conta</span>
          <Icon name="logout" size={18} />
        </button>
      </div>
    </section>
  );
}

/** Edição dos dados da conta (nome, celular, senha). */
function AccountSheet({ onClose }: { onClose: () => void }) {
  const user = useCloud((c) => c.user);
  const email = useCloud((c) => c.email);
  const [fullName, setFullName] = useState(user?.fullName ?? '');
  const [preferredName, setPreferredName] = useState(user?.preferredName ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const isEmail = user?.provider !== 'google';

  const dirty =
    fullName !== (user?.fullName ?? '') || preferredName !== (user?.preferredName ?? '') || phone !== (user?.phone ?? '') || !!password;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!supabase || !dirty || busy) return;
    if (password && password.length < 12) return setError('A senha precisa ter pelo menos 12 caracteres.');
    if (password !== confirmPw) return setError('As senhas não conferem.');
    setBusy(true);
    setError('');
    try {const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), preferred_name: preferredName.trim(), phone: phone.trim() },
      ...(password ? { password } : {}),
    });
    if(!mounted.current)return;
    if (error) return setError(error.message);
    if (preferredName.trim()) actions.updateSettings({ name: preferredName.trim() });
    toast('Dados da conta salvos');
    onClose();
    }catch{if(mounted.current)setError('Não foi possível salvar. Suas alterações continuam aqui para tentar novamente.');}
    finally{if(mounted.current)setBusy(false);}
  };

  return (
    <BottomSheet
      title="Meus dados"
      onClose={onClose}
      className="settings-sheet"
      canClose={() => !busy && (!dirty || confirm('Descartar as alterações que você não salvou?'))}
      footer={
        <>
          <button className="btn btn-secondary" disabled={busy} onClick={()=>{if(!dirty||confirm('Descartar as alterações que você não salvou?'))onClose();}}>Cancelar</button>
          <button className="btn btn-primary grow" disabled={!dirty || busy} onClick={() => submit()}>
            <Icon name="check" size={18} />
            {busy ? 'Salvando…' : 'Salvar alterações'}
          </button>
        </>
      }
    >
      <form className="stack" style={{ gap: 14 }} onSubmit={submit}>
        <label className="field">
          <span className="label">Nome completo</span>
          <input className="input" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Como quer ser chamado</span>
          <input className="input" autoComplete="nickname" value={preferredName} onChange={(e) => setPreferredName(e.target.value)} />
        </label>
        <label className="field">
          <span className="label">Celular (opcional)</span>
          <input className="input num" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
        </label>
        <label className="field">
          <span className="label">E-mail</span>
          <input className="input" value={email ?? ''} disabled />
        </label>
        {isEmail && (
          <>
            <div className="divider" style={{ margin: '4px 0' }} />
            <label className="field">
              <span className="label">Nova senha (deixe vazio para manter)</span>
              <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            {password && (
              <label className="field">
                <span className="label">Confirmar nova senha</span>
                <input className="input" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />
              </label>
            )}
          </>
        )}
        {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
      </form>
    </BottomSheet>
  );
}

function InstallSection() {
  const install = useInstall();
  if (install.installed || (!install.canPrompt && !install.ios)) return null;
  return (
    <section className="section">
      <SectionHead title="Usar como app" />
      <div className="card card-pad stack" style={{ gap: 12 }}>
        {install.canPrompt ? (
          <>
            <p className="small muted">Instale o Leve na tela inicial: abre em tela cheia, como um app, e funciona offline.</p>
            <button className="btn btn-primary" onClick={() => install.prompt()}>
              <Icon name="download" size={18} />
              Instalar app
            </button>
          </>
        ) : (
          <>
            <p className="small muted">Para usar como app no iPhone:</p>
            <ol className="small" style={{ paddingLeft: 20, display: 'grid', gap: 6 }}>
              <li>Abra este site no <b>Safari</b></li>
              <li>Toque em <Icon name="share" size={14} /> <b>Compartilhar</b></li>
              <li>Escolha <b>Adicionar à Tela de Início</b></li>
            </ol>
          </>
        )}
      </div>
    </section>
  );
}

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function GoogleCalendarSection() {
  const gcal = useGoogleCalendar();
  const [syncing, setSyncing] = useState(false);
  const [localError,setLocalError] = useState('');
  const [success,setSuccess] = useState('');
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);

  const handleConnect = async () => {
    rememberCalendarSettingsReturn();setLocalError('');setSuccess('');
    try {if(!await connectGoogleCalendar())clearCalendarSettingsReturn();}
    catch {clearCalendarSettingsReturn();if(mounted.current)setLocalError('Não foi possível iniciar a conexão. Tente novamente.');}
  };

  const handleDisconnect = async () => {
    if (confirm('Desconectar o Google Agenda? Seus eventos já criados no Google Agenda permanecerão lá.')) {
      setSyncing(true);setLocalError('');setSuccess('');
      try {await disconnectGoogleCalendar();}
      catch {if(mounted.current)setLocalError('Não foi possível confirmar a desconexão. Tente novamente.');}
      finally {if(mounted.current)setSyncing(false);}
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    setLocalError('');
    setSuccess('');
    try {
      const count=await syncAllUpcomingTasks(true,true);
      if(mounted.current&&getGoogleCalendarState().status==='synced')setSuccess(count?`${count} ${count===1?'item sincronizado':'itens sincronizados'}.`:'Nenhum item novo para sincronizar.');
    } catch {if(mounted.current)setLocalError('Não foi possível sincronizar. Verifique a conexão e tente novamente.');}
    finally {
      if(mounted.current)setSyncing(false);
    }
  };

  const tone = gcal.status === 'error' ? 'var(--red)' : gcal.connected ? 'var(--green)' : 'var(--text-3)';
  const hasError=gcal.status==='error'||!!gcal.error||!!localError;

  return (
    <section className="section">
      <p className="small muted" style={{ marginBottom: 12 }}>Envia alterações do Leve para o calendário escolhido. Eventos já existentes no Google não são importados nem descontados do tempo disponível no Leve.</p>
      <p className="small muted" style={{ marginBottom: 12 }}><strong>Integração em testes.</strong> Disponível apenas para contas autorizadas no Google. Durante os testes, a autorização pode expirar após 7 dias e exigir uma nova conexão. Você pode usar o Leve sem conectar o calendário.</p>
      <div className="list">
        {!gcal.connected ? (
          <div className="settings-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span className="row grow" style={{ gap: 12 }}>
              <GoogleLogo size={24} />
              <span className="grow">
                <span style={{ fontWeight: 600, display: 'block' }}>Conectar ao Google Agenda</span>
              </span>
            </span>
            <button
              className="btn btn-sm btn-primary"
              onClick={handleConnect}
              disabled={gcal.status === 'syncing'}
            >
              {gcal.status === 'syncing' ? 'Conectando…' : 'Conectar'}
            </button>
          </div>
        ) : (
          <>
            <div className="settings-row">
              <span className="row grow" style={{ gap: 12 }}>
                <GoogleLogo size={22} />
                <span className="grow">
                  <span style={{ fontWeight: 600, display: 'block' }}>{gcal.email || 'Conta Google'}</span>
                  <span className="xs" style={{ display: 'block', color: tone }}>
                    {gcal.status === 'syncing' || syncing
                      ? 'Sincronizando…'
                      : gcal.status === 'error'
                      ? 'Requer atenção'
                      : `Conectado${gcal.lastSync ? ` · ${timeAgo(gcal.lastSync)}` : ''}`}
                  </span>
                </span>
              </span>
              <button
                className="btn btn-sm btn-soft"
                onClick={handleManualSync}
                disabled={gcal.status === 'syncing' || syncing}
              >
                Sincronizar
              </button>
            </div>

            <div className="settings-row">
              <span>
                Sincronização automática
                <span className="xs faint" style={{ display: 'block' }}>
                  Atualiza o Google Agenda sempre que criar ou editar algo
                </span>
              </span>
              <Switch
                checked={gcal.autoSync}
                onChange={toggleGoogleAutoSync}
                label="Sincronização automática"
              />
            </div>

            {gcal.calendars.length > 1 && (
              <label className="settings-row" style={{ flexWrap: 'wrap' }}>
                <span>
                  Destino de novos itens
                  <span className="xs faint" style={{ display: 'block' }}>Itens já vinculados continuam no calendário original; não serão movidos nem excluídos.</span>
                </span>
                <select
                  className="input"
                  style={{ minWidth: 160 }}
                  value={gcal.calendarId}
                  onChange={(e) => setGoogleTargetCalendar(e.target.value)}
                >
                  {gcal.calendars.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.summary} {c.primary ? '(Principal)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <button
              className="settings-row"
              style={{ width: '100%', color: 'var(--red)' }}
              onClick={handleDisconnect}
              disabled={gcal.status === 'syncing' || syncing}
            >
              <span>Desconectar Google Agenda</span>
              <Icon name="logout" size={18} />
            </button>
          </>
        )}
      </div>
      {hasError && (
        <p className="xs" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>
          {gcal.error||localError||'Não foi possível confirmar a sincronização. Tente novamente ou reconecte sua agenda.'}
        </p>
      )}
      {hasError&&gcal.connected&&<button className="btn btn-soft" disabled={gcal.status==='syncing'||syncing} onClick={handleConnect}>Reconectar Google Agenda</button>}
      {!hasError&&success&&<p className="small" role="status">{success}</p>}
    </section>
  );
}

