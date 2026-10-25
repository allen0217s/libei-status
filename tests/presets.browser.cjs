'use strict';
const assert=require('node:assert/strict');
const withBrowser=require('../browser_harness.cjs');
const checks=[];
(async()=>{
 await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
  const snap=()=>E('__libeiV2App.api.snapshot()');
  const wait=condition=>E(`__wait(()=>${condition})`);
  const tap=selector=>E(`__root.querySelector(${JSON.stringify(selector)}).click()`);
  const click=text=>E(`__button(${JSON.stringify(text)})`);
  const input=(selector,value)=>E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
  const select=(selector,value)=>E(`(()=>{const el=__root.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true}))})()`);
  const memory=()=>E('JSON.stringify([...__memory.entries()])');
  const doc=()=>E("(()=>{const key=[...__memory.keys()].find(key=>key.includes(':chat:modern-ui.png:modern-chat'));return key?JSON.parse(__memory.get(key)):null})()");
  const calls=()=>E('__requests.length');
  const check=async(name,fn)=>{await fn();checks.push(name);console.log('PASS '+name)};
  const open=async page=>{await E(`__libeiV2App.open(${JSON.stringify(page)})`);await wait(`!!__root.querySelector('.libei-${page==='state'?'state':'rules'}-page')`)};
  const load=async id=>{await select('[data-preset-select]',id);await tap('[data-action=load-rule-preset]');await wait("__root.querySelector('.libei-rule-actions').parentElement.textContent.includes('有未保存修改')")};
  const applyPreset=async()=>{await click('保存规则');await wait("__root.querySelector('[data-schema-review]')?.textContent.includes('审核预设替换')");await tap('[data-action=confirm-schema]');await wait("!__root.querySelector('[data-schema-review]')")};
  const errorFrom=body=>E(`(async()=>{try{${body};return ''}catch(error){return error.message}})()`);
  const importText=async text=>{await tap('[data-action=import-rule-preset]');await E(`(()=>{const el=__root.querySelector('[data-preset-file]'),data=new DataTransfer();data.items.add(new File([${JSON.stringify(text)}],'preset.json',{type:'application/json'}));el.files=data.files;el.dispatchEvent(new Event('change',{bubbles:true}))})()`)};
  const wearFields=s=>s.rules.fieldSchema.fields.filter(field=>field.path[0]==='主角'&&field.path[1]==='穿着'&&field.enabled);
  const generationValues=async()=>E(`(()=>{const rules=__libeiV2App.api.snapshot().rules,fields=rules.fieldSchema.fields.filter(field=>field.enabled&&(field.updateMode==='ai'||['money','energy'].includes(field.system))),values={};
    for(const field of fields){const path=field.path,key=path.join('/');
      if(field.system==='date')values[field.id]='2026-10-25';
      else if(field.system==='time')values[field.id]='09:15';
      else if(field.system==='money')values[field.id]=42;
      else if(field.system==='energy')values[field.id]=0;
      else if(path[0]==='世界')values[field.id]='公司楼下的便利店门口';
      else if(path[1]==='穿着')values[field.id]='NEW_'+path[2]+'_衣物';
      else if(path[1]==='随身物品')values[field.id]={手机:'电量 60%'};
      else if(path[1]==='想法')values[field.id]='刚下班，想着晚饭吃什么。';
      else if(field.type==='string')values[field.id]='未记录';
      else if(field.type==='integer'||field.type==='number')values[field.id]=0;
      else if(field.type==='boolean')values[field.id]=false;
      else if(field.type==='array')values[field.id]=[];
      else values[field.id]={};
    }
    return values})()`);
  const mockGeneration=async body=>E(`(()=>{__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'preset-generation',messages:JSON.parse(JSON.stringify(prompt))});return ${JSON.stringify(JSON.stringify(body))}}})()`);
  const moneyEvidence='钱包里还剩四十二元';
  await wait('__libeiV2App.api.snapshot().writerReady');
  await E(`__previewContext.characters[0]={name:'现代演示',avatar:'modern-ui.png'};__previewContext.name2='现代演示';__chatId='modern-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'PRESET_BROWSER_CHAT_BODY_987 ${moneyEvidence}',swipe_id:0}];__emit('CHAT_CHANGED')`);
  await wait("__libeiV2App.api.snapshot().profileKey==='modern-ui.png'");await open('rules');await wait("__root.querySelector('[data-preset-select]')?.options.length>=2");
  await check('New roles get a modern default; both built-ins have the user-requested names',async()=>{
   const s=await snap();assert.equal(s.rules.presetName,'默认预设');assert.equal(s.rules.initialChoice,'');assert.equal(s.state,null);
   assert.deepEqual(wearFields(s).map(field=>field.label),['上装','下装','内裤','鞋袜']);
   assert.equal(s.rules.fieldSchema.fields.some(field=>['精液','精液算式','阳具','遮露','内衬'].some(part=>field.path.includes(part))),false);
   const bytes=await memory();const list=await E('__libeiV2App.api.listRulePresets()');assert.deepEqual(list.filter(p=>p.builtin).map(p=>p.label),['默认预设','黎北预设']);assert.equal(await memory(),bytes);
  });
  await E("(()=>{const rules=__libeiV2App.api.snapshot().rules,state=JSON.parse(rules.initials[0].text);state.世界={日期:'2026-10-20',时间:'08:30',地点:'公寓客厅'};state.主角.钱财=1280;for(const [slot,text] of Object.entries({上装:'灰色连帽卫衣',下装:'深色牛仔裤',内裤:'棉质四角内裤',鞋袜:'白袜与运动鞋'}))state.主角.穿着[slot].衣物=text;state.主角.随身物品={手机:'电量 82%',钥匙:'家门钥匙'};state.主角.想法='出门前确认手机和钥匙都带齐了。';rules.initials[0].text=JSON.stringify(state,null,2);rules.initialChoice='generic';__libeiV2App.api.saveRules(rules,'modern-ui.png')})()");
  await open('state');
  await check('Modern state shows four distinct clothing labels without coverage or physiology rows',async()=>{
   const s=await snap();assert.equal(s.state.主角.钱财,1280);
   const labels=await E("[...__root.querySelectorAll('[data-field-value] dt strong')].map(el=>el.textContent)");
   for(const label of ['上装','下装','内裤','鞋袜'])assert.equal(labels.filter(value=>value===label).length,1);
   for(const label of ['衣物','内衬','遮露','元精','元精算式','阳具'])assert.ok(!labels.includes(label));
   await cdp.send('Emulation.setDeviceMetricsOverride',{width:1100,height:1200,deviceScaleFactor:1,mobile:false});await screenshot('50-modern-default-state.png');
  });
  await open('rules');
  await check('Modern update and story projections contain field rules without legacy physiology instructions',async()=>{
   const bytes=await memory(),count=await calls();const p=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'modern-ui.png'})");
   const text=JSON.stringify(p.update.messages)+p.story.content;for(const retired of ['精液','元精','阳具','遮露','内衬'])assert.ok(!text.includes(retired),retired);
   for(const modern of ['上装','下装','内裤','鞋袜','人民币'])assert.ok(text.includes(modern));assert.equal(await memory(),bytes);assert.equal(await calls(),count);
  });
  await check('Loading the Libei preset is an unsaved draft and does not inherit an initial selection',async()=>{
   const bytes=await memory(),before=(await snap()).rules;await load('libei');
   assert.ok(await E("[...__root.querySelectorAll('[data-field-id]')].some(el=>el.textContent.includes('元精'))"));
   assert.equal(await E("__root.querySelector('[aria-label=新聊天初值方案]')?.value ?? ''"),'');assert.deepEqual((await snap()).rules,before);assert.equal(await memory(),bytes);
   await click('放弃修改');assert.equal(await E("__root.querySelector('[data-rule-presets]').textContent.includes('当前草稿：默认预设')"),true);
  });
  let customId;
  await check('Saving a named preset makes a library copy only, without changing the active role or timeline',async()=>{
   const before=(await snap()).rules,nodes=(await doc()).nodes;await input('[data-preset-name]','城市通勤');await tap('[data-action=save-rule-preset]');
   await wait("[...__root.querySelector('[data-preset-select]').options].some(option=>option.textContent.includes('城市通勤'))");
   customId=(await E('__libeiV2App.api.listRulePresets()')).find(p=>p.label==='城市通勤').id;assert.ok(customId.startsWith('user-'));
   assert.deepEqual((await snap()).rules,before);assert.deepEqual((await doc()).nodes,nodes);assert.equal(await calls(),0);
  });
  const locationId=(await snap()).rules.fieldSchema.fields.find(field=>field.path.join('/')==='世界/地点').id;
  const ruleSelector=`[data-field-id="${locationId}"] [data-field-prop=rule]`;
  let exported;
  await check('One-click export includes edited draft rules but no channel settings, secrets or chat text',async()=>{
   const bytes=await memory();await input(ruleSelector,'地点按本轮实际移动更新。DRAFT_RULE_EXPORT_SENTINEL');
   await E("window.__nativeObjectURL=URL.createObjectURL;URL.createObjectURL=blob=>{window.__presetExportBlob=blob;return __nativeObjectURL.call(URL,blob)};__previewContext.extensionSettings.libei_status_v2.__testSecret='PRIVATE_API_TOKEN_SENTINEL'");
   await tap('[data-action=export-rule-preset]');exported=await E('(async()=>JSON.parse(await __presetExportBlob.text()))()');
   assert.equal(exported.format,'libei-rule-preset-v1');assert.ok(JSON.stringify(exported).includes('DRAFT_RULE_EXPORT_SENTINEL'));
   for(const forbidden of ['PRIVATE_API_TOKEN_SENTINEL','PRESET_BROWSER_CHAT_BODY_987','rememberedKey','channels','transport'])assert.ok(!JSON.stringify(exported).includes(forbidden));
   assert.equal(await memory(),bytes);await E('URL.createObjectURL=__nativeObjectURL');await click('放弃修改');
  });
  await check('Import round-trip loads only a draft and applies through an explicit replacement review',async()=>{
   const oldNodes=(await doc()).nodes,before=(await snap()).rules,count=await calls();await importText(JSON.stringify(exported));
   await wait(`__root.querySelector(${JSON.stringify(ruleSelector)})?.value.includes('DRAFT_RULE_EXPORT_SENTINEL')`);
   assert.deepEqual((await snap()).rules,before);assert.deepEqual((await doc()).nodes,oldNodes);assert.equal(await calls(),count);
   await click('保存规则');await wait("!!__root.querySelector('[data-schema-review]')");assert.ok(await E("__root.querySelector('[data-schema-review]').textContent.includes('审核预设替换')"));
   await tap('[data-action=cancel-schema]');assert.deepEqual((await snap()).rules,before);
   await applyPreset();assert.ok((await snap()).rules.fieldSchema.fields.find(field=>field.id===locationId).rule.includes('DRAFT_RULE_EXPORT_SENTINEL'));
  });
  await check('Applying a preset blanks current display, pauses injection and keeps old snapshots byte-intact',async()=>{
   const oldNodes=(await doc()).nodes,s=await snap();assert.equal(s.awaitingPresetGeneration,true);assert.equal(s.state,null);
   assert.equal(s.rules.presetName,exported.rules.presetName);
   assert.deepEqual((await doc()).nodes,oldNodes);assert.ok(!(await E('window.__storyPrompt||""')));
   await open('state');await wait("!!__root.querySelector('[data-awaiting-preset]')");
   const values=await E("[...__root.querySelectorAll('[data-field-value] dd')].map(el=>el.textContent.trim())");assert.ok(values.length>0&&values.every(value=>!value||value==='—'));
   assert.equal(await E("!!__root.querySelector('[data-schema-state] [data-manual-field]')"),false);
   assert.ok(await errorFrom("await __libeiV2App.api.update()"));
   await screenshot('54-preset-awaiting-generation.png');
   assert.equal((await snap()).state,null);assert.deepEqual((await doc()).nodes,oldNodes);
  });
  await check('Manual generation builds a fresh state from the new preset without old values or LiBei opening data',async()=>{
   const oldNodes=(await doc()).nodes,values=await generationValues();
   const moneyField=(await snap()).rules.fieldSchema.fields.find(field=>field.system==='money');
   await mockGeneration({values,evidence:{[moneyField.id]:moneyEvidence}});await click('手动生成当前状态');
   await wait("__libeiV2App.api.snapshot().state && !__libeiV2App.api.snapshot().awaitingPresetGeneration");
   const s=await snap();assert.equal(s.state.主角.钱财,42);assert.notEqual(s.state.主角.钱财,1280);assert.equal(s.state.主角.穿着.上装.衣物,'NEW_上装_衣物');assert.equal(s.state.主角.穿着.鞋袜.衣物,'NEW_鞋袜_衣物');
   assert.equal(s.state.主角.想法,'刚下班，想着晚饭吃什么。');assert.deepEqual(s.state.主角.随身物品,{手机:'电量 60%'});
   assert.deepEqual((await doc()).nodes.slice(0,oldNodes.length),oldNodes);
   const added=(await doc()).nodes.slice(oldNodes.length);assert.equal(added.length,1);assert.equal(added[0].action,'preset-generation');assert.equal(added[0].id,0);assert.equal(added[0].parent,oldNodes.find(node=>node.id===0)?.parent??null);
   assert.ok(await E('window.__storyPrompt.includes("公司楼下的便利店门口")'));
   const request=await E("__requests.findLast(r=>r.kind==='preset-generation')");const text=JSON.stringify(request.messages);
   assert.ok(!text.includes('1280'));assert.ok(!text.includes('灰色连帽卫衣'));assert.ok(text.includes('preset-generation'));assert.ok(text.includes('"previous_state":null')||text.includes('previous_state\\":null'));
   await screenshot('55-preset-generated-state.png');
  });
  await check('Generation validation failure keeps the blank state and old snapshots, then a valid retry succeeds',async()=>{
   await open('rules');await load('libei');await applyPreset();await open('state');await wait("!!__root.querySelector('[data-awaiting-preset]')");
   const oldNodes=(await doc()).nodes,values=await generationValues();const partial={...values};delete partial[Object.keys(partial)[0]];
   await mockGeneration({values:partial});await click('手动生成当前状态');await wait("!!__root.querySelector('[role=alert]')");
   assert.equal((await snap()).state,null);assert.equal((await snap()).awaitingPresetGeneration,true);assert.deepEqual((await doc()).nodes,oldNodes);
   const full=await generationValues();const moneyField=(await snap()).rules.fieldSchema.fields.find(field=>field.system==='money');
   await mockGeneration({values:full,evidence:moneyField?{[moneyField.id]:moneyEvidence}:{}});await click('手动生成当前状态');await wait("!!__libeiV2App.api.snapshot().state");
   const s=await snap();assert.equal(s.awaitingPresetGeneration,false);assert.equal(s.state.主角.钱财,42);assert.ok(Object.hasOwn(s.state.主角,'精液'));
  });
  await check('Role switch during generation discards the stale result and never crosses profiles',async()=>{
   await open('rules');await load('modern');await applyPreset();await open('state');await wait("!!__root.querySelector('[data-awaiting-preset]')");
   const oldNodes=(await doc()).nodes,values=await generationValues(),moneyField=(await snap()).rules.fieldSchema.fields.find(field=>field.system==='money');
   const response=JSON.stringify({values,evidence:moneyField?{[moneyField.id]:moneyEvidence}:{}});
   await E(`__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'preset-generation',messages:JSON.parse(JSON.stringify(prompt))});await new Promise(resolve=>{window.__releasePresetGeneration=resolve});return ${JSON.stringify(response)}}`);
   await click('手动生成当前状态');await wait('!!window.__releasePresetGeneration');
   await E("window.__modernChat=__previewContext.chat;__previewContext.characters[0]={name:'其他角色',avatar:'preset-other.png'};__previewContext.name2='其他角色';__chatId='preset-other-chat';__previewContext.chat=[{is_user:false,is_system:false,mes:'其他开场'}];__emit('CHAT_CHANGED')");
   await wait("__libeiV2App.api.snapshot().profileKey==='preset-other.png'");await E('window.__releasePresetGeneration()');
   await E("(async()=>{await new Promise(resolve=>setTimeout(resolve,200))})()");
   assert.equal((await snap()).state,null);assert.deepEqual((await doc()).nodes,oldNodes);
   await E("__previewContext.characters[0]={name:'现代演示',avatar:'modern-ui.png'};__previewContext.name2='现代演示';__chatId='modern-chat';__previewContext.chat=__modernChat;__emit('CHAT_CHANGED')");
   await wait("__libeiV2App.api.snapshot().profileKey==='modern-ui.png'");await wait("!!__root.querySelector('[data-awaiting-preset]')");
  });
  await check('Built-in presets are protected and deleting a custom preset does not change active rules',async()=>{
   await open('rules');const before=(await snap()).rules,nodes=(await doc()).nodes;assert.ok(await errorFrom("__libeiV2App.api.deleteRulePreset('modern','modern-ui.png')"));
   await select('[data-preset-select]',customId);await click('删除所选自建预设');await tap('[data-action=confirm-delete-preset]');
   await wait("![...__root.querySelector('[data-preset-select]').options].some(option=>option.textContent.includes('城市通勤'))");assert.deepEqual((await snap()).rules,before);assert.deepEqual((await doc()).nodes,nodes);
  });
  await check('Returning to the latest floor after a discarded result can regenerate normally',async()=>{
   await open('state');await wait("!!__root.querySelector('[data-awaiting-preset]')");
   const values=await generationValues(),moneyField=(await snap()).rules.fieldSchema.fields.find(field=>field.system==='money');
   await mockGeneration({values,evidence:moneyField?{[moneyField.id]:moneyEvidence}:{}});await click('手动生成当前状态');
   await wait("!!__libeiV2App.api.snapshot().state && !__libeiV2App.api.snapshot().awaitingPresetGeneration");
   assert.equal((await snap()).state.主角.穿着.鞋袜.衣物,'NEW_鞋袜_衣物');await open('rules');
  });
  await E("__root.querySelector('[data-rule-presets]').scrollIntoView({block:'start'})");await screenshot('51-rule-presets-desktop.png');
  for(const width of [390,320]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:true});
   await check(width+'px preset controls and four clothing fields stay within the viewport',async()=>{
    await E("__root.querySelector('[data-rule-presets]').scrollIntoView({block:'start'})");assert.ok(await E("['[data-rule-presets]','.libei-rules-page','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"));await screenshot('52-rule-presets-'+width+'.png');
    await open('state');const id=wearFields(await snap())[0].id;await E(`__root.querySelector('[data-field-value="${id}"]').scrollIntoView({block:'start'})`);
    const labels=await E("[...__root.querySelectorAll('[data-field-value] dt strong')].map(el=>el.textContent)");for(const label of ['上装','下装','内裤','鞋袜'])assert.ok(labels.includes(label));assert.ok(!labels.includes('遮露'));
    await screenshot('53-modern-clothing-'+width+'.png');await open('rules');await wait("__root.querySelector('[data-preset-select]')?.options.length>=2");
   });
  }
  await check('No uncaught browser errors or external requests were needed for presets',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[])});
 });
 console.log(JSON.stringify({passed:checks.length,mockOnly:true,realSillyTavern:false,checks},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1});
