/** Split rule source without evaluating instructions or regenerating YAML.
 * Offsets use JavaScript string indices (UTF-16), as do yaml's AST ranges.
 */
export function createRuleSectionToolkit(YAML) {
  if (!YAML || typeof YAML.parseDocument !== 'function') throw new TypeError('YAML.parseDocument is required');
  const clone = value => {
    if (Array.isArray(value)) return value.map(clone);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, clone(item)]));
    return value;
  };
  const normalize = path => path.map((part, index) => index === 0 && part === '黎北' ? '主角' : part);
  const heading = key => {
    if (typeof key !== 'string') return null;
    const parts = key.replace(/^\//u, '').split(/[./]/u);
    return parts.length && parts.every(Boolean) ? normalize(parts) : null;
  };
  const partMatches = (pattern, value) => {
    const template = /^\$\{([^{}]+)\}$/u.exec(pattern);
    return template ? template[1].split('|').includes(value) : pattern === value;
  };
  const prefix = (pattern, path) => pattern.length <= path.length && pattern.every((part, index) => partMatches(part, path[index]));
  const map = node => Boolean(node && Array.isArray(node.items) && node.items.every(item => item && 'key' in item));

  function split(text, fields) {
    if (typeof text !== 'string' || !Array.isArray(fields)) throw new TypeError('Expected rule text and fields array');
    if (fields.length > 128) throw new RangeError('Field limit 128 exceeded');
    const output = clone(fields), notes = [], assigned = [];
    for (const field of output) {
      if (field.rule != null && typeof field.rule !== 'string') throw new TypeError('Field rule must be text');
      if ((field.rule || '').length > 40000) throw new RangeError('Field rule limit 40000 exceeded');
    }
    const targets = output.map(field => ({field, path:Array.isArray(field.path) ? normalize(field.path) : []}));
    const matches = path => {
      const found = targets.filter(target => target.path.length && prefix(path, target.path));
      // Colliding normalized paths/IDs cannot be assigned safely.
      const paths = found.map(target => JSON.stringify(target.path));
      const ids = found.map(target => target.field.id);
      if (new Set(paths).size !== paths.length || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string')) return [];
      return ids;
    };
    const lineStart = offset => text.lastIndexOf('\n', offset - 1) + 1;
    function visit(node, parent, end) {
      if (!map(node) || node.flow) return;
      const pairs = node.items;
      for (let index = 0; index < pairs.length; index++) {
        const pair = pairs[index], key = pair.key;
        if (!key || !key.range || typeof key.value !== 'string') continue;
        const start = lineStart(key.range[0]);
        const next = pairs[index + 1]?.key?.range?.[0];
        const stop = next == null ? end : lineStart(next);
        if (start < 0 || stop <= start || stop > text.length) continue;
        if (key.value === '变量更新规则' && parent.length === 0) {
          visit(pair.value, [], stop);
          continue;
        }
        const parts = heading(key.value);
        if (!parts || parts.some(part => ['总则','通用规则','公共规则','通用','common','general'].includes(part))) continue;
        const path = [...parent, ...parts], ids = matches(path);
        const children = map(pair.value) && !pair.value.flow && pair.value.items.some(child => {
          const childParts = heading(child.key?.value);
          return childParts && matches([...path, ...childParts]).length > 0;
        });
        if (children) visit(pair.value, path, stop);
        else if (ids.length && pair.value && !YAML.isAlias?.(pair.value)) assigned.push({start, end:stop, fieldIds:ids});
      }
      return;
    }
    try {
      const document = YAML.parseDocument(text, {uniqueKeys:true, strict:true});
      if (document.errors.length) notes.push('Unparseable YAML retained as shared text.');
      else if (!map(document.contents) || document.contents.flow) notes.push('Non-block mapping retained as shared text.');
      else visit(document.contents, [], Math.min(document.contents.range?.[2] ?? text.length, text.length));
    } catch {
      notes.push('Unparseable YAML retained as shared text.');
    }
    const segments = [];
    const add = (start, end, fieldIds) => {
      if (end > start) segments.push({start, end, text:text.slice(start, end), fieldIds:[...fieldIds]});
    };
    let cursor = 0;
    for (const block of assigned.sort((a, b) => a.start - b.start)) {
      if (block.start < cursor) continue;
      add(cursor, block.start, []);
      add(block.start, block.end, block.fieldIds);
      cursor = block.end;
    }
    add(cursor, text.length, []);
    for (const field of output) {
      let rule = field.rule || '';
      for (const segment of segments) {
        if (!segment.fieldIds.includes(field.id) || rule.includes(segment.text)) continue;
        rule += (rule && !/[\r\n]$/u.test(rule) ? '\n' : '') + segment.text;
      }
      if (rule.length > 40000) throw new RangeError('Field rule limit 40000 exceeded');
      if (rule || field.rule != null) field.rule = rule;
    }
    const shared = segments.filter(segment => !segment.fieldIds.length).map(segment => segment.text).join('');
    if (shared && !notes.length) notes.push('Unmatched source retained as shared text.');
    return {fields:output, shared, segments, notes};
  }
  return Object.freeze({split});
}
