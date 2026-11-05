// @vitest-environment jsdom
import {afterEach,beforeEach,describe,it,expect,vi} from 'vitest';
beforeEach(()=>{vi.resetModules();localStorage.clear();});
afterEach(()=>vi.restoreAllMocks());
describe('regressões de prontidão',()=>{
  it('não regrava um snapshot idêntico sem necessidade',async()=>{
    const {localRepository}=await import('./persistence');const {emptyState}=await import('./store');
    const state=emptyState();const writes=vi.spyOn(Storage.prototype,'setItem');
    localRepository.save(state);localRepository.save(state);
    expect(writes).toHaveBeenCalledTimes(1);
  });
});
