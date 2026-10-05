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
