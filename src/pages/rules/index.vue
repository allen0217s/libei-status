<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import Collapsible from '@/components/Collapsible.vue';
import { engineView as view, runEngine } from '@/state/engine';

interface ContextEntry { id: string; title: string; content: string; editable: boolean; field?: string; role?: string }
interface ContextPreview {
  available: boolean; reason: string; targetId: number;
  update: { entries: ContextEntry[]; messages: Array<{ role: string; content: string }>; worldbookStatus: string };
  story: { entries: ContextEntry[]; content: string; applied: { enabled: boolean; content: string; reason: string } };
}
const clone = (value: any): any => value == null ? null : JSON.parse(JSON.stringify(value));
const profileKey = computed(() => String(view.value.profileKey ?? ''));
const cardName = computed(() => view.value.cardName || '尚未选择角色');
const draftProfile = ref(profileKey.value), draft = ref<any>(null), numericText = ref('');
const dirty = ref(false), saving = ref(false), importing = ref(false), localError = ref(''), notice = ref('');
const optionsDraft = ref<any>({}), optionsDirty = ref(false), optionsSaving = ref(false);
const fileInput = ref<HTMLInputElement | null>(null), rulesRoot = ref<HTMLElement | null>(null);
const preview = ref<ContextPreview | null>(null), previewBusy = ref(false), previewError = ref(''), previewWithWorldbooks = ref(false);
let loadingDraft = false, alive = true, actionEpoch = 0, previewEpoch = 0, importProfile = '';
const entries = [
  { field:'systemPrompt', title:'插件模型额外任务说明', audience:'插件模型', hint:'补充状态维护任务；不替代程序固定写入保护。' },
  { field:'updateRules', title:'变量更新规则', audience:'插件模型', hint:'描述字段含义、依据和更新条件。' },
  { field:'numericRules', title:'数值与事件规则', audience:'插件模型 / 正文参考', hint:'用于事件判断；自然语言不是计算公式执行器。' },
  { field:'numericConfig', title:'程序计算参数', audience:'程序结算', hint:'编辑 JSON 数值参数，保存和预览前都会校验。' },
  { field:'outputFormat', title:'模型输出协议', audience:'插件模型', hint:'约定更新模型返回格式，不能改变固定字段写入权。' },
  { field:'snapshotTemplate', title:'正文状态注入模板', audience:'正文模型', hint:'正文生成时使用的状态模板，不是酒馆完整预设。' },
  { field:'storyInstruction', title:'正文职责说明', audience:'正文模型', hint:'补充正文如何使用状态，与插件更新任务分开。' },
] as const;
const initials = computed<Array<{id:string;label:string;text:string}>>(() => Array.isArray(draft.value?.initials) ? draft.value.initials : []);
const initialOptions = computed(() => [{ value:'', label:'请选择初值方案' }, ...initials.value.map(item => ({value:item.id,label:item.label || item.id}))]);
const canEdit = computed(() => !!draft.value && !!profileKey.value && draftProfile.value === profileKey.value);
function invalidatePreview() { previewEpoch++; preview.value = null; previewBusy.value = false; previewError.value = ''; }
function loadDraft(value:any) {
  loadingDraft = true;
  draft.value = clone(value);
  if (draft.value) for (const field of ['protagonistName','systemPrompt','storyInstruction']) if (typeof draft.value[field] !== 'string') draft.value[field] = '';
  numericText.value = draft.value?.numericConfig ? JSON.stringify(draft.value.numericConfig, null, 2) : '{}';
  dirty.value = false;
  loadingDraft = false;
}
function markDirty() { if (loadingDraft) return; dirty.value = true; notice.value = ''; invalidatePreview(); }
watch(draft, markDirty, {deep:true,flush:'sync'});
watch(numericText, markDirty, {flush:'sync'});
watch(optionsDraft, () => { if (!loadingDraft) optionsDirty.value = true; }, {deep:true,flush:'sync'});
watch(() => view.value.profileKey, (key, previous) => {
  const discarded = dirty.value || optionsDirty.value;
  actionEpoch++; invalidatePreview(); saving.value = false; importing.value = false; optionsSaving.value = false; localError.value = '';
  draftProfile.value = String(key ?? '');
  loadDraft(view.value.rules);
  loadingDraft = true; optionsDraft.value = clone(view.value.config) || {}; optionsDirty.value = false; loadingDraft = false;
  notice.value = previous !== undefined && key !== previous ? discarded ? '已切换角色：旧角色未保存的草稿已丢弃。' : '已切换到当前角色的规则。' : '';
}, {immediate:true,flush:'sync'});
watch(() => view.value.rules, value => { if (!dirty.value && !saving.value && draftProfile.value === profileKey.value) loadDraft(value); });
watch(() => view.value.config, value => {
  if (optionsDirty.value || optionsSaving.value) return;
  loadingDraft = true; optionsDraft.value = clone(value) || {}; loadingDraft = false;
});
watch([() => view.value.floor, () => view.value.selection], invalidatePreview);
function assembledDraft() {
  if (!canEdit.value) throw Error('角色已切换或尚未就绪，请使用当前角色的规则。');
  let config:unknown;
  try { config = JSON.parse(numericText.value); } catch { throw Error('程序计算参数不是合法 JSON，草稿已保留。'); }
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw Error('程序计算参数必须是 JSON 对象。');
  return { ...clone(draft.value), numericConfig:config };
}
async function save() {
  if (saving.value || importing.value) return;
  const key = draftProfile.value, epoch = actionEpoch;
  localError.value = ''; saving.value = true;
  try {
    await runEngine('saveRules', assembledDraft(), key);
    if (!alive || epoch !== actionEpoch || key !== profileKey.value) return;
    loadDraft(view.value.rules); invalidatePreview(); notice.value = '当前角色规则已保存，已有进度未重置。';
  } catch (error) { if (alive && epoch === actionEpoch && key === profileKey.value) localError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive && epoch === actionEpoch) saving.value = false; }
}
function revert() { actionEpoch++; saving.value = false; importing.value = false; loadDraft(view.value.rules); invalidatePreview(); localError.value = ''; notice.value = '已放弃当前规则草稿。'; }
function requestImport() { importProfile = profileKey.value; fileInput.value?.click(); }
async function importRules(event:Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = '';
  if (!file) return;
  const key = importProfile, epoch = actionEpoch;
  importing.value = true; localError.value = '';
  try {
    if (!key || key !== profileKey.value) throw Error('文件选择期间角色已切换，请在当前角色重新导入。');
    if (file.size > 1500000) throw Error('规则文件过大。');
    const value = JSON.parse(await file.text());
    if (!alive || epoch !== actionEpoch || key !== profileKey.value) return;
    if (!value.rules) throw Error('不是包含 rules 的规则备份。');
    const checked = await runEngine('validateRules', value.rules);
    if (!alive || epoch !== actionEpoch || key !== profileKey.value) return;
    loadDraft(checked); dirty.value = true; invalidatePreview(); localError.value = ''; notice.value = '已载入规则草稿；检查后保存，才会应用到当前角色。';
  } catch (error) { if (alive && epoch === actionEpoch) localError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive && epoch === actionEpoch) importing.value = false; }
}
async function exportRules() {
  try { await runEngine('exportRules'); }
  catch (error) { if (alive) localError.value = error instanceof Error ? error.message : String(error); }
}
async function saveOptions() {
  if (!canEdit.value || optionsSaving.value) return;
  const epoch = actionEpoch; optionsSaving.value = true; localError.value = '';
  try {
    await runEngine('saveOptions', clone(optionsDraft.value));
    if (!alive || epoch !== actionEpoch) return;
    optionsDirty.value = false; invalidatePreview(); notice.value = '更新选项已保存。';
  } catch (error) { if (alive && epoch === actionEpoch) localError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive && epoch === actionEpoch) optionsSaving.value = false; }
}
async function previewContext(includeWorldbooks = false) {
  if (previewBusy.value || importing.value) return;
  const key = draftProfile.value, epoch = ++previewEpoch;
  previewError.value = ''; preview.value = null; previewBusy.value = true;
  try {
    const value = await runEngine('previewContext', assembledDraft(), {includeWorldbooks,profileKey:key}) as ContextPreview;
    if (!alive || epoch !== previewEpoch || key !== profileKey.value) return;
    preview.value = value; previewWithWorldbooks.value = includeWorldbooks;
  } catch (error) { if (alive && epoch === previewEpoch && key === profileKey.value) previewError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive && epoch === previewEpoch) previewBusy.value = false; }
}
function editableField(field?:string) { return !!field && entries.some(entry => entry.field === field); }
function editFromPreview(field?:string) {
  if (!editableField(field)) return;
  const entry = rulesRoot.value?.querySelector<HTMLDetailsElement>(`[data-rule-field="${field}"]`);
  if (!entry) return;
  entry.open = true; entry.scrollIntoView({block:'nearest'}); entry.querySelector<HTMLTextAreaElement>('textarea')?.focus();
}
onBeforeUnmount(() => { alive = false; actionEpoch++; previewEpoch++; });
</script>

<template>
  <section ref="rulesRoot" class="libei-rules-page">
    <div class="bbs-section-head"><h2 class="bbs-title bbs-title-sub">变量规则</h2><span class="libei-hint">{{ dirty ? '有未保存修改' : '已保存' }}</span></div>
    <p class="libei-hint libei-profile">当前角色：<strong>{{ cardName }}</strong> · 规则按角色分别保存，保存不会重置已有状态。</p>
    <p v-if="notice" class="libei-notice" role="status">{{ notice }}</p>
    <p v-if="localError" class="libei-error" role="alert">{{ localError }}</p>
    <template v-if="draft">
      <div class="libei-actions libei-rule-actions">
        <button class="bbs-btn bbs-btn-primary" type="button" :disabled="!canEdit || view.busy || saving || importing" @click="save"><Icon name="check" />{{ saving ? '保存中…' : '保存规则' }}</button>
        <button class="bbs-btn" type="button" :disabled="saving" @click="revert">放弃修改</button>
        <button class="bbs-btn" type="button" :disabled="!canEdit" @click="exportRules"><Icon name="download" />导出规则</button>
        <button class="bbs-btn" type="button" :disabled="!canEdit || saving || importing" @click="requestImport">导入规则</button>
        <input ref="fileInput" type="file" accept=".json,application/json" hidden aria-label="导入当前角色规则" @change="importRules" />
      </div>
      <p class="libei-hint">导出的是当前已保存规则，不包含未保存草稿。导入仅载入草稿，不会立即覆盖当前角色。</p>
      <fieldset class="libei-rule-fields" :disabled="!canEdit || saving || importing">
        <legend class="libei-sr-only">当前角色规则草稿</legend>
        <label class="libei-field"><span>主角称呼</span><input v-model="draft.protagonistName" class="bbs-input" type="text" maxlength="120" :placeholder="view.cardName || '留空使用当前角色卡名'" /><small class="libei-hint">留空使用当前角色卡名，不改变角色隔离标识。</small></label>
        <section class="libei-initials" aria-label="变量初值">
          <h3>变量初值</h3>
          <label class="libei-field"><span>新聊天初值方案</span><BbsSelect v-model="draft.initialChoice" :options="initialOptions" aria-label="新聊天初值方案" /></label>
          <p class="libei-hint">手动选择，不按开场文字猜测；未选择前不初始化新聊天。每份 YAML 都可在下面展开编辑。</p>
          <details v-for="(initial, index) in initials" :key="initial.id" class="libei-rule-entry">
            <summary><span class="libei-entry-title">{{ initial.label || `初值 ${index + 1}` }}</span><span class="libei-entry-tag">YAML</span></summary>
            <div class="libei-entry-body"><label class="libei-field"><span>初值名称</span><input v-model="initial.label" class="bbs-input" type="text" /></label><label class="libei-field"><span>{{ initial.label || '变量初值' }} · YAML</span><textarea v-model="initial.text" class="bbs-input libei-editor" rows="12" spellcheck="false" :aria-label="`初值YAML ${index + 1}`" /></label></div>
          </details>
        </section>
      </fieldset>
      <fieldset class="libei-rule-fields" :disabled="!canEdit || saving || importing">
        <legend class="libei-sr-only">上下文条目与预览</legend>
        <section class="libei-context-region" aria-label="上下文条目与预览">
        <section class="libei-context-editor" aria-label="上下文条目编辑">
          <h3>上下文条目</h3><p class="libei-hint">按下列顺序逐项查看和编辑。标记显示条目的使用方；实际拼接结果在下方按需预览。</p>
          <ol class="libei-context-list">
            <li v-for="(entry, index) in entries" :key="entry.field">
              <details class="libei-rule-entry" :data-rule-field="entry.field">
                <summary><span class="libei-entry-number">{{ String(index + 1).padStart(2, '0') }}</span><span class="libei-entry-title">{{ entry.title }}</span><span class="libei-entry-tag">{{ entry.audience }}</span></summary>
                <div class="libei-entry-body"><p class="libei-hint">{{ entry.hint }}</p><label class="libei-field"><span>{{ entry.title }}</span><textarea v-if="entry.field === 'numericConfig'" v-model="numericText" class="bbs-input libei-editor" rows="8" spellcheck="false" aria-label="程序计算参数JSON" /><textarea v-else v-model="draft[entry.field]" class="bbs-input libei-editor" rows="10" spellcheck="false" :aria-label="entry.title" /></label></div>
              </details>
            </li>
          </ol>
          <details class="libei-rule-entry libei-protection"><summary><span class="libei-entry-title">程序固定写入保护</span><span class="libei-entry-tag">只读 · 不可编辑</span></summary><div class="libei-entry-body"><p>钱财、元精和算式只由程序结算。模型不能直接覆盖这些字段，也不能用替换整个主角对象绕过保护。编辑提示词不会改变这条边界，数值参数仍由引擎校验。</p></div></details>
        </section>
        <section class="libei-preview" :aria-busy="previewBusy" aria-label="草稿上下文预览">
        <h3>上下文预览</h3>
        <p class="libei-hint">只预览当前草稿，不保存、不发送模型请求，不显示渠道密钥。默认不扫描世界书；点击“收集世界书参考”才显式收集。若开启世界书模板执行，引擎会拒绝预览，避免执行副作用。</p>
        <div class="libei-actions"><button class="bbs-btn" type="button" :disabled="!canEdit || previewBusy || saving || importing" @click="previewContext(false)">{{ previewBusy ? '正在构建预览…' : '预览当前草稿' }}</button><button class="bbs-btn" type="button" :disabled="!canEdit || previewBusy || saving || importing" @click="previewContext(true)">收集世界书参考</button></div>
        <p v-if="previewError" class="libei-error" role="alert">{{ previewError }}</p>
        <template v-if="preview">
          <p class="libei-notice" role="status">草稿预览 · 未保存、未发送{{ preview.targetId >= 0 ? ` · 目标第 ${preview.targetId} 楼` : '' }} · {{ previewWithWorldbooks ? '已请求收集世界书参考' : '未扫描世界书' }}</p>
          <p v-if="preview.reason" class="libei-hint">{{ preview.reason }}</p>
          <p v-if="!preview.available" class="libei-hint">当前预览不可完整使用，请先处理上述原因；这不代表内容已经发送。</p>
          <h4>插件更新模型上下文</h4><p class="libei-hint">{{ preview.update?.worldbookStatus }}</p>
          <details v-for="entry in preview.update?.entries || []" :key="entry.id" class="libei-preview-entry"><summary>{{ entry.title }} <span class="libei-entry-tag">{{ entry.role || '上下文' }} · {{ entry.editable ? '草稿条目' : '只读' }}</span></summary><div class="libei-entry-body"><button v-if="entry.editable && editableField(entry.field)" class="bbs-btn" type="button" @click="editFromPreview(entry.field)">编辑此项</button><pre class="libei-preview-text">{{ entry.content }}</pre></div></details>
          <details class="libei-preview-entry"><summary>查看拼接后的更新消息（未发送）</summary><ol class="libei-message-list"><li v-for="(message, index) in preview.update?.messages || []" :key="index"><h5>{{ index + 1 }} · {{ message.role }}</h5><pre class="libei-preview-text">{{ message.content }}</pre></li></ol></details>
          <h4>正文模型 · 本插件注入段</h4><p class="libei-hint">这里只包含本插件注入内容，不等于酒馆的完整预设、人设、世界书与聊天历史。</p>
          <details v-for="entry in preview.story?.entries || []" :key="entry.id" class="libei-preview-entry"><summary>{{ entry.title }} <span class="libei-entry-tag">{{ entry.editable ? '草稿条目' : '只读' }}</span></summary><div class="libei-entry-body"><button v-if="entry.editable && editableField(entry.field)" class="bbs-btn" type="button" @click="editFromPreview(entry.field)">编辑此项</button><pre class="libei-preview-text">{{ entry.content }}</pre></div></details>
          <details class="libei-preview-entry"><summary>查看草稿正文注入段（未应用）</summary><pre class="libei-preview-text">{{ preview.story?.content }}</pre></details>
          <details class="libei-preview-entry"><summary>当前实际注入段（引擎报告）</summary><div class="libei-entry-body"><p class="libei-hint">{{ preview.story?.applied?.enabled ? '引擎报告当前已启用注入；不代表模型已接收。' : '引擎报告当前未启用注入。' }} {{ preview.story?.applied?.reason }}</p><pre class="libei-preview-text">{{ preview.story?.applied?.content }}</pre></div></details>
        </template>
        </section>
      </section>
      </fieldset>
    </template>
    <p v-else class="bbs-empty">请先打开一个单角色聊天，等待当前角色规则载入。</p>
    <Collapsible title="状态更新选项" :open="false">
      <p class="libei-hint">更新选项单独保存；上下文预览使用引擎当前已保存的选项。</p>
      <label class="libei-switch"><span>正文完成后自动更新状态</span><input v-model="optionsDraft.automatic" class="bbs-checkbox" type="checkbox" /></label>
      <label class="libei-field"><span>参考最近消息数（2～30；只结算目标楼层）</span><input v-model.number="optionsDraft.contextMessages" type="number" min="2" max="30" class="bbs-input" /></label>
      <label class="libei-switch"><span>向正文模型提供数值事件规则</span><input v-model="optionsDraft.sendNumericToStory" class="bbs-checkbox" type="checkbox" /></label>
      <button class="bbs-btn bbs-btn-primary" type="button" :disabled="!canEdit || view.busy || optionsSaving" @click="saveOptions">{{ optionsSaving ? '保存中…' : '保存更新选项' }}</button>
    </Collapsible>
  </section>
</template>

<style scoped>
.libei-rules-page{display:flex;flex-direction:column;gap:14px;min-width:0}.libei-rules-page h3,.libei-rules-page h4,.libei-rules-page h5{margin:0;font-weight:600}.libei-rules-page h3{font-size:15px}.libei-rules-page h4{font-size:13px}.libei-rules-page h5{font-size:12px}
.libei-hint{font-size:12px;line-height:1.7;color:var(--bbs-ink-soft);margin:0;overflow-wrap:anywhere}.libei-profile strong{font-weight:600}.libei-notice{font-size:12px;line-height:1.7;color:var(--bbs-ink);background:var(--bbs-surface-2);padding:9px 12px;margin:0;border-radius:var(--bbs-radius-sm);overflow-wrap:anywhere}.libei-error{color:var(--bbs-danger);font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin:0}
.libei-rule-fields{border:0;padding:0;margin:0;min-width:0;display:grid;gap:16px}.libei-field{display:flex;flex-direction:column;gap:7px;font-size:13px;min-width:0}.libei-field>.bbs-input{width:100%;min-width:0}.libei-initials,.libei-context-editor,.libei-preview{display:grid;gap:10px;min-width:0}.libei-context-region{display:grid;gap:16px;min-width:0}.libei-context-list,.libei-message-list{list-style:none;display:grid;gap:9px;margin:0;padding:0;min-width:0}.libei-context-list>li,.libei-message-list>li{min-width:0}
.libei-rule-entry,.libei-preview-entry{min-width:0;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface);overflow:hidden}.libei-rule-entry>summary,.libei-preview-entry>summary{cursor:pointer;padding:12px;min-height:44px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.libei-rule-entry>summary{display:flex;flex-wrap:wrap;align-items:center;gap:7px;list-style:none}.libei-rule-entry>summary::after{content:'＋';margin-left:auto;flex:none;color:var(--bbs-ink-soft)}.libei-rule-entry[open]>summary::after{content:'−'}.libei-rule-entry>summary::-webkit-details-marker{display:none}.libei-rule-entry[open]>summary,.libei-preview-entry[open]>summary{border-bottom:1px solid var(--bbs-line)}
.libei-entry-title{font-weight:600;min-width:0;overflow-wrap:anywhere}.libei-entry-number{font:11px var(--bbs-font-mono);color:var(--bbs-ink-soft)}.libei-entry-tag{font-size:10px;font-weight:400;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.libei-entry-body{display:grid;gap:10px;min-width:0;padding:12px}.libei-entry-body>p{font-size:12px;line-height:1.7;margin:0;overflow-wrap:anywhere}.libei-editor{min-height:160px;font:13px/1.7 var(--bbs-font-mono);resize:vertical;tab-size:2;max-width:100%;overflow-wrap:anywhere;white-space:pre-wrap}
.libei-actions{display:flex;flex-wrap:wrap;gap:8px}.libei-actions>.bbs-btn{min-height:40px;white-space:normal;text-align:left}.libei-rule-actions{padding:8px 0;border-bottom:1px solid var(--bbs-line)}.libei-protection{background:var(--bbs-surface-2)}.libei-preview{border-top:1px solid var(--bbs-line);padding-top:14px}.libei-preview-text{font:12px/1.7 var(--bbs-font-mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;min-width:0;max-height:480px;overflow:auto;padding:12px;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm)}.libei-message-list{padding:12px}.libei-message-list>li{display:grid;gap:6px}.libei-switch{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:12px 0;font-size:13px}.libei-switch>input{flex:none}
.libei-rules-page summary:focus-visible,.libei-rules-page button:focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:-3px}.libei-sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:400px){.libei-rule-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.libei-rule-actions>.bbs-btn{justify-content:center;width:100%;padding:8px}.libei-rule-entry>summary,.libei-preview-entry>summary{padding:10px}.libei-entry-body{padding:10px}.libei-entry-tag{font-size:10px}.libei-editor{font-size:16px;min-height:180px}.libei-preview-text{font-size:12px}}
</style>
