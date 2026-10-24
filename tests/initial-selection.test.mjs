import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = await readFile(path.join(root, 'src/engine/legacy-adapter.js'), 'utf8');
const start = source.indexOf('var LbYamlEmbedded=');
const end = source.indexOf('/* Native SillyTavern adapter.');
assert.ok(start >= 0 && end > start, 'engine core markers exist');
const sandbox = { TextEncoder };
vm.runInNewContext(
  `${source.slice(start, end)}\nglobalThis.__initialTest = { yaml: LbYamlEmbedded, createCore: createLibeiStatusCore, createTimeline: createLibeiTimelineStore };`,
  sandbox,
);
const { yaml, createCore, createTimeline } = sandbox.__initialTest;
const core = createCore(yaml);
const defaults = JSON.parse(await readFile(path.join(root, 'tests/fixtures/defaults.json'), 'utf8')).rules;
const legacyGeneric = JSON.parse((await readFile(path.join(root, 'tests/fixtures/legacy-generic-initial.json'), 'utf8')).replace(/^\uFEFF/, ''));
const clone = value => JSON.parse(JSON.stringify(value));
const test = (name, fn) => { fn(); console.log(`PASS ${name}`); };

function memoryStorage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('fresh defaults keep two presets and no selected initial', () => {
  assert.equal(defaults.initialChoice, '');
  assert.deepEqual(Array.from(defaults.initials, item => item.id), ['greeting-0', 'greeting-1']);
  assert.ok(defaults.initials.every(item => !Object.hasOwn(item, 'match')));
});

test('legacy auto and untouched generic preset migrate to manual selection', () => {
  const old = clone(defaults);
  old.initialChoice = 'auto';
  old.initials = [legacyGeneric, ...old.initials.map(item => ({ ...item, match: 'old opener' }))];
  const migrated = core.migrateRules(old);
  assert.equal(migrated.initialChoice, '');
  assert.deepEqual(Array.from(migrated.initials, item => item.id), ['greeting-0', 'greeting-1']);
  assert.ok(migrated.initials.every(item => !Object.hasOwn(item, 'match')));
});

test('edited generic preset survives migration as a manual custom option', () => {
  const old = clone(defaults);
  old.initialChoice = 'default';
  old.initials = [{ ...legacyGeneric, text: legacyGeneric.text.replace('前院·门厅', '山路口') }, ...old.initials];
  const migrated = core.migrateRules(old);
  assert.equal(migrated.initialChoice, 'default');
  assert.equal(migrated.initials[0].text, legacyGeneric.text.replace('前院·门厅', '山路口'));
  assert.equal(Object.hasOwn(migrated.initials[0], 'match'), false);
});

test('chosen preset does not depend on opening text', () => {
  const rules = clone(defaults);
  rules.initialChoice = 'greeting-1';
  rules.initials[0].match = 'opening text one';
  rules.initials[1].match = 'opening text two';
  assert.equal(core.chooseInitial(rules).id, 'greeting-1');
  assert.equal(core.chooseInitial({ ...rules, initialChoice: '' }), null);
});

test('timeline waits without selection, seeds after selection, and preserves existing state', () => {
  const storage = memoryStorage();
  const timeline = createTimeline(core, storage, 'test.initial-selection');
  const scope = { card: 'card', chatId: 'chat', chat: [{ is_user: false, mes: 'unrelated opening text' }] };
  const waiting = timeline.synchronize(scope, defaults);
  assert.equal(waiting.view.current, null);
  assert.equal(waiting.doc.nodes.length, 0);
  assert.equal(waiting.doc.seedRules.initialChoice, '');

  const selected = clone(defaults);
  selected.initialChoice = 'greeting-1';
  const initialized = timeline.synchronize(scope, selected);
  assert.equal(initialized.doc.nodes.length, 1);
  assert.equal(initialized.doc.nodes[0].initialId, 'greeting-1');
  assert.equal(initialized.view.current.state['世界']['日期'], '三月十二');

  const noLongerSelected = timeline.synchronize(scope, defaults);
  assert.equal(noLongerSelected.doc.nodes.length, 1);
  assert.equal(noLongerSelected.view.current.initialId, 'greeting-1');
});

console.log('Initial-selection regression tests: 5 passed');
