'use strict';
const assert=require('node:assert/strict');
const withBrowser=require('../browser_harness.cjs');
const checks=[];
(async()=>{
 await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
  const snap=()=>E('__libeiV2App.api.snapshot()');
  const wait=expression=>E(`__wait(()=>${expression})`);
  const click=text=>E(`__button(${JSON.stringify(text)})`);
  const tap=selector=>E(`__root.querySelector(${JSON.stringify(selector)}).click()`);
  const input=(selector,value)=>E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
  const memory=()=>E('JSON.stringify([...__memory.entries()])');
  const timeline=()=>E("JSON.stringify([...__memory.entries()].filter(([key])=>key.includes(':chat:reference-ui.png:reference-chat')))");
  const calls=()=>E('__requests.length');
  const entry=uid=>`[data-reference-book="绑定资料"][data-reference-uid="${uid}"]`;
  const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
  const open=async page=>{await E(`__libeiV2App.open(${JSON.stringify(page)})`);await wait(page==='state' ? "!!__root.querySelector('.libei-state-page')" : `!!__root.querySelector('[data-editor-page=${page}]')`)};
  await wait('__libeiV2App.api.snapshot().writerReady');
  await E("__previewContext.characters[0]={name:'条目回归',avatar:'reference-ui.png',data:{extensions:{world:'绑定资料'}}};__previewContext.name2='条目回归';__chatId='reference-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'开场',swipe_id:0}];__emit('CHAT_CHANGED')");
  await wait("__libeiV2App.api.snapshot().profileKey==='reference-ui.png'");
  const original='---\r\n变量更新规则:\r\n  总则:\r\n    check: 通用原文不改写\r\n  世界.地点:\r\n    check: 地点只记实际到达的位置\r\n  黎北.想法:\r\n    check: 想法原文与旧路径保留\r\n  未识别.字段:\r\n    check: 不得丢掉这一段\r\n';
  await E(`(()=>{const rules=__libeiV2App.api.snapshot().rules;rules.initialChoice='generic';rules.updateRules=${JSON.stringify(original)};rules.numericRules='MUST_NOT_SEND_OLD_NUMERIC';delete rules.fieldRuleSplitVersion;delete rules.fieldRuleSource;__libeiV2App.api.saveRules(rules,'reference-ui.png');window.__referenceLore=[{name:'reference-ui',extraBooks:['附加资料']}];window.__referenceBooks={'绑定资料':{entries:{'7':{uid:7,comment:'时间与数值参考',content:'SELECTED_REFERENCE_BODY\\n{{setvar::unsafe::1}} <%= window.__refEval=true %>',disable:true},'5':{uid:5,comment:'[mvu]不允许引用',content:'EXCLUDED_BODY'},'9':{uid:9,comment:'<img src=x onerror="window.__refXss=true">',content:'UNSELECTED_BODY'}}},'附加资料':{entries:{'11':{uid:11,comment:'附加条目',content:'AUXILIARY_BODY'}}},'全局资料':{entries:{'1':{uid:1,content:'GLOBAL_BODY'}}},'另一角色资料':{entries:{'1':{uid:1,comment:'另一角色条目',content:'OTHER_ROLE_BODY'}}}};window.__referenceLoads=[]})()`);
  await open('state');
  await check('State rows remove type/writer subtitles and have compact padding',async()=>{
   assert.equal(await E("__root.querySelectorAll('[data-field-value] dt span').length"),0);
   assert.ok(await E("[...__root.querySelectorAll('[data-field-value] dt,[data-field-value] dd')].every(el=>parseFloat(getComputedStyle(el).paddingTop)<=10&&parseFloat(getComputedStyle(el).paddingBottom)<=10)"));
   assert.equal((await snap()).state.世界.地点,'未记录');await screenshot('40-state-compact-desktop.png');
  });
  await open('rules');
  const locationId=(await snap()).rules.fieldSchema.fields.find(field=>field.path.join('/')==='世界/地点').id;
  await check('Rules are verbatim under their fields while common and unknown source remains visible',async()=>{
   const s=await snap();assert.equal(s.rules.fieldRuleSource,original);assert.equal(Object.hasOwn(s.rules,'numericRules'),false);
   const rule=await E(`__root.querySelector('[data-field-id="${locationId}"] [data-field-prop=rule]').value`);
   const storedRule=s.rules.fieldSchema.fields.find(field=>field.id===locationId).rule;
   // HTML textarea.value normalizes CRLF for display; the untouched saved source must remain byte-exact.
   assert.equal(rule,storedRule.replace(/\r\n/g,'\n'));assert.ok(storedRule.includes('  世界.地点:\r\n    check: 地点只记实际到达的位置\r\n'));
   assert.ok(s.rules.fieldSchema.fields.find(field=>field.path.join('/')==='主角/想法').rule.includes('黎北.想法:'));
   assert.ok(s.rules.updateRules.includes('通用原文不改写'));assert.ok(s.rules.updateRules.includes('不得丢掉这一段'));assert.ok(!s.rules.updateRules.includes('地点只记'));
   assert.equal(await E("__root.querySelectorAll('[data-rule-field=numericRules]').length"),0);assert.equal(await E("__root.querySelectorAll('[data-rule-field=numericConfig]').length"),1);
   await E(`__root.querySelector('[data-field-id="${locationId}"]').open=true;__root.querySelector('[data-field-id="${locationId}"]').scrollIntoView({block:'start'})`);await screenshot('41-verbatim-field-rule.png');
  });
  await open('context');
  await E("__root.querySelector('[data-rule-field=worldbookReferences]').open=true");
  await wait(`!!__root.querySelector('${entry('7')}')`);
  await check('Picker lists only bound primary/auxiliary books, never unrelated global books',async()=>{
   assert.deepEqual(await E("[...__root.querySelectorAll('[data-reference-book]')].map(el=>el.dataset.referenceBook).filter((value,index,list)=>list.indexOf(value)===index)"),['绑定资料','附加资料']);
   assert.ok(!(await E('__referenceLoads')).includes('全局资料'));assert.equal(await E(`__root.querySelector('${entry('5')} input').disabled`),true);
   assert.equal(await E(`__root.querySelector('${entry('7')} input').disabled`),false);assert.ok(await E(`__root.querySelector('${entry('7')}').textContent.includes('来源已停用')`));
  });
  await check('Selecting an entry is a reversible unsaved draft with no model, state or worldbook write',async()=>{
   const bytes=await memory(),count=await calls(),book=await E('JSON.stringify(__referenceBooks)');
   await tap(entry('7')+' input');await wait("__root.querySelectorAll('[data-selected-reference]').length===1");
   assert.deepEqual((await snap()).rules.worldbookReferences,[]);assert.equal(await memory(),bytes);assert.equal(await calls(),count);assert.equal(await E('JSON.stringify(__referenceBooks)'),book);
   await click('放弃修改');await wait("__root.querySelectorAll('[data-selected-reference]').length===0");
   await tap(entry('7')+' input');await wait("__root.querySelectorAll('[data-selected-reference]').length===1");
  });
  await check('Search and raw previews use inert text, leaving worldbook data unchanged',async()=>{
   const bytes=await memory();await input('[data-rule-field=worldbookReferences] input[type=search]','附加条目');
   assert.equal(await E("__root.querySelectorAll('[data-reference-book]').length"),1);
   await input('[data-rule-field=worldbookReferences] input[type=search]','');
   await E(`__root.querySelector('${entry('9')} details').open=true`);
   assert.equal(await E("!!window.__refXss||!!window.__refEval||!!__root.querySelector('img[src=x]')"),false);assert.equal(await memory(),bytes);
  });
  await check('Saving persists stable book/UID only and never resets the existing chat',async()=>{
   const bytes=await timeline(),state=(await snap()).state;await click('保存上下文');
   await wait("__libeiV2App.api.snapshot().rules.worldbookReferences.length===1");
   assert.deepEqual((await snap()).rules.worldbookReferences,[{book:'绑定资料',uid:'7'}]);assert.equal(await timeline(),bytes);assert.deepEqual((await snap()).state,state);
  });
  await check('Collected preview includes selected raw JSON data but no retired rules or unselected material',async()=>{
   const bytes=await memory(),count=await calls();
   const p=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'reference-ui.png',includeWorldbooks:true})");
   assert.ok(p.update.messages[0].content.includes('SELECTED_REFERENCE_BODY'));assert.ok(!p.update.messages[0].content.includes('{{'));
   const text=JSON.stringify(p);assert.ok(!text.includes('MUST_NOT_SEND_OLD_NUMERIC'));assert.ok(!text.includes('UNSELECTED_BODY'));assert.ok(!text.includes('EXCLUDED_BODY'));assert.ok(!text.includes('GLOBAL_BODY'));
   assert.equal(await memory(),bytes);assert.equal(await calls(),count);assert.equal(await E('!!window.__refEval||!!window.__refXss'),false);
  });
  await check('References resolve current content by UID rather than storing a copied text',async()=>{
   await E("__referenceBooks['绑定资料'].entries['7'].content='LIVE_REFERENCE_BODY';__previewContext.chat.push({is_user:true,mes:'继续'},{is_user:false,is_system:false,mes:'本轮正文，时间不变。',swipe_id:0});__libeiV2App.api.refresh()");
   const p=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'reference-ui.png',includeWorldbooks:true})");
   assert.ok(p.update.messages[0].content.includes('LIVE_REFERENCE_BODY'));
   await E("__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'reference-update',messages:JSON.parse(JSON.stringify(prompt))});return '[]'};__libeiV2App.api.update()");
   assert.deepEqual(await E("__requests.findLast(row=>row.kind==='reference-update').messages"),p.update.messages);assert.deepEqual((await snap()).pending,[]);
  });
  await check('Book rebinding or reference edits while the model is pending discard its result without a state write',async()=>{
   for(const change of ['binding','content']) {
    const before=await timeline(),count=await calls();
    await E("window.__modelStarted=new Promise(resolve=>window.__signalModelStarted=resolve);__previewContext.generateRaw=({prompt})=>{__requests.push({kind:'reference-held',messages:JSON.parse(JSON.stringify(prompt))});return new Promise(resolve=>{window.__releaseReferenceModel=resolve;__signalModelStarted(true)})};window.__pendingReferenceUpdate=__libeiV2App.api.update().then(()=>'',error=>error.message);true");
    await E('__modelStarted');
    if(change==='binding') await E("__previewContext.characters[0].data.extensions.world='另一角色资料'");
    else await E("__referenceBooks['绑定资料'].entries['7'].content='CHANGED_WHILE_MODEL_PENDING'");
    await E("__releaseReferenceModel('[]')");assert.ok(await E('__pendingReferenceUpdate'));
    assert.equal(await timeline(),before);assert.equal(await calls(),count+1);
    await E("__previewContext.characters[0].data.extensions.world='绑定资料';__referenceBooks['绑定资料'].entries['7'].content='LIVE_REFERENCE_BODY'");
   }
   await E("__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'reference-update',messages:JSON.parse(JSON.stringify(prompt))});return '[]'}");
  });
  await check('Missing referenced entries stop model requests and stay removable in the picker',async()=>{
   await E("delete __referenceBooks['绑定资料'].entries['7']");const bytes=await timeline(),count=await calls();
   assert.ok(await E("(async()=>{try{await __libeiV2App.api.update();return ''}catch(error){return error.message}})()"));
   assert.equal(await timeline(),bytes);assert.equal(await calls(),count);
   await tap('[data-action=refresh-references]');await wait("__root.querySelector('[data-selected-reference]')?.textContent.includes('引用缺失')");
   await tap('[data-action=remove-reference]');await wait("__root.querySelectorAll('[data-selected-reference]').length===0");
   assert.equal((await snap()).rules.worldbookReferences.length,1);await click('放弃修改');
   await E("__referenceBooks['绑定资料'].entries['7']={uid:7,comment:'时间与数值参考',content:'RESTORED_REFERENCE'}");
  });
  await check('Read errors offer retry instead of hiding selection or sending an empty ruleset',async()=>{
   await E("__referenceLoadHook=async()=>{throw Error('模拟读取失败')}");await tap('[data-action=refresh-references]');await wait("!!__root.querySelector('[data-action=retry-references]')");
   assert.equal((await snap()).rules.worldbookReferences.length,1);
   await E('window.__referenceLoadHook=null');await tap('[data-action=retry-references]');await wait(`!!__root.querySelector('${entry('7')}')`);
  });
  await check('An old-role delayed read cannot replace the new-role catalog or save across roles',async()=>{
   await E("window.__heldOnce=false;window.__referenceLoadHook=async name=>{if(name==='绑定资料'&&!__heldOnce){__heldOnce=true;await new Promise(resolve=>window.__releaseReferenceRead=resolve)}return __referenceBooks[name]||null}");
   await tap('[data-action=refresh-references]');
   await E("window.__referenceChat=__previewContext.chat;__previewContext.characters[0]={name:'另一角色',avatar:'reference-other.png',data:{extensions:{world:'另一角色资料'}}};__previewContext.name2='另一角色';__chatId='reference-other-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'别的开场'}];__emit('CHAT_CHANGED')");
   await wait("__libeiV2App.api.snapshot().profileKey==='reference-other.png'");await wait("!!__root.querySelector('[data-reference-book="+'"另一角色资料"'+"]')");
   await E('window.__releaseReferenceRead?.()');assert.equal(await E("__root.querySelectorAll('[data-reference-book="+'"绑定资料"'+"]').length"),0);assert.deepEqual((await snap()).rules.worldbookReferences,[]);
   await E('window.__referenceLoadHook=null');
  });
  await check('Empty bound-book lists show a clear empty state without creating a worldbook',async()=>{
   const before=await E('JSON.stringify(__referenceBooks)');await E('delete __previewContext.characters[0].data.extensions.world');await tap('[data-action=refresh-references]');
   await wait("__root.querySelector('[data-rule-field=worldbookReferences]').textContent.includes('当前角色没有绑定世界书')");assert.equal(await E('JSON.stringify(__referenceBooks)'),before);
   await E("__previewContext.characters[0].data.extensions.world='另一角色资料'");await tap('[data-action=refresh-references]');await wait("!!__root.querySelector('[data-reference-uid="+'"1"'+"]')");
  });
  await E("__previewContext.characters[0]={name:'条目回归',avatar:'reference-ui.png',data:{extensions:{world:'绑定资料'}}};__previewContext.name2='条目回归';__chatId='reference-chat';__previewContext.chat=__referenceChat;__emit('CHAT_CHANGED')");
  await wait("__libeiV2App.api.snapshot().profileKey==='reference-ui.png'");await wait(`!!__root.querySelector('${entry('7')}')`);
  await E("__root.querySelector('[data-rule-field=worldbookReferences]').scrollIntoView({block:'start'})");await screenshot('42-reference-picker-desktop.png');
  for(const width of [390,320]) {
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
   await check(width+'px reference picker and compact state have no horizontal overflow',async()=>{
    assert.equal(await E("['.libei-rules-page','.libei-references','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"),true);
    await E("__root.querySelector('[data-rule-field=worldbookReferences]').scrollIntoView({block:'start'})");
    await screenshot('43-reference-picker-'+width+'.png');await open('state');
    assert.ok(await E("__root.querySelectorAll('[data-field-value]').length>0"));
    assert.equal(await E("__root.querySelectorAll('[data-field-value] dt span').length"),0);
    assert.equal(await E("['.libei-state-page','[data-schema-state]','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"),true);
    await screenshot('44-state-compact-'+width+'.png');await open('context');await E("__root.querySelector('[data-rule-field=worldbookReferences]').open=true");
   });
  }
  await check('No uncaught exceptions or external network requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[])});
 });
 console.log(JSON.stringify({passed:checks.length,mockOnly:true,realSillyTavern:false,checks},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1});
