import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createFieldSchemaToolkit} from '../src/engine/field-schema.js';
import {createRuleSectionToolkit} from '../src/engine/rule-sections.js';
import {validateReferenceConfig} from '../src/engine/reference-config.js';

const source = await readFile(new URL('../src/engine/legacy-adapter.js',import.meta.url),'utf8');
const sandbox = {TextEncoder,createFieldSchemaToolkit,createRuleSectionToolkit,validateReferenceConfig};
vm.runInNewContext(source.slice(source.indexOf('var LbYamlEmbedded='),source.indexOf('/* Native SillyTavern adapter.')) + '\nglobalThis.core={C:createLibeiStatusCore(LbYamlEmbedded),T:createLibeiTimelineStore};',sandbox);
const {C,T} = sandbox.core, clone = value => JSON.parse(JSON.stringify(value));
const stock = JSON.parse(await readFile(new URL('./fixtures/defaults.json',import.meta.url),'utf8')).rules;
const modern = C.defaultRules(), legacy = C.upgradeProfile(stock);
const chosen = rules => C.chooseInitial({...rules,initialChoice:rules.initials[0].id}).state;
const clothes = schema => schema.fields.filter(field => field.path[0]==='主角'&&field.path[1]==='穿着');
const at = (schema,path) => schema.fields.find(field => field.path.join('/')===path);
const checks = [];
const test = (name,fn) => {fn(); checks.push(name); console.log('PASS '+name);};
const asyncTest = async (name,fn) => {await fn(); checks.push(name); console.log('PASS '+name);};
const storage = () => {const values=new Map();return {values,getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};};

test('Modern default contains four correctly labelled clothing leaves and no physiology in state or prompts',()=>{
  assert.deepEqual(clone(clothes(modern.fieldSchema).map(field=>field.label)),['上装','下装','内裤','鞋袜']);
  const state=chosen(modern);
  assert.deepEqual(Object.keys(state.主角.穿着),['上装','下装','内裤','鞋袜']);
  assert.ok(Object.values(state.主角.穿着).every(slot=>Object.keys(slot).join()==='衣物'&&slot.衣物==='未记录'));
  assert.equal(modern.initialChoice,'');assert.equal(modern.presetName,'默认预设');assert.equal(legacy.presetName,'黎北预设');
  const text=JSON.stringify([state,C.buildMessages(modern,state,[],0),C.storyPrompt(modern,state,true)]);
  assert.doesNotMatch(text,/精液|元精|阳具|遮露|内衬/u);
  assert.ok(modern.fieldSchema.fields.every(field=>field.rule.trim()));
  assert.equal(new Set(clothes(modern.fieldSchema).map(field=>field.rule)).size,4);
  assert.match(at(modern.fieldSchema,'主角/穿着/上装/衣物').rule,/T恤、衬衫或外套/u);
  assert.match(at(modern.fieldSchema,'主角/穿着/下装/衣物').rule,/长裤、短裤/u);
  assert.match(at(modern.fieldSchema,'主角/穿着/内裤/衣物').rule,/不从外裤臆测/u);
  assert.match(at(modern.fieldSchema,'主角/穿着/鞋袜/衣物').rule,/不补写不可见/u);
  assert.match(at(modern.fieldSchema,'主角/随身物品').rule,/正文实际出现.*手机、钥匙、证件/u);
  assert.match(at(modern.fieldSchema,'主角/钱财').rule,/人民币整元/u);
  assert.equal(JSON.stringify(C.upgradeProfile(modern)),JSON.stringify(modern));
});

test('One-time clothing migration preserves subsequent custom labels and rules through save/export/reload',()=>{
  const draft=clone(modern),shirt=at(draft.fieldSchema,'主角/穿着/上装/衣物');
  assert.equal(draft.clothingLayoutVersion,1);shirt.label='今天的外套';shirt.rule='只记录正文明确穿上的外套，不从天气推断。';
  const before=clone(shirt),saved=C.presetRules(draft),reloaded=C.upgradeProfile(clone(saved));
  assert.deepEqual(clone(at(reloaded.fieldSchema,'主角/穿着/上装/衣物')),before);
  const doc=C.rulePresetDocument(reloaded,'改过的衣着'),parsed=C.parseRulePreset(doc);
  assert.deepEqual(Object.keys(parsed.rules).sort(),['fieldSchema','presetName']);
  assert.deepEqual(clone(at(parsed.rules.fieldSchema,'主角/穿着/上装/衣物')),before);
  assert.equal(C.upgradeProfile({...reloaded,...parsed.rules}).fieldSchema.fields.find(field=>field.id===shirt.id).label,'今天的外套');
  assert.throws(()=>C.upgradeProfile({...draft,clothingLayoutVersion:2}),/衣着布局版本/u);
});

test('Retiring obsolete shared clothing prose keeps unrelated single-paragraph requirements',()=>{
  const generic=C.libeiRules(),original=generic.fieldRuleSource;
  assert.equal(generic.updateRules,original.replaceAll('衣物与遮露','上装、下装、内裤和鞋袜'));
  for(const required of ['不将其他人物的状态混入','HH:MM 时间','钱财和消耗用事件报告','跨月前应明确年份'])assert.ok(generic.updateRules.includes(required));
  assert.ok(generic.clothingArchive.rules.some(rule=>rule.id==='shared'&&rule.text===original));
  const old=clone(modern);delete old.clothingLayoutVersion;
  old.updateRules='按实际经过的时间推进。旧遮露规则取消。钱财只能报告明确金额。';
  const upgraded=C.upgradeProfile(old);
  assert.equal(upgraded.updateRules,'按实际经过的时间推进。钱财只能报告明确金额。');
  assert.ok(upgraded.clothingArchive.rules.some(rule=>rule.text===old.updateRules));
});

test('Modern money remains integer and deterministic without energy, formula or body fields',()=>{
  const state=chosen(modern);state.主角.钱财=100;
  const result=C.settleUpdate(state,[{op:'replace',path:'/世界/时间',value:'01:00'},{op:'money',direction:'expense',amount:15,evidence:'花了十五元'}],modern,'花了十五元');
  assert.equal(result.state.主角.钱财,85);assert.equal(result.settlement.gain,0);
  for(const key of ['精液','精液算式','阳具'])assert.equal(Object.hasOwn(result.state.主角,key),false);
  assert.throws(()=>C.settleUpdate(state,[{op:'money',direction:'expense',amount:1.5,evidence:'花了1.5元'}],modern,'花了1.5元'),/整数/u);
  assert.throws(()=>C.settleUpdate(state,[{op:'release',kind:'awake',amount:10,evidence:'旧事件'}],modern,'旧事件'),/停用/u);
  const raw=clone(modern);delete raw.fieldSchema;
  assert.equal(C.upgradeProfile(raw).fieldSchema.fields.length,modern.fieldSchema.fields.length);
  assert.equal(C.settleUpdate(state,[],raw,'').state.主角.钱财,100);
});

test('Shoe aliases bridge only missing target paths in memory and explicit active values win',()=>{
  for(const [from,to,opposite,target] of [[legacy,modern,'鞋履','鞋袜'],[modern,legacy,'鞋袜','鞋履']]) {
    const state=chosen(from);state.主角.穿着[opposite].衣物='已记录的鞋';const before=JSON.stringify(state);
    const prepared=C.prepareProfileState(state,to.fieldSchema);
    assert.equal(prepared.state.主角.穿着[target].衣物,'已记录的鞋');assert.equal(JSON.stringify(state),before);
    assert.equal(C.prepareUpdateBase(state,null,to.fieldSchema).主角.穿着[target].衣物,'已记录的鞋');
    const entries=C.updateEntries(to,state,[],0),view=JSON.parse(entries.find(row=>row.id==='state').content);
    assert.equal(view.previous_state.主角.穿着[target].衣物,'已记录的鞋');
    state.主角.穿着[target]={衣物:'当前路径优先'};
    assert.equal(C.prepareProfileState(state,to.fieldSchema).state.主角.穿着[target].衣物,'当前路径优先');
    assert.equal(state.主角.穿着[opposite].衣物,'已记录的鞋');
  }
});

test('Original LiBei clothing migrates once, keeps legacy IDs/paths, and never calls a short shirt underwear',()=>{
  const input=clone(stock), before=JSON.stringify(input), raw=C.parseYaml(stock.initials[1].text);
  const oldSchema=C.F.infer(raw), upgraded=C.upgradeProfile(input);
  assert.equal(JSON.stringify(input),before);
  assert.equal(C.chooseInitial({...upgraded,initialChoice:'greeting-1'}).state.主角.穿着.内裤.衣物,'未记录');
  assert.match(C.chooseInitial({...upgraded,initialChoice:'greeting-1'}).state.主角.穿着.内衬.衣物,/短褂/u);
  for(const layer of ['上装','下装','鞋履']) {
    const path='主角/穿着/'+layer+'/衣物';
    assert.equal(at(upgraded.fieldSchema,path).id,at(oldSchema,path).id);
    assert.equal(at(upgraded.fieldSchema,path).label,layer==='鞋履'?'鞋袜':layer);
  }
  assert.equal(clothes(upgraded.fieldSchema).length,4);
  assert.ok(upgraded.clothingArchive.fields.some(field=>field.path.includes('遮露')));
  assert.ok(upgraded.clothingArchive.fields.some(field=>field.path.includes('内衬')));
  assert.ok(upgraded.clothingArchive.rules.some(rule=>rule.text.includes('遮露')));
  assert.equal(upgraded.fieldRuleSource,stock.updateRules);
  assert.equal(JSON.stringify(C.upgradeProfile(upgraded)),JSON.stringify(upgraded));
  const update=JSON.stringify(C.buildMessages(upgraded,raw,[],0)),story=C.storyPrompt(upgraded,raw,true);
  assert.doesNotMatch(update,/遮露|内衬/u);assert.doesNotMatch(story,/遮露|内衬/u);
});

test('Already split old profiles archive obsolete rules on surviving fields and retain unrelated metadata',()=>{
  const old=clone(legacy);delete old.clothingLayoutVersion;old.fieldSchema=C.F.infer(C.parseYaml(stock.initials[1].text));
  const shirt=at(old.fieldSchema,'主角/穿着/上装/衣物');shirt.label='旧衣名';shirt.updateMode='manual';shirt.visible=false;shirt.rule='主角.穿着.${内衬|上装|下装|鞋履}:\n  check: 衣物与遮露\n';
  old.fieldRuleSplitVersion=1;old.fieldRuleSource='ORIGINAL_SOURCE';old.updateRules='保持日期一致。\n取消不了的旧遮露规则\n';
  const before=JSON.stringify(old), upgraded=C.upgradeProfile(old), result=at(upgraded.fieldSchema,'主角/穿着/上装/衣物');
  assert.equal(JSON.stringify(old),before);assert.equal(result.id,shirt.id);assert.equal(result.updateMode,'manual');assert.equal(result.visible,false);
  assert.equal(result.label,'上装');assert.equal(upgraded.fieldRuleSource,'ORIGINAL_SOURCE');
  assert.match(upgraded.updateRules,/保持日期一致/u);
  assert.ok(upgraded.clothingArchive.rules.some(rule=>rule.text===shirt.rule));
  assert.equal(JSON.stringify(C.upgradeProfile(upgraded)),JSON.stringify(upgraded));
});

test('Retired clothing rejects writes while underwear and retained legacy footwear remain writable',()=>{
  const raw=C.parseYaml(stock.initials[0].text), state=C.prepareUpdateBase(raw,null,legacy.fieldSchema);
  const before=JSON.stringify(state);
  for(const path of ['/主角/穿着/上装/遮露','/主角/穿着/内衬/衣物','/主角/穿着','/主角/穿着/鞋袜/衣物'])assert.throws(()=>C.settleUpdate(state,[{op:'replace',path,value:'wrong'}],legacy,''));
  assert.equal(JSON.stringify(state),before);
  const result=C.settleUpdate(state,[{op:'replace',path:'/主角/穿着/内裤/衣物',value:'明确记录'},{op:'replace',path:'/主角/穿着/鞋履/衣物',value:'新鞋袜'}],legacy,'');
  assert.equal(result.state.主角.穿着.鞋履.衣物,'新鞋袜');
  assert.equal(result.state.主角.穿着.上装.遮露,state.主角.穿着.上装.遮露);
});

test('Historical clothing overlay uses its own unrelated types and never rewrites saved timeline bytes',()=>{
  const mem=storage(),timeline=T(C,mem,'clothing-test'),scope={card:'old.png',chatId:'chat',chat:[{is_user:false,mes:'opening'}]};
  const rawRules=clone(stock);rawRules.initialChoice='greeting-1';
  const saved=timeline.synchronize(scope,rawRules),before=mem.getItem(saved.key),node=saved.doc.nodes[0],nodeBefore=JSON.stringify(node);
  const historical=C.historicalFieldView(node);
  assert.equal(at(historical.schema,'主角/想法').type,'string');
  assert.equal(historical.state.主角.穿着.内裤.衣物,'未记录');
  assert.deepEqual(clone(clothes(historical.schema).map(field=>field.label)),['上装','下装','内裤','鞋袜']);
  assert.equal(JSON.stringify(node),nodeBefore);assert.equal(mem.getItem(saved.key),before);
  const next=clone(legacy);at(next.fieldSchema,'主角/想法').type='boolean';at(next.fieldSchema,'主角/想法').default=false;
  assert.throws(()=>C.F.prepareState(node.state,next.fieldSchema));
  assert.equal(C.historicalFieldView(node).state.主角.想法,node.state.主角.想法);
  scope.chat.push({is_user:true,mes:'continue'},{is_user:false,mes:'next'});
  const result=C.settleUpdate(C.prepareUpdateBase(node.state,null,legacy.fieldSchema),[],legacy,'');
  const committed=timeline.commit(saved,timeline.append(saved,scope.chat,2,result.state,result.patch,{fieldSchema:legacy.fieldSchema}));
  assert.equal(JSON.stringify(committed.doc.nodes[0]),nodeBefore);
  assert.equal(committed.doc.current.state.主角.穿着.内衬.衣物,node.state.主角.穿着.内衬.衣物);
  assert.equal(committed.doc.current.state.主角.穿着.内裤.衣物,'未记录');
});

test('Schema-less history keeps formerly accepted fractional legacy money and collapses duplicate shoe display only',()=>{
  const old=C.parseYaml(stock.initials[0].text);old.主角.钱财=1.5;
  // Schema-less validation remains backward compatible; a modern inferred money field is integer-only.
  assert.equal(C.validateState(old).主角.钱财,1.5);
  const state=chosen(modern);state.主角.穿着.鞋履={衣物:'旧路径的鞋'};
  const rules=clone(modern);delete rules.clothingLayoutVersion;rules.fieldSchema=C.F.infer(state);rules.initials[0].text=JSON.stringify(state);
  const upgraded=C.upgradeProfile(rules);
  assert.equal(clothes(upgraded.fieldSchema).length,4);
  assert.ok(at(upgraded.fieldSchema,'主角/穿着/鞋履/衣物'));assert.equal(at(upgraded.fieldSchema,'主角/穿着/鞋袜/衣物'),undefined);
  assert.ok(upgraded.clothingArchive.fields.some(field=>field.path.join('/')==='主角/穿着/鞋袜/衣物'));
  assert.equal(chosen(upgraded).主角.穿着.鞋袜.衣物,'未记录');
});

test('Historical explicit schema is cloned while nonclothing field configuration remains untouched',()=>{
  const state=chosen(legacy),schema=clone(legacy.fieldSchema),field=at(schema,'主角/想法');field.type='boolean';field.default=false;field.updateMode='manual';field.label='旧楼独有名称';state.主角.想法=true;
  const node={state,fieldSchema:schema},before=JSON.stringify(node),view=C.historicalFieldView(node);
  assert.deepEqual(clone(at(view.schema,'主角/想法')),field);assert.equal(view.state.主角.想法,true);assert.equal(JSON.stringify(node),before);
});

test('Plain-text presets round-trip only fields and reject legacy bundles or extra configuration',()=>{
  const dirty={...clone(modern),config:{apiKey:'SECRET'},rememberedKey:'SECRET',chat:{messages:['HISTORY']},arbitrary:'SECRET'};
  dirty.initials[0].apiKey='SECRET';
  at(dirty.fieldSchema,'主角/想法').rule='含冒号: 和 # 及换行\n  缩进与中文\n\n';
  const text=C.rulePresetDocument(dirty,'  现代日常  ');
  assert.ok(text.startsWith('# 男主状态字段预设 v1\n'));assert.doesNotMatch(text,/SECRET|HISTORY|apiKey|rememberedKey|initials|systemPrompt|numericConfig|worldbookReferences/u);
  const parsed=C.parseRulePreset(text);assert.equal(parsed.name,'现代日常');assert.deepEqual(clone(parsed.rules),clone(C.fieldPreset({...dirty,presetName:'现代日常'})));
  assert.deepEqual(clone(C.parseRulePreset('\uFEFF'+text.replace(/\n/g,'\r\n'))),clone(parsed));
  for(const invalid of ['{bad','[]',JSON.stringify({format:'libei-rule-preset-v1',name:'旧版',rules:modern}),text+'初值: {}\n',text+'名称: 重复\n',text.replace(/^名称:.*$/mu,'名称: &bad 现代日常'),text.replace(/^名称:.*$/mu,'名称: !tag 现代日常'),'x'.repeat(250001)])assert.throws(()=>C.parseRulePreset(invalid));
  const duplicate=clone(modern);duplicate.fieldSchema.fields.push(clone(duplicate.fieldSchema.fields[0]));assert.throws(()=>C.rulePresetDocument(duplicate,'重复字段'));
  const unsafe=clone(modern);unsafe.fieldSchema.fields[0].path=['世界','__proto__'];assert.throws(()=>C.rulePresetDocument(unsafe,'非法路径'));
});

test('Initialization accepts ordinary field evidence without weakening program numeric evidence',()=>{
  const rules=C.defaultRules(),fields=C.presetGenerationFields(rules),values=Object.fromEntries(fields.map(field=>[field.id,clone(field.default)]));
  const location=at(rules.fieldSchema,'世界/地点'),money=fields.find(field=>field.system==='money');
  values[location.id]='门口';const context=[{content:'站在门口，钱包里有四十二元。'}];
  const parse=evidence=>C.parsePresetState(JSON.stringify({values,evidence}),rules,context);
  assert.equal(parse({[location.id]:'站在门口'}).世界.地点,'门口');
  values[money.id]=42;
  assert.throws(()=>parse({[location.id]:'站在门口'}),/程序数值初始化缺少/u);
  assert.throws(()=>parse({[money.id]:'不在正文中的引文'}),/程序数值初始化缺少/u);
  assert.equal(parse({[location.id]:'站在门口',[money.id]:'钱包里有四十二元'}).主角.钱财,42);
  for(const id of ['字段ID','钱财','/主角/钱财'])assert.throws(()=>parse({[id]:'钱包里有四十二元'}),error=>error.message.includes(id)&&error.message.includes('未允许的字段 ID'));
  assert.throws(()=>parse({[location.id]:{text:'站在门口'}}),/初始化引文须为/u);
  assert.throws(()=>parse({[location.id]:'x'.repeat(501)}),/初始化引文须为/u);
});

// Exercise the exact runtime operation bodies with in-memory dependencies, without a DOM or host install.
const presetBody=source.slice(source.indexOf('  /* Rule presets: explicit'),source.indexOf('  /* End rule preset operations. */'));
const planBody=source.slice(source.indexOf('  function fieldPlanScope('),source.indexOf('  function previewRulesChange('));
const evolutionBody=source.slice(source.indexOf('  function assertSchemaEvolution('),source.indexOf('  function fieldStateView('));
const generationBody=source.slice(source.indexOf('  /* Preset state generation:'),source.indexOf('  /* End preset state generation. */'));
const snapshotBody=source.slice(source.indexOf('  function snapshot() {'),source.indexOf('  const engineApi = {'));
const injectionBody=source.slice(source.indexOf('  function refreshInjection('),source.indexOf('  function gatherContext('));
const captureBody=source.slice(source.indexOf('  function capture('),source.indexOf('  const serial = value =>'));
const gatherBody=source.slice(source.indexOf('  function gatherContext('),source.indexOf('  async function compute('));
const updateBody=source.slice(source.indexOf('  async function runUpdates('),source.indexOf('  function recoverGeneration('));
const stateViewBody=source.slice(source.indexOf('  function fieldStateView('),source.indexOf('  function assertFieldIdle('));
const updateGuardBody=source.slice(source.indexOf('  function containsUpdates('),source.indexOf('  function status('));
vm.runInNewContext(`globalThis.makeHarness=function(C,createTimeline,genericRules,builtinLibeiRules,initial){
  const copy=value=>JSON.parse(JSON.stringify(value));let stored=copy(initial),settingsRaw=JSON.stringify(stored),revision=0,viewId=null,rulePresetPlan=null,draftRules=null,draftProfileKey='',rulesDirty=false,apiDirty=false,destroyed=false,busy=false,generating=false,writable=true,writerReady=true,autoAllowed=false,generationTargetId=null,lastPatch='';
  let scope={card:'role.png',chatId:'chat',name:'fixture',chat:[{is_user:false,mes:'opening'}]},downloads=[],requests=[],writes=0,timelineWrites=0,reply='',requestHook=null,failTimeline=false,failSettings=false;
  const serial=JSON.stringify,KEY='fixture-settings',memory=new Map([[KEY,settingsRaw]]),DEFAULTS={namespace:'fixture-preset'};
  const activeProfileKey=()=>scope.card,identity=()=>scope,activeRules=()=>stored.profiles[scope.card]||stored.rules;
  const assertWrite=()=>{if(!writable)throw Error('readonly')},LB_IS_GENERATING=()=>generating,protagonistName=()=>scope.name;
  const storage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>{assertWrite();if(failTimeline)throw Error('timeline-quota');memory.set(key,value);timelineWrites++},removeItem:key=>memory.delete(key)};
  const T=createTimeline(C,storage,'fixture-preset'),host={crypto:{randomUUID:()=>String(++uuid)},localStorage:{getItem:key=>memory.get(key)??null}};let uuid=0;
  T.synchronize(scope,{...builtinLibeiRules,initialChoice:builtinLibeiRules.initials[0].id});timelineWrites=0;
  const persist=next=>{assertWrite();if(failSettings)throw Error('settings-quota');stored=copy(next);settingsRaw=JSON.stringify(stored);memory.set(KEY,settingsRaw);revision++;writes++};
  const statusLine={textContent:'fixture',dataset:{}},updateBtn={disabled:false};let injection={enabled:false,content:'',reason:''},injectDisposer=null;const INJECT_ID='fixture-inject';
  const status=()=>{},fillRuleOptions=()=>{},renderState=()=>{},download=(name,value)=>downloads.push(copy(value)),configReady=()=>{},body=message=>C.cleanMessage(message.mes||'');
  const latestAI=chat=>chat.findLastIndex(message=>!message.is_user&&!message.is_system),setBusy=value=>{busy=value},key='';
  const completion=async messages=>{requests.push(copy(messages));if(requestHook)await requestHook();return reply};
  const apiBridge={enabled:()=>true},native=name=>name==='uninjectPrompts'?()=>{}:prompts=>({uninject:()=>{}});
  const timeline=()=>{if(writable)return T.synchronize(scope,activeRules());const saved=T.read(scope,activeRules());return {...saved,view:T.reconcile(saved.doc,scope.chat)}};
  const selectedFloor=()=>viewId===null?timeline().view.current?.id??-1:viewId;
  ${planBody}\n${evolutionBody}\n${presetBody}\n${captureBody}\n${updateGuardBody}\n${gatherBody}\n${stateViewBody}\n${injectionBody}\n${generationBody}\n${updateBody}\n${snapshotBody}
  return {listRulePresets,saveRulePreset,deleteRulePreset,exportRulePreset,parseRulePreset,previewRulePreset,commitRulePreset,assertSchemaEvolution,generatePresetState,automatic:()=>runUpdates(true),update:()=>runUpdates(false),view:snapshot,refreshInjection,
    snapshot:()=>copy({stored,downloads,requests,writes,timelineWrites,draftRules,timeline:T.read(scope,activeRules()).doc,timelineBytes:storage.getItem(T.keyFor(scope)),injection}),
    set:(key,value)=>{if(key==='card')scope.card=value;else if(key==='chatId')scope.chatId=value;else if(key==='busy')busy=value;else if(key==='generating')generating=value;else if(key==='writable'){writable=value;writerReady=value;}else if(key==='revision')revision++;else if(key==='selection')viewId=value;else if(key==='transcript')scope.chat.push({mes:value});else if(key==='stored'){settingsRaw='external-change';memory.set(KEY,settingsRaw)}else if(key==='reply')reply=value;else if(key==='hook')requestHook=value;else if(key==='chat')scope.chat=copy(value);else if(key==='failTimeline')failTimeline=value;else if(key==='failSettings')failSettings=value;}}
};`,sandbox);
const harness=()=>sandbox.makeHarness(C,T,modern,legacy,{version:1,rules:clone(legacy),profiles:{'role.png':clone(legacy)},rulePresets:[],config:{model:'UNTOUCHED_MODEL',contextMessages:6},rememberedKey:'SECRET',timeline:'UNTOUCHED_CHAT'});

test('Preset listing is cloned, keeps original LiBei builtin, and user save/delete touch only preset storage',()=>{
  const api=harness(),before=api.snapshot(),list=api.listRulePresets();
  assert.deepEqual(clone(list.map(item=>item.id)),['modern','libei']);assert.deepEqual(clone(list.map(item=>item.label)),['默认预设','黎北预设']);
  assert.deepEqual(clone(list[1].rules.fieldSchema),clone(legacy.fieldSchema));
  for(const item of list)assert.deepEqual(Object.keys(item.rules).sort(),['fieldSchema','presetName']);
  list[0].rules.fieldSchema.fields[0].label='mutated';assert.notEqual(api.listRulePresets()[0].rules.fieldSchema.fields[0].label,'mutated');
  const saved=api.saveRulePreset('我的预设',modern,'role.png');assert.equal(saved.builtin,false);assert.equal(api.listRulePresets().length,3);
  assert.deepEqual(Object.keys(saved.rules).sort(),['fieldSchema','presetName']);
  assert.equal(JSON.stringify(api.snapshot().stored.profiles),JSON.stringify(before.stored.profiles));
  assert.equal(api.snapshot().stored.timeline,'UNTOUCHED_CHAT');assert.equal(api.snapshot().stored.rememberedKey,'SECRET');
  assert.throws(()=>api.deleteRulePreset('modern','role.png'));api.deleteRulePreset(saved.id,'role.png');assert.equal(api.listRulePresets().length,2);
});

test('Preset export/parse are read-only and profile guarded',()=>{
  const api=harness(),before=api.snapshot();api.set('writable',false);
  const doc=api.exportRulePreset(modern,'日常','role.png');assert.equal(api.snapshot().writes,before.writes);
  assert.equal(api.parseRulePreset(doc,'role.png').name,'日常');
  assert.equal(api.snapshot().downloads.length,0);
  assert.doesNotMatch(JSON.stringify(api.snapshot().downloads),/SECRET|UNTOUCHED_CHAT|UNTOUCHED_MODEL/u);
  assert.throws(()=>api.parseRulePreset(doc,'other.png'));assert.throws(()=>api.exportRulePreset(modern,'日常','other.png'));
});

await asyncTest('Preset replacement needs its own preview/commit, stays blank until manual generation, and preserves history',async()=>{
  const api=harness(),before=api.snapshot(),plan=api.previewRulePreset(modern,'role.png');
  assert.equal(api.snapshot().writes,0);assert.ok(plan.changes.some(change=>change.kind==='field-retire'));
  assert.throws(()=>api.assertSchemaEvolution(legacy.fieldSchema,modern.fieldSchema),/不能删除/u);
  assert.throws(()=>api.commitRulePreset('wrong'));api.commitRulePreset(plan.planId);
  const after=api.snapshot();assert.equal(after.writes,1);assert.deepEqual(clone(after.stored.profiles['role.png']),clone(modern));
  assert.equal(JSON.stringify(after.stored.rules),JSON.stringify(before.stored.rules));assert.equal(JSON.stringify(after.stored.config),JSON.stringify(before.stored.config));
  assert.equal(after.stored.timeline,'UNTOUCHED_CHAT');assert.equal(after.stored.rememberedKey,'SECRET');assert.throws(()=>api.commitRulePreset(plan.planId));
  assert.equal(after.timelineWrites,1);assert.deepEqual(after.timeline.nodes,before.timeline.nodes);
  assert.equal(after.timeline.awaitingPresetGeneration.card,'role.png');assert.equal(after.timeline.awaitingPresetGeneration.chatId,'chat');
  assert.equal(after.timeline.awaitingPresetGeneration.presetFingerprint,C.presetFingerprint(modern));
  assert.equal(api.view().awaitingPresetGeneration,true);assert.equal(api.view().state,null);
  assert.deepEqual(clone(api.view().stateFieldSchema),clone(modern.fieldSchema));
  assert.equal(api.snapshot().timelineBytes,after.timelineBytes);assert.equal(api.snapshot().injection.enabled,false);
  api.set('selection',0);assert.equal(api.view().awaitingPresetGeneration,true);assert.ok(api.view().state);assert.equal(api.snapshot().timelineBytes,after.timelineBytes);
  api.set('selection',null);await api.automatic();assert.equal(api.snapshot().requests.length,0);assert.equal(api.view().state,null);
  const values=Object.fromEntries(C.presetGenerationFields(modern).map(field=>[field.id,field.system==='date'?'第2天':field.system==='time'?'12:00':field.type==='integer'||field.type==='number'?0:field.type==='object'?{}:field.type==='array'?[]:field.type==='boolean'?false:field.type==='enum'?field.options[0]:'新生成'+field.label]));
  api.set('reply',JSON.stringify({values}));const generated=await api.generatePresetState('role.png');
  assert.equal(generated.generated,true);const final=api.snapshot();
  assert.equal(final.timeline.awaitingPresetGeneration,undefined);assert.equal(api.view().awaitingPresetGeneration,false);
  assert.deepEqual(final.timeline.nodes.slice(0,before.timeline.nodes.length),before.timeline.nodes);
  assert.equal(final.timeline.nodes.at(-1).action,'preset-generation');assert.deepEqual(final.timeline.nodes.at(-1).backup,before.timeline.current.state);
  assert.equal(api.view().state.主角.钱财,0);assert.equal(api.view().state.主角.穿着.鞋袜.衣物,'新生成鞋袜');assert.equal(final.injection.enabled,true);
  assert.equal(JSON.parse(final.requests[0].findLast(entry=>entry.role==='user').content).previous_state,null);
  const schemaRows=JSON.parse(final.requests[0].find(entry=>entry.content.startsWith('[{')).content);
  assert.ok(schemaRows.every(field=>field.required&&!Object.hasOwn(field,'default')));
});

test('Preset plans reject stale profile/chat/transcript/config/selection/revision and busy/read-only commits',()=>{
  for(const [key,value] of [['card','other.png'],['chatId','other-chat'],['transcript','new turn'],['stored',null],['selection',0],['revision',null],['busy',true],['generating',true],['writable',false]]){
    const api=harness(),plan=api.previewRulePreset(modern,'role.png');api.set(key,value);assert.throws(()=>api.commitRulePreset(plan.planId),key);assert.equal(api.snapshot().writes,0);
  }
  for(const key of ['busy','generating']){const api=harness();api.set(key,true);assert.throws(()=>api.previewRulePreset(modern,'role.png'));assert.throws(()=>api.saveRulePreset('name',modern,'role.png'));}
  const api=harness();api.set('writable',false);assert.throws(()=>api.previewRulePreset(modern,'role.png'));assert.throws(()=>api.saveRulePreset('name',modern,'role.png'));
});
console.log('Clothing/preset engine checks: '+checks.length+' passed; in-memory only, no real SillyTavern.');
