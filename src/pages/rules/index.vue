<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import Collapsible from '@/components/Collapsible.vue';
import FieldSchemaEditor from './FieldSchemaEditor.vue';
import WorldbookReferences from './WorldbookReferences.vue';
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
interface SchemaReview { planId:string; changes:Array<Record<string,any>>; summary:string }
const fieldEditor = ref<InstanceType<typeof FieldSchemaEditor> | null>(null), schemaReview = ref<SchemaReview | null>(null);
let loadingDraft = false, alive = true, actionEpoch = 0, previewEpoch = 0, schemaReviewEpoch = 0, importProfile = '';
function invalidateSchemaReview() { schemaReviewEpoch++; schemaReview.value = null; }
const entries = [
  { field:'systemPrompt', title:'插件模型额外任务说明', audience:'插件模型', hint:'补充状态维护任务；不替代程序固定写入保护。' },
  { field:'updateRules', title:'通用与未匹配规则', audience:'插件模型', hint:'保留跨字段的通用要求，以及尚未归入字段的原文。各字段的独立规则在字段定义中编辑。' },
  { field:'numericConfig', title:'程序计算参数', audience:'程序结算', hint:'编辑 JSON 数值参数，保存和预览前都会校验。' },
  { field:'outputFormat', title:'模型输出协议', audience:'插件模型', hint:'约定更新模型返回格式，不能改变固定字段写入权。' },
  { field:'snapshotTemplate', title:'正文状态注入模板', audience:'正文模型', hint:'正文生成时使用的状态模板，不是酒馆完整预设。' },
  { field:'storyInstruction', title:'正文职责说明', audience:'正文模型', hint:'补充正文如何使用状态，与插件更新任务分开。' },
] as const;
const addCommon = ref(false);
const visibleEntries = computed(() => entries.filter(entry => entry.field !== 'updateRules' || !!draft.value?.updateRules || addCommon.value));
const initials = computed<Array<{id:string;label:string;text:string}>>(() => Array.isArray(draft.value?.initials) ? draft.value.initials : []);
const initialOptions = computed(() => [{ value:'', label:'请选择初值方案' }, ...initials.value.map(item => ({value:item.id,label:item.label || item.id}))]);
const canEdit = computed(() => !!draft.value && !!profileKey.value && draftProfile.value === profileKey.value);
const newInitialId = ref('');
const previewEntries = computed(() => [
  ...(preview.value?.update?.entries || []).map(entry => ({ ...entry, source:'插件模型', key:'update:' + entry.id })),
  ...(preview.value?.story?.entries || []).map(entry => ({ ...entry, source:'正文模型', key:'story:' + entry.id })),
]);
const readOnlyEntries = computed(() => previewEntries.value.filter(entry => entry.field !== 'fieldSchema' && entry.field !== 'worldbookReferences' && !entries.some(item => item.field === entry.field)));
function fieldPreviews(field:string) { return previewEntries.value.filter(entry => entry.field === field); }
function fieldSource(field:string) { return field === 'numericConfig' ? numericText.value : draft.value?.[field]; }
async function addInitial() {
  if (!canEdit.value || saving.value || importing.value || initials.value.length >= 20) return;
  const source = initials.value.find(initial => initial.id === draft.value.initialChoice) || initials.value[0];
  if (!source) return;
  let number = 1;
  while (initials.value.some(initial => initial.id === 'custom-' + number)) number++;
  const id = 'custom-' + number, key = draftProfile.value;
  draft.value.initials.push({ id, label:'新初值 ' + number, text:source.text });
  newInitialId.value = id;
  localError.value = '';
  notice.value = '已新建初值草稿。请修改名称和 YAML，保存规则后再按需选用；已有进度不会重置。';
  await nextTick();
  if (!alive || key !== profileKey.value || newInitialId.value !== id) return;
  const details = rulesRoot.value?.querySelector<HTMLDetailsElement>(`[data-initial-id="${id}"]`);
  details?.scrollIntoView({block:'nearest'});
  details?.querySelector<HTMLInputElement>('input')?.focus();
}
function invalidatePreview() { previewEpoch++; preview.value = null; previewBusy.value = false; previewError.value = ''; }
function loadDraft(value:any) {
  invalidateSchemaReview();
  loadingDraft = true;
  newInitialId.value = '';
  addCommon.value = !!value?.updateRules;
  draft.value = clone(value);
  if (draft.value) for (const field of ['protagonistName','systemPrompt','storyInstruction']) if (typeof draft.value[field] !== 'string') draft.value[field] = '';
  numericText.value = draft.value?.numericConfig ? JSON.stringify(draft.value.numericConfig, null, 2) : '{}';
  dirty.value = false;
  loadingDraft = false;
}
function markDirty() { if (loadingDraft) return; dirty.value = true; notice.value = ''; invalidatePreview(); invalidateSchemaReview(); }
watch(draft, markDirty, {deep:true,flush:'sync'});
watch(numericText, markDirty, {flush:'sync'});
watch(optionsDraft, () => { if (!loadingDraft) { optionsDirty.value = true; invalidateSchemaReview(); } }, {deep:true,flush:'sync'});
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
watch([() => view.value.floor, () => view.value.selection, () => view.value.chatId], () => { invalidatePreview(); invalidateSchemaReview(); });
function assembledDraft() {
  if (!canEdit.value) throw Error('角色已切换或尚未就绪，请使用当前角色的规则。');
  fieldEditor.value?.validate();
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
    const value = assembledDraft();
    if (JSON.stringify(value.fieldSchema ?? null) !== JSON.stringify(view.value.rules?.fieldSchema ?? null)) {
      invalidateSchemaReview();
      const reviewEpoch = schemaReviewEpoch;
      const plan = await runEngine('previewRulesChange', value, key) as SchemaReview;
      if (!alive || epoch !== actionEpoch || key !== profileKey.value || reviewEpoch !== schemaReviewEpoch) return;
      if (!plan || typeof plan.planId !== 'string' || !Array.isArray(plan.changes)) throw Error('引擎没有返回可审核的字段变更计划，草稿未保存。');
      schemaReview.value = plan; notice.value = '请审核字段变更。确认只保存配置，不会在这里改写当前聊天状态。';
      return;
    }
    await runEngine('saveRules', value, key);
    if (!alive || epoch !== actionEpoch || key !== profileKey.value) return;
    loadDraft(view.value.rules); invalidatePreview(); notice.value = '当前角色规则已保存，已有进度未重置。';
  } catch (error) { if (alive && epoch === actionEpoch && key === profileKey.value) localError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive && epoch === actionEpoch) saving.value = false; }
}
async function confirmSchemaSave() {
  const plan = schemaReview.value;
  if (!plan || !canEdit.value || saving.value || importing.value || view.value.busy) return;
  const key = draftProfile.value, epoch = actionEpoch, reviewEpoch = schemaReviewEpoch;
  saving.value = true; localError.value = '';
  try {
    await runEngine('commitRulesChange', plan.planId);
    if (!alive || epoch !== actionEpoch || key !== profileKey.value || reviewEpoch !== schemaReviewEpoch) return;
    loadDraft(view.value.rules); invalidatePreview();
    notice.value = '字段配置已保存，旧楼层没有改写。缺失字段按默认值在内存中补齐，下次正常更新或手动写入当前字段时才保存。';
  } catch (error) {
    if (alive && epoch === actionEpoch && key === profileKey.value) { invalidateSchemaReview(); localError.value = error instanceof Error ? error.message : String(error); }
  } finally { if (alive && epoch === actionEpoch) saving.value = false; }
}
function cancelSchemaSave() { invalidateSchemaReview(); notice.value = '已取消本次审核，字段草稿仍保留。'; }
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
onBeforeUnmount(() => { alive = false; actionEpoch++; previewEpoch++; invalidateSchemaReview(); });
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
      <section v-if="schemaReview" class="libei-schema-review" data-schema-review aria-label="字段变更审核">
        <h3>审核字段变更</h3><p class="libei-hint">{{ schemaReview.summary }}</p>
        <p class="libei-hint">此次确认只保存字段配置与初值，不会改写旧楼层。新增默认值先在内存中使用，下次正常更新或手动写入当前字段时才保存；不兼容旧值会明确阻止更新。</p>
        <ol class="libei-schema-changes"><li v-for="(change,index) in schemaReview.changes" :key="index"><strong>{{ change.kind }}</strong><pre class="libei-preview-text">{{ JSON.stringify(change,null,2) }}</pre></li></ol>
        <div class="libei-actions"><button class="bbs-btn bbs-btn-primary" type="button" data-action="confirm-schema" :disabled="saving || importing || view.busy || !canEdit" @click="confirmSchemaSave">确认保存字段配置</button><button class="bbs-btn" type="button" data-action="cancel-schema" :disabled="saving" @click="cancelSchemaSave">取消审核，保留草稿</button></div>
      </section>
      <fieldset class="libei-rule-fields" :disabled="!canEdit || saving || importing">
        <legend class="libei-sr-only">当前角色规则草稿</legend>
        <label class="libei-field"><span>主角称呼</span><input v-model="draft.protagonistName" class="bbs-input" type="text" maxlength="120" :placeholder="view.cardName || '留空使用当前角色卡名'" /><small class="libei-hint">留空使用当前角色卡名，不改变角色隔离标识。</small></label>
        <FieldSchemaEditor v-if="draft.fieldSchema" ref="fieldEditor" v-model="draft.fieldSchema" :disabled="!canEdit || saving || importing" @draft-change="markDirty">
          <template #preview><details v-for="rendered in fieldPreviews('fieldSchema')" :key="rendered.key" class="libei-preview-entry" :data-projection="rendered.key"><summary>{{ rendered.source }} · 字段定义组装结果（只读）</summary><div class="libei-entry-body"><pre class="libei-preview-text">{{ rendered.content }}</pre></div></details></template>
        </FieldSchemaEditor>
        <p v-else class="libei-hint">当前为旧版规则，尚无字段定义。初值与原有规则仍可按下方方式编辑。</p>
        <section class="libei-initials" aria-label="变量初值">
          <div class="libei-initial-head"><h3>变量初值</h3><button class="bbs-btn" type="button" :disabled="initials.length >= 20" @click="addInitial">新建初值</button></div>
          <p class="libei-hint">{{ initials.length }} / 20 个方案 · 新建时复制当前选中方案，未选择时复制第一个方案；不会自动选用。{{ initials.length >= 20 ? '已达方案上限。' : '' }}</p>
          <label class="libei-field"><span>新聊天初值方案</span><BbsSelect v-model="draft.initialChoice" :options="initialOptions" aria-label="新聊天初值方案" /></label>
          <p class="libei-hint">手动选择，不按开场文字猜测；未选择前不初始化新聊天。下方 YAML 是每个方案的高级初值覆写，字段类型与写入权限仍受字段定义约束。</p>
          <details v-for="(initial, index) in initials" :key="initial.id" class="libei-rule-entry" :data-initial-id="initial.id" :open="initial.id === newInitialId">
            <summary><span class="libei-entry-title">{{ initial.label || `初值 ${index + 1}` }}</span><span class="libei-entry-tag">YAML</span></summary>
            <div class="libei-entry-body"><label class="libei-field"><span>初值名称</span><input v-model="initial.label" class="bbs-input" type="text" /></label><label class="libei-field"><span>{{ initial.label || '变量初值' }} · YAML</span><textarea v-model="initial.text" class="bbs-input libei-editor" rows="12" spellcheck="false" :aria-label="`初值YAML ${index + 1}`" /></label></div>
          </details>
        </section>
      </fieldset>
      <fieldset class="libei-rule-fields" :disabled="!canEdit || saving || importing">
        <legend class="libei-sr-only">上下文条目与预览</legend>
        <section class="libei-context-region" :aria-busy="previewBusy" aria-label="上下文条目与预览">
          <h3>上下文 · 查看与编辑</h3>
          <p class="libei-hint">每个条目在原位编辑和查看，不再分列两份。点击预览后，展开条目可查看组装结果；修改草稿会清除旧预览，需要重新生成。</p>
          <div class="libei-actions"><button class="bbs-btn" type="button" :disabled="!canEdit || previewBusy || saving || importing" @click="previewContext(false)">{{ previewBusy ? '正在构建预览…' : '预览当前草稿' }}</button><button class="bbs-btn" type="button" :disabled="!canEdit || previewBusy || saving || importing" @click="previewContext(true)">收集已选世界书参考</button></div>
          <p class="libei-hint">预览不保存，也不发送模型请求。默认不收集引用；点击“收集已选世界书参考”才读取所选条目的原文，不执行宏或 EJS。</p>
          <p v-if="previewError" class="libei-error" role="alert">{{ previewError }}</p>
          <template v-if="preview">
            <p class="libei-notice" role="status">草稿预览 · 未保存、未发送{{ preview.targetId >= 0 ? ` · 目标第 ${preview.targetId} 楼` : '' }} · {{ previewWithWorldbooks ? '已请求收集所选引用' : '未收集引用' }}</p>
            <p v-if="preview.reason" class="libei-hint">{{ preview.reason }}</p>
            <p v-if="!preview.available" class="libei-hint">当前仅供检查草稿结构，不代表已有可发送的完整请求。请先处理上述原因。</p>
            <p class="libei-hint">{{ preview.update?.worldbookStatus }}</p>
          </template>
          <WorldbookReferences v-model="draft.worldbookReferences" :profile-key="draftProfile" :disabled="!canEdit || saving || importing">
            <template #preview><div v-for="rendered in fieldPreviews('worldbookReferences')" :key="rendered.key" class="libei-inline-preview" :data-projection="rendered.key"><h4>{{ rendered.source }} · 引用原文预览</h4><pre class="libei-preview-text">{{ rendered.content }}</pre></div></template>
          </WorldbookReferences>
          <button v-if="!draft.updateRules && !addCommon" class="bbs-btn" type="button" data-action="add-common-rules" @click="addCommon = true">添加通用规则</button>
          <ol class="libei-context-list">
            <li v-for="(entry, index) in visibleEntries" :key="entry.field">
              <details class="libei-rule-entry" :data-rule-field="entry.field">
                <summary><span class="libei-entry-number">{{ String(index + 1).padStart(2, '0') }}</span><span class="libei-entry-title">{{ entry.title }}</span><span class="libei-entry-tag">{{ entry.audience }} · 可编辑</span></summary>
                <div class="libei-entry-body">
                  <p class="libei-hint">{{ entry.hint }}</p>
                  <label class="libei-field"><span>草稿原文</span><textarea v-if="entry.field === 'numericConfig'" v-model="numericText" class="bbs-input libei-editor" rows="8" spellcheck="false" aria-label="程序计算参数JSON" /><textarea v-else v-model="draft[entry.field]" class="bbs-input libei-editor" rows="10" spellcheck="false" :aria-label="entry.title" /></label>
                  <div v-for="rendered in fieldPreviews(entry.field)" :key="rendered.key" class="libei-inline-preview" :data-projection="rendered.key">
                    <h4>{{ rendered.source }}{{ rendered.role ? ' · ' + rendered.role : '' }}</h4>
                    <p v-if="rendered.content === fieldSource(entry.field)" class="libei-hint">直接使用上方草稿原文，不另列副本。</p>
                    <pre v-else class="libei-preview-text">{{ rendered.content }}</pre>
                  </div>
                  <p v-if="!preview" class="libei-hint">点击“预览当前草稿”，在此处核对组装结果。</p>
                  <p v-else-if="!fieldPreviews(entry.field).length" class="libei-hint">本次预览未使用此条目。</p>
                </div>
              </details>
            </li>
            <li v-for="entry in readOnlyEntries" :key="entry.key">
              <details class="libei-rule-entry" :data-context-readonly="entry.key">
                <summary><span class="libei-entry-title">{{ entry.title }}</span><span class="libei-entry-tag">{{ entry.source }}{{ entry.role ? ' · ' + entry.role : '' }} · 只读</span></summary>
                <div class="libei-entry-body"><pre class="libei-preview-text">{{ entry.content }}</pre></div>
              </details>
            </li>
          </ol>
          <p v-if="!preview" class="libei-hint">生成预览后，世界书、跟踪对象、固定写入保护、状态快照及消息等只读资料也会列在这里。</p>
          <details v-if="preview" class="libei-preview-entry libei-request-check"><summary>整包核对（未发送、未应用）</summary>
            <div class="libei-entry-body">
              <h4>插件更新模型 · 拼接消息</h4>
              <ol class="libei-message-list"><li v-for="(message, index) in preview.update?.messages || []" :key="index"><h5>{{ index + 1 }} · {{ message.role }}</h5><pre class="libei-preview-text">{{ message.content }}</pre></li></ol>
              <h4>正文模型 · 草稿注入段</h4><p class="libei-hint">仅包含本插件内容，不等于酒馆完整预设、人设、世界书和聊天历史。</p><pre class="libei-preview-text">{{ preview.story?.content }}</pre>
              <h4>当前实际注入段（引擎报告）</h4><p class="libei-hint">{{ preview.story?.applied?.enabled ? '引擎报告当前已启用注入；不代表模型已接收。' : '引擎报告当前未启用注入。' }} {{ preview.story?.applied?.reason }}</p><pre class="libei-preview-text">{{ preview.story?.applied?.content }}</pre>
            </div>
          </details>
        </section>
      </fieldset>
    </template>
    <p v-else class="bbs-empty">请先打开一个单角色聊天，等待当前角色规则载入。</p>
    <Collapsible title="状态更新选项" :open="false">
      <p class="libei-hint">更新选项单独保存；上下文预览使用引擎当前已保存的选项。</p>
      <label class="libei-switch"><span>正文完成后自动更新状态</span><input v-model="optionsDraft.automatic" class="bbs-checkbox" type="checkbox" /></label>
      <label class="libei-field"><span>参考最近消息数（2～30；只结算目标楼层）</span><input v-model.number="optionsDraft.contextMessages" type="number" min="2" max="30" class="bbs-input" /></label>
      <button class="bbs-btn bbs-btn-primary" type="button" :disabled="!canEdit || view.busy || optionsSaving" @click="saveOptions">{{ optionsSaving ? '保存中…' : '保存更新选项' }}</button>
    </Collapsible>
  </section>
</template>

<style scoped>
.libei-rules-page{display:flex;flex-direction:column;gap:14px;min-width:0}.libei-rules-page h3,.libei-rules-page h4,.libei-rules-page h5{margin:0;font-weight:600}.libei-rules-page h3{font-size:15px}.libei-rules-page h4{font-size:13px}.libei-rules-page h5{font-size:12px}
.libei-hint{font-size:12px;line-height:1.7;color:var(--bbs-ink-soft);margin:0;overflow-wrap:anywhere}.libei-profile strong{font-weight:600}.libei-notice{font-size:12px;line-height:1.7;color:var(--bbs-ink);background:var(--bbs-surface-2);padding:9px 12px;margin:0;border-radius:var(--bbs-radius-sm);overflow-wrap:anywhere}.libei-error{color:var(--bbs-danger);font-size:12px;line-height:1.7;overflow-wrap:anywhere;margin:0}
.libei-rule-fields{border:0;padding:0;margin:0;min-width:0;display:grid;gap:16px}.libei-field{display:flex;flex-direction:column;gap:7px;font-size:13px;min-width:0}.libei-field>.bbs-input{width:100%;min-width:0}.libei-initials{display:grid;gap:10px;min-width:0}.libei-initial-head{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px}.libei-initial-head>.bbs-btn{min-height:44px}.libei-context-region{display:grid;gap:12px;min-width:0}.libei-inline-preview{display:grid;gap:7px;min-width:0;border-top:1px solid var(--bbs-line);padding-top:10px}.libei-context-list,.libei-message-list{list-style:none;display:grid;gap:9px;margin:0;padding:0;min-width:0}.libei-context-list>li,.libei-message-list>li{min-width:0}
.libei-rule-entry,.libei-preview-entry{min-width:0;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface);overflow:hidden}.libei-rule-entry>summary,.libei-preview-entry>summary{cursor:pointer;padding:12px;min-height:44px;font-size:13px;line-height:1.6;overflow-wrap:anywhere}.libei-rule-entry>summary{display:flex;flex-wrap:wrap;align-items:center;gap:7px;list-style:none}.libei-rule-entry>summary::after{content:'＋';margin-left:auto;flex:none;color:var(--bbs-ink-soft)}.libei-rule-entry[open]>summary::after{content:'−'}.libei-rule-entry>summary::-webkit-details-marker{display:none}.libei-rule-entry[open]>summary,.libei-preview-entry[open]>summary{border-bottom:1px solid var(--bbs-line)}
.libei-entry-title{font-weight:600;min-width:0;overflow-wrap:anywhere}.libei-entry-number{font:11px var(--bbs-font-mono);color:var(--bbs-ink-soft)}.libei-entry-tag{font-size:10px;font-weight:400;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.libei-entry-body{display:grid;gap:10px;min-width:0;padding:12px}.libei-entry-body>p{font-size:12px;line-height:1.7;margin:0;overflow-wrap:anywhere}.libei-editor{min-height:160px;font:13px/1.7 var(--bbs-font-mono);resize:vertical;tab-size:2;max-width:100%;overflow-wrap:anywhere;white-space:pre-wrap}
.libei-actions{display:flex;flex-wrap:wrap;gap:8px}.libei-actions>.bbs-btn{min-height:40px;white-space:normal;text-align:left}.libei-rule-actions{padding:8px 0;border-bottom:1px solid var(--bbs-line)}.libei-preview-text{font:12px/1.7 var(--bbs-font-mono);white-space:pre-wrap;overflow-wrap:anywhere;margin:0;min-width:0;max-height:480px;overflow:auto;padding:12px;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm)}.libei-message-list{padding:12px}.libei-message-list>li{display:grid;gap:6px}.libei-switch{display:flex;justify-content:space-between;align-items:center;gap:14px;margin:12px 0;font-size:13px}.libei-switch>input{flex:none}
.libei-schema-review{display:grid;gap:12px;min-width:0;padding:12px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);background:var(--bbs-surface-2)}.libei-schema-review .bbs-btn{min-height:44px}.libei-schema-changes{display:grid;gap:10px;margin:0;padding-left:22px;min-width:0}.libei-schema-changes>li{min-width:0;font-size:12px}.libei-schema-changes pre{margin-top:6px}
.libei-rules-page summary:focus-visible,.libei-rules-page button:focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:-3px}.libei-sr-only{position:absolute;width:1px;height:1px;padding:0;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}
@media(max-width:400px){.libei-rule-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.libei-rule-actions>.bbs-btn{justify-content:center;width:100%;padding:8px}.libei-rule-entry>summary,.libei-preview-entry>summary{padding:10px}.libei-entry-body{padding:10px}.libei-entry-tag{font-size:10px}.libei-editor{font-size:16px;min-height:180px}.libei-preview-text{font-size:12px}}
</style>
