import { isAlias, parseDocument, stringify, visit } from 'yaml';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type State = { [key: string]: JsonValue };
export interface UniversalConfig { initialVariables: string; updateRules: string }
export interface MvuOperation { op: 'replace' | 'insert' | 'add' | 'remove' | 'delta' | 'move'; path: string; value?: JsonValue; from?: string }
export interface StatusUpdate { operations: MvuOperation[]; analysis: string }
export const MAX_TEXT = 250_000;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const own = (value: object, key: PropertyKey) => Object.prototype.hasOwnProperty.call(value, key);

export function checkedState(value: unknown): State {
  let count = 0;
  const seen = new Set<object>();
  function check(item: unknown, depth: number): void {
    if (++count > 12_000 || depth > 16) throw Error('状态嵌套或字段数量过多。');
    if (item === null || typeof item === 'boolean') return;
    if (typeof item === 'string') { if (item.length > MAX_TEXT) throw Error('字段文本过长。'); return; }
    if (typeof item === 'number' && Number.isFinite(item)) return;
    if (typeof item !== 'object' || !item || seen.has(item)) throw Error('只支持有限数值和普通 JSON 数据。');
    seen.add(item);
    if (!Array.isArray(item) && Object.getPrototypeOf(item) !== Object.prototype && Object.getPrototypeOf(item) !== null) throw Error('状态对象格式无效。');
    for (const key of Reflect.ownKeys(item)) {
      if (Array.isArray(item) && key === 'length') continue;
      if (typeof key !== 'string' || forbidden.has(key)) throw Error('状态含不安全的键名。');
      const descriptor = Object.getOwnPropertyDescriptor(item, key)!;
      if (!descriptor.enumerable || !('value' in descriptor)) throw Error('状态不允许隐藏字段或访问器。');
      check(descriptor.value, depth + 1);
    }
    if (Array.isArray(item) && Object.keys(item).length !== item.length) throw Error('数组不允许空位。');
    seen.delete(item);
  }
  if (!object(value)) throw Error('状态最外层必须是对象。');
  check(value, 0);
  const text = JSON.stringify(value);
  if (text.length > MAX_TEXT) throw Error('状态数据超过 25 万字符。');
  return JSON.parse(text) as State;
}
export function parseData(text: string): State {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) throw Error('请输入不超过 25 万字符的 JSON / YAML。');
  const doc = parseDocument(text.trim().replace(/^\uFEFF/, ''), { schema: 'core', uniqueKeys: true, strict: true });
  if (doc.errors.length) throw Error('JSON / YAML 格式错误：' + doc.errors[0].message);
  let count = 0;
  visit(doc, (_key, node, path) => {
    if (++count > 30_000 || path.length > 40) throw Error('数据嵌套或节点数量过多。');
    if (isAlias(node) || (node && typeof node === 'object' && (('anchor' in node && node.anchor) || ('tag' in node && node.tag)))) throw Error('不接受 YAML 锚点、别名或显式标签。');
  });
  if (doc.warnings.length) throw Error('YAML 含不支持的标签或语法。');
  return checkedState(doc.toJS({ maxAliasCount: 0 }));
}
/** Accept MVU InitVar body or its explicit stat_data wrapper, without double wrapping. */
export function parseInitialVariables(text: string): State {
  const init = text.trim().match(/^<initvar\s*>([\s\S]*)<\/initvar\s*>$/i);
  const data = parseData(init ? init[1] : text);
  if ('stat_data' in data) {
    if (Object.keys(data).length !== 1) throw Error('stat_data 包装外不能混入其他配置；更新规则请填写在规则栏。');
    return checkedState(data.stat_data);
  }
  return data;
}
export function extractStatus(text: string): { body: string; content: string } | null {
  const blocks = [...text.matchAll(/<(UpdateVariable|VariableUpdate|update)\s*>([\s\S]*?)<\/\1\s*>/gi)];
  if (!blocks.length) {
    if (/<\/?(?:UpdateVariable|VariableUpdate|update)\b/i.test(text)) throw Error('MVU 更新块不完整，请等待回复结束后再提取。');
    return null;
  }
  if (blocks.length !== 1) throw Error('每条回复只能包含一个 MVU 更新块。');
  const block = blocks[0], body = text.slice(0, block.index) + text.slice(block.index! + block[0].length);
  if (/<\/?(?:UpdateVariable|VariableUpdate|update)\b/i.test(body) || /<\/?(?:UpdateVariable|VariableUpdate|update)\b/i.test(block[2])) throw Error('MVU 更新块嵌套或不完整。');
  return { body: body.trim(), content: block[2].trim() };
}
function stripFence(text: string): string {
  const match = text.trim().match(/^\`\`\`(?:json)?\s*\n([\s\S]*?)\n\`\`\`$/i);
  return match ? match[1].trim() : text.trim();
}
function pointer(path: unknown): string[] {
  if (typeof path !== 'string' || !path || path.length > 2000) throw Error('path 必须是相对 stat_data 的非空 JSON Pointer。');
  const normalized = path.startsWith('/') ? path : '/' + path;
  const parts = normalized.slice(1).split('/').map(part => {
    if (/~(?![01])/u.test(part)) throw Error('JSON Pointer 转义无效，请使用 ~0 或 ~1。');
    return part.replace(/~1/g, '/').replace(/~0/g, '~');
  });
  if (parts.length > 16 || parts.some(part => !part || forbidden.has(part) || ['$internal', '$meta'].includes(part))) throw Error('不允许根路径、元数据或不安全的字段路径。');
  if (parts[0] === 'stat_data') throw Error('path 已相对 stat_data，请去掉 /stat_data 前缀。');
  return parts;
}
export function parseUpdate(text: string, requireTag = false): StatusUpdate {
  if (typeof text !== 'string' || text.length > MAX_TEXT) throw Error('MVU 更新文本超过上限。');
  const block = extractStatus(text);
  if (requireTag && !block) throw Error('当前回复没有 <UpdateVariable> 更新块。');
  let source = block?.content ?? text.trim(), analysis = '';
  const analyses = [...source.matchAll(/<analysis\s*>([\s\S]*?)<\/analysis\s*>/gi)];
  if (analyses.length > 1) throw Error('Analysis 段重复。');
  if (analyses.length) { analysis = analyses[0][1].trim(); source = source.replace(analyses[0][0], '').trim(); }
  const patches = [...source.matchAll(/<(json_?patch)\s*>([\s\S]*?)<\/\1\s*>/gi)];
  if (patches.length > 1) throw Error('每个更新块只能包含一个 JSONPatch 数组。');
  if (patches.length) {
    if (source.replace(patches[0][0], '').trim()) throw Error('JSONPatch 外包含无法识别的内容。');
    source = patches[0][2];
  } else if (block) throw Error('MVU 更新块缺少 <JSONPatch>。');
  source = stripFence(source);
  let raw: unknown;
  try { raw = JSON.parse(source); } catch { throw Error('JSONPatch 必须是合法的 JSON 数组。'); }
  if (!Array.isArray(raw) || raw.length > 256) throw Error('JSONPatch 必须是最多 256 项的数组。');
  // Check duplicate JSON keys as well as the JSON-only value contract.
  const safe = parseData('{"operations":' + source + '}').operations as JsonValue[];
  const operations = safe.map((item, index) => {
    try {
      if (!object(item) || !['replace', 'insert', 'add', 'remove', 'delta', 'move'].includes(String(item.op))) throw Error('支持 replace / insert / add / remove / delta / move。');
      const path = item.path ?? (item.op === 'move' ? item.to : undefined);
      pointer(path);
      const allowed = item.op === 'move' ? ['op', 'path', 'from', 'to'] : item.op === 'remove' ? ['op', 'path'] : ['op', 'path', 'value'];
      if (Object.keys(item).some(key => !allowed.includes(key))) throw Error('操作含多余字段。');
      if (item.op === 'move') { pointer(item.from); if (item.path !== undefined && item.to !== undefined && item.path !== item.to) throw Error('move 的 path 与 to 不一致。'); }
      else if (item.op !== 'remove' && !own(item, 'value')) throw Error('操作缺少 value。');
      if (item.op === 'delta' && (typeof item.value !== 'number' || !Number.isFinite(item.value))) throw Error('delta 的 value 必须是有限数字。');
      return { op: item.op, path, ...(item.op === 'move' ? { from: item.from } : item.op === 'remove' ? {} : { value: item.value }) } as MvuOperation;
    } catch (cause) { throw Error('第 ' + (index + 1) + ' 条操作：' + (cause instanceof Error ? cause.message : String(cause))); }
  });
  return { operations, analysis };
}
/** Atomic MVU JSONPatch subset; never executes legacy _.set commands or model code. */
export function applyUpdate(base: State | null, update: StatusUpdate): State {
  if (!base) throw Error('请先提供 MVU 初始变量。');
  const state = checkedState(base);
  type Container = State | JsonValue[];
  function locate(parts: string[]): { parent: Container; key: string } {
    let current: JsonValue = state;
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(current)) {
        if (!/^(0|[1-9]\d*)$/.test(part) || Number(part) >= current.length) throw Error('父级数组下标不存在。');
      } else if (!object(current) || !own(current, part)) throw Error('父级字段不存在，请先 insert 父对象。');
      current = (current as State)[part];
    }
    if (!object(current) && !Array.isArray(current)) throw Error('父级必须是对象或数组。');
    return { parent: current as Container, key: parts.at(-1)! };
  }
  function index(parent: JsonValue[], key: string, insert = false): number {
    if (insert && key === '-') return parent.length;
    if (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= parent.length + (insert ? 1 : 0)) throw Error('数组下标越界或无效。');
    return Number(key);
  }
  function read(parts: string[]): JsonValue {
    const { parent, key } = locate(parts);
    if (Array.isArray(parent)) return parent[index(parent, key)];
    if (!own(parent, key)) throw Error('目标字段不存在。');
    return parent[key];
  }
  function remove(parts: string[]): void {
    const { parent, key } = locate(parts);
    if (Array.isArray(parent)) parent.splice(index(parent, key), 1);
    else { if (!own(parent, key)) throw Error('删除目标不存在。'); delete parent[key]; }
  }
  function insert(parts: string[], value: JsonValue, replace = false): void {
    const { parent, key } = locate(parts);
    if (Array.isArray(parent)) {
      const at = index(parent, key, !replace);
      if (replace) parent[at] = value; else parent.splice(at, 0, value);
    } else { if (replace && !own(parent, key)) throw Error('replace 目标不存在，请使用 insert。'); parent[key] = value; }
  }
  update.operations.forEach((operation, i) => {
    try {
      const parts = pointer(operation.path);
      if (operation.op === 'remove') remove(parts);
      else if (operation.op === 'move') {
        const from = pointer(operation.from);
        if (parts.length > from.length && from.every((part, at) => parts[at] === part)) throw Error('不能将字段移动到自身内部。');
        const value = read(from);
        if (JSON.stringify(from) !== JSON.stringify(parts)) { remove(from); insert(parts, value); }
      } else if (operation.op === 'delta') {
        const current = read(parts);
        if (typeof current !== 'number' || typeof operation.value !== 'number' || !Number.isFinite(current + operation.value)) throw Error('delta 只更新有限数字字段。');
        insert(parts, current + operation.value, true);
      } else insert(parts, JSON.parse(JSON.stringify(operation.value)) as JsonValue, operation.op === 'replace');
      checkedState(state);
    } catch (cause) { throw Error('第 ' + (i + 1) + ' 条操作 ' + operation.path + '：' + (cause instanceof Error ? cause.message : String(cause))); }
  });
  return checkedState(state);
}
export function validateUniversalConfig(value: unknown): UniversalConfig {
  if (!object(value) || typeof value.initialVariables !== 'string' || typeof value.updateRules !== 'string' || value.updateRules.length > 50_000) throw Error('通用配置须包含初始变量和更新规则。');
  parseInitialVariables(value.initialVariables);
  return { initialVariables: value.initialVariables, updateRules: value.updateRules };
}
export function exportUniversalConfig(value: UniversalConfig): string {
  const config = validateUniversalConfig(value);
  return stringify({ stat_data: parseInitialVariables(config.initialVariables), 变量更新规则: config.updateRules });
}
export function importUniversalConfig(text: string): UniversalConfig {
  const data = parseData(text);
  if (Object.keys(data).some(key => !['stat_data', '变量更新规则'].includes(key))) throw Error('通用配置仅接受 stat_data 和“变量更新规则”，不支持预设名称或预设列表。');
  return validateUniversalConfig({ initialVariables: stringify({ stat_data: checkedState(data.stat_data) }), updateRules: data.变量更新规则 ?? '' });
}
export function progressValue(key: string, value: JsonValue, siblings: State = {}): { value: number; max: number; assumed: boolean } | null {
  if (typeof value === 'string') {
    const ratio = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/), percent = value.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
    if (ratio && Number.isFinite(Number(ratio[1])) && Number.isFinite(Number(ratio[2])) && Number(ratio[2]) > 0) return { value: Number(ratio[1]), max: Number(ratio[2]), assumed: false };
    if (percent && Number.isFinite(Number(percent[1]))) return { value: Number(percent[1]), max: 100, assumed: false };
  }
  if (typeof value === 'number' && value >= 0 && /^(hp|mp|san|好感度?|进度|体力|生命值|灵力)$/i.test(key)) {
    const max = siblings[key + '上限'] ?? siblings['最大' + key] ?? siblings[key + '_max'];
    if (typeof max === 'number' && Number.isFinite(max) && max > 0) return { value, max, assumed: false };
    if (value <= 100) return { value, max: 100, assumed: true };
  }
  return null;
}
