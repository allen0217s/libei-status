'use strict';
const assert = require('node:assert/strict');
const withBrowser = require('../browser_harness.cjs');
const checks = [];

(async () => {
  await withBrowser(async ({evaluate:E, cdp, screenshot, errors, external}) => {
    const snap = () => E('__libeiV2App.api.snapshot()');
    const memory = () => E('JSON.stringify([...__memory.entries()])');
    const timelineBytes = () => E("JSON.stringify([...__memory.entries()].filter(([key])=>key.includes(':chat:field-ui.png:field-ui-chat')))");
    const calls = () => E('__mainCalls');
    const wait = expression => E(`__wait(()=>${expression})`);
    const click = text => E(`__button(${JSON.stringify(text)})`);
    const tap = selector => E(`(()=>{const el=__root.querySelector(${JSON.stringify(selector)});if(!el)throw Error('Missing control');el.click()})()`);
    const input = (selector,value) => E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
    const select = (selector,value) => E(`(()=>{const el=__root.querySelector(${JSON.stringify(selector)});el.value=${JSON.stringify(value)};el.dispatchEvent(new Event('change',{bubbles:true,composed:true}))})()`);
    const check = async (name,fn) => { await fn(); checks.push(name); console.log('PASS '+name); };
    const row = id => `[data-field-id="${id}"]`;
    const control = (id,prop) => `${row(id)} [data-field-prop="${prop}"]`;
    const action = (id,name) => `${row(id)} [data-action="${name}"]`;
    const open = async page => { await E(`__libeiV2App.open(${JSON.stringify(page)})`); await wait(`!!__root.querySelector('.libei-${page==='state'?'state':'rules'}-page')`); };
    const fieldIds = () => E("[...__root.querySelectorAll('[data-field-id]')].map(el=>el.dataset.fieldId)");
    const changeType = async (id,type) => {
      await select(control(id,'type'),type);
      await wait(`!!__root.querySelector(${JSON.stringify(action(id,'confirm-type'))})`);
      await tap(action(id,'confirm-type'));
      await wait(`!__root.querySelector(${JSON.stringify(action(id,'confirm-type'))})`);
    };
    const saveReview = async () => { await click('保存规则'); await wait("!!__root.querySelector('[data-schema-review]')"); };
    const confirmReview = async () => { await tap('[data-action=confirm-schema]'); await wait("!__root.querySelector('[data-schema-review]') && !__root.querySelector('.libei-rule-actions .bbs-btn-primary').disabled"); };
    const errorFrom = body => E(`(async()=>{try{${body};return ''}catch(error){return error.message}})()`);
    const pathFor = id => ['主角','自定义',id];
    const pathText = id => '/'+pathFor(id).join('/');
    const currentValue = async id => (await snap()).state.主角.自定义?.[id];
    const switchRole = async (name,avatar,chatId,chatExpression="[{is_user:false,is_system:false,mes:'开场',swipe_id:0}]") => {
      await E(`__previewContext.characters[0]={name:${JSON.stringify(name)},avatar:${JSON.stringify(avatar)}};__previewContext.name2=${JSON.stringify(name)};__chatId=${JSON.stringify(chatId)};__previewContext.chat=${chatExpression};__emit('CHAT_CHANGED')`);
      await wait(`__libeiV2App.api.snapshot().profileKey===${JSON.stringify(avatar)}`);
    };
    await wait('__libeiV2App.api.snapshot().writerReady');
    await switchRole('字段回归','field-ui.png','field-ui-chat');
    await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;rules.initialChoice='generic';__libeiV2App.api.saveRules(rules,'field-ui.png');window.__fieldReply='[]';__previewContext.generateRaw=async({prompt})=>{__mainCalls++;__requests.push({kind:'field-update',messages:JSON.parse(JSON.stringify(prompt))});return __fieldReply}})()");
    await open('rules');
    await wait("!!__root.querySelector('[data-field-schema-editor]')");
    const baseline = await snap(), baselineState = baseline.state, baselineCount = baseline.rules.fieldSchema.fields.length;
    let manualId, enumId;
    const dateId = baseline.rules.fieldSchema.fields.find(field=>field.system==='date').id;
    const timeId = baseline.rules.fieldSchema.fields.find(field=>field.system==='time').id;
    const moneyId = baseline.rules.fieldSchema.fields.find(field=>field.system==='money').id;

    await check('Builtin date/time and program identity/type/mode controls are locked',async()=>{
      for(const id of [dateId,timeId,moneyId]) {
        assert.equal(await E(`__root.querySelector(${JSON.stringify(control(id,'type'))}).disabled`),true);
        assert.equal(await E(`__root.querySelector(${JSON.stringify(control(id,'updateMode'))}).disabled`),true);
        assert.equal(await E(`!!__root.querySelector(${JSON.stringify(row(id)+' input[data-field-prop=path]')})`),false);
      }
      assert.equal(await E(`__root.querySelector(${JSON.stringify(action(dateId,'disable'))}).disabled`),true);
      assert.equal(await E(`__root.querySelector(${JSON.stringify(action(timeId,'disable'))}).disabled`),true);
    });
    await check('Original new-initial draft behavior remains available',async()=>{
      const before=await memory();
      await click('新建初值');
      await wait("!!__root.querySelector('[data-initial-id=custom-1]')");
      assert.equal((await snap()).rules.initials.length,1);
      assert.equal(await memory(),before);
      await click('放弃修改');
      await wait("!__root.querySelector('[data-initial-id=custom-1]')");
    });
    await check('Adding a field creates a safe stable path and no persistent state/config write',async()=>{
      const before=await memory(), count=await calls();
      await tap('[data-field-schema-editor] [data-action=add]');
      await wait(`__root.querySelectorAll('[data-field-id]').length===${baselineCount+1}`);
      manualId=(await fieldIds()).at(-1);
      assert.match(manualId,/^field_[a-z0-9]+_\d+$/);
      assert.equal(await E(`__root.querySelector(${JSON.stringify(row(manualId))}).open`),true);
      assert.equal(await E(`__root.activeElement===__root.querySelector(${JSON.stringify(control(manualId,'label'))})`),true);
      assert.ok(await E(`__root.querySelector(${JSON.stringify(row(manualId))}).textContent.includes(${JSON.stringify('主角 / 自定义 / '+manualId)})`));
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(manualId,'rule'))}).value`),'');
      assert.equal((await snap()).rules.fieldSchema.fields.length,baselineCount);
      assert.deepEqual((await snap()).state,baselineState);
      assert.equal(await memory(),before); assert.equal(await calls(),count);
    });
    await check('Type changes require confirmation and reset only the local default draft',async()=>{
      await input(control(manualId,'label'),'好感度');
      await input(control(manualId,'group'),'属性');
      await input(control(manualId,'default'),'"草稿文字"');
      await select(control(manualId,'type'),'integer');
      await wait(`!!__root.querySelector(${JSON.stringify(action(manualId,'confirm-type'))})`);
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(manualId,'default'))}).value`),'"草稿文字"');
      await tap(action(manualId,'cancel-type'));
      await select(control(manualId,'type'),'integer');
      await tap(action(manualId,'confirm-type'));
      await wait(`__root.querySelector(${JSON.stringify(control(manualId,'default'))}).value==='0'`);
      await input(control(manualId,'default'),'7');
      await input(control(manualId,'min'),'0'); await input(control(manualId,'max'),'100');
      await select(control(manualId,'updateMode'),'manual');
      assert.equal((await snap()).rules.fieldSchema.fields.some(field=>field.id===manualId),false);
      assert.deepEqual((await snap()).state,baselineState);
    });
    await check('Invalid integer defaults and nonfinite bounds block schema review without discarding text',async()=>{
      const before=await memory();
      await input(control(manualId,'default'),'7.5'); await click('保存规则');
      await wait("!!__root.querySelector('.libei-rules-page [role=alert]')");
      assert.equal(await E("!!__root.querySelector('[data-schema-review]')"),false);
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(manualId,'default'))}).value`),'7.5');
      await input(control(manualId,'default'),'7'); await input(control(manualId,'min'),'Infinity'); await click('保存规则');
      await wait("__root.querySelector('.libei-rules-page [role=alert]')?.textContent.includes('上下限')");
      assert.equal(await memory(),before);
      await input(control(manualId,'min'),'0');
    });
    await check('Cloning makes a new identity/path and enum defaults must match options',async()=>{
      await tap(action(manualId,'clone')); await wait(`__root.querySelectorAll('[data-field-id]').length===${baselineCount+2}`);
      enumId=(await fieldIds()).at(-1); assert.notEqual(enumId,manualId);
      await input(control(enumId,'label'),'心情'); await changeType(enumId,'enum');
      await input(control(enumId,'options'),'平静\n高兴');
      await click('保存规则'); await wait("!!__root.querySelector('.libei-rules-page [role=alert]')");
      assert.equal(await E("!!__root.querySelector('[data-schema-review]')"),false);
      await input(control(enumId,'default'),'"平静"'); await select(control(enumId,'updateMode'),'ai');
      await tap(action(enumId,'move-up'));
      const ids=await fieldIds(); assert.ok(ids.indexOf(enumId)<ids.indexOf(manualId));
      await input(control(manualId,'label'),'关系刻度');
      assert.ok(await E(`__root.querySelector(${JSON.stringify(row(manualId))}).textContent.includes(${JSON.stringify('主角 / 自定义 / '+manualId)})`));
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(enumId,'default'))}).value`),'"平静"');
    });
    await check('Invalid JSON in one field survives editing a different field and blocks save',async()=>{
      const before=await memory();
      await input(control(manualId,'default'),'{bad');
      await input(control(enumId,'label'),'心情展示');
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(manualId,'default'))}).value`),'{bad');
      await click('保存规则'); await wait("!!__root.querySelector('.libei-rules-page [role=alert]')");
      assert.equal(await E("!!__root.querySelector('[data-schema-review]')"),false);
      assert.equal(await memory(),before);
      await input(control(manualId,'default'),'7');
    });
    await check('Schema review saves only config; missing defaults stay in memory until ordinary write',async()=>{
      const before=await memory(), storedBefore=await timelineBytes(), count=await calls();
      await saveReview(); assert.equal(await memory(),before);
      assert.equal((await snap()).rules.fieldSchema.fields.length,baselineCount);
      assert.deepEqual((await snap()).state,baselineState);
      await confirmReview();
      const saved=await snap(); assert.equal(saved.rules.fieldSchema.fields.length,baselineCount+2);
      assert.deepEqual(saved.rules.fieldSchema.fields.find(field=>field.id===manualId).path,pathFor(manualId));
      assert.equal(saved.rules.fieldSchema.fields.find(field=>field.id===manualId).label,'关系刻度');
      assert.equal(saved.state.主角.自定义[manualId],7); assert.equal(saved.state.主角.自定义[enumId],'平静');
      assert.equal(await timelineBytes(),storedBefore); assert.equal(await calls(),count);
    });
    await check('Pending turns need no separate migration action and keep manual edits readonly',async()=>{
      await E("__previewContext.chat.push({is_user:true,mes:'继续等待。'},{is_user:false,is_system:false,mes:'此刻心情平静。',swipe_id:0});__libeiV2App.api.refresh()");
      await open('state');
      const pending=await snap(); assert.deepEqual(pending.pending,[2]); assert.equal(pending.floor,0); assert.equal(pending.latest,2);
      const before=await memory(), count=await calls();
      assert.equal(await E("__root.querySelectorAll('[data-action=preview-migration],[data-action=apply-migration]').length"),0);
      assert.equal(await currentValue(manualId),7); assert.equal(await currentValue(enumId),'平静');
      assert.equal(await E("__root.querySelectorAll('[data-manual-field]').length"),0);
      assert.equal(await memory(),before); assert.equal(await calls(),count);
    });
    await check('Unsafe model patches cannot write manual/program/unknown fields or replace their ancestor',async()=>{
      for(const patch of [
        [{op:'replace',path:pathText(manualId),value:42}],
        [{op:'replace',path:'/主角/钱财',value:200}],
        [{op:'add',path:'/主角/未知字段',value:'bad'}],
        [{op:'replace',path:'/主角',value:{}}],
      ]) {
        const before=await snap(), bytes=await memory();
        await E(`__fieldReply=${JSON.stringify(JSON.stringify(patch))}`);
        const error=await errorFrom('await __libeiV2App.api.update()'); assert.ok(error,error);
        assert.deepEqual((await snap()).state,before.state); assert.equal(await memory(),bytes);
      }
      await E(`__fieldReply=${JSON.stringify(JSON.stringify([{op:'replace',path:pathText(enumId),value:'高兴'}]))}`);
      await E('__libeiV2App.api.update()');
      assert.equal(await currentValue(enumId),'高兴'); assert.deepEqual((await snap()).pending,[]);
    });
    await check('Dynamic grouped rendering and manual edits use declared fields without a model request',async()=>{
      await wait(`!!__root.querySelector('[data-field-value="${manualId}"]')`);
      assert.equal(await E(`__root.querySelector('[data-field-value="${manualId}"]').querySelector('dt strong').textContent`),'关系刻度');
      assert.equal(await E(`__root.querySelectorAll('[data-manual-field="${moneyId}"]').length`),0);
      const before=await memory(), count=await calls();
      await E(`__root.querySelector('[data-manual-field="${manualId}"]').open=true`);
      await input(`[data-manual-field="${manualId}"] input`,'12');
      assert.equal(await currentValue(manualId),7); assert.equal(await memory(),before);
      await tap(`[data-manual-field="${manualId}"] [data-action=apply-field]`);
      await wait(`__libeiV2App.api.snapshot().state.主角.自定义[${JSON.stringify(manualId)}]===12`);
      assert.equal(await calls(),count);
      assert.ok(await errorFrom(`__libeiV2App.api.setFieldValue(${JSON.stringify(enumId)},'高兴','field-ui.png')`));
      assert.ok(await errorFrom(`__libeiV2App.api.setFieldValue(${JSON.stringify(moneyId)},5,'field-ui.png')`));
    });
    await check('Current-floor recompute preserves manual values and shares the preview prompt',async()=>{
      const prepared=await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'field-ui.png',includeWorldbooks:true})");
      await E('__libeiV2App.api.update()');
      assert.equal(await currentValue(manualId),12);
      assert.deepEqual(await E("__requests.findLast(request=>request.kind==='field-update').messages"),prepared.update.messages);
      assert.equal(await E("typeof __libeiV2App.api.previewFieldMigration"),'undefined');
      assert.equal(await E("typeof __libeiV2App.api.applyFieldMigration"),'undefined');
    });
    await check('Historical state remains readonly even when its schema has manual fields',async()=>{
      await E('__libeiV2App.api.setFloor(0)');
      await wait("__root.querySelectorAll('[data-manual-field]').length===0");
      assert.equal(await E("__root.querySelectorAll('[data-manual-field]').length"),0);
      assert.ok(await errorFrom(`__libeiV2App.api.setFieldValue(${JSON.stringify(manualId)},50,'field-ui.png')`));
      await E('__libeiV2App.api.setFloor(null)'); await wait("__libeiV2App.api.snapshot().selection==='latest'");
      assert.equal(await currentValue(manualId),12);
    });
    await check('Disable is safe removal: hidden from active state but physical value retained',async()=>{
      await open('rules'); await tap(action(enumId,'disable')); await saveReview();
      await confirmReview();
      await open('state');
      assert.equal(await E(`!!__root.querySelector('[data-field-value="${enumId}"]')`),false);
      assert.equal(await currentValue(enumId),'高兴');
      assert.ok(await errorFrom(`__libeiV2App.api.setFieldValue(${JSON.stringify(enumId)},'平静','field-ui.png')`));
      const before=await memory();
      await E(`__fieldReply=${JSON.stringify(JSON.stringify([{op:'replace',path:pathText(enumId),value:'平静'}]))}`);
      assert.ok(await errorFrom('await __libeiV2App.api.update()'));
      assert.equal(await memory(),before);
    });
    await check('Any draft edit invalidates pending schema review and preserves its local editor',async()=>{
      await open('rules'); await input(control(manualId,'label'),'关系草稿一'); await saveReview();
      await input(control(manualId,'label'),'关系草稿二'); await wait("!__root.querySelector('[data-schema-review]')");
      assert.equal((await snap()).rules.fieldSchema.fields.find(field=>field.id===manualId).label,'关系刻度');
      await saveReview(); await input(control(manualId,'default'),'{bad');
      await wait("!__root.querySelector('[data-schema-review]')");
      assert.equal(await E(`__root.querySelector(${JSON.stringify(control(manualId,'default'))}).value`),'{bad');
      await click('放弃修改');
      await wait(`__root.querySelector(${JSON.stringify(control(manualId,'label'))}).value==='关系刻度'`);
    });
    await check('Role changes drop UI reviews and engine refuses stale cross-role plan commits',async()=>{
      await input(control(manualId,'label'),'不应跨角色保存'); await saveReview();
      await E("(()=>{window.__fieldChat=__previewContext.chat;const rules=__libeiV2App.api.snapshot().rules;rules.fieldSchema.fields.find(field=>field.system==='money').label='stale money';window.__staleFieldPlan=__libeiV2App.api.previewRulesChange(rules,'field-ui.png')})()");
      await switchRole('另一字段角色','field-other.png','field-other-chat');
      await wait("!__root.querySelector('[data-schema-review]')");
      const before=await memory();
      assert.ok(await errorFrom('__libeiV2App.api.commitRulesChange(__staleFieldPlan.planId)'));
      assert.equal(await memory(),before);
      await switchRole('字段回归','field-ui.png','field-ui-chat','__fieldChat');
      assert.equal((await snap()).rules.fieldSchema.fields.find(field=>field.id===manualId).label,'关系刻度');
      assert.equal(await currentValue(manualId),12);
    });
    await check('New field namespace avoids overlap with an existing atomic object field',async()=>{
      await switchRole('命名空间回归','field-namespace.png','field-namespace-chat');
      await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;rules.initialChoice='generic';rules.fieldSchema.fields.push({id:'existing_custom_object',path:['主角','自定义'],label:'已有自定义对象',group:'属性',type:'object',default:{retained:'ok'},enabled:true,visible:true,updateMode:'manual',rule:''});const plan=__libeiV2App.api.previewRulesChange(rules,'field-namespace.png');__libeiV2App.api.commitRulesChange(plan.planId)})()");
      await open('rules');
      const before=(await snap()).state, count=(await snap()).rules.fieldSchema.fields.length;
      await tap('[data-field-schema-editor] [data-action=add]');
      await wait(`__root.querySelectorAll('[data-field-id]').length===${count+1}`);
      const id=(await fieldIds()).at(-1);
      assert.ok(await E(`__root.querySelector(${JSON.stringify(row(id))}).textContent.includes(${JSON.stringify('主角 / 自定义2 / '+id)})`));
      await saveReview(); assert.deepEqual((await snap()).state,before);
      await tap('[data-action=cancel-schema]'); await click('放弃修改');
      await switchRole('字段回归','field-ui.png','field-ui-chat','__fieldChat');
      assert.equal(await currentValue(manualId),12);
    });
    await check('Changed defaults update untouched presets while incompatible saved values require explicit repair',async()=>{
      await switchRole('类型回归','field-type.png','field-type-chat');
      await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;rules.initialChoice='generic';__libeiV2App.api.saveRules(rules,'field-type.png')})()");
      const stored=()=>E("JSON.stringify([...__memory.entries()].filter(([key])=>key.includes(':chat:field-type.png:field-type-chat')))");
      const before=await stored(),count=await calls();
      await E("(()=>{const rules=__libeiV2App.api.snapshot().rules;const field=rules.fieldSchema.fields.find(field=>field.path.join('/')==='主角/想法');window.__typeFieldId=field.id;field.type='boolean';field.default=false;field.updateMode='manual';window.__typePlan=__libeiV2App.api.previewRulesChange(rules,'field-type.png')})()");
      assert.ok(await E("__typePlan.changes.some(change=>change.kind==='initial-default'&&change.after===false)"));
      assert.equal(await stored(),before);
      await E('__libeiV2App.api.commitRulesChange(__typePlan.planId)');
      assert.equal(JSON.parse((await snap()).rules.initials[0].text).主角.想法,false);
      assert.equal((await snap()).state.主角.想法,'未记录');
      assert.ok((await snap()).fieldStateError);assert.equal(await stored(),before);
      await open('state');
      const id=await E('__typeFieldId');
      await wait(`!!__root.querySelector('[data-manual-field="${id}"]')`);
      await E(`__root.querySelector('[data-manual-field="${id}"]').open=true`);
      await select(`[data-manual-field="${id}"] select`,'true');
      await tap(`[data-manual-field="${id}"] [data-action=apply-field]`);
      await wait('__libeiV2App.api.snapshot().state.主角.想法===true');
      assert.equal((await snap()).fieldStateError,'');assert.equal(await calls(),count);
      assert.equal(await E("JSON.parse([...__memory.entries()].find(([key])=>key.includes(':chat:field-type.png:field-type-chat'))[1]).nodes[0].state.主角.想法"),'未记录');
      await switchRole('字段回归','field-ui.png','field-ui-chat','__fieldChat');await open('rules');
    });
    await check('Merged preview keeps schema projections inline with existing seven rule editors',async()=>{
      const before=await memory(), count=await calls();
      await click('预览当前草稿');
      await wait("!!__root.querySelector('[data-field-schema-editor] [data-projection=\"update:fields\"]')");
      assert.equal(await E("__root.querySelectorAll('[data-rule-field]').length"),7);
      assert.equal(await E("__root.querySelectorAll('[data-context-readonly=\"update:fields\"]').length"),0);
      assert.equal(await E("__root.querySelectorAll('.libei-context-editor,.libei-preview').length"),0);
      assert.equal(await memory(),before); assert.equal(await calls(),count);
    });
    await E(`__root.querySelector('[data-field-id="${manualId}"]').open=true;__root.querySelector('[data-field-id="${manualId}"]').scrollIntoView({block:'start'})`);
    await screenshot('30-field-editor-desktop.png');
    await open('state');
    await E(`__root.querySelector('[data-field-value="${manualId}"]').scrollIntoView({block:'center'})`);
    await screenshot('31-field-state-desktop.png');
    await open('rules');
    for(const width of [390,320]) {
      await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:true});
      await check(width+'px field editor and dynamic state stay within their containers',async()=>{
        assert.equal(await E("['.libei-rules-page','[data-field-schema-editor]','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"),true);
        await open('state');
        assert.equal(await E("['.libei-state-page','[data-schema-state]','.bbs-body'].every(selector=>{const el=__root.querySelector(selector);return el.scrollWidth<=el.clientWidth+1})"),true);
        await open('rules');
        await E(`__root.querySelector('[data-field-id="${manualId}"]').open=true;__root.querySelector('[data-field-id="${manualId}"]').scrollIntoView({block:'start'})`);
        await screenshot('32-field-editor-'+width+'.png');
      });
    }
    await check('No uncaught errors or external requests',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(external,[])});
  });
  console.log(JSON.stringify({passed:checks.length,mockApiOnly:true,realSillyTavernTest:false,checks},null,2));
})().catch(error=>{console.error(error.stack);process.exitCode=1});
