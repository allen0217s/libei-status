import { isAlias, parseDocument, stringify, visit } from 'yaml';

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };
export type State = { [key: string]: JsonValue };
export interface StatusPreset { id: string; name: string; template: string; instruction: string }
export interface StatusUpdate { mode: 'full' | 'delta'; state: State }
export const MAX_TEXT = 250_000;
const forbidden = new Set(['__proto__', 'prototype', 'constructor']);
export const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

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

/** JSON is also YAML; one safe parser handles both without evaluating code. */
export function parseData(text: string): State {
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TEXT) throw Error('请输入不超过 25 万字符的 JSON / YAML。');
  const source = text.trim().replace(/^\uFEFF/, '');
  const doc = parseDocument(source, { schema: 'core', uniqueKeys: true, strict: true });
  if (doc.errors.length) throw Error('JSON / YAML 格式错误：' + doc.errors[0].message);
  let count = 0;
  visit(doc, (_key, node, path) => {
    if (++count > 30_000 || path.length > 40) throw Error('数据嵌套或节点数量过多。');
    if (isAlias(node) || (node && typeof node === 'object' && (('anchor' in node && node.anchor) || ('tag' in node && node.tag)))) throw Error('不接受 YAML 锚点、别名或显式标签。');
  });
  if (doc.warnings.length) throw Error('YAML 含不支持的标签或语法。');
  return checkedState(doc.toJS({ maxAliasCount: 0 }));
}

export function extractStatus(text: string): { body: string; content: string } | null {
  const blocks = [...text.matchAll(/<status\s*>([\s\S]*?)<\/status\s*>/gi)];
  if (!blocks.length) {
    if (/<\/?status\b/i.test(text)) throw Error('状态块不完整，请等待回复完成后再提取。');
    return null;
  }
  if (blocks.length !== 1) throw Error('每条回复只能包含一个 <status> 状态块。');
  const block = blocks[0];
  const body = text.slice(0, block.index) + text.slice(block.index! + block[0].length);
  if (/<\/?status\b/i.test(body)) throw Error('状态标签嵌套或不完整。');
  return { body: body.trim(), content: block[1].trim() };
}
export function parseUpdate(text: string, requireTag = false): StatusUpdate {
  const block = extractStatus(text);
  if (requireTag && !block) throw Error('当前回复没有 <status> 状态块；请检查生成模式或改用独立生成。');
  let content = block?.content ?? text.trim();
  const fence = content.match(/^\`\`\`(?:json|yaml|yml)?\s*\n([\s\S]*?)\n\`\`\`$/i);
  if (fence) content = fence[1];
  const data = parseData(content);
  if ('mode' in data && 'state' in data) {
    if (!['full', 'delta'].includes(String(data.mode)) || Object.keys(data).some(key => !['mode', 'state'].includes(key))) throw Error('状态协议只接受 mode: full / delta 和 state。');
    return { mode: data.mode as 'full' | 'delta', state: checkedState(data.state) };
  }
  return { mode: 'full', state: data };
}
/** JSON Merge Patch semantics: objects merge, arrays replace, null deletes. */
export function applyUpdate(base: State | null, update: StatusUpdate): State {
  if (update.mode === 'full') return checkedState(update.state);
  if (!base) throw Error('没有旧状态，首次必须输出 full 全量状态。');
  function merge(target: Record<string, unknown>, patch: Record<string, unknown>): State {
    const result = { ...target };
    for (const [key, value] of Object.entries(patch)) {
      if (forbidden.has(key)) throw Error('增量含不安全的键名。');
      if (value === null) delete result[key];
      else result[key] = object(value) ? merge(object(result[key]) ? result[key] : {}, value) : value;
    }
    return result as State;
  }
  return checkedState(merge(checkedState(base), checkedState(update.state)));
}
export function validatePreset(value: unknown): StatusPreset {
  if (!object(value) || typeof value.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(value.id) || typeof value.name !== 'string' || !value.name.trim() || value.name.length > 80 || typeof value.template !== 'string' || typeof value.instruction !== 'string' || value.instruction.length > 50_000) throw Error('预设须包含名称、JSON / YAML 模板和更新指令。');
  parseData(value.template);
  return { id: value.id, name: value.name.trim(), template: value.template, instruction: value.instruction };
}
export function exportPreset(preset: StatusPreset): string {
  const p = validatePreset(preset);
  return stringify({ 名称: p.name, 模板: parseData(p.template), 更新指令: p.instruction });
}
export function importPreset(text: string, id: string): StatusPreset {
  const data = parseData(text);
  if (Object.keys(data).some(key => !['名称', '模板', '更新指令'].includes(key))) throw Error('预设仅接受“名称”“模板”“更新指令”；旧版完整字段请使用转换入口。');
  if (!object(data.模板)) throw Error('“模板”必须是状态对象。');
  return validatePreset({ id, name: data.名称, template: stringify(data.模板), instruction: data.更新指令 ?? '' });
}
/** Explicit import only. No automatic migration of field permissions or settlement. */
export function convertLegacyPreset(text: string, id: string): StatusPreset {
  const data = parseData(text);
  if (!Array.isArray(data.字段) || !data.字段.length) throw Error('未找到旧版字段列表。');
  const state: State = {};
  const rules: string[] = [];
  for (const field of data.字段) {
    if (!object(field) || !Array.isArray(field.path) || !field.path.length || field.path.some(key => typeof key !== 'string' || !key || forbidden.has(key))) throw Error('旧版字段路径无效。');
    let parent: State = state;
    const path = field.path as string[];
    for (const part of path.slice(0, -1)) {
      if (part in parent && !object(parent[part])) throw Error('旧版字段路径互相冲突。');
      parent[part] ??= {};
      parent = parent[part] as State;
    }
    if (path.at(-1)! in parent) throw Error('旧版字段路径重复。');
    if (!('default' in field)) throw Error('旧版字段缺少 default。');
    parent[path.at(-1)!] = field.default as JsonValue;
    if (typeof field.rule === 'string' && field.rule.trim()) rules.push(path.join('.') + '：' + field.rule);
  }
  return validatePreset({ id, name: data.名称 ?? '旧版字段转换', template: stringify(checkedState(state)), instruction: rules.join('\n') });
}
export function progressValue(key: string, value: JsonValue, siblings: State = {}): { value: number; max: number; assumed: boolean } | null {
  if (typeof value === 'string') {
    const ratio = value.match(/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*$/);
    const percent = value.match(/^\s*(\d+(?:\.\d+)?)\s*%\s*$/);
    if (ratio && Number(ratio[2]) > 0) return { value: Number(ratio[1]), max: Number(ratio[2]), assumed: false };
    if (percent) return { value: Number(percent[1]), max: 100, assumed: false };
  }
  if (typeof value === 'number' && value >= 0 && /^(hp|mp|san|好感度?|进度|体力|生命值|灵力)$/i.test(key)) {
    const max = siblings[key + '上限'] ?? siblings['最大' + key] ?? siblings[key + '_max'];
    if (typeof max === 'number' && max > 0) return { value, max, assumed: false };
    if (value <= 100) return { value, max: 100, assumed: true };
  }
  return null;
}
