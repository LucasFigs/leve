import { useState } from 'react';
import { actions, useStore } from '../store/store';
import { periodError } from '../domain/context';
import { Disclosure } from './Disclosure';

export function AvailabilityEditor() {
  const settings = useStore(s => s.settings);
  const [draft, setDraft] = useState<{start:string;end:string}>();
  const start = draft?.start ?? settings.dayStart;
  const end = draft?.end ?? settings.dayEnd;
  const [message, setMessage] = useState('');
  return <Disclosure icon="clock" title={`Período para planejar: ${settings.dayStart}–${settings.dayEnd}`}>
    <p className="small muted">Escolha quando você pode realizar suas tarefas. Pausas e itens registrados no Leve são descontados desse período.</p>
    <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginTop: 12 }}>
      <label className="field">Começo<input type="time" className="input" value={start} onChange={e => { setDraft({start:e.target.value,end}); setMessage(''); }} /></label>
      <label className="field">Fim<input type="time" className="input" value={end} onChange={e => { setDraft({start,end:e.target.value}); setMessage(''); }} /></label>
      <button type="button" className="btn btn-soft" onClick={() => {
        const error = periodError(start,end);
        if (error) { setMessage(error); return; }
        actions.updateSettings({ dayStart: start, dayEnd: end });
        setDraft(undefined);
        setMessage('Período atualizado. O plano foi recalculado.');
      }}>Atualizar período</button>
    </div>
    <p className="small" role="status">{message}</p>
  </Disclosure>;
}
