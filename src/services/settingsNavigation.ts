/** Somente destino de UI e validade; nunca armazena parametros OAuth. */
const KEY='leve.settings.calendar-return';
let resumed=false;
export function rememberCalendarSettingsReturn() {
  try {sessionStorage.setItem(KEY,String(Date.now()+15*60*1000));}catch{/* Sem storage, o status continua disponivel nas configuracoes. */}
}
export function clearCalendarSettingsReturn(){try{sessionStorage.removeItem(KEY);}catch{/* storage bloqueado */}}
export function resumeCalendarSettings():boolean {
  try {
    // Descartar somente resíduos Calendar; não tocar no fragmento de login Supabase.
    const oldQuery=new URLSearchParams(location.search), oldHash=new URLSearchParams(location.hash.slice(1));
    const calendarReturn=oldQuery.has('gcal')||oldHash.has('gcal_code');
    if(calendarReturn){
      oldQuery.delete('gcal');oldHash.delete('gcal_code');oldHash.delete('gcal_state');
      history.replaceState(null,'',location.pathname+(oldQuery.size?`?${oldQuery}`:'')+(oldHash.size?`#${oldHash}`:''));
      try{localStorage.removeItem('leve.gcal.pending.v1');}catch{/* storage bloqueado */}
    }
    const expires=Number(sessionStorage.getItem(KEY));
    if(!expires||expires<Date.now()){clearCalendarSettingsReturn();return false;}
    if(!calendarReturn)return false;
    clearCalendarSettingsReturn();resumed=true;return true;
  }catch{return false;}
}
export function consumeCalendarSettingsReturn(){const value=resumed;resumed=false;return value;}
