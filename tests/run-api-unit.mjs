import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { writeFile } from 'node:fs/promises';
import { build } from 'vite';

// 独立程序化构建；不读取仓库 Vite 配置，不清理/修改 dist，不发真实网络请求。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const results = [];
const report = {
  scope: 'API / settings / worldbooks unit regression',
  productionSourceChanged: false,
  realNetworkRequests: 0,
  builtUnder: '.test-api',
  limitations: [
    'No real SillyTavern server or supplier was contacted.',
    'Supported checkWorldInfo path uses a test-build-only dynamic import URL substitution; production source remains unchanged.',
    'Missing checkWorldInfo uses the unmodified production dynamic import and its actual import failure in Node.',
    'Main generateRaw cancellation cannot stop the real host request; this test documents the limitation, not bridge stale-result discard.',
    'Settings-page DOM CRUD is covered by integration/browser tests, not this isolated module suite.',
  ],
  results,
};
let seq = 0;
let networkCalls = [];
function resetFetch() {
  networkCalls = [];
  globalThis.fetch = async (...args) => {
    networkCalls.push(args);
    throw new Error('UNEXPECTED_FETCH_BLOCKED: real network is disabled by unit harness');
  };
}
function mockFetch(factory) {
  networkCalls = [];
  globalThis.fetch = async (...args) => {
    networkCalls.push(args);
    assert.ok(String(args[0]).startsWith('/api/backends/chat-completions/'), 'only the ST proxy route is permitted');
    return factory(...args);
  };
}
function mockStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  const writes = [];
  return {
    values, writes,
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => { writes.push(['set', key, String(value)]); values.set(key, String(value)); },
    removeItem: key => { writes.push(['remove', key]); values.delete(key); },
  };
}
function environment({ stored, legacy, available = true } = {}) {
  const storage = mockStorage(legacy === undefined ? {} : { 'libei.independent-status.v1.621746c1:settings': JSON.stringify(legacy) });
  const ext = {
    baibai_book: { untouched: true }, baibai_api_channels: { untouched: true }, baibai_exclude_settings: { untouched: true },
    ...(stored === undefined ? {} : { libei_status_v2: structuredClone(stored) }),
  };
  const accesses = [];
  const extensionSettings = new Proxy(ext, {
    get(target, key, receiver) { accesses.push(['get', key]); return Reflect.get(target, key, receiver); },
    set(target, key, value, receiver) { accesses.push(['set', key]); return Reflect.set(target, key, value, receiver); },
  });
  const ctx = {
    chat: [
      { name: 'User', is_user: true, is_system: false, mes: 'old user text' },
      { name: '黎北', is_user: false, is_system: false, mes: 'OLD_TARGET' },
      { name: '黎北', is_user: false, is_system: false, mes: 'FUTURE_SECRET' },
    ],
    name1: 'User', name2: '黎北', characterId: 0,
    characters: [{ name: '黎北', avatar: 'libei.png' }],
    getCurrentChatId: () => 'unit-chat',
    getRequestHeaders: () => ({ 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit-token' }),
    extensionSettings,
    saveCount: 0,
    saveSettingsDebounced() { ctx.saveCount++; },
    generateRaw: async () => ' main answer ',
  };
  let activeContext = available ? ctx : null;
  globalThis.localStorage = storage;
  globalThis.window = { SillyTavern: { getContext: () => activeContext } };
  delete globalThis.EjsTemplate;
  globalThis.__unitWorldCheck = async () => ({ allActivatedEntries: new Set() });
  resetFetch();
  return { ctx, ext, accesses, storage, setAvailable(v) { activeContext = v ? ctx : null; } };
}
async function buildVariant(name, supported) {
  const plugins = supported ? [{
    name: 'unit-only-world-info-import',
    enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/st/context.ts')) return null;
      const old = "const wiPath = '/scripts/world-info.js';";
      assert.ok(code.includes(old), 'test instrumentation anchor must match exactly');
      const module = 'export const checkWorldInfo = (...args) => globalThis.__unitWorldCheck(...args);';
      const url = `data:text/javascript,${encodeURIComponent(module)}`;
      return { code: code.replace(old, `const wiPath = ${JSON.stringify(url)};`), map: null };
    },
  }] : [];
  await build({
    root, configFile: false, logLevel: 'error', plugins,
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: {
      ssr: path.join(root, 'tests/api-unit-entry.ts'),
      target: 'node20', minify: false, sourcemap: false,
      outDir: path.join(root, '.test-api', name), emptyOutDir: false,
      rollupOptions: { output: { entryFileNames: 'entry.mjs' } },
    },
  });
  return pathToFileURL(path.join(root, '.test-api', name, 'entry.mjs')).href;
}
async function load(url, options) {
  const env = environment(options);
  const modules = await import(`${url}?instance=${++seq}`);
  return { ...env, ...modules };
}
async function test(name, fn) {
  const start = performance.now();
  try {
    await fn();
    results.push({ name, status: 'passed', durationMs: Math.round(performance.now() - start) });
    console.log('PASS', name);
  } catch (error) {
    results.push({ name, status: 'failed', durationMs: Math.round(performance.now() - start), error: error.stack ?? String(error) });
    console.error('FAIL', name, error.stack ?? error);
  }
}
const legacy = { version: 1, config: { url: 'https://legacy.invalid/v1', model: 'old-model', temperature: 0.2, maxTokens: 4096, timeout: 90 }, rememberedKey: 'unit-old-key' };
const channel = { id: 'unit-ch', name: 'unit', url: 'https://supplier.invalid', key: 'unit-key', model: 'model', temperature: 1, maxTokens: 1024, timeoutSec: 3, stream: false, excludeParams: [], reasoningEffort: '' };
const messages = [{ role: 'system', content: 'schema' }, { role: 'user', content: 'hello' }];
const jsonReply = (content = 'ok', finish_reason = 'stop') => Response.json({ choices: [{ message: { content }, finish_reason }] });
const frame = value => `data: ${JSON.stringify(value)}\n\n`;
const delta = (content, finish_reason) => ({ choices: [{ delta: { content }, ...(finish_reason ? { finish_reason } : {}) }] });
const streamReply = text => new Response(text, { headers: { 'Content-Type': 'text/event-stream' } });

try {
  const supported = await buildVariant('supported', true);
  const missing = await buildVariant('missing', false);

  await test('settings: ready gate prevents pre-hydrate and hydrate writes', async () => {
    const m = await load(supported, { available: false, stored: { ui: { theme: 'night' }, assignments: { summary: 'missing-channel' } } });
    assert.equal(m.settings.ready, false);
    m.settings.apiSettings.enabled = false;
    m.settings.hydrateSettings();
    assert.equal(m.ctx.saveCount, 0);
    assert.equal(m.settings.ready, false);
    m.setAvailable(true);
    let calls = 0;
    m.settings.onSettingsReady(() => calls++);
    m.settings.hydrateSettings();
    assert.equal(m.settings.ready, true);
    assert.equal(m.settings.apiSettings.ui.theme, 'night');
    assert.equal(calls, 1);
    assert.equal(m.ctx.saveCount, 0);
    m.settings.hydrateSettings();
    m.settings.onSettingsReady(() => calls++);
    assert.equal(calls, 2);
    assert.equal(m.ctx.saveCount, 0);
    m.settings.apiSettings.ui.theme = 'day';
    assert.equal(m.ctx.saveCount, 1);
    assert.equal(m.ext.libei_status_v2.ui.theme, 'day');
  });
  await test('settings: default template execution is off; UI schema retained', async () => {
    const m = await load(supported);
    m.settings.hydrateSettings();
    assert.equal(m.settings.apiSettings.exclusions.renderWorldInfoTemplates, false);
    assert.deepEqual(Object.keys(m.settings.apiSettings.ui).sort(), ['theme', 'navPosition', 'navTapClose', 'showTopBar', 'showQuickReply', 'showFloorPanel', 'showOrb', 'orbImage', 'orbShape', 'orbOpacity', 'orbSize'].sort());
    assert.equal(m.settings.apiSettings.channels.length, 0);
  });
  await test('settings: legacy detection and import draft do not upload or delete old key', async () => {
    const m = await load(supported, { legacy });
    m.settings.hydrateSettings();
    assert.equal(m.settings.migrationPending.value, true);
    assert.equal(m.ctx.saveCount, 0);
    const draft = m.settings.importLegacySettings();
    assert.equal(draft.key, 'unit-old-key');
    assert.equal(draft.timeoutSec, 90);
    assert.equal(draft.model, 'old-model');
    draft.key = 'draft-only';
    assert.equal(m.settings.apiSettings.channels.length, 0);
    assert.equal(m.ext.libei_status_v2, undefined);
    assert.equal(m.storage.writes.length, 0);
    assert.equal(m.ctx.saveCount, 0);
  });
  await test('settings: explicit draft commit stores plain key and resolved survives reload', async () => {
    const m = await load(supported, { legacy });
    m.settings.hydrateSettings();
    const draft = m.settings.importLegacySettings();
    m.settings.apiSettings.channels.push(structuredClone(draft));
    m.settings.apiSettings.assignments.summary = draft.id;
    m.settings.resolveLegacyMigration();
    assert.equal(m.ext.libei_status_v2.channels[0].key, 'unit-old-key');
    assert.equal(m.ext.libei_status_v2.legacyMigrationResolved, true);
    assert.equal(m.settings.migrationPending.value, false);
    const saved = structuredClone(m.ext.libei_status_v2);
    const reloaded = await load(supported, { legacy, stored: saved });
    reloaded.settings.hydrateSettings();
    assert.equal(reloaded.settings.migrationPending.value, false);
    assert.equal(reloaded.settings.apiSettings.assignments.summary, draft.id);
    assert.equal(reloaded.ctx.saveCount, 0);
  });
  await test('settings: explicit main choice resolves migration without importing key', async () => {
    const m = await load(supported, { legacy });
    m.settings.hydrateSettings();
    m.settings.apiSettings.assignments.summary = '';
    m.settings.resolveLegacyMigration();
    assert.equal(m.ext.libei_status_v2.legacyMigrationResolved, true);
    assert.equal(m.ext.libei_status_v2.channels.length, 0);
    assert.ok(!JSON.stringify(m.ext.libei_status_v2).includes('unit-old-key'));
    assert.equal(m.storage.writes.length, 0);
  });
  await test('settings: unknown nonempty assignment is preserved, never rewritten to main', async () => {
    const m = await load(supported, { stored: { channels: [], assignments: { summary: 'deleted-channel', resummary: 'other-missing' } } });
    m.settings.hydrateSettings();
    assert.equal(m.settings.apiSettings.assignments.summary, 'deleted-channel');
    assert.equal(m.settings.apiSettings.assignments.resummary, 'other-missing');
    assert.equal(m.settings.getChannelForTask('summary'), null);
  });
  await test('settings: no read/write of BaiBai namespaces and no localStorage writes', async () => {
    const m = await load(supported, { legacy });
    m.settings.hydrateSettings();
    m.settings.apiSettings.enabled = false;
    m.settings.apiSettings.exclusions.excludedWorldNames.push('unit-book');
    assert.deepEqual(m.accesses.filter(([, key]) => String(key).startsWith('baibai')), []);
    assert.deepEqual(m.ext.baibai_api_channels, { untouched: true });
    assert.deepEqual(m.ext.baibai_exclude_settings, { untouched: true });
    assert.deepEqual(m.storage.writes, []);
  });
  await test('settings: malformed channels normalized and duplicate IDs repaired', async () => {
    const m = await load(supported, { stored: { channels: [null, false, { id: 'same' }, { id: 'same' }], ui: { orbOpacity: 999, orbSize: -1 }, exclusions: { excludedWorldNames: [' A ', 'A', null], excludedWorldInfoPatterns: [] } } });
    m.settings.hydrateSettings();
    assert.equal(m.settings.apiSettings.channels.length, 2);
    assert.notEqual(m.settings.apiSettings.channels[0].id, m.settings.apiSettings.channels[1].id);
    assert.equal(m.settings.apiSettings.ui.orbOpacity, 100);
    assert.equal(m.settings.apiSettings.ui.orbSize, 32);
    assert.deepEqual([...m.settings.apiSettings.exclusions.excludedWorldNames], ['A']);
    assert.deepEqual([...m.settings.apiSettings.exclusions.excludedWorldInfoPatterns], []);
  });

  const core = await load(supported);
  core.settings.hydrateSettings();
  await test('validation: valid channel and ordinary parameter exclusion accepted', () => {
    assert.equal(core.settings.validateChannel(channel), null);
    assert.equal(core.settings.validateChannel({ ...channel, excludeParams: ['temperature', 'max_tokens', 'tool_choice'] }), null);
  });
  await test('validation: every routing/credential/message field is protected', () => {
    for (const field of ['chat_completion_source', 'reverse_proxy', 'proxy_password', 'custom_url', 'custom_include_headers', 'custom_include_body', 'custom_exclude_body', 'model', 'messages', 'stream']) {
      assert.match(core.settings.validateChannel({ ...channel, excludeParams: [` ${field} `] }), /不可排除/);
    }
  });
  await test('validation: missing URL/model, unsupported protocol, embedded credentials rejected', () => {
    for (const over of [{ url: '' }, { model: '' }, { url: 'bad-url' }, { url: 'file:///unit' }, { url: 'https://user:pass@supplier.invalid' }]) {
      assert.equal(typeof core.settings.validateChannel({ ...channel, ...over }), 'string');
    }
  });
  await test('validation: nonfinite/out-of-range/fractional numeric settings rejected', () => {
    for (const over of [{ temperature: NaN }, { temperature: 3 }, { temperature: -1 }, { maxTokens: Infinity }, { maxTokens: 0 }, { maxTokens: 1.5 }, { timeoutSec: 0 }, { timeoutSec: 0.5 }]) {
      assert.equal(typeof core.settings.validateChannel({ ...channel, ...over }), 'string');
    }
  });
  await test('client: openai body, custom effort and YAML-sensitive key JSON escaping', () => {
    const body = core.client.buildRequestBody(channel, messages, 'https://supplier.invalid/v1', false);
    assert.deepEqual(body, { chat_completion_source: 'openai', reverse_proxy: 'https://supplier.invalid/v1', proxy_password: 'unit-key', model: 'model', messages, temperature: 1, max_tokens: 1024, stream: false, tool_choice: 'none', presence_penalty: 0, frequency_penalty: 0 });
    const key = 'sk-a:b#c{d}e*f "g"\\h\n';
    const custom = core.client.buildRequestBody({ ...channel, key, reasoningEffort: ' xhigh ' }, messages, 'https://supplier.invalid/v1', true);
    assert.equal(custom.chat_completion_source, 'custom');
    assert.equal(custom.custom_url, 'https://supplier.invalid/v1');
    assert.deepEqual(JSON.parse(custom.custom_include_headers), { Authorization: `Bearer ${key}` });
    assert.deepEqual(JSON.parse(custom.custom_include_body), { reasoning_effort: 'xhigh' });
    assert.equal(custom.proxy_password, undefined);
    assert.equal(custom.reasoning_effort, undefined);
    assert.equal(custom.tool_choice, 'none');
  });
  await test('client: whitespace effort stays openai; exclusions affect both request branches', () => {
    assert.equal(core.client.buildRequestBody({ ...channel, reasoningEffort: '  ' }, messages, 'u', false).chat_completion_source, 'openai');
    for (const reasoningEffort of ['', 'max']) {
      const body = core.client.buildRequestBody({ ...channel, reasoningEffort, excludeParams: ['temperature', 'max_tokens'] }, messages, 'u', false);
      assert.equal(body.temperature, undefined);
      assert.equal(body.max_tokens, undefined);
      assert.equal(body.chat_completion_source, reasoningEffort ? 'custom' : 'openai');
    }
  });
  await test('client: completion uses ST proxy headers, normalized base and exact messages', async () => {
    mockFetch(() => jsonReply(' answer '));
    assert.equal(await core.client.requestCompletion(channel, messages), 'answer');
    assert.equal(networkCalls[0][0], '/api/backends/chat-completions/generate');
    const options = networkCalls[0][1];
    assert.equal(options.headers['X-CSRF-Token'], 'unit-token');
    const body = JSON.parse(options.body);
    assert.equal(body.reverse_proxy, 'https://supplier.invalid/v1');
    assert.deepEqual(body.messages, messages);
    assert.equal(options.signal instanceof AbortSignal, true);
  });
  await test('client: nonstream finish_reason=length rejects otherwise valid text', async () => {
    mockFetch(() => jsonReply('{"patch":[]}', 'length'));
    await assert.rejects(core.client.requestCompletion(channel, messages), /截断/);
  });
  await test('client: HTTP errors and upstream JSON errors reject', async () => {
    mockFetch(() => new Response('denied', { status: 401 }));
    await assert.rejects(core.client.requestCompletion(channel, messages), /401.*denied/);
    mockFetch(() => Response.json({ error: { message: 'unit-upstream-error' } }));
    await assert.rejects(core.client.requestCompletion(channel, messages), /unit-upstream-error/);
  });
  await test('client: SSE appends deltas and rejects finish_reason=length', async () => {
    mockFetch(() => streamReply(frame(delta('one')) + frame(delta('two')) + 'data: [DONE]\n\n'));
    assert.equal(await core.client.requestCompletion({ ...channel, stream: true }, messages), 'onetwo');
    mockFetch(() => streamReply(frame(delta('{"patch":[]}')) + frame(delta('', 'length')) + 'data: [DONE]\n\n'));
    await assert.rejects(core.client.requestCompletion({ ...channel, stream: true }, messages), /截断/);
  });
  await test('client: SSE EOF without newline preserves final data and detects truncated tail', async () => {
    mockFetch(() => streamReply(`data: ${JSON.stringify(delta('EOF-tail'))}`));
    assert.equal(await core.client.requestCompletion({ ...channel, stream: true }, messages), 'EOF-tail');
    mockFetch(() => streamReply(frame(delta('ok')) + `data: ${JSON.stringify(delta('', 'length'))}`));
    await assert.rejects(core.client.requestCompletion({ ...channel, stream: true }, messages), /截断/);
  });
  await test('client: DONE ends immediately and ignores subsequent data/error', async () => {
    mockFetch(() => streamReply(frame(delta('before')) + 'data: [DONE]\n\n' + frame({ error: { message: 'after-DONE-must-not-run' } }) + frame(delta('after'))));
    assert.equal(await core.client.requestCompletion({ ...channel, stream: true }, messages), 'before');
  });
  await test('client: SSE split UTF8 and split lines reconstruct intact text', async () => {
    const bytes = new TextEncoder().encode(frame(delta('中文🙂')) + 'data: [DONE]\n\n');
    mockFetch(() => new Response(new ReadableStream({ start(controller) { for (const byte of bytes) controller.enqueue(Uint8Array.of(byte)); controller.close(); } })));
    assert.equal(await core.client.requestCompletion({ ...channel, stream: true }, messages), '中文🙂');
  });
  await test('client: SSE upstream error rejects; comment and heartbeat tolerated', async () => {
    mockFetch(() => streamReply(': heartbeat\n\ndata: not-json\n\n' + frame(delta('alive')) + 'data: [DONE]\n\n'));
    assert.equal(await core.client.requestCompletion({ ...channel, stream: true }, messages), 'alive');
    mockFetch(() => streamReply(frame({ error: { message: 'sse-error' } })));
    await assert.rejects(core.client.requestCompletion({ ...channel, stream: true }, messages), /sse-error/);
  });
  await test('client: external AbortSignal reaches active proxy request', async () => {
    const ctrl = new AbortController();
    mockFetch((_url, opts) => new Promise((_resolve, reject) => {
      opts.signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true });
      queueMicrotask(() => ctrl.abort());
    }));
    await assert.rejects(core.client.requestCompletion(channel, messages, { signal: ctrl.signal }), e => e.name === 'AbortError');
  });
  await test('client: main API uses generateRaw without independent api override; cancel limitation documented', async () => {
    let params;
    core.ctx.generateRaw = async p => { params = p; return ' main result '; };
    const ctrl = new AbortController(); ctrl.abort();
    assert.equal(core.client.mainApiAvailable(), true);
    assert.equal(await core.client.requestViaMainApi(messages, { signal: ctrl.signal }), 'main result');
    assert.deepEqual(params, { prompt: messages, responseLength: 65535 });
    assert.equal(params.api, undefined);
  });
  await test('client: model list proxy normalizes and sorts strings/ids without model requirement', async () => {
    mockFetch(() => Response.json({ data: [{ id: 'z' }, 'a', { id: 'b' }, {}, null, ''] }));
    assert.deepEqual(await core.client.fetchModels({ url: 'https://supplier.invalid/chat/completions/', key: 'unit-key' }), ['a', 'b', 'z']);
    assert.equal(networkCalls[0][0], '/api/backends/chat-completions/status');
    assert.deepEqual(JSON.parse(networkCalls[0][1].body), { chat_completion_source: 'openai', reverse_proxy: 'https://supplier.invalid', proxy_password: 'unit-key' });
  });
  await test('client: testChannel retries alternate /v1 only for HTTP 404/405 and persists candidate on success', async () => {
    let count = 0;
    mockFetch(() => ++count === 1 ? new Response('missing', { status: 404 }) : jsonReply('ok'));
    const draft = { ...channel, url: 'https://supplier.invalid/v1' };
    assert.equal((await core.client.testChannel(draft)).ok, true);
    assert.equal(draft.url, 'https://supplier.invalid');
    assert.equal(networkCalls.length, 2);
    mockFetch(() => new Response('unauthorized', { status: 401 }));
    assert.equal((await core.client.testChannel({ ...channel })).ok, false);
    assert.equal(networkCalls.length, 1);
  });

  const wb = await load(supported);
  wb.settings.hydrateSettings();
  await test('worldbooks: exact whole-book names and case-insensitive comment regex OR semantics', () => {
    wb.settings.apiSettings.exclusions.excludedWorldNames = ['Book A'];
    wb.settings.apiSettings.exclusions.excludedWorldInfoPatterns = ['^rule', '附加'];
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ world: ' Book A ', comment: '' }), true);
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ world: 'book a', comment: '' }), false);
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ world: 'B', comment: 'RULE detail' }), true);
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ world: 'B', comment: '某附加设定' }), true);
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ world: 'B', comment: '', content: 'RULE text is not comment' }), false);
  });
  await test('worldbooks: invalid regex falls back to literal case-insensitive substring', () => {
    wb.settings.apiSettings.exclusions.excludedWorldNames = [];
    wb.settings.apiSettings.exclusions.excludedWorldInfoPatterns = ['[Temp'];
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ comment: 'Unit [TEMP data' }), true);
    assert.equal(wb.worldbooks.isWorldInfoEntryExcluded({ comment: 'ordinary' }), false);
  });
  await test('worldbooks: position buckets, depth descending and order ascending without mutation', () => {
    const entries = [
      { content: 'unknown', position: 99 }, { content: 'depth2', position: 4, depth: 2, order: 0 },
      { content: 'before100', position: 0 }, { content: 'depth8order50', position: 4, depth: 8, order: 50 },
      { content: 'after', position: 1 }, { content: 'before1', position: 0, order: 1 },
      { content: 'depth8order1', position: 4, depth: 8, order: 1 }, { content: 'em', position: 5 },
    ];
    const original = structuredClone(entries);
    assert.deepEqual(wb.worldbooks.sortWorldInfoEntriesLikeST(entries).map(e => e.content), ['before1', 'before100', 'after', 'depth8order1', 'depth8order50', 'depth2', 'em', 'unknown']);
    assert.deepEqual(entries, original);
    assert.equal(wb.worldbooks.joinWorldInfoChunks([' a ', '', 'a', 'b ']), 'a\n\nb');
  });
  await test('worldbooks: explicit old target uses frozen chat and excludes future/system text', async () => {
    wb.settings.apiSettings.exclusions.excludedWorldNames = [];
    wb.settings.apiSettings.exclusions.excludedWorldInfoPatterns = [];
    let received;
    globalThis.__unitWorldCheck = async (...args) => { received = args; return { allActivatedEntries: new Set([{ world: 'B', comment: 'story', content: 'STATIC_REFERENCE' }]) }; };
    const frozen = structuredClone(wb.ctx.chat);
    wb.ctx.chat[1].mes = 'CURRENT_CHANGED_TEXT';
    const result = await wb.worldbooks.collectWorldbookContext({ chat: frozen, targets: [1] });
    assert.deepEqual(received[0], ['黎北: OLD_TARGET']);
    assert.equal(received[1], 1000000000);
    assert.equal(received[2], true);
    assert.match(result, /STATIC_REFERENCE/);
    assert.ok(!result.includes('FUTURE_SECRET'));
    const systemChat = [{ name: 'system', mes: 'SYSTEM_SECRET', is_user: false, is_system: true }];
    assert.deepEqual(wb.worldbooks.buildScanText(systemChat, [0], 'U', 'C'), []);
  });
  await test('worldbooks: Set/Map collection filters excluded entries before rendering', async () => {
    wb.settings.apiSettings.exclusions.excludedWorldNames = ['private'];
    wb.settings.apiSettings.exclusions.excludedWorldInfoPatterns = ['^rule'];
    wb.settings.apiSettings.exclusions.renderWorldInfoTemplates = true;
    const rendered = [];
    globalThis.EjsTemplate = { prepareContext: async env => env, evalTemplate: async text => { rendered.push(text); return text.replace('<%x%>', 'evaluated'); } };
    const entries = [
      { world: 'private', content: 'SECRET <%x%>' }, { world: 'public', comment: 'RULE task', content: 'RULE_SECRET <%x%>' },
      { world: 'public', comment: 'story', content: 'KEPT <%x%>' },
    ];
    for (const activated of [new Set(entries), new Map(entries.map((e, i) => [String(i), e]))]) {
      globalThis.__unitWorldCheck = async () => ({ allActivatedEntries: activated });
      const result = await wb.worldbooks.collectWorldbookContext({ targets: [1] });
      assert.ok(result.includes('KEPT evaluated'));
      assert.ok(!result.includes('SECRET'));
    }
    assert.deepEqual(rendered, ['KEPT <%x%>', 'KEPT <%x%>']);
  });
  await test('worldbooks: disabled templates do not run macros/EJS; enabled refFloor is last target', async () => {
    wb.settings.apiSettings.exclusions.excludedWorldNames = [];
    wb.settings.apiSettings.exclusions.excludedWorldInfoPatterns = [];
    const calls = [];
    wb.ctx.substituteParams = text => { calls.push(['macro']); return text.replace('{{char}}', '黎北'); };
    globalThis.EjsTemplate = {
      prepareContext: async (env, floor) => { calls.push(['prepare', floor, env.world_info]); return env; },
      evalTemplate: async text => { calls.push(['eval']); return text.replace('<%x%>', 'DONE'); },
    };
    globalThis.__unitWorldCheck = async () => ({ allActivatedEntries: new Set([{ world: 'B', content: '{{char}} <%x%>' }]) });
    wb.settings.apiSettings.exclusions.renderWorldInfoTemplates = false;
    assert.match(await wb.worldbooks.collectWorldbookContext({ targets: [0, 1] }), /\{\{char\}\} <%x%>/);
    assert.deepEqual(calls, []);
    wb.settings.apiSettings.exclusions.renderWorldInfoTemplates = true;
    assert.match(await wb.worldbooks.collectWorldbookContext({ targets: [0, 1] }), /黎北 DONE/);
    assert.equal(calls[1][1], 1);
    assert.equal(calls[1][2].world, 'B');
  });
  await test('worldbooks: excluded single character returns empty; group does not use single-name exclusion', async () => {
    wb.settings.apiSettings.exclusions.excludedChars = ['黎北'];
    assert.equal(await wb.worldbooks.collectWorldbookContext({ targets: [1] }), '');
    wb.ctx.groupId = 'unit-group';
    assert.equal(wb.settings.isCurrentChatExcluded(), false);
    delete wb.ctx.groupId;
    wb.settings.apiSettings.exclusions.excludedChars = [];
  });
  await test('worldbooks: pre-aborted and mid-check aborted results reject', async () => {
    const pre = new AbortController(); pre.abort();
    await assert.rejects(wb.worldbooks.collectWorldbookContext({ signal: pre.signal, targets: [1] }), e => e.name === 'AbortError');
    const mid = new AbortController();
    globalThis.__unitWorldCheck = async () => { mid.abort(); return { allActivatedEntries: new Set([{ content: 'late' }]) }; };
    await assert.rejects(wb.worldbooks.collectWorldbookContext({ signal: mid.signal, targets: [1] }), e => e.name === 'AbortError');
  });
  await test('worldbooks: production missing checkWorldInfo refuses fail-open when rules exist', async () => {
    const m = await load(missing);
    m.settings.hydrateSettings();
    let fallbackCalls = 0;
    m.ctx.getWorldInfoPrompt = async () => { fallbackCalls++; return { worldInfoBefore: 'UNFILTERED_SECRET' }; };
    assert.equal(await m.context.getCheckWorldInfo(), null);
    await assert.rejects(m.worldbooks.collectWorldbookContext({ targets: [1] }), /为防排除失效/);
    assert.equal(fallbackCalls, 0);
  });
  await test('worldbooks: missing check fallback allowed only with explicitly empty rules', async () => {
    const m = await load(missing);
    m.settings.hydrateSettings();
    m.settings.apiSettings.exclusions.excludedWorldNames = [];
    m.settings.apiSettings.exclusions.excludedWorldInfoPatterns = [];
    m.ctx.getWorldInfoPrompt = async () => ({ worldInfoBefore: 'A', worldInfoAfter: 'A', worldInfoDepth: [{ entries: ['B'] }], anBefore: ['C'], anAfter: ['D'] });
    assert.match(await m.worldbooks.collectWorldbookContext({ targets: [1] }), /A\n\nB\n\nC\n\nD/);
    assert.equal(networkCalls.length, 0);
  });
} catch (error) {
  results.push({ name: 'test harness setup', status: 'failed', error: error.stack ?? String(error) });
} finally {
  const passed = results.filter(r => r.status === 'passed').length;
  const failed = results.filter(r => r.status === 'failed').length;
  Object.assign(report, { completedAt: new Date().toISOString(), total: results.length, passed, failed });
  await writeFile(path.join(root, 'unit_test_report.json'), JSON.stringify(report, null, 2) + '\n', 'utf8');
  console.log(`API/settings/worldbook unit report: ${passed} passed, ${failed} failed; real network: 0`);
  if (failed) process.exitCode = 1;
}
