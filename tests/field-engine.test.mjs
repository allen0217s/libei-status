import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createFieldSchemaToolkit } from '../src/engine/field-schema.js';

const source = await readFile(new URL('../src/engine/legacy-adapter.js', import.meta.url), 'utf8');
const sandbox = { TextEncoder, createFieldSchemaToolkit };
vm.runInNewContext(source.slice(source.indexOf('var LbYamlEmbedded='), source.indexOf('/* Native SillyTavern adapter.')) + '\nglobalThis.testCore={C:createLibeiStatusCore(LbYamlEmbedded),T:createLibeiTimelineStore};', sandbox);
const { C, T } = sandbox.testCore;
const clone = value => JSON.parse(JSON.stringify(value));
const normalize = value => JSON.parse(JSON.stringify(value));
const fieldAt = (rules, path) => rules.fieldSchema.fields.find(field => JSON.stringify(field.path) === JSON.stringify(path));
const checks = [];
const test = (name, fn) => { fn(); checks.push(name); console.log('PASS ' + name); };
const generic = C.defaultRules();
const base = () => C.chooseInitial({...generic, initialChoice:'generic'}).state;
const patch = (path, value) => [{op:'replace',path,value}];
function presets(...states) {
  const rules = clone(generic); delete rules.fieldSchema;
  rules.initials = states.map((state,index) => ({id:'initial-'+index,label:'initial '+index,text:JSON.stringify(state)}));
  rules.initialChoice = '';
  return rules;
}
function storage() {
  const values = new Map();
  return { values, getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,value), removeItem:key => values.delete(key) };
}

test('Default rules have one centralized schema without mutating caller state', () => {
  const rules = presets(base());
  const before = JSON.stringify(rules), upgraded = C.upgradeProfile(rules);
  assert.ok(upgraded.fieldSchema.fields.length > 10);
  assert.equal(JSON.stringify(rules), before);
  assert.equal(C.F.signature(upgraded.fieldSchema), C.F.signature(C.upgradeProfile(upgraded).fieldSchema));
});
test('Legacy integer and decimal preset fields widen to number', () => {
  const first = base(), second = base(); first.custom = 0; second.custom = 0.5;
  const rules = C.upgradeProfile(presets(first,second));
  assert.equal(fieldAt(rules,['custom']).type, 'number');
  assert.equal(C.parseYaml(rules.initials[1].text,rules.fieldSchema).custom, 0.5);
});
test('Empty-object and nested-object presets use an atomic object field', () => {
  for (const reverse of [false,true]) {
    const first = base(), second = base(); first.custom = {}; second.custom = {x:'retained'};
    const rules = C.upgradeProfile(presets(...(reverse ? [second,first] : [first,second])));
    assert.equal(fieldAt(rules,['custom']).type, 'object');
    assert.equal(rules.fieldSchema.fields.filter(field=>field.path[0]==='custom').length, 1);
    assert.ok(rules.initials.some(initial=>C.parseYaml(initial.text,rules.fieldSchema).custom.x==='retained'));
  }
});
test('Genuinely incompatible legacy preset values stay unregistered and preserved with a note', () => {
  const first = base(), second = base(); first.custom = 'retain'; second.custom = {x:3};
  const rules = C.upgradeProfile(presets(first,second));
  assert.ok(rules.fieldSchemaNotes.length);
  assert.equal(fieldAt(rules,['custom']), undefined);
  assert.equal(C.parseYaml(rules.initials[0].text,rules.fieldSchema).custom, 'retain');
  assert.equal(C.parseYaml(rules.initials[1].text,rules.fieldSchema).custom.x, 3);
});
test('Adding a field fills all initial presets without overwriting other initial values', () => {
  const rules = clone(generic);
  rules.fieldSchema.fields.push({id:'affinity',path:['主角','好感度'],label:'好感度',group:'属性',type:'integer',default:5,enabled:true,visible:true,updateMode:'ai',rule:'只按事实。',min:0,max:100});
  const upgraded = C.upgradeProfile(rules);
  assert.equal(C.parseYaml(upgraded.initials[0].text,upgraded.fieldSchema).主角.好感度, 5);
  assert.equal(C.parseYaml(upgraded.initials[0].text,upgraded.fieldSchema).世界.时间, '00:00');
});
test('Type-incompatible initial values reject without rewriting the input', () => {
  const rules = clone(generic), before = JSON.stringify(rules);
  fieldAt(rules,['主角','想法']).type='boolean'; fieldAt(rules,['主角','想法']).default=false;
  const modified = JSON.stringify(rules);
  assert.throws(()=>C.upgradeProfile(rules),/字段/);
  assert.equal(JSON.stringify(rules),modified);
  assert.notEqual(before,modified);
});
test('Legacy ordinary patch aliases are canonicalized before schema writer checks', () => {
  const result = C.settleUpdate(base(),patch('/黎北/想法','兼容保留'),generic,'');
  assert.equal(result.state.主角.想法,'兼容保留');
  assert.equal(result.state.黎北,undefined);
  assert.equal(result.patch[0].path,'/主角/想法');
});
test('AI writes to unregistered, manual, disabled and program paths all reject atomically', () => {
  const rules=clone(generic), state=base();
  fieldAt(rules,['主角','想法']).updateMode='manual';
  fieldAt(rules,['主角','阳具']).enabled=false;
  const before=JSON.stringify(state);
  for(const [path,value] of [['/主角/想法','wrong'],['/主角/阳具','wrong'],['/主角/钱财',1],['/主角/unknown',1],['/主角',{}]]) {
    assert.throws(()=>C.settleUpdate(state,patch(path,value),rules,''));
    assert.equal(JSON.stringify(state),before);
  }
});
test('Final runtime types and bounds reject a syntactically valid AI patch', () => {
  const rules=clone(generic), state=base();
  rules.fieldSchema.fields.push({id:'affinity',path:['主角','好感度'],label:'好感度',group:'属性',type:'integer',default:0,min:0,max:100,enabled:true,visible:true,updateMode:'ai',rule:''});
  state.主角.好感度=0;
  for(const value of ['50',1.5,101]) assert.throws(()=>C.settleUpdate(state,patch('/主角/好感度',value),rules,''));
  assert.equal(C.settleUpdate(state,patch('/主角/好感度',50),rules,'').state.主角.好感度,50);
});
test('Money, hourly growth and event consumption retain deterministic settlement', () => {
  const state=base(), rules=clone(generic); state.主角.钱财=100;state.主角.精液=80;rules.numericConfig.hourlyGain=6;
  const commands=[...patch('/世界/时间','01:00'),{op:'money',direction:'income',amount:20,evidence:'收到二十文'},{op:'release',kind:'awake',amount:10,evidence:'实际消耗十毫升'}];
  const result=C.settleUpdate(state,commands,rules,'收到二十文，实际消耗十毫升。');
  assert.equal(result.state.主角.钱财,120);assert.equal(result.state.主角.精液,76);assert.equal(result.settlement.gain,6);
  assert.throws(()=>C.settleUpdate(state,[...commands,commands[1]],rules,'收到二十文，实际消耗十毫升。'),/重复/);
});
test('Disabled program fields retain their physical values and reject corresponding events', () => {
  const rules=clone(generic), state=base();state.主角.精液=90;state.主角.钱财=60;
  for(const field of rules.fieldSchema.fields) if(['money','energy','formula'].includes(field.system))field.enabled=false;
  const result=C.settleUpdate(state,patch('/世界/时间','02:00'),rules,'');
  assert.equal(result.state.主角.精液,90);assert.equal(result.state.主角.钱财,60);
  assert.throws(()=>C.settleUpdate(state,[{op:'money',direction:'income',amount:1,evidence:'得到一文'}],rules,'得到一文'),/停用/);
  assert.throws(()=>C.settleUpdate(state,[{op:'release',kind:'awake',amount:10,evidence:'确实消耗'}],rules,'确实消耗'),/停用/);
});
test('Same-floor recompute retains manual and disabled values from the current snapshot', () => {
  const rules=clone(generic), previous=base(), current=base();
  fieldAt(rules,['主角','想法']).updateMode='manual';
  fieldAt(rules,['主角','阳具']).enabled=false;
  current.主角.想法='MANUAL_CURRENT';current.主角.阳具='DISABLED_CURRENT';
  const prepared=C.prepareUpdateBase(previous,current,rules.fieldSchema), result=C.settleUpdate(prepared,[],rules,'');
  assert.equal(result.state.主角.想法,'MANUAL_CURRENT');assert.equal(result.state.主角.阳具,'DISABLED_CURRENT');
  assert.equal(previous.主角.想法,'未记录');
});
test('Recompute can repair an old manual type using the current validated manual value', () => {
  const rules=clone(generic), previous=base(), current=base(), field=fieldAt(rules,['主角','想法']);
  field.type='boolean';field.default=false;field.updateMode='manual';current.主角.想法=true;
  assert.equal(C.prepareUpdateBase(previous,current,rules.fieldSchema).主角.想法,true);
  assert.throws(()=>C.prepareUpdateBase(previous,null,rules.fieldSchema),/字段/);
});
test('Recompute canonicalizes old roots without mutating historical input', () => {
  const old=base();old.黎北=old.主角;delete old.主角;const before=JSON.stringify(old);
  const state=C.prepareUpdateBase(old,null,generic.fieldSchema);
  assert.ok(state.主角);assert.equal(state.黎北,undefined);assert.equal(JSON.stringify(old),before);
});
test('Declared projections omit inactive values while preserving them in physical state', () => {
  const rules=clone(generic), state=base();state.customSecret='retained only';state.主角.阳具='DISABLED_VALUE';
  fieldAt(rules,['主角','阳具']).enabled=false;
  const messages=C.buildMessages(rules,state,[],0,'测试角色');
  assert.equal(messages.length,2);assert.equal(messages[0].role,'system');assert.equal(messages[1].role,'user');
  assert.ok(messages[0].content.includes('集中字段定义'));
  assert.ok(!messages[1].content.includes('DISABLED_VALUE'));assert.ok(!messages[1].content.includes('customSecret'));
  const story=C.storyPrompt(rules,state,true,'测试角色');assert.ok(!story.includes('DISABLED_VALUE'));assert.equal(state.customSecret,'retained only');
});
test('Field labels and rules appear in the shared update and story projections', () => {
  const rules=clone(generic), field=fieldAt(rules,['主角','想法']);field.label='当前念头';field.rule='不得把计划记为事实';
  assert.ok(C.buildMessages(rules,base(),[],0)[0].content.includes('当前念头'));
  assert.ok(C.storyPrompt(rules,base(),false).includes('不得把计划记为事实'));
});
test('Schema timeline nodes validate with their own version, not the latest role configuration', () => {
  const mem=storage(), timeline=T(C,mem,'schema-test'), rules={...clone(generic),initialChoice:'generic'};
  const scope={card:'schema.png',chatId:'schema-chat',chat:[{is_user:false,mes:'opening'}]};
  const first=timeline.synchronize(scope,rules); const oldNode=JSON.stringify(first.doc.nodes[0]);
  const nextRules=clone(rules);fieldAt(nextRules,['主角','想法']).type='boolean';fieldAt(nextRules,['主角','想法']).default=false;
  scope.chat.push({is_user:true,mes:'continue'},{is_user:false,mes:'next'});
  const state=base();state.主角.想法=true;
  const doc=timeline.append(first,scope.chat,2,state,[],{fieldSchema:nextRules.fieldSchema});
  const saved=timeline.commit(first,doc);
  assert.equal(JSON.stringify(saved.doc.nodes[0]),oldNode);
  assert.equal(timeline.read(scope,nextRules).doc.current.state.主角.想法,true);
});
test('Legacy timeline reads and in-memory default supplementation do not rewrite saved bytes', () => {
  const mem=storage(), timeline=T(C,mem,'old-test'), oldRules=presets(base());oldRules.initialChoice='initial-0';
  const scope={card:'old.png',chatId:'old-chat',chat:[{is_user:false,mes:'old opening'}]};
  const saved=timeline.synchronize(scope,oldRules), before=mem.getItem(saved.key);
  const rules=C.upgradeProfile(oldRules);rules.fieldSchema.fields.push({id:'new',path:['主角','新增'],label:'新增',group:'属性',type:'string',default:'default',enabled:true,visible:true,updateMode:'ai',rule:''});
  const read=timeline.read(scope,rules), state=C.F.prepareState(read.doc.current.state,rules.fieldSchema).state;
  assert.equal(state.主角.新增,'default');assert.equal(mem.getItem(saved.key),before);
  assert.equal(read.doc.nodes[0].fieldSchema,undefined);
});
test('Inactive unknown state is retained on subsequent normal append', () => {
  const mem=storage(), timeline=T(C,mem,'preserve-test'), rules={...clone(generic),initialChoice:'generic'};
  const initial=C.parseYaml(rules.initials[0].text,rules.fieldSchema);initial.extra={retained:true};rules.initials[0].text=JSON.stringify(initial);
  const scope={card:'preserve.png',chatId:'preserve-chat',chat:[{is_user:false,mes:'opening'}]};
  const first=timeline.synchronize(scope,rules);scope.chat.push({is_user:true,mes:'continue'},{is_user:false,mes:'next'});
  const result=C.settleUpdate(C.prepareUpdateBase(first.doc.current.state,null,rules.fieldSchema),[],rules,'');
  const saved=timeline.commit(first,timeline.append(first,scope.chat,2,result.state,result.patch,{fieldSchema:rules.fieldSchema}));
  assert.equal(saved.doc.current.state.extra.retained,true);
});
console.log('Field engine/timeline regressions: ' + checks.length + ' passed; memory-only, no live SillyTavern.');
