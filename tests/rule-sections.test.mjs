import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {createRuleSectionToolkit} from '../src/engine/rule-sections.js';

const source = await readFile(new URL('../src/engine/legacy-adapter.js', import.meta.url), 'utf8');
const begin = source.indexOf('var LbYamlEmbedded=');
// Only evaluate the bundled parser, not the adapter or application.
const finish = source.indexOf('/* Pure validation and request core.', begin);
const sandbox = {TextEncoder};
vm.runInNewContext(source.slice(begin, finish) + '\nglobalThis.parser=LbYamlEmbedded;', sandbox);
const YAML = sandbox.parser;
assert.equal(typeof YAML.parseDocument, 'function');
const {split} = createRuleSectionToolkit(YAML);
const fixture = JSON.parse(await readFile(new URL('./fixtures/defaults.json', import.meta.url), 'utf8'));
const field = (id, path, rule = '') => ({id, path, rule, extra:{retained:true}});
const fields = () => [field('date',['世界','日期']), field('money',['主角','钱财']),
  field('shirt',['主角','穿着','上装','衣物']), field('shoe',['主角','穿着','鞋履','衣物'])];
let count = 0;
function test(name, run) {run(); count++; console.log('PASS ' + name);}
function reconstruct(text, result) {
  assert.equal(result.segments.map(segment => segment.text).join(''), text);
  let cursor = 0;
  for (const segment of result.segments) {
    assert.equal(segment.start, cursor);
    assert.equal(segment.text, text.slice(segment.start, segment.end));
    cursor = segment.end;
  }
  assert.equal(cursor, text.length);
  assert.equal(result.shared, result.segments.filter(segment => !segment.fieldIds.length).map(segment => segment.text).join(''));
}

test('wrapped legacy source is copied verbatim with comments and CRLF', () => {
  const text = '# head\r\n变量更新规则:\r\n  总则:\r\n    check: common\r\n  黎北.钱财: # original\r\n    check: keep 黎北\r\n  未知:\r\n    check: retain\r\n';
  const result = split(text, fields());
  reconstruct(text, result);
  assert.equal(result.fields[1].rule, '  黎北.钱财: # original\r\n    check: keep 黎北\r\n');
  assert.ok(result.shared.includes('总则:'));
  assert.ok(result.shared.includes('未知:'));
  assert.ok(!result.fields[1].rule.includes('主角'));
});
test('nested mappings separate matched leaves and retain unknown siblings', () => {
  const text = '世界:\n  日期:\n    check: date\n  未知: retain\n主角:\n  钱财:\n    check: money\n';
  const result = split(text, fields());
  reconstruct(text, result);
  assert.equal(result.fields[0].rule, '  日期:\n    check: date\n');
  assert.equal(result.fields[1].rule, '  钱财:\n    check: money\n');
  assert.ok(result.shared.includes('未知: retain'));
});
test('legacy parent groups copy the unchanged block to descendants', () => {
  const text = '黎北.穿着:\n  check:\n    - retain\n';
  const result = split(text, fields());
  reconstruct(text, result);
  assert.deepEqual(result.segments[0].fieldIds, ['shirt','shoe']);
  assert.equal(result.fields[2].rule, text);
  assert.equal(result.fields[3].rule, text);
});
test('literal path templates and slash headings match without execution', () => {
  const text = '主角.穿着.${内衬|上装|下装|鞋履}:\n  check: literal\n/世界/日期:\n  check: date\n';
  const result = split(text, fields());
  reconstruct(text, result);
  assert.equal(result.fields[2].rule, result.fields[3].rule);
  assert.ok(result.fields[2].rule.includes('${内衬|上装|下装|鞋履}'));
  assert.ok(result.fields[0].rule.startsWith('/世界/日期:'));
});
test('malformed YAML, free text, flow maps and ambiguous names remain shared', () => {
  for (const text of ['update everything safely', '世界.日期: [broken', '钱财: ambiguous\n', '{世界.日期: date}', '主角.钱财: one\n主角.钱财: two\n']) {
    const result = split(text, fields());
    reconstruct(text, result);
    assert.equal(result.shared, text);
    assert.ok(result.fields.every(item => !item.rule));
  }
  const text = '主角.钱财: money\n';
  assert.equal(split(text, [field('a',['主角','钱财']),field('b',['黎北','钱财'])]).shared, text);
});
test('existing field prose is retained, identical blocks are not appended twice', () => {
  const text = '黎北.钱财:\n  check: keep\n';
  const input = fields(); input[1].rule = 'Existing instructions.';
  const once = split(text, input);
  assert.equal(once.fields[1].rule, 'Existing instructions.\n' + text);
  assert.deepEqual(split(text, once.fields).fields, once.fields);
});
test('input fields and nested properties are cloned without state mutation', () => {
  const input = fields(), before = JSON.stringify(input);
  input.forEach(item => {Object.freeze(item.path); Object.freeze(item.extra); Object.freeze(item);}); Object.freeze(input);
  const result = split('主角.钱财: money\n', input);
  assert.equal(JSON.stringify(input), before);
  result.fields[1].extra.retained = false;
  assert.equal(input[1].extra.retained, true);
});
test('document markers, Unicode and shared common rules stay lossless', () => {
  const text = '---\r\ncommon: shared\r\n主角.钱财: "😀 <%= neverRun() %>"\r\n...\r\n# tail\r\n';
  const result = split(text, [...fields(), field('common',['common'])]);
  reconstruct(text, result);
  assert.ok(result.shared.includes('common: shared'));
  assert.ok(result.shared.includes('...\r\n# tail'));
  assert.ok(result.fields[1].rule.includes('😀 <%= neverRun() %>'));
  assert.ok(!result.fields[1].rule.includes('...'));
  reconstruct('', split('', fields()));
});
test('field and per-rule size limits reject rather than truncate', () => {
  assert.throws(() => split('', Array.from({length:129}, (_, i) => field('f'+i,['x'+i]))), /128/);
  assert.throws(() => split('', [field('x',['x'],'a'.repeat(40001))]), /40000/);
  assert.throws(() => split('主角.钱财: more\n', [field('money',['主角','钱财'],'a'.repeat(40000))]), /40000/);
});
test('real defaults updateRules is preserved and mapped including template groups', () => {
  const text = fixture.rules.updateRules;
  const result = split(text, fields());
  reconstruct(text, result);
  assert.ok(result.fields[0].rule.includes('世界.日期:'));
  assert.ok(result.fields[1].rule.includes('黎北.钱财:'));
  assert.ok(result.fields[2].rule.includes('黎北.穿着.${内衬|上装|下装|鞋履}:'));
  assert.equal(result.fields[2].rule, result.fields[3].rule);
  assert.ok(result.shared.includes('总则:'));
});
console.log(`${count} rule section checks passed`);
