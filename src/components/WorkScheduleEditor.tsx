import { useState } from 'react';
import { WEEKDAYS_LONG, WEEKDAYS_SHORT } from '../domain/dates';
import { isSettings } from '../domain/validation';
import { actions, useStore } from '../store/store';
import { Disclosure } from './Disclosure';
import { Switch } from './ui';
import { BottomSheet } from './BottomSheet';
import { toast } from '../store/ui';

export function WorkScheduleEditor({onClose}: {onClose?: () => void} = {}) {
  const saved = useStore(s => s.settings.workSchedule);
  const [initial,setInitial] = useState(saved);
  const [draft, setDraft] = useState(saved ?? {enabled:false,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00'});
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState('');
  const value = editing ? draft : saved ?? draft;
  const change = (patch: Partial<typeof draft>) => { if(!editing)setInitial(saved);setDraft({...value,...patch}); setEditing(true); setMessage(''); };
  const summary = saved?.enabled ? `${[1,2,3,4,5,6,0].filter(d => saved.weekdays.includes(d)).map(d => WEEKDAYS_SHORT[d]).join(', ')} · ${saved.start}–${saved.end}` : 'Sem restrição profissional';
  const canClose = () => !editing || confirm('Descartar as alterações do expediente?');
  const save = () => {
    if (!isSettings({workSchedule:value})) { setMessage('Escolha pelo menos um dia e um fim posterior ao início, no mesmo dia.'); return; }
    if (editing && saved !== initial) { setMessage('O expediente mudou em outra sessão. Feche e abra novamente antes de salvar.'); return; }
    actions.updateSettings({workSchedule:value}); setEditing(false); setMessage('Expediente salvo. Suas tarefas continuam nos horários escolhidos.');
    if (onClose) { toast('Expediente salvo'); onClose(); }
  };
  const footer = <><button type="button" className="btn btn-secondary" onClick={() => {if(canClose()) onClose?.();}}>Cancelar</button><button type="button" className="btn btn-primary grow" disabled={!editing} onClick={save}>Salvar expediente</button></>;
  const fields = <>
    <div className="settings-row"><span>Respeitar expediente nas sugestões</span><Switch label="Respeitar expediente nas sugestões" checked={value.enabled} onChange={enabled => change({enabled})} /></div>
    <p className="xs muted">Só para a categoria Trabalho. Horários já salvos não mudam.</p>
    <div className="chips" role="group" aria-label="Dias de trabalho" style={{margin:'12px 0'}}>
      {[1,2,3,4,5,6,0].map(day => <button type="button" className={`chip${value.weekdays.includes(day) ? ' on' : ''}`} key={day} aria-label={WEEKDAYS_LONG[day]} aria-pressed={value.weekdays.includes(day)} onClick={() => change({weekdays:value.weekdays.includes(day) ? value.weekdays.filter(d => d !== day) : [...value.weekdays,day]})}>{WEEKDAYS_SHORT[day]}</button>)}
    </div>
    <div className="row" style={{gap:12,flexWrap:'wrap'}}>
      <label className="field">Início do expediente<input type="time" className="input" value={value.start} onChange={e => change({start:e.target.value})} /></label>
      <label className="field">Fim do expediente<input type="time" className="input" value={value.end} onChange={e => change({end:e.target.value})} /></label>
    </div>
    {!onClose && <button type="button" className="btn btn-soft" style={{marginTop:12}} disabled={!editing} onClick={save}>Salvar expediente</button>}
    {message && <p className="small" role="status">{message}</p>}
  </>;
  return onClose ? <BottomSheet title="Horário de trabalho" onClose={onClose} canClose={canClose} className="settings-sheet" footer={footer}>{fields}</BottomSheet> :
    <Disclosure icon="clock" title={<><span>Horário de trabalho</span><span className="xs faint" style={{display:'block'}}>{summary}</span></>}>{fields}</Disclosure>;
}
