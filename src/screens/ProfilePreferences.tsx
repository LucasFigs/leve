import { useEffect, useRef, useState } from 'react';
import type { Settings } from '../domain/types';
import { formatDuration } from '../domain/dates';
import { periodError } from '../domain/context';
import { isSettings } from '../domain/validation';
import { actions, getState, useStore } from '../store/store';
import { toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Disclosure } from '../components/Disclosure';
import { Switch } from '../components/ui';
import { reminderPermission, requestReminderPermission } from '../services/reminders';
import { disablePush, enablePush, pushConfigured } from '../services/push';

const timePreferences = (s: Settings) => ({dayStart:s.dayStart,dayEnd:s.dayEnd,protectLunch:s.protectLunch,lunchStart:s.lunchStart,lunchEnd:s.lunchEnd,defaultDuration:s.defaultDuration});

export function TimeSettingsSheet({onClose}: {onClose:()=>void}) {
  const settings = useStore(s=>s.settings);
  const [original] = useState(()=>timePreferences(settings));
  const [draft,setDraft] = useState(original);
  const [message,setMessage] = useState('');
  const dirty = JSON.stringify(original)!==JSON.stringify(draft);
  const error = periodError(draft.dayStart,draft.dayEnd) ?? (draft.protectLunch ? periodError(draft.lunchStart,draft.lunchEnd) : undefined) ?? (!isSettings(draft)?'Confira o formato dos horários antes de salvar.':undefined);
  const canClose=()=>!dirty||confirm('Descartar as alterações do seu tempo?');
  const update=(patch:Partial<typeof draft>)=>{setDraft({...draft,...patch});setMessage('');};
  return <BottomSheet title="Meu tempo" className="settings-sheet" onClose={onClose} canClose={canClose} footer={<>
    <button className="btn btn-secondary" onClick={()=>{if(canClose())onClose();}}>Cancelar</button>
    <button className="btn btn-primary grow" disabled={!dirty||!!error} onClick={()=>{
      if(JSON.stringify(timePreferences(getState().settings))!==JSON.stringify(original)){setMessage('Estas preferências mudaram em outra sessão. Feche e abra novamente antes de salvar.');return;}
      actions.updateSettings(draft);toast('Seu tempo foi atualizado');onClose();
    }}>Salvar alterações</button>
  </>}>
    <p className="small muted">Seu período geral para atividades. O expediente de Trabalho é configurado à parte.</p>
    <div className="settings-form-grid">
      <label className="field">Começo do período<input className="input" type="time" value={draft.dayStart} onChange={e=>update({dayStart:e.target.value})}/></label>
      <label className="field">Fim do período<input className="input" type="time" value={draft.dayEnd} onChange={e=>update({dayEnd:e.target.value})}/></label>
    </div>
    <div className="settings-row"><span>Proteger almoço</span><Switch label="Proteger almoço" checked={draft.protectLunch} onChange={protectLunch=>update({protectLunch})}/></div>
    {draft.protectLunch&&<div className="settings-form-grid">
      <label className="field">Início do almoço<input className="input" type="time" value={draft.lunchStart} onChange={e=>update({lunchStart:e.target.value})}/></label>
      <label className="field">Fim do almoço<input className="input" type="time" value={draft.lunchEnd} onChange={e=>update({lunchEnd:e.target.value})}/></label>
    </div>}
    <fieldset className="settings-options"><legend>Duração padrão das tarefas</legend><p className="xs muted">Quando você não informa a duração.</p><div className="chips">
      {[15,30,45,60].map(duration=><button type="button" className={`chip${draft.defaultDuration===duration?' on':''}`} aria-pressed={draft.defaultDuration===duration} key={duration} onClick={()=>update({defaultDuration:duration})}>{formatDuration(duration)}</button>)}
    </div></fieldset>
    {(error||message)&&<p className="small warn-text" role="alert">{message||error}</p>}
  </BottomSheet>;
}

export function LocalIdentitySheet({onClose}:{onClose:()=>void}) {
  const saved=useStore(s=>s.settings.name);
  const [name,setName]=useState(saved);
  const dirty=name!==saved;
  const canClose=()=>!dirty||confirm('Descartar a alteração do nome?');
  return <BottomSheet title="Meu perfil" className="settings-sheet" onClose={onClose} canClose={canClose} footer={<>
    <button className="btn btn-secondary" onClick={()=>{if(canClose())onClose();}}>Cancelar</button>
    <button className="btn btn-primary grow" disabled={!dirty} onClick={()=>{actions.updateSettings({name:name.trim()});toast('Nome atualizado');onClose();}}>Salvar alterações</button>
  </>}><label className="field">Como quer ser chamado<input className="input" value={name} maxLength={1000} autoComplete="nickname" onChange={e=>setName(e.target.value)}/></label></BottomSheet>;
}

export function remindersSummary(enabled:boolean|undefined, permission=reminderPermission()) {
  if(!enabled)return 'Desativados';
  if(permission==='denied')return 'Permissão bloqueada neste aparelho';
  if(permission==='unsupported')return 'Indisponíveis neste navegador';
  return permission==='granted'?'Ativados neste aparelho':'Permissão necessária';
}

export function ReminderSettingsSheet({onClose}:{onClose:()=>void}) {
  const settings=useStore(s=>s.settings);
  const [permission,setPermission]=useState(reminderPermission());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const alive=useRef(true);
  useEffect(()=>{
    alive.current=true;
    const refresh=()=>setPermission(reminderPermission());
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',refresh);
    return()=>{alive.current=false;window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',refresh);};
  },[]);
  const toggle=async(enabled:boolean)=>{
    if(busy)return;
    setBusy(true);setMessage('');
    try {
      if(!enabled){actions.updateSettings({reminders:false});await disablePush();if(alive.current)setMessage('Lembretes desativados neste aparelho.');return;}
      const granted=await requestReminderPermission();
      if(!alive.current)return;
      setPermission(reminderPermission());
      if(!granted){setMessage(reminderPermission()==='unsupported'?'Este navegador não oferece notificações. No iPhone, use a PWA instalada.':'Libere as notificações nas configurações deste aparelho para receber avisos.');return;}
      actions.updateSettings({reminders:true});
      const result=await enablePush();
      if(alive.current)setMessage(result==='ok'?'Aparelho registrado. A entrega depende da conexão, da permissão e do sistema.':result==='error'?'Preferência salva. Não foi possível registrar os avisos com o app fechado; tente novamente.':'Preferência salva. Avisos disponíveis enquanto o app estiver aberto.');
    }catch{if(alive.current)setMessage('Não foi possível confirmar os avisos deste aparelho. Tente novamente.');}
    finally{if(alive.current)setBusy(false);}
  };
  return <BottomSheet title="Lembretes" className="settings-sheet" onClose={onClose} footer={<button className="btn btn-secondary grow" onClick={onClose}>Voltar às configurações</button>}>
    <p className="small muted">{remindersSummary(settings.reminders,permission)}</p>
    <p className="xs muted">Permissão neste aparelho: {permission==='granted'?'permitida':permission==='denied'?'bloqueada':permission==='unsupported'?'indisponível':'ainda não concedida'}.</p>
    <fieldset disabled={busy} className="settings-options">
      <div className="settings-row"><span>Avisar antes do horário<span className="xs muted settings-description">Tarefas e compromissos com hora marcada.</span></span><Switch label="Avisar antes do horário" checked={!!settings.reminders} onChange={toggle}/></div>
      {settings.reminders&&permission!=='granted'&&<button className="btn btn-soft" onClick={()=>toggle(true)}>Verificar permissão</button>}
      {settings.reminders&&<>
        <fieldset className="settings-options"><legend>Antecedência</legend><div className="chips">{[5,10,15,30,60].map(m=><button className={`chip${(settings.reminderLead??10)===m?' on':''}`} aria-pressed={(settings.reminderLead??10)===m} key={m} onClick={()=>{actions.updateSettings({reminderLead:m});setMessage(`Antecedência salva: ${m} minutos.`);}}>{formatDuration(m)}</button>)}</div></fieldset>
        <div className="settings-row"><span>Lembretes discretos<span className="xs muted settings-description">Ocultar o título. Com o app fechado, requer o serviço de lembretes atualizado.</span></span><Switch label="Lembretes discretos" checked={!!settings.discreetReminders} onChange={discreetReminders=>actions.updateSettings({discreetReminders})}/></div>
      </>}
      <div className="settings-row"><span>Sugestões no Leve<span className="xs muted settings-description">Avisos de capturas e replanejamento dentro do app.</span></span><Switch label="Sugestões inteligentes" checked={settings.nudges} onChange={nudges=>actions.updateSettings({nudges})}/></div>
    </fieldset>
    <p className="small" role="status">{busy?'Verificando este aparelho…':message}</p>
    <Disclosure title="Sobre a entrega dos avisos"><p className="small muted">{pushConfigured?'Serviço de push configurado. Isso não confirma o registro deste aparelho nem garante entrega.':'Push não configurado neste ambiente. Avisos locais dependem do app aberto.'} A permissão é específica de cada aparelho. No iPhone, use o Leve adicionado à tela inicial.</p></Disclosure>
  </BottomSheet>;
}
