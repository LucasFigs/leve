import {useEffect,useRef,type ComponentProps} from 'react';
import {BottomSheet} from './BottomSheet';

const HISTORY_KEY='leve-settings-sheet';
let sequence=0;
let entry:{id:string;owner:symbol}|undefined;
const markedState=(base:unknown,id:string)=>({...((base&&typeof base==='object')?base:{}),[HISTORY_KEY]:id});

/** Apenas configuracoes: viewport visivel e Voltar, sem alterar os outros modais. */
export function SettingsSheet(props:ComponentProps<typeof BottomSheet>) {
  const root=useRef<HTMLDivElement>(null);
  const callbacks=useRef(props);
  callbacks.current=props;
  useEffect(()=>{
    const subscribe=()=>{
      const owner=Symbol('settings-sheet');
      const previous=window.history.state;
      let id:string;
      try {
        if(entry&&previous?.[HISTORY_KEY]===entry.id)id=entry.id;
        else {id=`${Date.now()}-${++sequence}`;window.history.pushState(markedState(previous,id),'');}
        entry={id,owner};
      }catch{return;}
      const back=()=>{
        if(entry?.owner!==owner||window.history.state?.[HISTORY_KEY]===id)return;
        if(callbacks.current.canClose&&!callbacks.current.canClose()){
          window.history.pushState(markedState(window.history.state,id),'');return;
        }
        entry=undefined;callbacks.current.onClose();
      };
      window.addEventListener('popstate',back);
      return()=>{
        window.removeEventListener('popstate',back);
        // Uma troca entre editores reutiliza a entrada; fechar consome-a uma vez.
        queueMicrotask(()=>{
          if(entry?.owner!==owner)return;
          entry=undefined;
          if(window.history.state?.[HISTORY_KEY]===id)window.history.back();
        });
      };
    };
    // O callback existente precisa consumir a URL antes de criar historico de UI.
    // Conferimos apenas a presenca das chaves; seus valores nao sao armazenados.
    const pendingReturn=()=>new URLSearchParams(window.location.hash.slice(1)).has('gcal_code')||new URLSearchParams(window.location.search).has('gcal');
    if(!pendingReturn())return subscribe();
    let release:(()=>void)|undefined;
    const timer=window.setInterval(()=>{
      if(pendingReturn())return;
      window.clearInterval(timer);release=subscribe();
    },50);
    return()=>{window.clearInterval(timer);release?.();};
  },[]);
  useEffect(()=>{
    const node=root.current;
    if(!node)return;
    let frame=0;
    const update=()=>{
      const viewport=window.visualViewport;
      node.style.setProperty('--sheet-viewport-height',`${viewport?.height??window.innerHeight}px`);
      node.style.setProperty('--sheet-viewport-top',`${viewport?.offsetTop??0}px`);
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        const body=node.querySelector<HTMLElement>('.sheet-body');
        const active=document.activeElement;
        if(!body||!(active instanceof HTMLElement)||!body.contains(active)||!active.matches('input,textarea,select'))return;
        const field=active.getBoundingClientRect(),area=body.getBoundingClientRect();
        if(field.bottom>area.bottom)body.scrollTop+=field.bottom-area.bottom+8;
        else if(field.top<area.top)body.scrollTop-=area.top-field.top+8;
      });
    };
    update();window.addEventListener('resize',update);
    window.visualViewport?.addEventListener('resize',update);
    window.visualViewport?.addEventListener('scroll',update);
    return()=>{cancelAnimationFrame(frame);window.removeEventListener('resize',update);window.visualViewport?.removeEventListener('resize',update);window.visualViewport?.removeEventListener('scroll',update);};
  },[]);
  return <div className="settings-modal" ref={root}><BottomSheet {...props}/></div>;
}
