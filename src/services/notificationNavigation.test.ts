// @vitest-environment jsdom
import {beforeEach,describe,expect,it} from 'vitest';
import {emptyState,newTask,replaceState} from '../store/store';
import {closeAllSheets,getUI} from '../store/ui';
import {dueReminders} from '../domain/reminders';

beforeEach(()=>{closeAllSheets();replaceState(emptyState());history.replaceState(null,'','/?task=fixture&date=2026-11-05&owner=owner-a&keep=1');});
describe('intenção de abertura de notificações',()=>{
 it('aguarda autenticação e dados antes de consumir a URL',async()=>{
  const {rememberNotificationUrl,resumeNotification}=await import('./notificationNavigation');rememberNotificationUrl();
  resumeNotification(false);expect(location.search).toContain('task=fixture');expect(getUI().sheet).toBeUndefined();
  replaceState({...emptyState(),tasks:[newTask({id:'fixture',title:'Fictícia'})]});resumeNotification(true,'owner-a');
  expect(getUI().sheet).toMatchObject({id:'fixture',date:'2026-11-05'});expect(location.search).toBe('?keep=1');
 });
 it('não abre tarefa de outra conta mesmo com o mesmo id',async()=>{
  const {rememberNotificationUrl,resumeNotification}=await import('./notificationNavigation');rememberNotificationUrl();
  replaceState({...emptyState(),tasks:[newTask({id:'fixture',title:'De outra conta'})]});resumeNotification(true,'owner-b');
  expect(getUI().sheet).toBeUndefined();
  expect(location.search).toContain('task=fixture');resumeNotification(true,'owner-a');expect(getUI().sheet).toMatchObject({id:'fixture'});
 });
 it('ignora id inválido e data impossível',async()=>{
  const {rememberNotification,resumeNotification}=await import('./notificationNavigation');
  rememberNotification({taskId:'fixture',date:'2026-02-30'});resumeNotification(true,'owner-a');expect(getUI().sheet).toBeUndefined();
 });
 it('modo discreto não inclui título pessoal no lembrete',()=>{
  const task=newTask({title:'Título fictício pessoal',kind:'event',status:'active',date:'2026-11-05',time:'10:00'});
  const reminders=dueReminders([task],{discreetReminders:true},'2026-11-05',595);
  expect(reminders[0].title).toBe('Leve');expect(reminders[0].body).not.toContain(task.title);
 });
});
