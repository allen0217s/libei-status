/** Stable per-character references; pure validation shared by the engine and the reader. */
export function validateReferenceConfig(value) {
  if (!Array.isArray(value) || value.length > 64) throw Error('参考世界书条目必须是最多 64 项的列表。');
  const keys = new Set();
  return value.map(item => {
    if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['book','uid'].includes(key)) ||
      typeof item.book !== 'string' || !item.book.trim() || item.book.length > 300 ||
      typeof item.uid !== 'string' || !item.uid || item.uid.length > 200) throw Error('参考条目必须有有效的世界书名称与 UID。');
    const key = JSON.stringify([item.book,item.uid]);
    if (keys.has(key)) throw Error('参考世界书条目重复。');
    keys.add(key);
    return {book:item.book,uid:item.uid};
  });
}
