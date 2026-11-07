// @vitest-environment jsdom
import {afterEach, expect, it} from 'vitest';
import {PROJECT_ICONS, getProjectIcon, projectIconPatch} from './projectIcons';
import {isProject} from './validation';
import {actions, emptyState, getState, replaceState} from '../store/store';
import {localRepository, recoveryExport} from '../store/persistence';
const legacy=(emoji:string)=>({id:'p',name:'Viagem 🌊 com amigos',emoji,color:'blue',createdAt:1});
afterEach(()=>replaceState(emptyState(),{resetUndo:true}));
it('mapeia os doze identificadores legados sem alterar os projetos',()=>{
 expect(PROJECT_ICONS).toHaveLength(12);
 for(const item of PROJECT_ICONS){const p=legacy(item.legacy);const raw=JSON.stringify(p);expect(getProjectIcon(p)).toBe(item.value);expect(JSON.stringify(p)).toBe(raw);expect(isProject(p)).toBe(true);}
});
it('preserva valores desconhecidos e usa pasta sem renderizar texto legado',()=>{
 const p={...legacy('🦊 personalizado'),icon:'future-icon'};expect(isProject(p)).toBe(true);expect(getProjectIcon(p)).toBe('folder');expect(p.emoji).toBe('🦊 personalizado');
 expect(getProjectIcon({...p,icon:undefined})).toBe('folder');
});
it('aceita campo opcional limitado, inclusive valores futuros, e rejeita formatos inválidos',()=>{
 for(const icon of [undefined,'plane','future-icon'])expect(isProject({...legacy('✈️'),icon})).toBe(true);
 for(const icon of [12,{},'a'.repeat(101)])expect(isProject({...legacy('✈️'),icon})).toBe(false);
});
it('reconhece mudança feita por uma versão antiga que só atualiza emoji',()=>{
 const p={...legacy('✈️'),icon:'plane'};expect(getProjectIcon(p)).toBe('plane');expect(getProjectIcon({...p,emoji:'💼'})).toBe('briefcase');
 expect(getProjectIcon({...p,emoji:'✈'})).toBe('plane');
});
it('persiste, recupera e exporta ícone e conteúdo pessoal sem migração destrutiva',()=>{
 replaceState(emptyState(),{resetUndo:true});const p=actions.addProject('Viagem 🌊 com amigos','✈️','blue','plane');
 expect(isProject(p)).toBe(true);expect(getState().projects[0].icon).toBe('plane');
 const loaded=localRepository.load()!;replaceState(loaded,{resetUndo:true});expect(getState().projects[0]).toEqual(p);
 const backup=JSON.parse(recoveryExport(getState()));expect(backup.current.projects[0]).toEqual(p);
 actions.updateProject(p.id,projectIconPatch('leaf'));expect(getState().projects[0]).toMatchObject({name:'Viagem 🌊 com amigos',icon:'leaf',emoji:'🌱',color:'blue'});
});
