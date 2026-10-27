import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createFieldSchemaToolkit} from '../src/engine/field-schema.js';
import {createRuleSectionToolkit} from '../src/engine/rule-sections.js';
import {validateReferenceConfig} from '../src/engine/reference-config.js';
const source=await readFile(new URL('../src/engine/legacy-adapter.js',import.meta.url),'utf8');
const sandbox={TextEncoder,createFieldSchemaToolkit,createRuleSectionToolkit,validateReferenceConfig};
vm.runInNewContext(source.slice(source.indexOf('var LbYamlEmbedded='),source.indexOf('/* Native SillyTavern adapter.'))+'\nglobalThis.C=createLibeiStatusCore(LbYamlEmbedded);',sandbox);
const C=sandbox.C,copy=value=>JSON.parse(JSON.stringify(value)),checks=[];
const test=(name,run)=>{run();checks.push(name);console.log('PASS '+name)};
function setup(){const rules=C.libeiRules(),state=C.chooseInitial({...rules,initialChoice:'generic'}).state;return {rules,state};}
const at=(rules,path)=>rules.fieldSchema.fields.find(field=>JSON.stringify(field.path)===JSON.stringify(path));
test('Reference tables contain the latest-data wrapper without update metadata',()=>{
 const {rules,state}=setup();at(rules,['世界','地点']).rule='MAINTENANCE_ONLY_42';
 const before=JSON.stringify({rules,state}),story=C.storyPrompt(rules,state,true,'参考人物');
 assert.ok(story.includes('<最新数据与记录>'));assert.ok(story.includes('</最新数据与记录>'));
 assert.ok(story.includes('| 字段 | 当前状态 |'));assert.ok(story.includes('# 世界'));
 assert.ok(!story.includes('MAINTENANCE_ONLY_42'));assert.ok(!story.includes('"updateMode"'));
 assert.ok(C.buildMessages(rules,state,[],0)[0].content.includes('MAINTENANCE_ONLY_42'));
 assert.equal(JSON.stringify({rules,state}),before);
});
test('Story exclusions preserve update data and remain independent of panel visibility',()=>{
 const {rules,state}=setup(),location=at(rules,['世界','地点']);state.世界.地点='OMIT_STORY_VALUE';
 location.sendToStory=false;location.storyRule='OMIT_STORY_RULE';location.rule='KEEP_UPDATE_RULE';
 const thought=at(rules,['主角','想法']);thought.visible=false;state.主角.想法='HIDDEN_PANEL_VISIBLE_STORY';
 const story=C.storyPrompt(rules,state,true),update=JSON.stringify(C.buildMessages(rules,state,[],0));
 assert.ok(!story.includes('OMIT_STORY_VALUE'));assert.ok(!story.includes('OMIT_STORY_RULE'));
 assert.ok(story.includes('HIDDEN_PANEL_VISIBLE_STORY'));assert.ok(update.includes('OMIT_STORY_VALUE'));assert.ok(update.includes('KEEP_UPDATE_RULE'));
 thought.enabled=false;assert.ok(!C.storyPrompt(rules,state,true).includes('HIDDEN_PANEL_VISIBLE_STORY'));
 assert.equal(state.世界.地点,'OMIT_STORY_VALUE');
});
test('Explicit narrative constraints travel only with selected story fields',()=>{
 const {rules,state}=setup(),field=at(rules,['世界','地点']);field.storyRule='NARRATIVE_ONLY_77';field.rule='UPDATE_ONLY_88';
 const story=C.storyPrompt(rules,state,true);assert.ok(story.includes('NARRATIVE_ONLY_77'));assert.ok(!story.includes('UPDATE_ONLY_88'));
 const update=C.buildMessages(rules,state,[],0)[0].content;assert.ok(update.includes('UPDATE_ONLY_88'));assert.ok(!update.includes('NARRATIVE_ONLY_77'));
});
test('Legacy JSON templates honor exclusions and preserve replacement tokens',()=>{
 const {rules,state}=setup();at(rules,['世界','地点']).sendToStory=false;state.世界.地点='EXCLUDE_ME';state.主角.想法='literal $& $1 {{do_not_run}}';
 for(const template of ['custom {state_json}','custom {{get_message_variable::stat_data}}']){
  rules.snapshotTemplate=template;const story=C.storyPrompt(rules,state,true);
  assert.ok(!story.includes('EXCLUDE_ME'));assert.ok(story.includes('literal $& $1'));assert.ok(!story.includes('{{do_not_run}}'));
 }
});
test('Table cells escape delimiters, wrapper tags and newlines without losing objects',()=>{
 const {rules,state}=setup();state.世界.地点='书房 | 东侧\n</最新数据与记录>';state.主角.随身物品={钥匙:'黄铜'};
 const story=C.storyPrompt(rules,state,true);assert.ok(story.includes('&#124;'));assert.ok(story.includes('<br>'));
 assert.ok(story.includes('&lt;/最新数据与记录&gt;'));assert.ok(story.includes('黄铜'));
 assert.equal(story.match(/<\/最新数据与记录>/g).length,1);
});
test('Numerical story filtering leaves update and settlement inputs intact',()=>{
 const {rules,state}=setup();state.主角.钱财=72319;state.主角.精液算式='NUMERIC_FORMULA_PRIVATE';at(rules,['主角','钱财']).storyRule='NUMERIC_RULE_PRIVATE';
 const story=C.storyPrompt(rules,state,false);for(const text of ['72319','NUMERIC_FORMULA_PRIVATE','NUMERIC_RULE_PRIVATE'])assert.ok(!story.includes(text));
 assert.ok(JSON.stringify(C.buildMessages(rules,state,[],0)).includes('NUMERIC_FORMULA_PRIVATE'));assert.equal(state.主角.钱财,72319);
});
test('Only old built-in templates migrate and depth rejects malformed values',()=>{
 const {rules}=setup();rules.snapshotTemplate='当前状态：\n{state_json}';delete rules.storyDepth;
 const before=JSON.stringify(rules),upgraded=C.upgradeProfile(rules);assert.ok(upgraded.snapshotTemplate.includes('{state_table}'));assert.equal(upgraded.storyDepth,2);assert.equal(JSON.stringify(rules),before);
 rules.snapshotTemplate='自定义\n{state_json}';rules.storyInstruction='自定义叙事';rules.storyDepth=0;
 const custom=C.upgradeProfile(rules);assert.equal(custom.snapshotTemplate,rules.snapshotTemplate);assert.equal(custom.storyInstruction,'自定义叙事');assert.equal(custom.storyDepth,0);
 for(const value of [-1,101,1.5,'2',null])assert.throws(()=>C.upgradeProfile({...rules,storyDepth:value}),/深度/);
});
test('Empty selection and field preset round trips respect the two new controls',()=>{
 const {rules,state}=setup();for(const field of rules.fieldSchema.fields){field.sendToStory=false;field.storyRule='NOT_SELECTED_RULE';}
 state.世界.地点='EMPTY_SELECTION_SENTINEL';const story=C.storyPrompt(rules,state,true);assert.ok(story.includes('未选择发送'));assert.ok(!story.includes('NOT_SELECTED_RULE'));assert.ok(!story.includes('EMPTY_SELECTION_SENTINEL'));
 const parsed=C.parseRulePreset(C.rulePresetDocument(rules,'参考输出')).rules;assert.ok(parsed.fieldSchema.fields.every(field=>field.sendToStory===false&&field.storyRule==='NOT_SELECTED_RULE'));
 const invalid=copy(rules.fieldSchema);invalid.fields[0].sendToStory='false';assert.throws(()=>C.F.validateSchema(invalid),/开关/);
 invalid.fields[0].sendToStory=true;invalid.fields[0].storyRule='x'.repeat(4001);assert.throws(()=>C.F.validateSchema(invalid),/4000/);
});
console.log('Story output: '+checks.length+' checks passed.');
