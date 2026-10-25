<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { runEngine } from '@/state/engine';
interface Reference { book:string; uid:string }
interface Entry { uid:string; comment:string; content:string; disabled:boolean; excluded?:boolean }
interface Book { name:string; entries:Entry[] }
const props = defineProps<{ modelValue?:Reference[]; profileKey:string; disabled?:boolean }>();
const emit = defineEmits<{ (event:'update:modelValue', value:Reference[]):void }>();
const open = ref(false), search = ref(''), books = ref<Book[]>([]), busy = ref(false), error = ref(''), loaded = ref(false);
let alive = true, epoch = 0;
const identity = (book:string, uid:string) => JSON.stringify([book,uid]);
const selected = computed(() => Array.isArray(props.modelValue) ? props.modelValue : []);
const selectedKeys = computed(() => new Set(selected.value.map(item => identity(item.book,item.uid))));
const available = computed(() => new Map(books.value.flatMap(book => book.entries.map(entry => [identity(book.name,entry.uid),entry] as const))));
const filtered = computed(() => {
  const query = search.value.trim().toLocaleLowerCase();
  return books.value.map(book => ({ ...book, entries:book.entries.filter(entry => !query || [book.name,entry.uid,entry.comment,entry.content].some(text => text.toLocaleLowerCase().includes(query))) })).filter(book => book.entries.length);
});
async function refresh() {
  const key = props.profileKey, request = ++epoch;
  books.value = []; loaded.value = false; error.value = ''; busy.value = false;
  if (!key || !open.value) return;
  busy.value = true;
  try {
    const result = await runEngine('listReferenceWorldbookEntries',key);
    if (!alive || request !== epoch || key !== props.profileKey || !open.value) return;
    if (!result || result.profileKey !== key || !Array.isArray(result.books)) throw Error('世界书列表与当前角色不匹配，请重试。');
    books.value = result.books.map((book:any) => {
      if (typeof book.name !== 'string' || !Array.isArray(book.entries)) throw Error('世界书列表格式不正确。');
      return { name:book.name, entries:book.entries.map((entry:any) => {
        if (typeof entry.uid !== 'string' || typeof entry.content !== 'string') throw Error('世界书条目缺少稳定 UID 或原文。');
        return {uid:entry.uid,comment:typeof entry.comment === 'string' ? entry.comment : '',content:entry.content,disabled:!!entry.disabled,excluded:!!entry.excluded};
      }) };
    });
    loaded.value = true;
  } catch (cause) { if (alive && request === epoch && key === props.profileKey) error.value = cause instanceof Error ? cause.message : String(cause); }
  finally { if (alive && request === epoch) busy.value = false; }
}
function toggle(event:Event) {
  open.value = (event.target as HTMLDetailsElement).open;
  if (open.value) void refresh();
  else { epoch++; busy.value = false; }
}
function choose(book:string, entry:Entry, event:Event) {
  if (props.disabled || entry.excluded) return;
  const remaining = selected.value.filter(item => identity(item.book,item.uid) !== identity(book,entry.uid));
  emit('update:modelValue',(event.target as HTMLInputElement).checked ? [...remaining,{book,uid:entry.uid}] : remaining);
}
function remove(item:Reference) {
  if (!props.disabled) emit('update:modelValue',selected.value.filter(value => identity(value.book,value.uid) !== identity(item.book,item.uid)));
}
watch(() => props.profileKey, () => { epoch++; books.value = []; loaded.value = false; error.value = ''; search.value = ''; busy.value = false; if (open.value) void refresh(); });
onBeforeUnmount(() => { alive = false; epoch++; });
</script>

<template>
  <details class="libei-references" data-rule-field="worldbookReferences" @toggle="toggle">
    <summary>参考世界书条目 <span>已选 {{ selected.length }} 条</span></summary>
    <div v-if="open" class="libei-reference-body" :aria-busy="busy">
      <p>引用原文仅供变量更新模型；正文仍由酒馆原机制加载世界书</p>
      <p>选择仅修改规则草稿，点击“保存规则”后生效。不会启用或改写世界书，也不会执行宏或 EJS。</p>
      <ul v-if="selected.length" class="libei-reference-list" aria-label="已选世界书引用">
        <li v-for="item in selected" :key="identity(item.book,item.uid)" :data-selected-reference="identity(item.book,item.uid)">
          <span>{{ item.book }} · {{ available.get(identity(item.book,item.uid))?.comment || item.uid }} <strong v-if="loaded && !available.has(identity(item.book,item.uid))">引用缺失</strong><strong v-else-if="available.get(identity(item.book,item.uid))?.excluded">已被全局排除</strong></span>
          <button type="button" class="bbs-btn" data-action="remove-reference" :disabled="disabled" :aria-label="'移除引用 ' + item.book + ' ' + item.uid" @click="remove(item)">移除</button>
        </li>
      </ul>
      <div class="libei-reference-tools"><label>搜索条目<input v-model="search" class="bbs-input" type="search" placeholder="书名、条目名、UID 或原文" /></label><button type="button" class="bbs-btn" data-action="refresh-references" :disabled="busy || !profileKey" @click="refresh">{{ busy ? '载入中…' : '刷新列表' }}</button></div>
      <p v-if="error" role="alert">{{ error }} <button type="button" class="bbs-btn" data-action="retry-references" @click="refresh">重试</button></p>
      <p v-else-if="busy" role="status">正在读取当前角色绑定的世界书…</p>
      <p v-else-if="loaded && !books.length" role="status">当前角色没有绑定世界书。</p>
      <p v-else-if="loaded && !filtered.length" role="status">没有匹配的条目。</p>
      <section v-for="book in filtered" :key="book.name" class="libei-reference-book">
        <h4>{{ book.name }}</h4>
        <div v-for="entry in book.entries" :key="identity(book.name,entry.uid)" class="libei-reference-entry" :data-reference-book="book.name" :data-reference-uid="entry.uid">
          <label class="libei-reference-check"><input class="bbs-checkbox" type="checkbox" :checked="selectedKeys.has(identity(book.name,entry.uid))" :disabled="disabled || entry.excluded" @change="choose(book.name,entry,$event)" /><span>{{ entry.comment || entry.uid }} <small v-if="entry.disabled">来源已停用</small> <small v-if="entry.excluded">全局排除 · 不可选择</small></span></label>
          <details><summary>查看原文</summary><pre>{{ entry.content }}</pre></details>
        </div>
      </section>
      <slot name="preview" />
    </div>
  </details>
</template>

<style scoped>
.libei-references{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);min-width:0;background:var(--bbs-surface)}.libei-references>summary{padding:10px 12px;font-size:13px;font-weight:600}.libei-references>summary>span{font-weight:400;color:var(--bbs-ink-soft);margin-left:8px}.libei-reference-body{display:grid;gap:10px;padding:12px;min-width:0;border-top:1px solid var(--bbs-line)}p{margin:0;font-size:12px;line-height:1.7;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.libei-reference-tools{display:flex;align-items:end;flex-wrap:wrap;gap:8px}.libei-reference-tools>label{display:grid;gap:6px;flex:1 1 180px;min-width:0;font-size:13px}.bbs-input{width:100%;min-width:0;min-height:44px}.bbs-btn,summary{min-height:44px;cursor:pointer;align-content:center}.libei-reference-list{display:grid;gap:6px;list-style:none;margin:0;padding:0}.libei-reference-list>li{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px}.libei-reference-list span{min-width:0;overflow-wrap:anywhere}.libei-reference-list .bbs-btn{flex:none}.libei-reference-list strong{font-weight:400;color:var(--bbs-danger)}.libei-reference-book{display:grid;gap:4px;min-width:0}.libei-reference-book h4{margin:0;font-size:13px;overflow-wrap:anywhere}.libei-reference-entry{min-width:0;border-top:1px solid var(--bbs-line)}.libei-reference-check{display:flex;align-items:center;gap:10px;min-height:44px;font-size:13px;overflow-wrap:anywhere}.libei-reference-check>input{flex:none}.libei-reference-check small{display:inline-block;color:var(--bbs-ink-soft);font-size:11px}.libei-reference-entry summary{font-size:12px;color:var(--bbs-ink-soft)}pre{margin:0;padding:10px;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm);white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto;font:12px/1.7 var(--bbs-font-mono)}:is(button,summary,input):focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:2px}@media(max-width:400px){.bbs-input{font-size:16px}.libei-reference-body{padding:10px}}
</style>
