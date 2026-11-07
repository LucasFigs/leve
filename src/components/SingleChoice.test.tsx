// @vitest-environment jsdom
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SingleChoice } from './SingleChoice';
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();});
const options=[{value:'' as const,label:'Nenhuma'},{value:'essential' as const,label:'Essencial'},{value:'important' as const,label:'Importante',disabled:true}];
it('usa radios nativos com nome exclusivo por grupo e sem exigir uma escolha',()=>{
  function Example(){const [value,setValue]=useState<'essential'|'important'>();return <><SingleChoice label="Prioridade" value={value} options={options} onChange={setValue}/><SingleChoice label="Outro grupo" options={options} onChange={()=>{}}/></>;}
  act(()=>root.render(<Example/>));
  const groups=host.querySelectorAll('fieldset');const inputs=groups[0].querySelectorAll<HTMLInputElement>('input');
  expect(groups[0].querySelector('legend')!.textContent).toBe('Prioridade');
  expect(inputs[0].checked).toBe(true);expect(inputs[0].required).toBe(false);
  expect(new Set([...inputs].map(i=>i.name)).size).toBe(1);expect(inputs[0].name).not.toBe(groups[1].querySelector('input')!.name);
  act(()=>inputs[1].click());expect(inputs[1].checked).toBe(true);expect(inputs[0].checked).toBe(false);
  act(()=>inputs[0].click());expect(inputs[0].checked).toBe(true);
  expect(inputs[2].matches(':disabled')).toBe(true);act(()=>inputs[2].click());expect(inputs[0].checked).toBe(true);
});
it.each([false,true])('respeita grupo desabilitado sem emitir mudança (compacto: %s)',compact=>{
  const onChange=vi.fn();act(()=>root.render(<SingleChoice label="Prioridade" compact={compact} disabled options={options} onChange={onChange}/>));
  for(const input of host.querySelectorAll<HTMLInputElement>('input')){expect(input.matches(':disabled')).toBe(true);act(()=>input.click());}
  expect(onChange).not.toHaveBeenCalled();
});
