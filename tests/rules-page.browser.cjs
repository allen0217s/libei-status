'use strict';
const assert = require('node:assert/strict');
const withBrowser = require('../browser_harness.cjs');
const checks = [];

(async () => {
  await withBrowser(async ({ evaluate: E, cdp, screenshot, errors, external }) => {
    const snap = () => E('__libeiV2App.api.snapshot()');
    const memory = () => E('JSON.stringify([...__memory.entries()])');
    const check = async (name, fn) => { await fn(); checks.push(name); console.log('PASS ' + name); };
    const click = text => E(`__button(${JSON.stringify(text)})`);
    const wait = expression => E(`__wait(()=>${expression})`);
    const input = (selector, value) => E(`__input(${JSON.stringify(selector)},${JSON.stringify(value)})`);
    const switchRole = async (name, avatar, chatId) => {
      await E(`__previewContext.characters[0]={name:${JSON.stringify(name)},avatar:${JSON.stringify(avatar)}};__previewContext.name2=${JSON.stringify(name)};__chatId=${JSON.stringify(chatId)};__previewContext.chat=[{is_user:false,is_system:false,mes:'开场',swipe_id:0}];__emit('CHAT_CHANGED')`);
      await wait(`__libeiV2App.api.snapshot().profileKey===${JSON.stringify(avatar)}`);
    };
    await wait('__libeiV2App.api.snapshot().writerReady');
    await switchRole('规则回归', 'rules-ui.png', 'rules-ui-chat');
    await E("__libeiV2App.open('rules')");
    await wait("!!__root.querySelector('[data-rule-field=systemPrompt]')");

    await check('New initial is an expanded, focused draft with no write or auto-selection', async () => {
      const before = await memory(), requests = await E('__requests.length');
      await click('新建初值');
      await wait("!!__root.querySelector('[data-initial-id=custom-1]')");
      assert.equal(await E("__root.querySelector('[data-initial-id=custom-1]').open"), true);
      assert.equal(await E("__root.activeElement===__root.querySelector('[data-initial-id=custom-1] input')"), true);
      assert.equal(await E("__root.querySelector('[data-initial-id=custom-1] textarea').value===__root.querySelector('[data-initial-id=generic] textarea').value"), true);
      assert.equal((await snap()).rules.initials.length, 1);
      assert.equal((await snap()).rules.initialChoice, '');
      assert.equal((await snap()).state, null);
      assert.equal(await memory(), before);
      assert.equal(await E('__requests.length'), requests);
      await screenshot('19-rules-new-initial.png');
    });
    await check('Invalid new YAML refuses save and keeps the draft', async () => {
      const before = await memory();
      await input('[data-initial-id=custom-1] textarea', 'invalid: [');
      await click('保存规则');
      await wait("!!__root.querySelector('[role=alert]')");
      assert.equal(await memory(), before);
      assert.equal(await E("__root.querySelector('[data-initial-id=custom-1] textarea').value"), 'invalid: [');
      await click('放弃修改');
      await wait("!__root.querySelector('[data-initial-id=custom-1]')");
    });
    await check('Repeated additions have unique IDs, independent text and discard together', async () => {
      await click('新建初值');
      await input('[data-initial-id=custom-1] input', '不保存的方案');
      await click('新建初值');
      await wait("!!__root.querySelector('[data-initial-id=custom-2]')");
      const ids = await E("[...__root.querySelectorAll('[data-initial-id]')].map(e=>e.dataset.initialId)");
      assert.equal(new Set(ids).size, 3);
      await click('放弃修改');
      await wait("__root.querySelectorAll('[data-initial-id]').length===1");
      assert.equal((await snap()).rules.initialChoice, '');
    });
    await click('新建初值');
    await input('[data-initial-id=custom-1] input', '新建回归方案');
    const initialText = await E("__root.querySelector('[data-initial-id=custom-1] textarea').value");
    await input('[data-initial-id=custom-1] textarea', initialText.replace("'00:00'", "'04:00'").replace('钱财: 0', '钱财: 100'));
    await click('保存规则');
    await wait('__libeiV2App.api.snapshot().rules.initials.length===2');
    await check('Saving an initial does not select it or initialize a chat', async () => {
      const s = await snap();
      assert.equal(s.rules.initials[1].label, '新建回归方案');
      assert.equal(s.rules.initialChoice, '');
      assert.equal(s.state, null);
    });
    await check('New initial is selectable and initializes only after explicit save', async () => {
      await E("__root.querySelector('[aria-label=新聊天初值方案]').click()");
      await wait("!!__root.querySelector('.bbs-select-option')");
      await E("[...__root.querySelectorAll('.bbs-select-option')].find(e=>e.textContent.includes('新建回归方案')).click()");
      assert.equal((await snap()).state, null);
      await click('保存规则');
      await wait("__libeiV2App.api.snapshot().rules.initialChoice==='custom-1'");
      assert.equal((await snap()).state.世界.时间, '04:00');
      assert.equal((await snap()).state.主角.钱财, 100);
    });
    await check('Creation copies the selected initial and saving does not reset existing progress', async () => {
      const before = (await snap()).state;
      await click('新建初值');
      await wait("!!__root.querySelector('[data-initial-id=custom-2]')");
      assert.equal(await E("__root.querySelector('[data-initial-id=custom-2] textarea').value"), (await snap()).rules.initials[1].text);
      await input('[data-initial-id=custom-2] textarea', initialText);
      await click('保存规则');
      await wait('__libeiV2App.api.snapshot().rules.initials.length===3');
      assert.deepEqual((await snap()).state, before);
      assert.equal((await snap()).rules.initialChoice, 'custom-1');
    });
    await check('Role switch drops unsaved new initials and restores saved ones', async () => {
      await click('新建初值');
      await wait("!!__root.querySelector('[data-initial-id=custom-3]')");
      await switchRole('另一角色', 'rules-other.png', 'rules-other-chat');
      await wait("__root.querySelectorAll('[data-initial-id]').length===1");
      assert.equal((await snap()).rules.initials.length, 1);
      assert.equal((await snap()).state, null);
      await switchRole('规则回归', 'rules-ui.png', 'rules-ui-chat');
      await wait("__root.querySelectorAll('[data-initial-id]').length===3");
      assert.equal((await snap()).state.主角.钱财, 100);
      assert.equal(await E("!!__root.querySelector('[data-initial-id=custom-3]')"), false);
    });
    await check('Twenty-initial limit disables creation without altering stored rules', async () => {
      await E("window.__savedRules=__libeiV2App.api.snapshot().rules;const rules=JSON.parse(JSON.stringify(__savedRules));for(let i=rules.initials.length;i<20;i++)rules.initials.push({...rules.initials[0],id:'limit-'+i,label:'limit '+i});__libeiV2App.api.saveRules(rules,'rules-ui.png')");
      await wait("__root.querySelectorAll('[data-initial-id]').length===20");
      const before = await memory();
      assert.equal(await E("[...__root.querySelectorAll('button')].find(e=>e.textContent.trim()==='新建初值').disabled"), true);
      await click('新建初值');
      assert.equal((await snap()).rules.initials.length, 20);
      assert.equal(await memory(), before);
      await E("__libeiV2App.api.saveRules(__savedRules,'rules-ui.png')");
      await wait("__root.querySelectorAll('[data-initial-id]').length===3");
    });
    await E("__libeiV2App.api.saveOptions({...__libeiV2App.api.snapshot().config,sendNumericToStory:true});__previewContext.chat.push({is_user:true,mes:'等待。'},{is_user:false,is_system:false,mes:'时间没有变化。',swipe_id:0});__libeiV2App.api.refresh()");
    await check('One combined list holds each editable field once with inline projections', async () => {
      const before = await memory(), requests = await E('__requests.length');
      await click('预览当前草稿');
      await wait("!!__root.querySelector('[data-context-readonly]')");
      assert.equal(await E("__root.querySelectorAll('[data-rule-field]').length"), 7);
      assert.equal(await E("__root.querySelectorAll('.libei-context-region').length"), 1);
      assert.equal(await E("__root.querySelectorAll('.libei-context-editor,.libei-preview').length"), 0);
      assert.equal(await E("__root.querySelectorAll('[data-rule-field=numericRules] .libei-inline-preview').length"), 2);
      assert.equal(await E("__root.querySelectorAll('[data-rule-field=systemPrompt] textarea').length"), 1);
      assert.equal(await E("__root.querySelectorAll('[data-rule-field=systemPrompt] pre').length"), 0);
      assert.ok(await E("__root.querySelector('[data-rule-field=snapshotTemplate] pre').textContent.includes('主角')"));
      assert.equal(await memory(), before);
      assert.equal(await E('__requests.length'), requests);
    });
    await check('Editing in place clears stale projections but preserves focus and open editor', async () => {
      await E("__root.querySelector('[data-rule-field=systemPrompt]').open=true;__root.querySelector('[data-rule-field=systemPrompt] textarea').focus()");
      const source = await E("__root.querySelector('[data-rule-field=systemPrompt] textarea').value");
      await input('[data-rule-field=systemPrompt] textarea', source + ' UNSAVED_RULE_MARKER');
      await wait("!__root.querySelector('[data-context-readonly]')");
      assert.equal(await E("__root.querySelector('[data-rule-field=systemPrompt]').open"), true);
      assert.equal(await E("__root.activeElement===__root.querySelector('[data-rule-field=systemPrompt] textarea')"), true);
      assert.ok(!(await snap()).rules.systemPrompt.includes('UNSAVED_RULE_MARKER'));
      await click('预览当前草稿');
      await wait("!!__root.querySelector('[data-projection=\"update:system\"]')");
      assert.ok(await E("__root.querySelector('.libei-request-check').textContent.includes('UNSAVED_RULE_MARKER')"));
    });
    await check('Invalid parameter JSON is reported without save or request', async () => {
      const before = await memory(), requests = await E('__requests.length');
      await input('[data-rule-field=numericConfig] textarea', '{bad');
      await click('预览当前草稿');
      await wait("!!__root.querySelector('.libei-context-region [role=alert]')");
      assert.ok(await E("__root.querySelector('.libei-context-region [role=alert]').textContent.includes('JSON')"));
      assert.equal(await memory(), before);
      assert.equal(await E('__requests.length'), requests);
      await click('放弃修改');
    });
    await check('Initial labels and prompt HTML render as inert text', async () => {
      const before = await memory(), requests = await E('__requests.length');
      const malicious = '<img src=x onerror="window.__rulesXss=true">';
      await input('[data-initial-id=custom-1] input', malicious);
      const source = await E("__root.querySelector('[data-rule-field=systemPrompt] textarea').value");
      await input('[data-rule-field=systemPrompt] textarea', source + malicious);
      await click('预览当前草稿');
      await wait("!!__root.querySelector('[data-context-readonly]')");
      assert.equal(await E("!!window.__rulesXss || !!__root.querySelector('img[src=x]')"), false);
      assert.ok(await E("__root.querySelector('.libei-request-check').textContent.includes('<img src=x')"));
      assert.equal(await memory(), before);
      assert.equal(await E('__requests.length'), requests);
      await click('放弃修改');
    });
    await check('Explicit worldbook collection filters excluded data within the same list', async () => {
      const before = await memory(), requests = await E('__requests.length');
      await click('收集世界书参考');
      await wait("__root.querySelector('[data-context-readonly=\"update:worldbooks\"] pre')?.textContent.includes('WORLD_ALLOWED_CONTENT')");
      assert.equal(await E("__root.querySelector('.libei-context-region').textContent.includes('WORLD_MVU_EXCLUDED_CONTENT')"), false);
      assert.equal(await memory(), before);
      assert.equal(await E('__requests.length'), requests);
    });
    await check('Draft preview remains byte-identical to the existing actual request builder', async () => {
      const prepared = await E("__libeiV2App.api.previewContext(__libeiV2App.api.snapshot().rules,{profileKey:'rules-ui.png',includeWorldbooks:true})");
      await E("__previewContext.generateRaw=async({prompt})=>{__requests.push({kind:'rules-update',messages:JSON.parse(JSON.stringify(prompt))});return '[]'};__libeiV2App.api.update()");
      assert.deepEqual(await E("__requests.findLast(r=>r.kind==='rules-update').messages"), prepared.update.messages);
      assert.equal((await snap()).state.主角.钱财, 100);
    });
    await check('Controls remain nonsticky and keyboard expansion works', async () => {
      assert.equal(await E("getComputedStyle(__root.querySelector('.libei-rule-actions')).position"), 'static');
      await E("__root.querySelector('[data-rule-field=systemPrompt]').open=false;__root.querySelector('[data-rule-field=systemPrompt]>summary').focus()");
      await cdp.send('Input.dispatchKeyEvent', {type:'keyDown',key:'Enter',code:'Enter',text:'\r',windowsVirtualKeyCode:13});
      await cdp.send('Input.dispatchKeyEvent', {type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13});
      assert.equal(await E("__root.querySelector('[data-rule-field=systemPrompt]').open"), true);
    });
    await click('预览当前草稿');
    await wait("!!__root.querySelector('[data-context-readonly]')");
    await E("__root.querySelector('.libei-context-region').scrollIntoView({block:'start'})");
    await screenshot('20-rules-unified-desktop.png');
    await E("__root.querySelector('[data-rule-field=systemPrompt]').open=false;__root.querySelector('.libei-context-region').scrollIntoView({block:'start'})");
    await screenshot('22-rules-unified-overview.png');
    for (const width of [390, 320]) {
      await cdp.send('Emulation.setDeviceMetricsOverride', {width,height:900,deviceScaleFactor:1,mobile:true});
      await check(width + 'px merged editor stays within its container', async () => {
        assert.equal(await E("['.libei-rules-page','.bbs-body','.libei-context-region'].every(s=>{const e=__root.querySelector(s);return e.scrollWidth<=e.clientWidth+1})"), true);
      });
      await screenshot('21-rules-unified-' + width + '.png');
    }
    await check('No uncaught browser error or external network access', async () => {
      assert.deepEqual(errors, []);
      assert.deepEqual(external, []);
    });
  });
  console.log(JSON.stringify({passed:checks.length,mockApiOnly:true,realSillyTavernTest:false,checks}, null, 2));
})().catch(error => { console.error(error.stack); process.exitCode = 1; });
