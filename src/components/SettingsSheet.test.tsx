// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {SettingsSheet} from './SettingsSheet';
import {BottomSheet} from './BottomSheet';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();history.replaceState(null,'','/');vi.spyOn(history,'back').mockImplementation(()=>{});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(async()=>{act(()=>root.unmount());await Promise.resolve();vi.runAllTicks();host.remove();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();history.replaceState(null,'','/');});
it('mede viewport visível, acompanha teclado e remove listeners ao fechar',()=>{
  const viewport=new EventTarget();Object.assign(viewport,{height:600,offsetTop:12});vi.stubGlobal('visualViewport',viewport);
  act(()=>root.render(<SettingsSheet title="Teste" onClose={()=>{}}><input aria-label="Campo"/></SettingsSheet>));
  const element=host.querySelector<HTMLElement>('.settings-modal')!;
  expect(element.style.getPropertyValue('--sheet-viewport-height')).toBe('600px');
  Object.assign(viewport,{height:320,offsetTop:28});act(()=>viewport.dispatchEvent(new Event('resize')));
  expect(element.style.getPropertyValue('--sheet-viewport-height')).toBe('320px');expect(element.style.getPropertyValue('--sheet-viewport-top')).toBe('28px');
  expect(document.body.style.overflow).toBe('hidden');
  act(()=>root.unmount());expect(document.body.style.overflow).not.toBe('hidden');root=createRoot(host);
});
it('Voltar respeita rascunho e não confirma fechamento quando a guarda recusa',()=>{
  const close=vi.fn(),guard=vi.fn(()=>false);
  act(()=>root.render(<SettingsSheet title="Rascunho" onClose={close} canClose={guard}>Conteúdo</SettingsSheet>));
  act(()=>{history.replaceState(null,'');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));});
  expect(guard).toHaveBeenCalled();expect(close).not.toHaveBeenCalled();expect(history.state['leve-settings-sheet']).toBeTruthy();
  guard.mockReturnValue(true);
  act(()=>{history.replaceState(null,'');window.dispatchEvent(new PopStateEvent('popstate',{state:null}));});expect(close).toHaveBeenCalledTimes(1);
});
it('trocar entre editores compartilha uma entrada sem navegar durante a troca',async()=>{
  act(()=>root.render(<SettingsSheet key="a" title="Conta" onClose={()=>{}}>Conta</SettingsSheet>));const marker=history.state;
  act(()=>root.render(<SettingsSheet key="b" title="Identidade" onClose={()=>{}}>Identidade</SettingsSheet>));await Promise.resolve();vi.runAllTicks();
  expect(history.state).toEqual(marker);expect(history.back).not.toHaveBeenCalled();
  act(()=>root.unmount());await Promise.resolve();vi.runAllTicks();expect(history.back).toHaveBeenCalledTimes(1);root=createRoot(host);
});
it('BottomSheet comum não recebe viewport nem comportamento de histórico das configurações',()=>{
  const state=history.state;
  act(()=>root.render(<BottomSheet title="Tarefa" onClose={()=>{}}>Conteúdo</BottomSheet>));
  expect(host.querySelector('.settings-modal')).toBeNull();expect(history.state).toBe(state);
});
it('aguarda limpeza do retorno Google antes de criar entrada de navegação',()=>{
  history.replaceState(null,'','/?gcal=connected');
  const push=vi.spyOn(history,'pushState');
  act(()=>root.render(<SettingsSheet title="Google" onClose={()=>{}}>Retorno fictício</SettingsSheet>));
  expect(push).not.toHaveBeenCalled();
  history.replaceState(null,'','/');act(()=>vi.advanceTimersByTime(60));
  expect(push).toHaveBeenCalledTimes(1);expect(history.state['leve-settings-sheet']).toBeTruthy();
});
