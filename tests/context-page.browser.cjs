'use strict';
const assert=require('node:assert/strict');
const withBrowser=require('../browser_harness.cjs');
const checks=[];
(async()=>{
 await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
  const snap=()=>E('__libeiV2App.api.snapshot()');
  const wait=expression=>E(`__wait(()=>${expression})`);
  const input=(selector,value)=>E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
  const click=text=>E(`__button(${JSON.stringify(text)})`);
  const open=async page=>{await E(`__libeiV2App.open(${JSON.stringify(page)})`);await wait(page==='state'?"!!__root.querySelector('.libei-state-page')":`!!__root.querySelector('[data-editor-page=${page}]')`)};
  const visible=selector=>E(`!!__root.querySelector(${JSON.stringify(selector)})?.getClientRects().length`);
  const text=selector=>E(`__root.querySelector(${JSON.stringify(selector)}).value`);
  const nodes=()=>E("JSON.parse([...__memory.entries()].find(([key])=>key.includes(':chat:context-ui.png:context-chat'))[1]).nodes");
  const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
  const name='input[maxlength="120"]',prompt='[data-rule-field=systemPrompt] textarea',numeric='[data-rule-field=numericConfig] textarea';
  await wait('__libeiV2App.api.snapshot().writerReady');
  await E("__previewContext.characters[0]={name:'上下文回归',avatar:'context-ui.png'};__previewContext.name2='上下文回归';__chatId='context-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'开场',swipe_id:0}];__emit('CHAT_CHANGED')");
  await wait("__libeiV2App.api.snapshot().profileKey==='context-ui.png'");
  await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;Object.assign(rules,__libeiV2App.api.listRulePresets().find(p=>p.id==='libei').rules);rules.initials=[rules.initials.find(p=>p.id==='generic')||rules.initials[0]];rules.initialChoice=rules.initials[0].id;__libeiV2App.api.commitRulePreset(__libeiV2App.api.previewRulePreset(rules).planId);__libeiV2App.api.saveRules(rules,'context-ui.png')})()");
  await open('rules');
  const original=(await snap()).rules;
  await check('Four navigation pages separate context from variables and keep protagonist name above presets',async()=>{
   assert.equal(await E("__root.querySelectorAll('.bbs-nav-item').length"),4);
   assert.equal(await visible('[data-rule-presets]'),true);assert.equal(await visible('.libei-context-region'),false);
   assert.ok(await E(`(__root.querySelector(${JSON.stringify(name)}).compareDocumentPosition(__root.querySelector('[data-rule-presets]')) & Node.DOCUMENT_POSITION_FOLLOWING)!==0`));
   await E("__root.querySelector('.bbs-nav-item[aria-label=上下文]').click()");await wait("!!__root.querySelector('[data-editor-page=context]')");
   assert.equal(await visible('.libei-context-region'),true);assert.equal(await visible('[data-rule-presets]'),false);assert.equal(await visible(name),false);
  });
  await check('Unsaved variable and context edits survive navigation including a state-page visit',async()=>{
   await open('rules');await input(name,'未保存称呼');await open('context');await input(prompt,original.systemPrompt+' CONTEXT_DRAFT');
   await open('state');await open('rules');assert.equal(await text(name),'未保存称呼');await open('context');assert.ok((await text(prompt)).includes('CONTEXT_DRAFT'));
   assert.deepEqual((await snap()).rules,original);
  });
  await check('Saving context preserves hidden variable draft and does not modify existing state nodes',async()=>{
   const before=await nodes();await click('保存上下文');await wait("__libeiV2App.api.snapshot().rules.systemPrompt.includes('CONTEXT_DRAFT')");
   assert.equal((await snap()).rules.protagonistName,original.protagonistName);assert.deepEqual(await nodes(),before);
   await open('rules');assert.equal(await text(name),'未保存称呼');
  });
  await check('Saving variables leaves unsaved context text and invalid numeric draft untouched',async()=>{
   await open('context');const saved=(await snap()).rules.systemPrompt;await input(prompt,saved+' SECOND_DRAFT');await input(numeric,'{bad');
   await open('rules');await click('保存规则');await wait("__libeiV2App.api.snapshot().rules.protagonistName==='未保存称呼'");
   assert.equal((await snap()).rules.systemPrompt,saved);await open('context');assert.equal(await text(numeric),'{bad');assert.ok((await text(prompt)).includes('SECOND_DRAFT'));
   await click('保存上下文');await wait("__root.querySelector('.libei-error')?.textContent.includes('JSON')");assert.equal((await snap()).rules.systemPrompt,saved);
  });
  await check('Discarding context keeps the other page draft and does not change saved configuration',async()=>{
   await open('rules');await input(name,'还没保存的称呼');await open('context');await click('放弃修改');
   assert.equal(await text(numeric),JSON.stringify((await snap()).rules.numericConfig,null,2));assert.ok(!(await text(prompt)).includes('SECOND_DRAFT'));
   await open('rules');assert.equal(await text(name),'还没保存的称呼');await click('放弃修改');await open('context');
  });
  await check('Composition preview reports actual entry sizes and readonly guards without requests or writes',async()=>{
   const before=await E('JSON.stringify([...__memory.entries()])'),calls=await E('__requests.length');
   await click('预览当前草稿');await wait("!!__root.querySelector('[data-context-composition]')");
   await E("__root.querySelector('[data-context-composition]').open=true");
   const expected=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'context-ui.png'})");
   assert.equal(await E("__root.querySelectorAll('[data-context-module]').length"),expected.update.entries.length+expected.story.entries.length);
   assert.ok(await E("__root.querySelector('[data-context-module=\"update:guard\"]').textContent.includes('只读')"));
   assert.equal(await E('JSON.stringify([...__memory.entries()])'),before);assert.equal(await E('__requests.length'),calls);
   await screenshot('60-context-composition-desktop.png');
  });
  for(const width of [390,320]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:true});
   await check(width+'px context navigation and composition stay within their containers',async()=>{
    assert.ok(await E("['.libei-context-page','.libei-context-region','[data-context-composition]','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"));
    await screenshot('61-context-composition-'+width+'.png');
   });
  }
  await check('Rejected update reports its exact operation, preserves state and makes no automatic repair request',async()=>{
   const before=await nodes(),calls=await E('__requests.length');
   await E(`__previewContext.chat.push({is_user:true,mes:'继续。'},{is_user:false,is_system:false,mes:'来到门口。',swipe_id:0});__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'diagnostic',messages:prompt});return '[{"op":"replace","path":"/世界/地点","value":"门口"},{"op":"replace","path":"/主角/钱财","value":99}]'};__libeiV2App.api.refresh()`);
   await open('state');await click('手动更新 / 重算末楼');await wait("__root.querySelector('[role=alert]')?.textContent.includes('第 2 条操作')");
   const details=JSON.parse((await snap()).lastPatch);assert.equal(details.status,'rejected');assert.equal(details.operationIndex,2);assert.equal(details.path,'/主角/钱财');assert.equal(details.stateChanged,false);
   assert.deepEqual(await nodes(),before);assert.equal(await E('__requests.length'),calls+1);await open('context');
  });
  await check('Changing roles drops both old drafts and keeps all calls isolated',async()=>{
   await input(prompt,'OLD_ROLE_CONTEXT');await open('rules');await input(name,'OLD_ROLE_NAME');
   await E("__previewContext.characters[0]={name:'另一个角色',avatar:'context-other.png'};__previewContext.name2='另一个角色';__chatId='context-other-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'另一个开场'}];__emit('CHAT_CHANGED')");
   await wait("__libeiV2App.api.snapshot().profileKey==='context-other.png'");assert.equal(await text(name),'');await open('context');assert.ok(!(await text(prompt)).includes('OLD_ROLE_CONTEXT'));
   assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await E('__requests.length'),1);
  });
 });
 console.log(JSON.stringify({passed:checks.length,mockOnly:true,realSillyTavern:false,checks},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1});
