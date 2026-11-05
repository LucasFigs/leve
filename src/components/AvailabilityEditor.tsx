import { useState } from 'react';
import { actions, useStore } from '../store/store';
import { timeToMin } from '../domain/dates';
import { Disclosure } from './Disclosure';

export function AvailabilityEditor() {
  const settings = useStore(s => s.settings);
  const [start, setStart] = useState(settings.dayStart);
  const [end, setEnd] = useState(settings.dayEnd);
  const [message, setMessage] = useState('');
  return <Disclosure icon="clock" title={`Período para planejar: ${settings.dayStart}–${settings.dayEnd}`}>
    <p className="small muted">Escolha quando você pode realizar suas tarefas. Pausas e itens registrados no Leve são descontados desse período.</p>
    <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
      <label className="field">Começo<input type="time" className="input" value={start} onChange={e => { setStart(e.target.value); setMessage(''); }} /></label>
      <label className="field">Fim<input type="time" className="input" value={end} onChange={e => { setEnd(e.target.value); setMessage(''); }} /></label>
      <button type="button" className="btn btn-soft" onClick={() => {
        if (!start || !end || timeToMin(start) >= timeToMin(end)) { setMessage('Escolha um fim posterior ao começo, no mesmo dia.'); return; }
        actions.updateSettings({ dayStart: start, dayEnd: end });
        setMessage('Período atualizado. O plano foi recalculado.');
      }}>Atualizar período</button>
    </div>
    <p className="small" role="status">{message}</p>
  </Disclosure>;
}
