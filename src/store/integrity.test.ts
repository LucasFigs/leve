// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

beforeEach(() => { vi.resetModules(); localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });
const task = { id:'test-task',title:'Tarefa fictícia',kind:'task',status:'active',subtasks:[],postponed:0,createdAt:1,updatedAt:1 };
const fixture = () => ({version:1,tasks:[task],projects:[],settings:{onboarded:true},dismissed:{}});

describe('integridade local', () => {
  it('recupera os registros válidos e preserva o original quando um item é inválido', async () => {
    const data=fixture(); data.tasks.push({...task,id:'invalid',title:'x'.repeat(1001)});
    const raw=JSON.stringify(data); localStorage.setItem('leve.state.v1',raw);
    const {localRepository}=await import('./persistence');
    expect(localRepository.load()?.tasks.map(t=>t.id)).toEqual(['test-task']);
    localRepository.save(fixture() as never);
    expect(localStorage.getItem('leve.state.v1')).toBe(raw);
  });
  it('oferece recuperação de uma cópia legada sem apagá-la',async()=>{
    const raw=JSON.stringify(fixture());localStorage.setItem('leve.recovery.v1',raw);
    const persistence=await import('./persistence');expect(persistence.localRepository.load()).toBeUndefined();
    expect(persistence.storageIssue()).toBe('recovery');
    expect(JSON.parse(persistence.recoveryExport(fixture() as never)).preservedSnapshot).toBe(raw);
    expect(localStorage.getItem('leve.recovery.v1')).toBe(raw);
  });
  it('recusa captura longa na ação central sem alterar os dados', async () => {
    const {actions,getState}=await import('./store');
    const original=getState();
    expect(actions.capture('x'.repeat(1001))).toBeUndefined();
    expect(getState()).toBe(original);
  });
  it('uma chave de lembretes não reverte dados em memória', async () => {
    const {actions,getState}=await import('./store');
    actions.capture('Mensagem fictícia');
    window.dispatchEvent(new StorageEvent('storage',{key:'leve.reminders.sent',newValue:'{}'}));
    expect(getState().tasks).toHaveLength(1);
  });
  it('grava uma captura antes do retorno da ação e permite recarregar', async () => {
    const {actions}=await import('./store'); actions.capture('Captura durável');
    expect(JSON.parse(localStorage.getItem('leve.state.v1')!).tasks).toHaveLength(1);
  });
  it('detecta concorrência e exporta as duas versões sem sobrescrever o disco', async () => {
    const {actions,getState}=await import('./store'); const persistence=await import('./persistence');
    actions.capture('Versão desta aba');
    const other=JSON.stringify(fixture());localStorage.setItem('leve.state.v1',other);
    actions.capture('Segunda captura local');
    expect(getState().tasks).toHaveLength(2);expect(localStorage.getItem('leve.state.v1')).toBe(other);
    expect(persistence.storageIssue()).toBe('conflict');
    const exported=JSON.parse(persistence.recoveryExport(getState()));
    expect(exported.current.tasks).toHaveLength(2);expect(exported.preservedSnapshot).toBe(other);
  });
  it('não perde o texto quando o armazenamento está cheio e permite retry', async () => {
    const persistence=await import('./persistence'); const {actions,getState}=await import('./store');
    const setter=vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new DOMException('Quota','QuotaExceededError');});
    actions.capture('Na memória');expect(getState().tasks).toHaveLength(1);expect(persistence.storageIssue()).toBe('storage');
    setter.mockRestore();expect(persistence.localRepository.save(getState())).toBe(true);
    expect(persistence.storageIssue()).toBeUndefined();
  });
  it('aceita o limite UTF-16 com emoji e recusa atualizações inválidas', async () => {
    const {actions,getState}=await import('./store');
    const saved=actions.capture('😀'.repeat(500));expect(saved).toBeDefined();
    actions.update(saved!.id,{title:'x'.repeat(1001)});
    expect(getState().tasks[0].title.length).toBe(1000);
  });
  it('preserva exclusões Google pendentes após reload e só remove após confirmação',async()=>{
    const {actions}=await import('./store');const {localRepository}=await import('./persistence');
    actions.queueGoogleDeletion('event-fixture','calendar-fixture');
    expect(localRepository.load()?.googleDeletions).toEqual([{eventId:'event-fixture',calendarId:'calendar-fixture'}]);
    actions.acknowledgeGoogleDeletion('event-fixture','calendar-fixture');
    expect(localRepository.load()?.googleDeletions).toEqual([]);
  });
  it('descartar horário/período e duração não mantém os campos rejeitados',async()=>{
    const {actions}=await import('./store');
    const captured=actions.capture('Revisar texto amanhã à tarde por 90 min',{},new Set(['time','duration']));
    expect(captured?.date).toBeDefined();expect(captured?.time).toBeUndefined();expect(captured?.dayPart).toBeUndefined();
    expect(captured?.duration).toBe(30);
  });
});
