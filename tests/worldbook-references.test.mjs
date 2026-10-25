import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const mock=`export const world_info={get charLore(){return globalThis.__referenceLore}};export async function loadWorldInfo(name){return globalThis.__loadReferenceBook(name)};`;
await build({root,configFile:false,logLevel:'error',resolve:{alias:{'@':path.join(root,'src')}},plugins:[{name:'isolated-native-reference-reader',enforce:'pre',transform(code,id){if(!id.replaceAll('\\','/').endsWith('/src/st/context.ts'))return null;const anchor="const wiPath = '/scripts/world-info.js';";assert.ok(code.includes(anchor));return {code:code.replace(anchor,'const wiPath = '+JSON.stringify('data:text/javascript,'+encodeURIComponent(mock))+';'),map:null}}}],build:{ssr:path.join(root,'tests/reference-unit-entry.ts'),target:'node20',minify:false,outDir:path.join(root,'.test-api/references'),emptyOutDir:false,rollupOptions:{output:{entryFileNames:'entry.mjs'}}}});
const api=await import(pathToFileURL(path.join(root,'.test-api/references/entry.mjs')).href);
let ctx,loads,registry;
function environment() {
  ctx={characterId:0,characters:[{name:'测试角色',avatar:'hero.png',data:{extensions:{world:'Primary'}}}],getCurrentChatId:()=> 'reference-chat'};
  loads=[];registry={Primary:{entries:{'8':{uid:8,comment:'时间规则',content:'逐字原文\r\n第二行',disable:true},'2':{uid:2,comment:'普通参考',content:'ordinary'}}},Auxiliary:{entries:{'3':{uid:3,comment:'额外绑定',content:'auxiliary'}}},Global:{entries:{'1':{uid:1,content:'MUST_NOT_READ_GLOBAL'}}}};
  globalThis.window={SillyTavern:{getContext:()=>ctx}};
  globalThis.__referenceLore=[{name:'hero',extraBooks:['Auxiliary','Primary']},{name:'other',extraBooks:['Global']}];
  globalThis.__loadReferenceBook=async name=>{loads.push(name);return registry[name]??null};
  globalThis.fetch=()=>{throw Error('REAL_NETWORK_DISABLED')};
  Object.assign(api.apiSettings.exclusions,{excludedWorldNames:[],excludedWorldInfoPatterns:[],renderWorldInfoTemplates:false});
}
const checks=[];
async function test(name,fn){environment();await fn();checks.push(name);console.log('PASS '+name)}
await test('Lists only the current card primary and auxiliary books, deduplicated',async()=>{
  const result=await api.listReferenceWorldbookEntries({expectedProfile:'hero.png'});
  assert.equal(result.profileKey,'hero.png');assert.deepEqual(result.books.map(book=>book.name),['Primary','Auxiliary']);assert.deepEqual(loads,['Primary','Auxiliary']);
  assert.equal(result.books[0].entries[0].uid,'2');assert.equal(result.books[0].entries[1].uid,'8');assert.equal(result.books[0].entries[1].content,'逐字原文\r\n第二行');
});
await test('No selected references means no book read and no keyword activation',async()=>{
  assert.equal(await api.collectReferenceWorldbookContext([],{}),'');assert.deepEqual(loads,[]);
});
await test('Only explicit selected UIDs enter the reference prompt, including a deliberately selected disabled entry',async()=>{
  const text=await api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}],{expectedProfile:'hero.png'});
  assert.ok(text.includes('逐字原文'));assert.ok(!text.includes('ordinary'));assert.ok(!text.includes('auxiliary'));assert.ok(!text.includes('MUST_NOT_READ_GLOBAL'));
  const rows=JSON.parse(text.slice(text.indexOf('[\n')));assert.equal(rows[0].content,'逐字原文\r\n第二行');
});
await test('Stable UID selection survives dictionary reorder and does not use labels or indexes',async()=>{
  registry.Primary.entries={'reordered-key':{uid:8,comment:'renamed label',content:'same UID new body'}};
  const text=await api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]);assert.ok(text.includes('same UID new body'));
});
await test('Selection of a global, unrelated or rebound book fails closed',async()=>{
  await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Global',uid:'1'}]),/不属于/);
  ctx.characters[0].data.extensions.world='Auxiliary';globalThis.__referenceLore=[];
  await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]),/不属于/);
});
await test('Missing book or entry rejects rather than sending an incomplete ruleset',async()=>{
  delete registry.Primary;await assert.rejects(()=>api.listReferenceWorldbookEntries(),/无法读取/);
  registry.Primary={entries:{}};await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]),/不存在/);
});
await test('Global whole-book and comment exclusions are honored for explicit references',async()=>{
  api.apiSettings.exclusions.excludedWorldNames=['Primary'];
  assert.equal((await api.listReferenceWorldbookEntries()).books[0].entries[0].excluded,true);
  await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]),/排除/);
  api.apiSettings.exclusions.excludedWorldNames=[];api.apiSettings.exclusions.excludedWorldInfoPatterns=['时间'];
  await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]),/排除/);
});
await test('Macro/EJS content remains decoded original JSON data, with literal macro openers escaped for generateRaw',async()=>{
  const original='{{setvar::bad::1}} <% throw new Error("MUST_NOT_EXECUTE") %>';
  registry.Primary.entries['8'].content=original;api.apiSettings.exclusions.renderWorldInfoTemplates=true;
  ctx.substituteParams=()=>{throw Error('MUST_NOT_SUBSTITUTE')};globalThis.EjsTemplate={prepareContext:()=>{throw Error('MUST_NOT_EVAL')}};
  const text=await api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]);
  assert.ok(!text.includes('{{'));assert.equal(JSON.parse(text.slice(text.indexOf('[\n')))[0].content,original);
});
await test('Reading or collecting never changes host books, bindings, exclusions or chat data',async()=>{
  const before=JSON.stringify({ctx,registry,ex:api.apiSettings.exclusions});
  await api.listReferenceWorldbookEntries();await api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'}]);
  assert.equal(JSON.stringify({ctx,registry,ex:api.apiSettings.exclusions}),before);
});
await test('Role switch during an awaited load drops old-role reference content',async()=>{
  globalThis.__loadReferenceBook=async()=>{ctx.characters[0]={name:'Other',avatar:'other.png',data:{extensions:{world:'Global'}}};return registry.Primary};
  await assert.rejects(()=>api.listReferenceWorldbookEntries({expectedProfile:'hero.png'}),/切换/);
});
await test('Changing the primary binding on the same card object invalidates an awaited load',async()=>{
  globalThis.__loadReferenceBook=async()=>{ctx.characters[0].data.extensions.world='Global';return registry.Primary};
  await assert.rejects(()=>api.listReferenceWorldbookEntries(),/切换/);
});
await test('Auxiliary bindings are rechecked during awaited reads, including replacement of the binding array',async()=>{
  globalThis.__loadReferenceBook=async()=>{globalThis.__referenceLore=[{name:'hero',extraBooks:[]}];return registry.Primary};
  await assert.rejects(()=>api.listReferenceWorldbookEntries(),/世界书.*切换/);
});
await test('Pre-abort, mid-read abort and caller invalidation all reject',async()=>{
  let controller=new AbortController();controller.abort();await assert.rejects(()=>api.collectReferenceWorldbookContext([],{signal:controller.signal}),{name:'AbortError'});assert.deepEqual(loads,[]);
  controller=new AbortController();globalThis.__loadReferenceBook=async()=>{controller.abort();return registry.Primary};
  await assert.rejects(()=>api.listReferenceWorldbookEntries({signal:controller.signal}),{name:'AbortError'});
  await assert.rejects(()=>api.listReferenceWorldbookEntries({valid:()=>false}),/丢弃/);
});
await test('Wrong profile and groups reject without borrowing another role book',async()=>{
  await assert.rejects(()=>api.listReferenceWorldbookEntries({expectedProfile:'wrong.png'}),/切换/);assert.deepEqual(loads,[]);
  ctx.groupId='group';await assert.rejects(()=>api.listReferenceWorldbookEntries(),/单角色/);
});
await test('An embedded character book is read directly only when no external bindings exist',async()=>{
  ctx.characters[0].data={character_book:{name:'卡内资料',entries:[{id:42,content:'内嵌原文',enabled:false}]}};globalThis.__referenceLore=[];
  const result=await api.listReferenceWorldbookEntries();assert.equal(result.books[0].name,'@embedded:hero.png');assert.equal(result.books[0].entries[0].uid,'42');assert.equal(result.books[0].entries[0].disabled,true);assert.deepEqual(loads,[]);
  assert.ok((await api.collectReferenceWorldbookContext([{book:'@embedded:hero.png',uid:'42'}])).includes('内嵌原文'));
});
await test('Duplicate UIDs and oversized raw or combined content reject without truncation',async()=>{
  registry.Primary.entries={a:{uid:8,content:'a'},b:{uid:8,content:'b'}};await assert.rejects(()=>api.listReferenceWorldbookEntries(),/重复/);
  registry.Primary.entries={a:{uid:8,content:'a'.repeat(200001)}};await assert.rejects(()=>api.listReferenceWorldbookEntries(),/20 万/);
  registry.Primary.entries={a:{uid:8,content:'a'.repeat(110000)},b:{uid:9,content:'b'.repeat(110000)}};
  await assert.rejects(()=>api.collectReferenceWorldbookContext([{book:'Primary',uid:'8'},{book:'Primary',uid:'9'}]),/20 万/);
});
await test('Reference configuration rejects malformed data, duplicate pairs, numeric indexes and oversized lists',async()=>{
  for(const value of [null,{},[{book:'',uid:'1'}],[{book:'Primary',uid:8}],[{book:'Primary',uid:'8',content:'inlined'}],[{book:'Primary',uid:'8'},{book:'Primary',uid:'8'}],Array.from({length:65},(_,i)=>({book:'Primary',uid:String(i)}))])assert.throws(()=>api.validateWorldbookReferences(value));
  const refs=[{book:'Primary',uid:'8'}];const copy=api.validateWorldbookReferences(refs);copy[0].uid='changed';assert.equal(refs[0].uid,'8');
});
console.log('Worldbook reference regressions: '+checks.length+' passed; native reader mocked; real network: 0.');
