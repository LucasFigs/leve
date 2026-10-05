import { useEffect, useState, type FormEvent } from 'react';
import { authProviders, endRecovery, signInWithGoogle, supabase, useCloud } from '../store/sync';
import { formatPhone } from '../domain/phone';
import { Icon } from '../components/Icon';

type Mode = 'signin' | 'signup' | 'forgot';

const TRANSLATE: [RegExp, string][] = [
  [/invalid login credentials/i, 'E-mail ou senha incorretos.'],
  [/email not confirmed/i, 'Confirme seu e-mail antes de entrar (veja sua caixa de entrada).'],
  [/user already registered/i, 'Já existe uma conta com esse e-mail. Tente entrar.'],
  [/password should be at least/i, 'A senha precisa ter pelo menos 6 caracteres.'],
  [/rate limit|too many/i, 'Muitas tentativas. Aguarde um pouco e tente de novo.'],
  [/provider is not enabled/i, 'Login com Google ainda não está ativado.'],
  [/failed to fetch|network/i, 'Sem conexão. Verifique a internet.'],
];
const translate = (msg: string) => TRANSLATE.find(([re]) => re.test(msg))?.[1] ?? msg;

/** 0–4: tamanho, números, maiúsculas e símbolos */
function passwordStrength(pw: string) {
  if (!pw) return 0;
  let score = pw.length >= 8 ? 1 : 0;
  if (/\d/.test(pw)) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return pw.length < 6 ? 0 : Math.max(1, score);
}
const STRENGTH = ['Muito curta', 'Fraca', 'Razoável', 'Boa', 'Forte'];

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Login() {
  const recovery = useCloud((c) => c.recovery);
  const [mode, setMode] = useState<Mode>('signin');
  const [fullName, setFullName] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [nickTouched, setNickTouched] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [google, setGoogle] = useState(() => {
    try {
      return localStorage.getItem('leve:google') === '1';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    authProviders().then((p) => {
      setGoogle(p.google);
      try {
        localStorage.setItem('leve:google', p.google ? '1' : '0');
      } catch {
        /* noop */
      }
    });
  }, []);

  const run = async (e: FormEvent | undefined, fn: () => Promise<string | void>) => {
    e?.preventDefault();
    if (!supabase || busy) return;
    setBusy(true);
    setError('');
    setInfo('');
    try {
      const msg = await fn();
      if (msg) setInfo(msg);
    } catch (err) {
      setError(translate((err as Error).message ?? String(err)));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) =>
    run(e, async () => {
      const auth = supabase!.auth;
      if (mode === 'signin') {
        const { error } = await auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
      } else if (mode === 'signup') {
        if (fullName.trim().split(/\s+/).length < 2) throw new Error('Informe seu nome completo (nome e sobrenome).');
        if (password !== confirmPw) throw new Error('As senhas não conferem.');
        if (phone && phone.replace(/\D/g, '').length < 10) throw new Error('Celular incompleto — use DDD + número, ou deixe em branco.');
        const { data, error } = await auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              preferred_name: (preferredName || fullName.split(' ')[0]).trim(),
              phone: phone.trim(),
            },
          },
        });
        if (error) throw error;
        if (!data.session) return 'Conta criada! Enviamos um link de confirmação para o seu e-mail. Depois é só entrar.';
      } else {
        const { error } = await auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (error) throw error;
        return 'Se existir uma conta com esse e-mail, enviamos um link para criar uma nova senha.';
      }
    });

  const saveNewPassword = (e: FormEvent) =>
    run(e, async () => {
      if (password !== confirmPw) throw new Error('As senhas não conferem.');
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      endRecovery();
    });

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setInfo('');
  };

  if (recovery) {
    return (
      <main className="onboarding">
        <form className="ob-slide" onSubmit={saveNewPassword}>
          <div className="ob-art">
            <Icon name="leaf" size={40} stroke={1.6} />
          </div>
          <h1 className="ob-title">Nova senha</h1>
          <p className="ob-text">Escolha uma senha nova para a sua conta.</p>
          <div className="stack" style={{ marginTop: 20 }}>
            <input className="input" type="password" autoComplete="new-password" placeholder="Nova senha (mín. 6 caracteres)" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus aria-label="Nova senha" />
            <input className="input" type="password" autoComplete="new-password" placeholder="Confirme a nova senha" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} minLength={6} required aria-label="Confirmar nova senha" />
            {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
            <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
              {busy ? 'Salvando…' : 'Salvar senha'}
            </button>
          </div>
        </form>
      </main>
    );
  }

  const titles: Record<Mode, [string, string]> = {
    signin: ['Bem-vindo de volta.', 'Entre para ver suas tarefas em qualquer aparelho.'],
    signup: ['Crie sua conta.', 'Seus dados ficam salvos na nuvem e sincronizam entre celular e computador.'],
    forgot: ['Esqueceu a senha?', 'Informe seu e-mail e enviamos um link para criar outra.'],
  };
  const strength = passwordStrength(password);

  return (
    <main className="onboarding">
      <div className="ob-slide" key={mode} style={{ justifyContent: mode === 'signup' ? 'flex-start' : undefined, paddingTop: mode === 'signup' ? 8 : 0 }}>
        {mode !== 'signup' && (
          <div className="ob-art">
            <Icon name="leaf" size={40} stroke={1.6} />
          </div>
        )}
        <h1 className="ob-title">{titles[mode][0]}</h1>
        <p className="ob-text">{titles[mode][1]}</p>

        <form className="stack" style={{ marginTop: 24, gap: 12 }} onSubmit={submit}>
          {mode === 'signup' && (
            <>
              <label className="field">
                <span className="label">Nome completo</span>
                <input
                  className="input"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => {
                    setFullName(e.target.value);
                    if (!nickTouched) setPreferredName(e.target.value.trim().split(/\s+/)[0] ?? '');
                  }}
                  required
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="label">Como quer ser chamado</span>
                <input className="input" autoComplete="nickname" value={preferredName} onChange={(e) => { setPreferredName(e.target.value); setNickTouched(true); }} />
              </label>
              <label className="field">
                <span className="label">Celular (opcional)</span>
                <input className="input num" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" value={phone} onChange={(e) => setPhone(formatPhone(e.target.value))} />
              </label>
            </>
          )}
          <label className="field">
            <span className="label">E-mail</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus={mode !== 'signup'} aria-label="E-mail" />
          </label>
          {mode !== 'forgot' && (
            <label className="field">
              <span className="row" style={{ justifyContent: 'space-between' }}>
                <span className="label">Senha</span>
                {mode === 'signin' && (
                  <button type="button" className="link-btn" onClick={() => switchMode('forgot')}>
                    Esqueci a senha
                  </button>
                )}
              </span>
              <input
                className="input"
                type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                placeholder={mode === 'signup' ? 'Mínimo 6 caracteres' : ''}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                aria-label="Senha"
              />
              {mode === 'signup' && password && (
                <span className="pw-meter" data-level={strength}>
                  <i /><i /><i /><i />
                  <span className="xs">{STRENGTH[strength]}</span>
                </span>
              )}
            </label>
          )}
          {mode === 'signup' && (
            <label className="field">
              <span className="label">Confirmar senha</span>
              <input className="input" type="password" autoComplete="new-password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} minLength={6} required aria-label="Confirmar senha" />
              {confirmPw && confirmPw !== password && <span className="xs" style={{ color: 'var(--red)' }}>As senhas não conferem</span>}
            </label>
          )}
          {error && <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>}
          {info && <p className="small" role="status" style={{ color: 'var(--green)' }}>{info}</p>}
          <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
            {busy ? 'Aguarde…' : mode === 'signin' ? 'Entrar' : mode === 'signup' ? 'Criar conta' : 'Enviar link'}
          </button>
          {mode === 'forgot' && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => switchMode('signin')}>
              <Icon name="chevron-left" size={16} />
              Voltar para o login
            </button>
          )}
        </form>

        {google && mode !== 'forgot' && (
          <div className="stack" style={{ marginTop: 16, gap: 16 }}>
            <div className="or-divider"><span>ou</span></div>
            <button type="button" className="btn btn-secondary btn-lg btn-block" disabled={busy} onClick={() => run(undefined, signInWithGoogle)}>
              <GoogleLogo />
              {mode === 'signup' ? 'Cadastrar com Google' : 'Entrar com Google'}
            </button>
          </div>
        )}
      </div>

      <div className="stack" style={{ marginTop: 16 }}>
        {mode === 'signin' ? (
          <button className="btn btn-ghost btn-block" onClick={() => switchMode('signup')}>
            Não tem conta? <b>Criar conta</b>
          </button>
        ) : (
          <button className="btn btn-ghost btn-block" onClick={() => switchMode('signin')}>
            Já tem conta? <b>Entrar</b>
          </button>
        )}
      </div>
    </main>
  );
}

export function Splash({ text = 'Carregando suas tarefas…' }: { text?: string }) {
  return (
    <main className="onboarding" style={{ justifyContent: 'center', alignItems: 'center', textAlign: 'center' }} aria-busy="true">
      <div className="ob-art splash-art">
        <Icon name="leaf" size={40} stroke={1.6} />
      </div>
      <p className="ob-text">{text}</p>
    </main>
  );
}
