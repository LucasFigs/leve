import { useState, type FormEvent } from 'react';
import { formatDuration, minToTime, timeToMin } from '../domain/dates';
import type { Settings } from '../domain/types';
import { actions, useStore } from '../store/store';
import { goTo, toast } from '../store/ui';
import { cloudEnabled, confirmSignOut, supabase, syncNow, useCloud, type SyncStatus } from '../store/sync';
import { useInstall } from '../hooks/install';
import { BottomSheet } from '../components/BottomSheet';
import { Segmented, SectionHead, Switch } from '../components/ui';
import { Icon } from '../components/Icon';
import { UserAvatar } from '../components/UserAvatar';
import { formatPhone } from '../domain/phone';
import { reminderPermission, requestReminderPermission } from '../services/reminders';
import { disablePush, enablePush, pushConfigured } from '../services/push';
import {
  connectGoogleCalendar,
  disconnectGoogleCalendar,
  setGoogleTargetCalendar,
  syncAllUpcomingTasks,
  toggleGoogleAutoSync,
  useGoogleCalendar,
} from '../services/googleCalendar';

const LUNCH_DURATIONS = [30, 45, 60, 90, 120];

function settingsError(s: Settings): string | undefined {
  if (timeToMin(s.dayEnd) <= timeToMin(s.dayStart)) return 'O fim do dia precisa ser depois do começo.';
  if (s.protectLunch && timeToMin(s.lunchEnd) <= timeToMin(s.lunchStart)) return 'O fim do almoço precisa ser depois do início.';
  return undefined;
}

export function ProfileScreen() {
  const settings = useStore((s) => s.settings);
  // Preferências valem na hora (o efeito é visível); só tarefas pedem confirmação.
  const set = (patch: Partial<Settings>) => actions.updateSettings(patch);
  const error = settingsError(settings);
  const lunchMin = timeToMin(settings.lunchEnd) - timeToMin(settings.lunchStart);
  const demoCount = useStore((s) => s.tasks.filter((t) => t.id.startsWith('demo-')).length + s.projects.filter((p) => p.id.startsWith('demo-')).length);


  return (
    <div className="screen">
      <div className="topbar" style={{ justifyContent: 'flex-start', gap: 4 }}>
        <button className="icon-btn mobile-only" onClick={() => goTo('today')} aria-label="Voltar">
          <Icon name="chevron-left" />
        </button>
        <h1 className="page-title">Perfil</h1>
      </div>

      <div className="card card-pad row" style={{ gap: 14 }}>
        <UserAvatar size={52} />
        <div className="grow field">
          <label className="label" htmlFor="name">Como posso te chamar?</label>
          <input id="name" className="input-plain" style={{ fontSize: '1.125rem', fontWeight: 600 }} placeholder="Seu nome" value={settings.name} onChange={(e) => set({ name: e.target.value })} />
        </div>
      </div>

      {cloudEnabled && <AccountSection />}
      <GoogleCalendarSection />
      <InstallSection />

      <section className="section">
        <SectionHead title="Aparência" />
        <Segmented<Settings['theme']>
          label="Tema"
          value={settings.theme}
          onChange={(theme) => set({ theme })}
          options={[
            { value: 'system', label: 'Automático' },
            { value: 'light', label: <><Icon name="sun" size={16} />Claro</> },
            { value: 'dark', label: <><Icon name="moon" size={16} />Escuro</> },
          ]}
        />
      </section>

      <section className="section">
        <SectionHead title="Seu dia" />
        <div className="list">
          <label className="settings-row">
            <span>Começa às</span>
            <input type="time" className="num" value={settings.dayStart} onChange={(e) => e.target.value && set({ dayStart: e.target.value })} />
          </label>
          <label className="settings-row">
            <span>Termina às</span>
            <input type="time" className="num" value={settings.dayEnd} onChange={(e) => e.target.value && set({ dayEnd: e.target.value })} />
          </label>
          <div className="settings-row">
            <span>
              Proteger horário de almoço
              <span className="xs faint" style={{ display: 'block' }}>
                {settings.protectLunch
                  ? `${settings.lunchStart}–${settings.lunchEnd} fica livre no planejamento (${formatDuration(Math.max(0, lunchMin))})`
                  : 'Desligado: o almoço pode receber tarefas'}
              </span>
            </span>
            <Switch checked={settings.protectLunch} onChange={(v) => set({ protectLunch: v })} label="Proteger horário de almoço" />
          </div>
          {settings.protectLunch && (
            <>
              <label className="settings-row">
                <span>Almoço começa às</span>
                <input
                  type="time"
                  className="num"
                  value={settings.lunchStart}
                  onChange={(e) => e.target.value && set({ lunchStart: e.target.value, lunchEnd: minToTime(timeToMin(e.target.value) + lunchMin) })}
                />
              </label>
              <div className="settings-row" style={{ flexWrap: 'wrap' }}>
                <span>Duração do almoço</span>
                <div className="chips">
                  {LUNCH_DURATIONS.map((m) => (
                    <button
                      key={m}
                      className={`chip num${lunchMin === m ? ' on' : ''}`}
                      aria-pressed={lunchMin === m}
                      onClick={() => set({ lunchEnd: minToTime(timeToMin(settings.lunchStart) + m) })}
                    >
                      {formatDuration(m)}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
          <div className="settings-row" style={{ flexWrap: 'wrap' }}>
            <span>
              Duração padrão das tarefas
              <span className="xs faint" style={{ display: 'block' }}>Usada quando você não informa quanto tempo leva</span>
            </span>
            <div className="chips">
              {[15, 30, 45, 60].map((m) => (
                <button key={m} className={`chip${settings.defaultDuration === m ? ' on' : ''}`} onClick={() => set({ defaultDuration: m })}>
                  {formatDuration(m)}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {error && (
        <p className="small" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>
          {error}
        </p>
      )}

      <section className="section">
        <SectionHead title="Assistente" />
        <div className="list">
          <div className="settings-row">
            <span>
              Sugestões inteligentes
              <span className="xs faint" style={{ display: 'block' }}>Avisos de tempo livre, tarefas adiadas e capturas</span>
            </span>
            <Switch checked={settings.nudges} onChange={(v) => set({ nudges: v })} label="Sugestões inteligentes" />
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead title="Lembretes" />
        <div className="list">
          <div className="settings-row">
            <span>
              Avisar antes do horário
              <span className="xs faint" style={{ display: 'block' }}>Notificação de tarefas e compromissos com hora marcada</span>
            </span>
            <Switch
              checked={!!settings.reminders && reminderPermission() === 'granted'}
              label="Avisar antes do horário"
              onChange={async (v) => {
                if (!v) {
                  set({ reminders: false });
                  disablePush();
                  return;
                }
                if (await requestReminderPermission()) {
                  set({ reminders: true });
                  const push = await enablePush();
                  toast(
                    push === 'ok'
                      ? 'Lembretes ligados — chegam mesmo com o app fechado'
                      : push === 'error'
                        ? 'Lembretes ligados, mas não consegui registrar este aparelho para avisos com o app fechado. Tente de novo com internet.'
                        : 'Lembretes ligados neste aparelho',
                  );
                } else {
                  toast(
                    reminderPermission() === 'unsupported'
                      ? 'Este navegador não permite notificações. No iPhone, instale o app na tela inicial primeiro.'
                      : 'As notificações estão bloqueadas. Libere nas configurações do navegador ou do app.',
                  );
                }
              }}
            />
          </div>
          {settings.reminders && reminderPermission() === 'granted' && (
            <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
              <span>Quanto tempo antes</span>
              <div className="chips">
                {[5, 10, 15, 30, 60].map((m) => (
                  <button key={m} className={`chip${(settings.reminderLead ?? 10) === m ? ' on' : ''}`} aria-pressed={(settings.reminderLead ?? 10) === m} onClick={() => set({ reminderLead: m })}>
                    {formatDuration(m)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <p className="xs faint" style={{ marginTop: 8 }}>
          {pushConfigured
            ? 'Os avisos chegam mesmo com o app fechado. Ligue em cada aparelho em que quiser receber. No iPhone, o app precisa estar instalado na tela inicial.'
            : 'Os avisos chegam enquanto o app está aberto ou em segundo plano há pouco tempo. Com o app totalmente fechado, o celular não deixa avisar.'}
        </p>
      </section>

      <section className="section">
        <SectionHead title="Dados" />
        <div className="list">
          {demoCount > 0 && (
            <button
              className="settings-row"
              style={{ width: '100%', textAlign: 'left' }}
              onClick={() => {
                if (!confirm(`Remover os ${demoCount} itens de exemplo? Suas tarefas e projetos continuam intactos.`)) return;
                const n = actions.removeDemo();
                toast(`${n} itens de exemplo removidos`, { label: 'Desfazer', run: () => actions.undo() });
              }}
            >
              <span>
                Remover dados de exemplo
                <span className="xs faint" style={{ display: 'block' }}>{demoCount} itens de exemplo · os seus continuam</span>
              </span>
              <Icon name="trash" size={18} className="faint" />
            </button>
          )}
          <button className="settings-row" style={{ width: '100%' }} onClick={() => actions.updateSettings({ onboarded: false })}>
            <span>Ver introdução novamente</span>
            <Icon name="chevron-right" size={18} className="faint" />
          </button>
          <button
            className="settings-row"
            style={{ width: '100%', color: 'var(--red)' }}
            onClick={() => {
              const msg = cloudEnabled
                ? 'Apagar todas as tarefas, projetos e preferências da sua conta? Isso vale para todos os aparelhos.'
                : 'Apagar todas as tarefas, projetos e preferências deste aparelho?';
              if (confirm(msg)) actions.reset();
            }}
          >
            <span>Apagar tudo</span>
            <Icon name="trash" size={18} />
          </button>
        </div>
        <p className="xs faint" style={{ marginTop: 12, textAlign: 'center' }}>
          {cloudEnabled
            ? 'Seus dados ficam na sua conta e neste aparelho. Sem internet, tudo continua funcionando e sincroniza quando a conexão voltar.'
            : 'Seus dados ficam salvos neste aparelho e funcionam offline.'}
        </p>
        <p className="xs faint" style={{ marginTop: 8, textAlign: 'center' }}>
          <a href="/privacidade.html" target="_blank" rel="noopener" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
            Privacidade
          </a>
          {' · '}
          <a href="/termos.html" target="_blank" rel="noopener" style={{ color: 'var(--text-3)', textDecoration: 'none' }}>
            Termos de Uso
          </a>
        </p>
      </section>

    </div>
  );
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

function AccountSection() {
  const email = useCloud((c) => c.email);
  const user = useCloud((c) => c.user);
  const status = useCloud((c) => c.status);
  const error = useCloud((c) => c.error);
  const lastSync = useCloud((c) => c.lastSync);
  const [editing, setEditing] = useState(false);
  const tone = status === 'error' ? 'var(--red)' : status === 'synced' ? 'var(--green)' : 'var(--text-3)';

  return (
    <section className="section">
      <SectionHead title="Conta" />
      <div className="list">
        <button className="settings-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => setEditing(true)}>
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
      {editing && <AccountSheet onClose={() => setEditing(false)} />}
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
  const isEmail = user?.provider !== 'google';

  const dirty =
    fullName !== (user?.fullName ?? '') || preferredName !== (user?.preferredName ?? '') || phone !== (user?.phone ?? '') || !!password;

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!supabase || !dirty || busy) return;
    if (password && password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.');
    if (password !== confirmPw) return setError('As senhas não conferem.');
    setBusy(true);
    setError('');
    const { error } = await supabase.auth.updateUser({
      data: { full_name: fullName.trim(), preferred_name: preferredName.trim(), phone: phone.trim() },
      ...(password ? { password } : {}),
    });
    setBusy(false);
    if (error) return setError(error.message);
    if (preferredName.trim()) actions.updateSettings({ name: preferredName.trim() });
    toast('Dados da conta salvos');
    onClose();
  };

  return (
    <BottomSheet
      title="Meus dados"
      onClose={onClose}
      canClose={() => !dirty || confirm('Descartar as alterações que você não salvou?')}
      footer={
        <>
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
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

  const handleConnect = async () => {
    const ok = await connectGoogleCalendar();
    if (!ok && gcal.error) {
      toast(gcal.error);
    }
  };

  const handleDisconnect = () => {
    if (confirm('Desconectar o Google Agenda? Seus eventos já criados no Google Agenda permanecerão lá.')) {
      disconnectGoogleCalendar();
    }
  };

  const handleManualSync = async () => {
    setSyncing(true);
    try {
      await syncAllUpcomingTasks(true);
    } finally {
      setSyncing(false);
    }
  };

  const tone = gcal.status === 'error' ? 'var(--red)' : gcal.connected ? 'var(--green)' : 'var(--text-3)';

  return (
    <section className="section">
      <SectionHead title="Google Agenda" />
      <div className="list">
        {!gcal.connected ? (
          <div className="settings-row" style={{ flexWrap: 'wrap', gap: 12 }}>
            <span className="row grow" style={{ gap: 12 }}>
              <GoogleLogo size={24} />
              <span className="grow">
                <span style={{ fontWeight: 600, display: 'block' }}>Conectar ao Google Agenda</span>
                <span className="xs faint" style={{ display: 'block' }}>
                  Tarefas e compromissos criados e editados sobem direto para a sua agenda Google
                </span>
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
                      ? gcal.error || 'Erro na sincronização'
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
                  Calendário de destino
                  <span className="xs faint" style={{ display: 'block' }}>Onde os eventos serão criados</span>
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
            >
              <span>Desconectar Google Agenda</span>
              <Icon name="logout" size={18} />
            </button>
          </>
        )}
      </div>
      {gcal.error && (
        <p className="xs" role="alert" style={{ color: 'var(--red)', marginTop: 8 }}>
          {gcal.error}
        </p>
      )}
    </section>
  );
}

