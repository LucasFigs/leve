/** Somente destino de UI e validade; nunca armazena parametros OAuth. */
const KEY='leve.settings.calendar-return';
let resumed=false;
export function rememberCalendarSettingsReturn() {
  try {sessionStorage.setItem(KEY,String(Date.now()+15*60*1000));}catch{/* Sem storage, o status continua disponivel nas configuracoes. */}
}
export function clearCalendarSettingsReturn(){try{sessionStorage.removeItem(KEY);}catch{/* storage bloqueado */}}
export function resumeCalendarSettings():boolean {
  try {
    const expires=Number(sessionStorage.getItem(KEY));
    if(!expires||expires<Date.now()){clearCalendarSettingsReturn();return false;}
    const query=new URLSearchParams(location.search), hash=new URLSearchParams(location.hash.slice(1));
    if(!query.has('gcal')&&!hash.has('gcal_code'))return false;
    clearCalendarSettingsReturn();resumed=true;return true;
  }catch{return false;}
}
export function consumeCalendarSettingsReturn(){const value=resumed;resumed=false;return value;}
