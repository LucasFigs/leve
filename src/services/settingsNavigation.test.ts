// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {rememberCalendarSettingsReturn,resumeCalendarSettings,consumeCalendarSettingsReturn} from './settingsNavigation';
beforeEach(()=>{sessionStorage.clear();history.replaceState(null,'','/');consumeCalendarSettingsReturn();vi.useFakeTimers();});
afterEach(()=>{vi.useRealTimers();history.replaceState(null,'','/');});
it('retoma somente retorno OAuth esperado, sem guardar seus parâmetros',()=>{
  rememberCalendarSettingsReturn();history.replaceState(null,'','/?gcal=connected');
  expect(resumeCalendarSettings()).toBe(true);expect(consumeCalendarSettingsReturn()).toBe(true);expect(consumeCalendarSettingsReturn()).toBe(false);expect(sessionStorage.length).toBe(0);
});
it('não navega por marcador expirado nem por abertura comum',()=>{
  rememberCalendarSettingsReturn();expect(resumeCalendarSettings()).toBe(false);vi.advanceTimersByTime(16*60*1000);history.replaceState(null,'','/?gcal=error');expect(resumeCalendarSettings()).toBe(false);
});
it('descarta retorno Calendar sem completar OAuth e preserva parâmetros de login',()=>{
 localStorage.setItem('leve.gcal.pending.v1','fixture-proof');history.replaceState(null,'','/?gcal=connected&keep=yes#gcal_code=old-code&gcal_state=old-state&access_token=identity-fixture&type=recovery');
 resumeCalendarSettings();expect(location.search).toBe('?keep=yes');expect(location.hash).toContain('access_token=identity-fixture');expect(location.hash).toContain('type=recovery');expect(location.hash).not.toContain('gcal_code');expect(localStorage.getItem('leve.gcal.pending.v1')).toBeNull();
});
