'use strict';
const assert=require('node:assert/strict'),withBrowser=require('../browser_harness.cjs');const checks=[];
(async()=>{await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
 const snap=()=>E('__libeiV2App.api.snapshot()'),wait=expr=>E(`__wait(()=>${expr})`),click=text=>E(`__button(${JSON.stringify(text)})`);
 const input=(selector,value)=>E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
 const open=async page=>{await E(`__libeiV2App.open(${JSON.stringify(page)})`);await wait(page==='state'?"!!__root.querySelector('.libei-state-page')":`!!__root.querySelector('[data-editor-page=${page}]')`)};
 const importText=async text=>{await input('[data-preset-text]',text);await click('解析导入草稿')};
 const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
 const nodes=()=>E("JSON.parse([...__memory.entries()].find(([key])=>key.includes(':chat:import-ui.png:import-chat'))[1]).nodes");
 await wait('__libeiV2App.api.snapshot().writerReady');await E("__previewContext.characters[0]={name:'导入回归',avatar:'import-ui.png'};__previewContext.name2='导入回归';__chatId='import-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'心情平静，好感度为十。',swipe_id:0}];__emit('CHAT_CHANGED')");
 await wait("__libeiV2App.api.snapshot().profileKey==='import-ui.png'");await open('rules');
 await check('Raw YAML without a name, version header, clocks or field metadata loads only a draft',async()=>{
  const before=(await snap()).rules;await importText('心情: 平静\n好感度: 10\n随身物品: [钥匙, 手机]');
  await wait("__root.querySelectorAll('[data-field-id]').length===3");
  const labels=await E("[...__root.querySelectorAll('[data-field-prop=label]')].map(el=>el.value)");assert.ok(labels.includes('心情'));assert.ok(!labels.includes('日期'));assert.ok(!labels.includes('时间'));assert.deepEqual((await snap()).rules,before);
 });
 await check('The imported no-clock field set saves as-is without restoring builtin fields',async()=>{
  await click('保存规则');await wait("__libeiV2App.api.snapshot().rules.fieldSchema.fields.length===3 && !__root.querySelector('.libei-rule-actions .bbs-btn-primary').disabled");
  assert.equal((await snap()).rules.fieldSchema.fields.some(f=>f.system==='date'||f.system==='time'),false);assert.equal((await snap()).awaitingPresetGeneration,true);assert.equal((await snap()).rules.initials.length,0);
 });
 await check('No-clock imports can initialize through the real state engine and render all custom fields',async()=>{
  await E("__previewContext.generateRaw=async()=>{__requests.push({kind:'import-init'});const fields=__libeiV2App.api.snapshot().rules.fieldSchema.fields;return JSON.stringify({values:Object.fromEntries(fields.map(f=>[f.id,f.label==='心情'?'开心':f.label==='好感度'?15:['钥匙']]))})}");
  await open('state');await click('手动生成当前状态');await wait('__libeiV2App.api.snapshot().state && !__libeiV2App.api.snapshot().busy');
  const state=(await snap()).state;assert.equal(state.心情,'开心');assert.equal(state.好感度,15);assert.equal(Object.hasOwn(state,'世界'),false);assert.equal(Object.hasOwn(state,'主角'),false);
 });
 await check('Ordinary patch updates work without a clock and preserve the previous snapshot',async()=>{
  const before=await nodes();await E(`__previewContext.chat.push({is_user:true,mes:'继续。'},{is_user:false,is_system:false,mes:'好感度升到了十八。',swipe_id:0});__previewContext.generateRaw=async()=>{__requests.push({kind:'import-update'});return '[{"op":"replace","path":"/好感度","value":18}]'};__libeiV2App.api.refresh()`);
  await click('手动更新 / 重算末楼');await wait('__libeiV2App.api.snapshot().state.好感度===18 && !__libeiV2App.api.snapshot().busy');assert.deepEqual((await nodes()).slice(0,before.length),before);
 });
 await check('Simplified field lists infer enum defaults and allow optional initial schemes',async()=>{
  await open('rules');await importText('字段:\n - 名称: 状态\n   类型: 枚举\n   选项: [平静, 开心]\n - 名称: 在场\n   类型: 开关\n初值方案:\n - 名称: 开局\n   变量: {状态: 开心, 在场: true}');
  await wait("__root.querySelectorAll('[data-field-id]').length===2");assert.ok(await E("__root.querySelector('.libei-initials').textContent.includes('开局')"));assert.equal((await snap()).rules.fieldSchema.fields.length,3);
 });
 await check('Invalid or duplicate typed definitions preserve pasted text, draft fields and saved state',async()=>{
  const before=await snap(),count=await E("__root.querySelectorAll('[data-field-id]').length"),text='字段: [{名称: 分数, 类型: 整数, 默认值: 错误}]';await importText(text);
  await wait("!!__root.querySelector('.libei-preset-error')");assert.equal(await E("__root.querySelector('[data-preset-text]').value"),text);assert.equal(await E("__root.querySelectorAll('[data-field-id]').length"),count);assert.deepEqual((await snap()).rules,before.rules);assert.deepEqual((await snap()).state,before.state);
 });
 for(const width of [390,320]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:true});await check(width+'px flexible import remains usable',async()=>{await E("__root.querySelector('[data-rule-presets]').scrollIntoView({block:'start'})");assert.ok(await E("['[data-rule-presets]','.libei-rules-page','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"));await screenshot('80-flexible-import-'+width+'.png')})}
 await check('Import, save and validation did not create any extra model requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await E('__requests.length'),2)});
});console.log(JSON.stringify({passed:checks.length,mockOnly:true,realSillyTavern:false,checks},null,2))})().catch(error=>{console.error(error.stack);process.exitCode=1});
