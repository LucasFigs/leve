import { useState } from 'react';
import { actions, useStore } from '../store/store';
import { useCloud } from '../store/sync';
import { Icon } from '../components/Icon';
import { timeToMin } from '../domain/dates';

export function Onboarding() {
  const settings = useStore(s => s.settings);
  const cloudName = useCloud(c => c.user?.preferredName);
  const [name, setName] = useState(settings.name || cloudName || '');
  const [capture, setCapture] = useState('');
  const [start, setStart] = useState(settings.dayStart);
  const [end, setEnd] = useState(settings.dayEnd);
  const [error, setError] = useState('');
  return <main className="onboarding">
    <form className="ob-slide onboarding-start" onSubmit={event => {
      event.preventDefault();
      if (!start || !end || timeToMin(start) >= timeToMin(end)) { setError('O fim do período precisa ser posterior ao começo, no mesmo dia.'); return; }
      actions.updateSettings({ dayStart: start, dayEnd: end });
      if (capture.trim()) actions.capture(capture);
      actions.finishOnboarding(name);
    }}>
      <div className="ob-art"><Icon name="leaf" size={40} stroke={1.6} /></div>
      <h1 className="ob-title">Um próximo passo para o seu dia.</h1>
      <p className="ob-text">Capture uma pendência. Depois você escolhe quando fazer e pode começar com um toque.</p>
      <label className="field">Como quer ser chamado? (opcional)
        <input className="input" value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" />
      </label>
      <label className="field">O que está na sua cabeça? (opcional)
        <input className="input" placeholder="Ex.: enviar relatório amanhã às 14h" value={capture} onChange={e => setCapture(e.target.value)} />
      </label>
      <details className="secondary-panel">
        <summary>Período para planejar: {start}–{end}</summary>
        <p className="small muted">Ajuste quando você pode fazer suas tarefas. Você pode mudar isso depois no planejamento ou no Perfil.</p>
        <div className="row" style={{ gap: 12, marginTop: 12 }}>
          <label className="field">Começo<input type="time" className="input" value={start} onChange={e => setStart(e.target.value)} /></label>
          <label className="field">Fim<input type="time" className="input" value={end} onChange={e => setEnd(e.target.value)} /></label>
        </div>
      </details>
      <p className="small muted">O plano considera os itens do Leve. Compromissos existentes no Google Agenda não são importados.</p>
      {error && <p role="alert">{error}</p>}
      <button className="btn btn-primary btn-lg btn-block" type="submit">{capture.trim() ? 'Guardar e abrir meu dia' : 'Abrir meu dia'}</button>
    </form>
  </main>;
}
