import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatDuration, WEEKDAYS_SHORT } from '../domain/dates';
import type { Settings } from '../domain/types';
import { actions, useStore } from '../store/store';
import { goTo, toast } from '../store/ui';
import { cloudEnabled, confirmSignOut, supabase, syncNow, useCloud, type SyncStatus } from '../store/sync';
import { useInstall } from '../hooks/install';
import { SettingsSheet as BottomSheet } from '../components/SettingsSheet';
import { Segmented, SectionHead } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { WorkScheduleEditor } from '../components/WorkScheduleEditor';
import { formatPhone } from '../domain/phone';
import { reminderPermission } from '../services/reminders';
import { useStorageIssue } from '../store/persistence';
import { LocalIdentitySheet, ReminderSettingsSheet, remindersSummary, TimeSettingsSheet } from './ProfilePreferences';
import { consumeCalendarSettingsReturn } from '../services/settingsNavigation';
import {disconnectGoogleCalendar, restoreGoogleCalendarConnection, useGoogleCalendar} from '../services/googleCalendar';

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
  const accountId=useCloud(c=>c.userId);
  const install=useInstall();
  const issue=useStorageIssue();
  const [page,setPage]=useState<SettingsPage>();
  useEffect(()=>{setPage(undefined);},[accountId]);
  const trigger=useRef<HTMLElement|null>(null);
  const open=(next:SettingsPage,element:HTMLElement)=>{trigger.current=element;setPage(next);};
  const [permission,setPermission]=useState(reminderPermission());
  useEffect(()=>{if(consumeCalendarSettingsReturn())setPage('google');},[]);
  useEffect(()=>{const refresh=()=>setPermission(reminderPermission());window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
  const close=()=>{setPage(undefined);setPermission(reminderPermission());queueMicrotask(()=>{if(trigger.current?.isConnected)trigger.current.focus({preventScroll:true});});};
  const legacy=useStore(s=>s.tasks.some(t=>!!t.googleEventId||!!t.googleCalendarId)||!!s.googleDeletions?.length);
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
      <SettingsRow title="Conta e sincronização" icon="cloud" value={cloudEnabled?`${STATUS_LABEL[status]}${email?` · ${email}`:''}`:'Dados neste aparelho · sem nuvem'} attention={status==='error'} onClick={el=>open('account',el)}/>
      <SettingsRow title="Dados e privacidade" icon="folder" value={issue?'Recuperação de dados requer atenção':'Gerenciamento, privacidade e termos'} attention={!!issue} onClick={el=>open('data',el)}/>
    </div></section>
    {!install.installed&&(install.canPrompt||install.ios)&&<button type="button" className="profile-install" onClick={e=>open('install',e.currentTarget)}><Icon name="download" size={18}/>Adicionar à tela inicial<Icon name="chevron-right" size={16}/></button>}
    {page==='identity'&&(cloudEnabled?<AccountSheet onClose={close}/>:<LocalIdentitySheet onClose={close}/>)}
    {page==='time'&&<TimeSettingsSheet onClose={close}/>}
    {page==='work'&&<WorkScheduleEditor onClose={close}/>}
    {page==='reminders'&&<ReminderSettingsSheet onClose={close}/>}
    {page&&['appearance','google','account','data','install'].includes(page)&&<BottomSheet key={page} className="settings-sheet" title={PAGE_LABEL[page]} onClose={close}>
      {page==='appearance'&&<><p className="small muted">Escolha como o Leve aparece. A mudança é aplicada na hora.</p><Segmented<Settings['theme']> label="Tema" value={settings.theme} onChange={theme=>{actions.updateSettings({theme});toast(`Tema: ${THEME_LABEL[theme]}`);}} options={[{value:'system',label:'Automático'},{value:'light',label:'Claro'},{value:'dark',label:'Escuro'}]}/></>}
      {page==='google'&&<><button className="btn btn-sm btn-ghost" onClick={()=>{setPage('data');queueMicrotask(()=>document.querySelector<HTMLButtonElement>('.settings-data [data-legacy-connections]')?.focus());}}><Icon name="chevron-left" size={16}/>Dados e privacidade</button><GoogleCalendarSection/></>}
      {page==='account'&&(cloudEnabled?<AccountSection onEdit={()=>setPage('identity')}/>:<p className="small muted">Este ambiente salva os dados somente neste aparelho. Não há uma conta conectada para sincronizar.</p>)}
      {page==='data'&&<DataSettings onClose={close} legacyConnections={gcal.connected||!!gcal.needsRevocation||legacy} onLegacy={()=>setPage('google')}/>}
      {page==='install'&&<InstallSection/>}
    </BottomSheet>}
  </div>;
}
function DataSettings({onClose,legacyConnections,onLegacy}:{onClose:()=>void;legacyConnections:boolean;onLegacy:()=>void}) {
  const count=useStore(s=>s.tasks.filter(t=>t.id.startsWith('demo-')).length+s.projects.filter(p=>p.id.startsWith('demo-')).length);
  const issue=useStorageIssue();
  return <div className="settings-data">
    {issue&&<div role="note"><p>Há dados locais que precisam de atenção. Use o aviso de recuperação para exportar as versões antes de fechar o app.</p><button className="btn btn-soft" onClick={onClose}>Ver opções de recuperação</button></div>}
    <div className="list">
      {legacyConnections&&<button className="settings-row" data-legacy-connections onClick={onLegacy}><span>Conexões antigas</span><Icon name="chevron-right" size={18}/></button>}
      {count>0&&<button className="settings-row" onClick={()=>{if(confirm(`Remover os ${count} itens de exemplo? Seus itens continuam intactos.`)){actions.removeDemo();toast('Exemplos removidos',{label:'Desfazer',run:()=>actions.undo()});}}}><span>Remover dados de exemplo</span><Icon name="trash" size={18}/></button>}
      <button className="settings-row" onClick={()=>{actions.updateSettings({onboarded:false});onClose();}}><span>Ver introdução novamente</span><Icon name="chevron-right" size={18}/></button>
      <a className="settings-row" href="/privacidade.html" target="_blank" rel="noopener">Política de privacidade<Icon name="arrow-right" size={18}/></a>
      <a className="settings-row" href="/termos.html" target="_blank" rel="noopener">Termos de uso<Icon name="arrow-right" size={18}/></a>
      <a className="settings-row" href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Gerenciar permissões na Conta Google<Icon name="arrow-right" size={18}/></a>
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
        <div className="settings-row settings-sync-row">
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

function GoogleCalendarSection() {
 const gcal=useGoogleCalendar();
 const [confirmed,setConfirmed]=useState(false);
 const disconnect=async()=>{if(!confirm('Desconectar Google Agenda? Os eventos já enviados permanecerão no Google.'))return;setConfirmed(await disconnectGoogleCalendar());};
 return <div>
  <p className="small muted">A integração com Google Agenda não faz mais parte desta versão do Leve. Seus compromissos continuam disponíveis aqui. Os eventos enviados anteriormente permanecem no Google Agenda, mas não serão mais atualizados.</p>
  <p className="small muted" style={{marginTop:12}}>Você pode administrar esses eventos diretamente no Google Agenda. Entrar com Google e sincronizar seus dados entre aparelhos Leve continuam disponíveis.</p>
  {gcal.email&&<p className="small" style={{marginTop:16,overflowWrap:'anywhere'}}>{gcal.email}</p>}
  {confirmed?<p role="status" className="small">Desconexão e revogação confirmadas.</p>:<div className="stack" style={{marginTop:16}}>
   {gcal.connected&&<button className="btn btn-secondary" disabled={gcal.status==='syncing'} onClick={disconnect}>{gcal.status==='syncing'?'Desconectando…':'Desconectar Google Agenda'}</button>}
   <button className="btn btn-ghost" disabled={gcal.status==='syncing'} onClick={()=>void restoreGoogleCalendarConnection()}>Verificar vínculo antigo</button>
  </div>}
  {gcal.error&&<p role="alert" className="small warn-text" style={{marginTop:12}}>{gcal.error}</p>}
  <p className="small" style={{marginTop:16}}><a href="https://myaccount.google.com/connections" target="_blank" rel="noopener noreferrer">Gerenciar acesso na Conta Google</a></p>
 </div>;
}

