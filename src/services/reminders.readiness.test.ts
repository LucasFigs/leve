// @vitest-environment jsdom
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {actions,emptyState,newTask,replaceState} from '../store/store';
import {closeAllSheets,getUI} from '../store/ui';
import {todayISO,nowMin,minToTime} from '../domain/dates';
import {checkReminders} from './reminders';
import {resumeNotification} from './notificationNavigation';
const session=vi.hoisted(()=>({owner:undefined as string|undefined}));
vi.mock('../store/sync',()=>({cloudEnabled:true,notificationOwner:()=>session.owner}));
const notifications: {options: NotificationOptions;onclick?:()=>void}[]=[];
beforeEach(()=>{
 vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));localStorage.clear();closeAllSheets();notifications.length=0;session.owner='owner-a';
 vi.stubGlobal('Notification',class {static permission='granted';options: NotificationOptions;onclick?:()=>void;constructor(_title:string,options:NotificationOptions){this.options=options;notifications.push(this);}});
 vi.spyOn(window,'focus').mockImplementation(()=>{});
 const state=emptyState();state.settings.reminders=true;state.tasks=[newTask({id:'same-id',title:'Fictícia A',status:'active',kind:'event',date:todayISO(),time:minToTime(nowMin()+5)})];replaceState(state);
});
afterEach(()=>{vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('vincula o aviso local à conta e não abre item homônimo após trocar conta',async()=>{
 checkReminders();await Promise.resolve();await Promise.resolve();expect(notifications).toHaveLength(1);
 expect(notifications[0].options.data.owner).toBe('owner-a');
 session.owner='owner-b';actions.update('same-id',{title:'Fictícia B'});
 notifications[0].onclick!();resumeNotification(true,'owner-b');expect(getUI().sheet).toBeUndefined();
 resumeNotification(true,'owner-a');
});
it('não envia aviso local da conta anterior quando não há sessão confirmada',async()=>{
 session.owner=undefined;checkReminders();await Promise.resolve();expect(notifications).toHaveLength(0);
});
