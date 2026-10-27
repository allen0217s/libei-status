'use strict';
const assert=require('node:assert/strict'),withBrowser=require('../browser_harness.cjs');
const checks=[];
(async()=>{
 await withBrowser(async({evaluate:E,cdp,screenshot,errors,external})=>{
  const wait=expression=>E('__wait(()=>'+expression+')');
  const input=(selector,value)=>E('__input('+JSON.stringify(selector)+','+JSON.stringify(value)+')');
  const click=text=>E('__button('+JSON.stringify(text)+')');
  const open=async page=>{await E('__libeiV2App.open('+JSON.stringify(page)+')');await wait('!!__root.querySelector("[data-editor-page='+page+']")');};
  const check=async(name,run)=>{await run();checks.push(name);console.log('PASS '+name)};
  await wait('__libeiV2App.api.snapshot().writerReady');
  await E("__previewContext.characters[0]={name:'正文输出回归',avatar:'story-output.png'};__previewContext.name2='正文输出回归';__chatId='story-output';__previewContext.chat=[{is_user:false,is_system:false,mes:'开场',swipe_id:0}];__emit('CHAT_CHANGED')");
  await wait("__libeiV2App.api.snapshot().profileKey==='story-output.png'");
  await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;Object.assign(rules,__libeiV2App.api.listRulePresets().find(p=>p.id==='libei').rules);rules.initials=[rules.initials.find(p=>p.id==='generic')||rules.initials[0]];rules.initialChoice=rules.initials[0].id;__libeiV2App.api.commitRulePreset(__libeiV2App.api.previewRulePreset(rules).planId);__libeiV2App.api.saveRules(rules,'story-output.png');window.__storyFieldId=rules.fieldSchema.fields.find(f=>f.path.join('/')==='世界/地点').id;window.__fieldSelector='[data-field-id=\"'+__storyFieldId+'\"]'})()");
  await open('rules');
  await check('Story send and narrative controls save independently from update rules',async()=>{
   await E("__root.querySelector(__fieldSelector).open=true;__root.querySelector(__fieldSelector+' [data-field-prop=sendToStory]').click()");
   await E("__input(__fieldSelector+' [data-field-prop=storyRule]','STORY_NARRATIVE_17')");
   await E("__input(__fieldSelector+' [data-field-prop=rule]','UPDATE_MAINTENANCE_18')");
   await click('保存规则');await wait("__libeiV2App.api.snapshot().rules.fieldSchema.fields.find(f=>f.id===__storyFieldId).sendToStory===false");
   assert.equal(await E("__storyPrompt.includes('STORY_NARRATIVE_17')"),false);
   assert.equal(await E("__storyPrompt.includes('UPDATE_MAINTENANCE_18')"),false);
   assert.equal(await E("__libeiV2App.api.snapshot().state.世界.地点!==undefined"),true);
  });
  await check('Hidden panel fields can still be selected for story and preview keeps full maintenance rules',async()=>{
   await E("__root.querySelector(__fieldSelector).open=true;__root.querySelector(__fieldSelector+' [data-field-prop=sendToStory]').click()");
   await E("__root.querySelector(__fieldSelector+' [data-field-prop=visible]').click()");
   await click('保存规则');await wait("__libeiV2App.api.snapshot().rules.fieldSchema.fields.find(f=>f.id===__storyFieldId).sendToStory===true");
   assert.equal(await E("__storyPrompt.includes('STORY_NARRATIVE_17')"),true);
   assert.equal(await E("__storyPrompt.includes('UPDATE_MAINTENANCE_18')"),false);
   const preview=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'story-output.png'})");
   assert.ok(preview.update.messages[0].content.includes('UPDATE_MAINTENANCE_18'));
   assert.ok(!preview.update.messages[0].content.includes('STORY_NARRATIVE_17'));
   assert.ok(preview.story.content.includes('STORY_NARRATIVE_17'));
  });
  await open('context');
  await check('Depth save registers the same system injection and matches saved preview content',async()=>{
   await input('[data-story-depth]','3');await click('保存上下文');
   await wait('__libeiV2App.api.snapshot().rules.storyDepth===3');
   const placement=await E('__storyPlacement');assert.equal(placement.depth,3);assert.equal(placement.position,1);assert.equal(placement.role,0);assert.equal(placement.scan,false);
   const preview=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'story-output.png'})");
   assert.equal(preview.story.content,await E('__storyPrompt'));assert.equal(preview.story.placement.depth,3);
  });
  await check('Reference format button changes only draft until context save',async()=>{
   await input('[data-rule-field=snapshotTemplate] textarea','CUSTOM_DRAFT {state_json}');
   await E("__root.querySelector('[data-action=story-reference-format]').click()");
   await wait("__root.querySelector('[data-rule-field=snapshotTemplate] textarea').value.includes('{state_table}')");
   assert.equal(await E('__libeiV2App.api.snapshot().rules.storyDepth'),3);
   assert.equal(await E("__libeiV2App.api.snapshot().rules.fieldSchema.fields.find(f=>f.id===__storyFieldId).storyRule"),'STORY_NARRATIVE_17');
   await click('保存上下文');await wait('__libeiV2App.api.snapshot().rules.storyDepth===2');
   assert.equal((await E('__storyPlacement')).depth,2);
   assert.equal(await E("__storyPrompt.includes('<最新数据与记录>')"),true);
  });
  await click('预览当前草稿');await wait("!!__root.querySelector('[data-context-composition]')");
  await screenshot('story-output-context-desktop.png');
  for(const width of [390,320]){
   await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:950,deviceScaleFactor:1,mobile:true});
   await check(width+'px context controls do not overflow',async()=>{
    assert.equal(await E("['.libei-context-page','.libei-context-region','.bbs-body'].every(s=>{const e=__root.querySelector(s);return e.scrollWidth<=e.clientWidth+1})"),true);
    await screenshot('story-output-context-'+width+'.png');
   });
  }
  assert.equal(await E('__requests.length'),0);assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 });
 console.log('Story output browser: '+checks.length+' checks passed; mock host, no real API.');
})().catch(error=>{console.error(error);process.exitCode=1});
