'use strict';
const assert=require('node:assert/strict');const withBrowser=require('../browser_harness.cjs');const checks=[];
(async()=>{await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
 const snap=()=>E('__libeiV2App.api.snapshot()'),wait=expression=>E(`__wait(()=>${expression})`),click=text=>E(`__button(${JSON.stringify(text)})`);
 const input=(selector,value)=>E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
 const open=async page=>{await E(`__libeiV2App.open(${JSON.stringify(page)})`);await wait(page==='state'?"!!__root.querySelector('.libei-state-page')":page==='settings'?"!!__root.querySelector('.bbs-master')":`!!__root.querySelector('[data-editor-page=${page}]')`)};
 const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
 const nodes=()=>E("JSON.parse([...__memory.entries()].find(([key])=>key.includes(':chat:experience.png:experience-chat'))[1]).nodes");
 const addTurn=()=>E("__previewContext.chat.push({is_user:true,mes:'继续。'},{is_user:false,is_system:false,mes:'来到南门。',swipe_id:0});__libeiV2App.api.refresh()");
 const reply=body=>E(`__previewContext.generateRaw=async()=>{__requests.push({kind:'experience'});return ${JSON.stringify(JSON.stringify(body))}}`);
 await wait('__libeiV2App.api.snapshot().writerReady');
 await E("__previewContext.characters[0]={name:'体验回归',avatar:'experience.png'};__previewContext.name2='体验回归';__chatId='experience-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'站在门口。',swipe_id:0}];__emit('CHAT_CHANGED')");await wait("__libeiV2App.api.snapshot().profileKey==='experience.png'");
 await check('Update options exist only in Settings and save without modifying chat state',async()=>{
  await open('rules');assert.equal(await E("!!__root.querySelector('[data-update-options]')"),false);await open('context');assert.equal(await E("!!__root.querySelector('[data-update-options]')"),false);
  await click('预览当前草稿');await wait("!!__root.querySelector('[data-context-composition]')");
  await open('settings');await click('状态更新选项');await input('[data-option=contextMessages]','8');await click('保存更新选项');await wait('__libeiV2App.api.snapshot().config.contextMessages===8');assert.equal((await snap()).state,null);await open('context');assert.equal(await E("!!__root.querySelector('[data-context-composition]')"),false);
 });
 await check('Saving a loaded preset applies after one click with no confirmation UI',async()=>{
  await open('rules');await click('载入预设草稿');await click('保存规则');await wait('__libeiV2App.api.snapshot().awaitingPresetGeneration');
  assert.equal(await E("!!__root.querySelector('[data-schema-review],[data-action=confirm-schema]')"),false);
 });
 await check('Initialization displays live wait time, completion time and actual generated field values',async()=>{
  const values=await E("Object.fromEntries(__libeiV2App.api.snapshot().rules.fieldSchema.fields.filter(f=>f.enabled&&(f.updateMode==='ai'||['money','energy'].includes(f.system))).map(f=>[f.id,f.system==='date'?'2026-10-26':f.system==='time'?'09:00':f.path.join('/')==='世界/地点'?'门口':f.default]))");
  await E(`__previewContext.generateRaw=async()=>{__requests.push({kind:'experience'});await new Promise(resolve=>{window.__releaseOutput=resolve});return ${JSON.stringify(JSON.stringify({values}))}}`);
  await open('state');await click('手动生成当前状态');await wait('!!window.__releaseOutput');assert.equal((await snap()).lastUpdate.status,'running');
  await E('new Promise(resolve=>setTimeout(resolve,150))');assert.ok(await E("__root.querySelector('[data-update-time]').textContent.includes('已等待')"));
  await E('__releaseOutput()');await wait('__libeiV2App.api.snapshot().state && !__libeiV2App.api.snapshot().busy');
  const s=await snap();assert.ok(s.lastUpdate.durationMs>=100);assert.ok(await E("__root.querySelector('[data-update-time]').textContent.includes('完成')"));
  const report=JSON.parse(s.lastPatch);assert.equal(report.generatedState.世界.地点,'门口');assert.ok(report.changes.some(change=>change.path==='/世界/地点'&&change.after==='门口'));
  await click('本次更新明细');assert.ok(await E("__root.querySelector('[data-update-details]').textContent.includes('门口')"));await screenshot('70-output-time-initial-details.png');
 });
 await check('A valid empty update explicitly displays no changes',async()=>{
  await addTurn();await reply([]);await click('手动更新 / 重算末楼');await wait('__libeiV2App.api.snapshot().floor===2 && !__libeiV2App.api.snapshot().busy');
  assert.deepEqual(JSON.parse((await snap()).lastPatch).changes,[]);assert.ok(await E("__root.querySelector('[data-update-details]').textContent.includes('本轮无变化')"));
 });
 await check('Normal updates show before/after values and saved history can recover details and timing',async()=>{
  await addTurn();await reply([{op:'replace',path:'/世界/地点',value:'南门'}]);await click('手动更新 / 重算末楼');await wait("__libeiV2App.api.snapshot().state.世界.地点==='南门' && !__libeiV2App.api.snapshot().busy");
  let report=JSON.parse((await snap()).lastPatch);assert.ok(report.changes.some(change=>change.before==='门口'&&change.after==='南门'));
  await E('__libeiV2App.api.setFloor(0)');report=JSON.parse((await snap()).lastPatch);assert.equal(report.generatedState.世界.地点,'门口');assert.ok((await snap()).lastUpdate.durationMs>=100);
  await E("window.__experienceChat=__previewContext.chat;__previewContext.characters[0]={name:'其他角色',avatar:'experience-other.png'};__previewContext.name2='其他角色';__chatId='experience-other-chat';__previewContext.chat=[{is_user:false,mes:'其他开场'}];__emit('CHAT_CHANGED')");
  await wait("__libeiV2App.api.snapshot().profileKey==='experience-other.png'");assert.equal((await snap()).lastUpdate,null);
  await E("__previewContext.characters[0]={name:'体验回归',avatar:'experience.png'};__previewContext.name2='体验回归';__chatId='experience-chat';__previewContext.chat=__experienceChat;__emit('CHAT_CHANGED')");await wait("__libeiV2App.api.snapshot().profileKey==='experience.png'");
  report=JSON.parse((await snap()).lastPatch);assert.ok(report.changes.some(change=>change.after==='南门'));assert.ok((await snap()).lastUpdate.durationMs>=0);
 });
 await check('A failed request records elapsed time and error details without writing a new state',async()=>{
  const before=await nodes();await addTurn();await E("__previewContext.generateRaw=async()=>{__requests.push({kind:'experience'});throw Error('模拟服务失败')}");
  await click('手动更新 / 重算末楼');await wait("__root.querySelector('[role=alert]')?.textContent.includes('模拟服务失败')");
  assert.equal((await snap()).lastUpdate.status,'failed');assert.ok((await snap()).lastUpdate.durationMs>=0);assert.ok(JSON.parse((await snap()).lastPatch).error.includes('模拟服务失败'));assert.deepEqual(await nodes(),before);
 });
 for(const width of [390,320]){await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:true});await check(width+'px time and update details fit the viewport',async()=>{assert.ok(await E("['.libei-state-page','[data-update-details]','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"));await screenshot('71-output-details-'+width+'.png')})}
 await check('All checks remain local with no automatic extra request',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[]);assert.equal(await E('__requests.length'),4)});
});console.log(JSON.stringify({passed:checks.length,mockOnly:true,realSillyTavern:false,checks},null,2))})().catch(error=>{console.error(error.stack);process.exitCode=1});
