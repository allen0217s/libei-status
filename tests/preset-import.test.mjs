import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import vm from 'node:vm';
import {createFieldSchemaToolkit} from '../src/engine/field-schema.js';
import {createRuleSectionToolkit} from '../src/engine/rule-sections.js';
import {validateReferenceConfig} from '../src/engine/reference-config.js';
const source=await readFile(new URL('../src/engine/legacy-adapter.js',import.meta.url),'utf8');
const sandbox={TextEncoder,createFieldSchemaToolkit,createRuleSectionToolkit,validateReferenceConfig};
vm.runInNewContext(source.slice(source.indexOf('var LbYamlEmbedded='),source.indexOf('/* Native SillyTavern adapter.'))+';globalThis.C=createLibeiStatusCore(LbYamlEmbedded);',sandbox);
const C=sandbox.C,copy=value=>JSON.parse(JSON.stringify(value));let count=0;
const test=(name,fn)=>{fn();count++;console.log('PASS '+name)};
const parse=text=>C.parseRulePreset(text),fields=text=>parse(text).rules.fieldSchema.fields;
test('Plain YAML infers ordinary value types without fixed header or compulsory clock',()=>{
 const result=parse('心情: 平静\n好感度: 10\n温度: 23.5\n在场: true\n物品: [钥匙, 手机]\n备注: {}');
 assert.equal(result.name,'导入的变量');assert.equal(result.rules.initials.length,0);assert.equal(result.rules.fieldSchema.fields.length,6);
 assert.deepEqual(copy(result.rules.fieldSchema.fields.map(f=>f.type).sort()),['array','boolean','integer','number','object','string']);
 assert.ok(result.rules.fieldSchema.fields.every(f=>!f.system));
});
test('Nested YAML retains nested field paths and JSON input behaves identically',()=>{
 const value={主角:{心情:'平静',好感度:10},世界:{地点:'客栈'}};
 const result=parse(JSON.stringify(value));assert.equal(result.rules.fieldSchema.fields.length,3);
 assert.ok(result.rules.fieldSchema.fields.some(f=>f.path.join('/')==='主角/心情'));
});
test('Optional wrapper names, initials and export comments are accepted but are never required',()=>{
 const result=parse('名称: 日常\n变量: {心情: 平静}\n说明: 这是备注');assert.equal(result.name,'日常');assert.equal(result.rules.fieldSchema.fields.length,1);
 const saved=C.rulePresetDocument(result.rules,'日常');assert.deepEqual(copy(parse(saved).rules),copy(result.rules));
 assert.deepEqual(copy(parse(saved.replace(/^#.*\n/u,'')).rules),copy(result.rules));
});
test('Simplified Chinese field definitions fill ID, path, flags and missing defaults',()=>{
 const result=fields('字段:\n - 名称: 心情\n   类型: 文字\n   默认值: 平静\n   更新规则: 按正文事实更新。\n - 名称: 好感度\n   类型: 整数');
 assert.equal(result.length,2);assert.equal(result[0].label,'心情');assert.equal(result[0].default,'平静');assert.deepEqual(copy(result[0].path),['心情']);assert.equal(result[1].default,0);
});
test('English and bare field lists support enum, bounds and manual ownership',()=>{
 const text=JSON.stringify([{name:'mood',type:'enum',options:['calm','happy']},{name:'score',type:'number',default:1.5,min:0,max:100,updateMode:'manual'}]);
 const result=fields(text);assert.equal(result[0].default,'calm');assert.equal(result[1].updateMode,'manual');assert.equal(result[1].max,100);
});
test('Field dictionaries preserve object defaults instead of discarding nested values',()=>{
 const result=fields('字段:\n 心情: 平静\n 装备: {武器: 剑, 防具: 布衣}');
 assert.equal(result[1].type,'object');assert.deepEqual(copy(result[1].default),{武器:'剑',防具:'布衣'});
});
test('Slash and dot paths work and omitted defaults follow the declared type',()=>{
 const result=fields('字段:\n - path: 主角.心情\n   type: string\n - path: /主角/好感度\n   type: integer');
 assert.deepEqual(copy(result[0].path),['主角','心情']);assert.deepEqual(copy(result[1].path),['主角','好感度']);assert.equal(result[1].default,0);
});
test('Markdown fences and arbitrary YAML comments are accepted without a magic first line',()=>{
 assert.equal(fields('```yaml\n# 自己的说明\n心情: 平静\n```')[0].default,'平静');
 assert.equal(fields('```json\n{"score":2}\n```')[0].default,2);
 assert.equal(fields('  心情: 平静\n  好感度: 10').length,2);
});
test('Initial schemes can be omitted or supplied with a label and variable object',()=>{
 const result=parse('变量: {心情: 平静}\n初值方案:\n - 名称: 开局\n   变量: {心情: 开心}');
 assert.equal(result.rules.initials[0].label,'开局');assert.equal(JSON.parse(result.rules.initials[0].text).心情,'开心');
 assert.equal(parse('变量: {心情: 平静}').rules.initials.length,0);
});
test('Old full rule bundles import variables and initial schemes without credentials or global prompts',()=>{
 const rules=C.defaultRules(),result=parse(JSON.stringify({format:'libei-independent-config-v1',name:'旧预设',rules,config:{apiKey:'SECRET'}}));
 assert.equal(result.rules.fieldSchema.fields.length,rules.fieldSchema.fields.length);assert.equal(result.rules.initials.length,1);assert.ok(!JSON.stringify(result).includes('SECRET'));assert.equal(result.rules.systemPrompt,undefined);
});
test('No-clock variables save, initialize and update through the existing patch protocol',()=>{
 const imported=parse('心情: 平静\n好感度: 10');const rules=C.presetRules({...C.defaultRules(),...imported.rules,initialChoice:''});
 const state=C.parseYaml('{}',rules.fieldSchema);const result=C.settleUpdate(state,[{op:'replace',path:'/心情',value:'开心'},{op:'replace',path:'/好感度',value:12}],rules,'');
 assert.equal(result.state.心情,'开心');assert.equal(result.state.好感度,12);assert.equal(result.settlement.gain,0);assert.equal(Object.hasOwn(result.state,'世界'),false);
});
test('Money-only presets work without clock fields while hourly growth still needs time evidence',()=>{
 const imported=parse('主角: {钱财: 100}'),rules=C.presetRules({...C.defaultRules(),...imported.rules,initialChoice:''});
 assert.equal(C.settleUpdate(C.parseYaml('{}',rules.fieldSchema),[{op:'money',direction:'expense',amount:10,evidence:'花了十元'}],rules,'花了十元').state.主角.钱财,90);
 const energy=parse('主角: {精液: 40}'),growth=C.presetRules({...C.defaultRules(),...energy.rules,initialChoice:'',numericConfig:{...C.defaultRules().numericConfig,hourlyGain:6}});
 assert.throws(()=>C.settleUpdate(C.parseYaml('{}',growth.fieldSchema),[],growth,''),/按小时增长/u);
});
test('Duplicate keys, paths, incompatible types and unsafe data still fail without silently dropping fields',()=>{
 for(const text of ['心情: 平静\n心情: 开心','字段: [{名称: 心情}, {名称: 心情}]','字段: [{名称: 分数, 类型: 整数, 默认值: 错误}]','__proto__: {polluted: true}','心情: &a 平静','心情: !x 平静','心情: null','字段: [{名称: 分数, defualt: 10}]'])assert.throws(()=>parse(text),text);
 assert.equal({}.polluted,undefined);
});
console.log('Flexible variable import checks: '+count+' passed; pure parser and engine, no host or network.');
