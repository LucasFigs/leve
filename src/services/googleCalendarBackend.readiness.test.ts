import {afterEach,it,expect,vi} from 'vitest';
import {calendarBackend} from './googleCalendarBackend';
vi.mock('../store/sync',()=>({supabase:{auth:{getSession:async()=>({data:{session:{access_token:'fixture-only'}}})}}}));
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();vi.unstubAllEnvs();});
it('limita a espera do backend Google e cancela a requisição pendente',async()=>{
 vi.useFakeTimers();vi.stubEnv('VITE_SUPABASE_URL','https://example.test');vi.stubEnv('VITE_SUPABASE_ANON_KEY','fixture-only');
 let received: AbortSignal | undefined;
 vi.stubGlobal('fetch',vi.fn((_url:string,init:RequestInit)=>new Promise((_resolve,reject)=>{received=init.signal as AbortSignal;received?.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));} )));
 const result=calendarBackend('status').catch(error=>error);await vi.advanceTimersByTimeAsync(15001);
 expect(await result).toBeInstanceOf(Error);expect(received?.aborted).toBe(true);
});
it.each(['begin','complete','token','preferences'])('transporte rejeita %s antes de obter sessão ou fazer rede',async action=>{
 const request=vi.fn();vi.stubGlobal('fetch',request);await expect(calendarBackend(action)).rejects.toMatchObject({status:410});expect(request).not.toHaveBeenCalled();
});
