import {expect,it} from 'vitest';

// Somente código da interface: não examina dados pessoais, fixtures ou mapa legado.
it('interface não fornece emojis decorativos fixos',()=>{
 const sources=import.meta.glob('../**/*.{ts,tsx,css}',{query:'?raw',import:'default',eager:true}) as Record<string,string>;
 const hits=Object.entries(sources).filter(([p])=>!p.includes('.test.')&&!p.endsWith('/domain/projectIcons.ts')).filter(([,source])=>/\p{Extended_Pictographic}/u.test(source)).map(([p])=>p);
 expect(hits).toEqual([]);
});
