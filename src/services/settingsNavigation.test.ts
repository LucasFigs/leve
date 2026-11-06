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
