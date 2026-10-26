<script setup lang="ts">
import UpdateOptions from './UpdateOptions.vue';
import Collapsible from '@/components/Collapsible.vue';
import ConfirmDialog from '@/components/ConfirmDialog.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import Icon from '@/components/Icon.vue';
import ModalMask from '@/components/ModalMask.vue';
import { fetchModels, testChannel } from '@/api/client';
import { apiSettings, newChannel, validateChannel, migrationPending, importLegacySettings, resolveLegacyMigration, type ApiChannel } from '@/api/settings';
import { getContext } from '@/st/context';
import { toast } from '@/st/toast';
import { ui, THEMES, ORB_SHAPES } from '@/state/ui';
import { computed, onBeforeUnmount, ref } from 'vue';
import { engineView as view, operationError, act } from '@/state/engine';

const archiveInput = ref<HTMLInputElement | null>(null);
function importArchive(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (file) act('importTimeline', file);
}

const navOptions = [{ value: 'auto', label: '自动' }, { value: 'top', label: '顶部' }, { value: 'bottom', label: '底部' }] as const;
const REASONING_EFFORT_OPTIONS = [
  { value: '', label: 'auto' }, { value: 'minimal', label: 'minimal' },
  { value: 'low', label: 'low' }, { value: 'medium', label: 'medium' },
  { value: 'high', label: 'high' }, { value: 'xhigh', label: 'xhigh' }, { value: 'max', label: 'max' },
];
const channelOptions = computed(() => [
  { value: '', label: '跟随主 API' },
  ...apiSettings.channels.map(c => ({ value: c.id, label: c.name || '未命名渠道' })),
]);
const importingLegacy = ref(false);
const editingId = ref<string | null>(null);
const editingChannel = ref<ApiChannel | null>(null);
const showKey = ref(false);
const confirmDeleteOpen = ref(false);
const testing = ref<Record<string, string>>({});
const testBusy = ref<Record<string, boolean>>({});
const models = ref<Record<string, string[]>>({});
const loadingModels = ref<Record<string, boolean>>({});
const modalBusy = computed(() => !!editingChannel.value && (testBusy.value[editingChannel.value.id] || loadingModels.value[editingChannel.value.id]));
let editorEpoch = 0;
const excludeParamsText = computed({
  get: () => editingChannel.value?.excludeParams.join(', ') ?? '',
  set: (v: string) => { if (editingChannel.value) editingChannel.value.excludeParams = v.split(',').map(s => s.trim()).filter(Boolean); },
});
function addChannel() {
  closeChannel();
  editingChannel.value = newChannel();
}
function openChannel(id: string) {
  const src = apiSettings.channels.find(c => c.id === id);
  if (!src) return;
  closeChannel();
  editingId.value = id;
  editingChannel.value = JSON.parse(JSON.stringify(src));
}
function closeChannel() {
  editorEpoch++;
  importingLegacy.value = false;
  showKey.value = false;
  editingId.value = null;
  editingChannel.value = null;
  confirmDeleteOpen.value = false;
  modelMenuOpen.value = false;
}
function confirmChannel() {
  const draft = editingChannel.value;
  if (!draft || modalBusy.value) return;
  draft.timeoutSec = Number.isFinite(draft.timeoutSec) && draft.timeoutSec > 0 ? Math.floor(draft.timeoutSec) : 180;
  const error = validateChannel(draft);
  if (error) { testing.value[draft.id] = error; return; }
  // 再深拷贝一次，隔断任何异步测试闭包与已保存对象的引用。
  const saved = JSON.parse(JSON.stringify(draft)) as ApiChannel;
  const idx = apiSettings.channels.findIndex(c => c.id === editingId.value);
  if (idx >= 0) apiSettings.channels[idx] = saved; else apiSettings.channels.push(saved);
  if (importingLegacy.value) {
    apiSettings.assignments.summary = saved.id;
    resolveLegacyMigration();
  }
  closeChannel();
  toast('渠道已保存；密钥以明文存入当前酒馆账户设置。', 'success');
}
function confirmRemoveChannel() {
  const id = editingId.value;
  if (id) {
    const idx = apiSettings.channels.findIndex(c => c.id === id);
    if (idx >= 0) apiSettings.channels.splice(idx, 1);
    if (apiSettings.assignments.summary === id) apiSettings.assignments.summary = '';
    if (apiSettings.assignments.resummary === id) apiSettings.assignments.resummary = '';
  }
  closeChannel();
}
async function doTest(ch: ApiChannel) {
  if (testBusy.value[ch.id]) return;
  const error = validateChannel(ch);
  if (error) { testing.value[ch.id] = error; return; }
  const epoch = editorEpoch;
  const originalUrl = ch.url;
  const snapshot = JSON.parse(JSON.stringify(ch)) as ApiChannel;
  testBusy.value[ch.id] = true;
  testing.value[ch.id] = '测试中…';
  try {
    const result = await testChannel(snapshot);
    if (editorEpoch !== epoch || editingChannel.value !== ch) return;
    testing.value[ch.id] = result.message;
    // 测试使用调用时参数；用户改过地址时不回写旧地址规范化结果。
    if (result.ok && ch.url === originalUrl) ch.url = snapshot.url;
  } finally { testBusy.value[ch.id] = false; }
}
function chooseAssignment(id: string) {
  apiSettings.assignments.summary = id;
  // 用户明确选过渠道或主 API 后，不再让旧版本地配置反复阻塞启动。
  resolveLegacyMigration();
}
function useMainWithoutImport() { chooseAssignment(''); }
async function pullModels(ch: ApiChannel) {
  if (loadingModels.value[ch.id]) return;
  const error = validateChannel({ ...ch, model: ch.model || '__model_list__' });
  if (error) { testing.value[ch.id] = error; return; }
  const epoch = editorEpoch;
  const snapshot = { url: ch.url, key: ch.key, timeoutSec: ch.timeoutSec };
  loadingModels.value[ch.id] = true;
  testing.value[ch.id] = '';
  try {
    const list = await fetchModels(snapshot);
    if (editorEpoch !== epoch || editingChannel.value !== ch || ch.url !== snapshot.url || ch.key !== snapshot.key) return;
    models.value[ch.id] = list;
    if (list.length && !ch.model) ch.model = list[0];
    if (!list.length) testing.value[ch.id] = '未返回任何模型';
  } catch (e) {
    if (editorEpoch === epoch) testing.value[ch.id] = e instanceof Error ? e.message : String(e);
  } finally { loadingModels.value[ch.id] = false; }
}
const modelMenuOpen = ref(false);
const modelQuery = ref('');
const modelList = computed(() => editingChannel.value ? models.value[editingChannel.value.id] ?? [] : []);
const filteredModels = computed(() => {
  const q = modelQuery.value.trim().toLowerCase();
  return (q ? modelList.value.filter(m => m.toLowerCase().includes(q)) : modelList.value).slice(0, 200);
});
function openModelMenu() { modelQuery.value = ''; modelMenuOpen.value = true; }
function pickModel(m: string) { if (editingChannel.value) editingChannel.value.model = m; modelMenuOpen.value = false; modelQuery.value = ''; }
let blurTimer: ReturnType<typeof setTimeout> | undefined;
function closeModelMenuSoon() {
  clearTimeout(blurTimer);
  blurTimer = setTimeout(() => { modelMenuOpen.value = false; modelQuery.value = ''; }, 150);
}
function importLegacy() {
  try {
    const draft = importLegacySettings();
    if (!draft) { toast('当前浏览器未找到旧版配置。', 'info'); return; }
    closeChannel();
    editingChannel.value = draft;
    importingLegacy.value = true;
    toast('已载入旧版配置草稿，尚未上传；点完成才保存到酒馆。', 'info');
  } catch (e) { toast(e instanceof Error ? e.message : String(e), 'error'); }
}

const excludeWorldOpen = ref(false);
const excludeWorldSearch = ref('');
function readWorldNamesFromDom(): string[] {
  return [...document.querySelectorAll<HTMLOptionElement>('#world_editor_select option')]
    .filter(o => o.value !== '' && o.textContent).map(o => o.textContent!);
}
const worldNames = computed(() => {
  if (!excludeWorldOpen.value) return [];
  const getNames = getContext()?.getWorldInfoNames;
  const names = getNames ? getNames() : readWorldNamesFromDom();
  return [...new Set(names.map(n => n?.trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
});
const filteredWorldNames = computed(() => {
  const q = excludeWorldSearch.value.trim().toLowerCase();
  return q ? worldNames.value.filter(n => n.toLowerCase().includes(q)) : worldNames.value;
});
function openExcludeWorld() { excludeWorldSearch.value = ''; excludeWorldOpen.value = true; }
function closeExcludeWorld() { excludeWorldOpen.value = false; }
function isWorldExcluded(name: string) { return apiSettings.exclusions.excludedWorldNames.includes(name); }
function toggleWorldExcluded(name: string) {
  const list = apiSettings.exclusions.excludedWorldNames;
  const idx = list.indexOf(name);
  if (idx >= 0) list.splice(idx, 1); else list.push(name);
}
const wiPatternDraft = ref('');
function addWiPattern() {
  const pat = wiPatternDraft.value.trim();
  if (pat && !apiSettings.exclusions.excludedWorldInfoPatterns.includes(pat)) apiSettings.exclusions.excludedWorldInfoPatterns.push(pat);
  wiPatternDraft.value = '';
}
function removeWiPattern(pat: string) {
  const idx = apiSettings.exclusions.excludedWorldInfoPatterns.indexOf(pat);
  if (idx >= 0) apiSettings.exclusions.excludedWorldInfoPatterns.splice(idx, 1);
}
const excludeCharOpen = ref(false);
const excludeCharSearch = ref('');
const charNames = computed(() => {
  if (!excludeCharOpen.value) return [];
  return [...new Set((getContext()?.characters ?? []).map(c => c.name).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'zh'));
});
const filteredCharNames = computed(() => charNames.value.filter(n => n.toLowerCase().includes(excludeCharSearch.value.trim().toLowerCase())));
function toggleCharExcluded(name: string) {
  const list = apiSettings.exclusions.excludedChars;
  const idx = list.indexOf(name);
  if (idx >= 0) list.splice(idx, 1); else list.push(name);
}
onBeforeUnmount(() => { editorEpoch++; clearTimeout(blurTimer); });
</script>

<template>
  <section class="bbs-page">
    <div class="bbs-page-head"><h2>设置</h2><span class="bbs-ver">男主状态 v2</span></div>
    <hr class="bbs-rule" />
    <div class="bbs-master" :class="{ 'is-off': !apiSettings.enabled }">
      <span class="bbs-master-spine" aria-hidden="true"></span>
      <div class="bbs-master-text"><span class="bbs-master-title">男主状态 · 状态更新</span></div>
      <button type="button" role="switch" class="bbs-toggle" :class="{ 'is-on': apiSettings.enabled }" :aria-checked="apiSettings.enabled" @click="apiSettings.enabled = !apiSettings.enabled"><span class="bbs-toggle-knob"></span></button>
    </div>
    <div class="bbs-sections">
      <UpdateOptions />
      <Collapsible title="存档与存储管理" :open="false">
        <p class="bbs-field-hint">状态链仍保存在此浏览器，不随角色卡或聊天自动同步。换设备前请导出完整存档。主 API 请求取消仅丢弃结果，不强停正在运行的酒馆主模型。</p>
        <p v-if="operationError || view.error" class="libei-storage-error" role="alert">{{ operationError || view.error }}</p>
        <div class="libei-storage-actions">
          <button class="bbs-btn" type="button" :disabled="!view.state" @click="act('exportState')"><Icon name="download" />导出当前状态</button>
          <button class="bbs-btn" type="button" @click="act('exportTimeline')">导出完整存档</button>
          <button class="bbs-btn" type="button" @click="archiveInput?.click()">导入完整存档</button>
          <button class="bbs-btn" type="button" @click="act('acquireLease')">启用本页写入</button>
          <button class="bbs-btn" type="button" @click="act('cleanBranches')">清理非活动分支</button>
          <button class="bbs-btn" type="button" @click="act('recoverGeneration')">恢复生成标记</button>
          <button class="bbs-btn" type="button" :disabled="!view.rules?.initialChoice || !view.state" @click="act('reset')">用初值重置末楼</button>
          <button class="bbs-btn" type="button" @click="act('restore')">恢复重置备份</button>
          <button class="bbs-btn bbs-btn-danger" type="button" @click="act('clear')">清除本聊天状态</button>
        </div>
        <input ref="archiveInput" type="file" accept=".json,application/json" hidden aria-label="导入完整状态存档" @change="importArchive" />
        <p class="bbs-field-hint libei-storage-status" role="status">{{ view.status }}</p>
      </Collapsible>
      <Collapsible title="基本设置" :open="false">
        <div class="bbs-field">
          <div class="bbs-field-head"><span class="bbs-field-label">主题</span></div>
          <div class="bbs-segmented bbs-segmented-wrap">
            <button v-for="t in THEMES" :key="t.value" type="button" class="bbs-seg" :class="{ 'is-on': ui.theme === t.value }" @click="ui.theme = t.value"><Icon :name="t.icon" />{{ t.label }}</button>
          </div>
        </div>
        <div class="bbs-field">
          <div class="bbs-field-head"><span class="bbs-field-label">导航位置</span></div>
          <div class="bbs-segmented"><button v-for="n in navOptions" :key="n.value" type="button" class="bbs-seg" :class="{ 'is-on': ui.navPosition === n.value }" @click="ui.navPosition = n.value">{{ n.label }}</button></div>
        </div>
        <label class="bbs-switch-row"><span class="bbs-field-label">移动端点当前页导航关窗</span><input v-model="ui.navTapClose" type="checkbox" class="bbs-checkbox" /></label>
        <label class="bbs-switch-row"><span class="bbs-field-label">在 ST 顶栏显示按钮</span><input v-model="ui.showTopBar" type="checkbox" class="bbs-checkbox" /></label>
        <label class="bbs-switch-row"><span class="bbs-field-label">在聊天框上方显示按钮</span><input v-model="ui.showQuickReply" type="checkbox" class="bbs-checkbox" /></label>
        <label class="bbs-switch-row"><span class="bbs-field-label">启用楼层界面</span><input v-model="ui.showFloorPanel" type="checkbox" class="bbs-checkbox" /></label>
        <Collapsible title="屏幕悬浮球" :open="false">
          <label class="bbs-switch-row"><span class="bbs-field-label">显示屏幕悬浮球</span><input v-model="ui.showOrb" type="checkbox" class="bbs-checkbox" /></label>
          <template v-if="ui.showOrb">
            <div class="bbs-segmented"><button v-for="s in ORB_SHAPES" :key="s.value" class="bbs-seg" :class="{'is-on':ui.orbShape===s.value}" type="button" @click="ui.orbShape=s.value">{{s.label}}</button></div>
            <label class="bbs-switch-row"><span>透明度 {{ui.orbOpacity}}%</span><input v-model.number="ui.orbOpacity" class="bbs-range" type="range" min="20" max="100" /></label>
            <label class="bbs-switch-row"><span>尺寸 {{ui.orbSize}}px</span><input v-model.number="ui.orbSize" class="bbs-range" type="range" min="32" max="80" /></label>
          </template>
        </Collapsible>
      </Collapsible>
      <Collapsible title="副 API" :open="false">
        <div class="bbs-field bbs-assign"><div class="bbs-assign-row"><span class="bbs-field-label">状态更新使用</span><BbsSelect :model-value="apiSettings.assignments.summary" :options="channelOptions" class="bbs-assign-select" aria-label="状态更新使用的渠道" @update:model-value="chooseAssignment" /></div></div>
        <p class="bbs-field-hint">跟随主 API 使用酒馆主界面当前连接，不是独立 primary；不会在失败时自动切换渠道。主 API 无法保证立即取消，过期结果会由状态更新引擎丢弃；generateRaw 只返回文本，无法观测 finish_reason 或保证检测截断。副渠道可拒绝 finish_reason=length 的截断响应。</p>
        <p class="bbs-field-hint">渠道仅供男主状态使用，不读取或修改柏宝共享渠道。密钥在点「完成」后以明文存入当前酒馆账户设置，可能随账户跨设备同步；仅在可信服务器保存。</p>
        <div v-if="migrationPending" class="bbs-field"><button class="bbs-btn bbs-btn-sm" type="button" @click="importLegacy">显式导入旧版 API 草稿</button><button class="bbs-btn bbs-btn-sm" type="button" @click="useMainWithoutImport">不导入，明确跟随主 API</button><p class="bbs-field-hint">不会自动上传旧版本地密钥；导入后仍需点完成保存，关闭草稿即放弃。</p></div>
        <hr class="bbs-rule" />
        <div class="bbs-channel-bar"><span class="bbs-field-label">渠道</span><button class="bbs-btn bbs-btn-primary bbs-btn-sm" type="button" @click="addChannel"><Icon name="plus" />添加渠道</button></div>
        <ul v-if="apiSettings.channels.length" class="bbs-channel-list"><li v-for="ch in apiSettings.channels" :key="ch.id" class="bbs-channel-item"><button class="bbs-channel-open" type="button" @click="openChannel(ch.id)"><span class="bbs-channel-item-name">{{ch.name || '未命名渠道'}}</span><span class="bbs-channel-item-model">{{ch.model || '未设模型'}}</span></button></li></ul>
        <p v-else class="bbs-field-hint">还没有渠道。点「添加渠道」配置状态更新使用的 API。</p>
      </Collapsible>
      <Collapsible title="排除角色" :open="false">
        <p class="bbs-field-hint">名单中的单角色聊天停用男主状态辅助请求；按名字匹配，同名卡一并排除。群聊不按单名排除。</p>
        <button class="bbs-btn bbs-btn-sm" type="button" @click="excludeCharSearch='';excludeCharOpen=true"><Icon name="edit" />编辑名单</button>
        <ul class="bbs-exclude-chips"><li v-for="name in apiSettings.exclusions.excludedChars" :key="name" class="bbs-exclude-chip"><span>{{name}}</span><button class="bbs-exclude-chip-x" type="button" title="移出名单" @click="toggleCharExcluded(name)"><Icon name="close" /></button></li></ul>
      </Collapsible>
      <Collapsible title="排除世界书" :open="false">
        <p class="bbs-field-hint">仅剔除男主状态辅助请求中的世界书参考，不改变主对话世界书、原书文件或全局启停。跟随主 API 时也适用。勾选即时保存，关闭不回滚。</p>
        <label class="bbs-switch-row"><span class="bbs-field-label">渲染世界书模板</span><input v-model="apiSettings.exclusions.renderWorldInfoTemplates" type="checkbox" class="bbs-checkbox" /></label>
        <p class="bbs-field-hint">默认关闭。开启会展开宏，并可能通过 ST-Prompt-Template 执行世界书 EJS 代码、读写变量；只对可信世界书开启，取消请求不能撤销已发生的模板副作用。</p>
        <hr class="bbs-rule" />
        <div class="bbs-channel-bar"><span class="bbs-field-label">整本排除 · 已选 {{apiSettings.exclusions.excludedWorldNames.length}} 本</span><button class="bbs-btn bbs-btn-primary bbs-btn-sm" type="button" @click="openExcludeWorld"><Icon name="edit" />编辑名单</button></div>
        <ul v-if="apiSettings.exclusions.excludedWorldNames.length" class="bbs-exclude-chips"><li v-for="name in apiSettings.exclusions.excludedWorldNames" :key="name" class="bbs-exclude-chip"><span class="bbs-exclude-chip-name">{{name}}</span><button class="bbs-exclude-chip-x" type="button" title="移出名单" @click="toggleWorldExcluded(name)"><Icon name="close" /></button></li></ul>
        <p v-else class="bbs-field-hint">未整本排除世界书。</p>
        <hr class="bbs-rule" />
        <div class="bbs-field-head"><span class="bbs-field-label">按条目名过滤</span></div>
        <p class="bbs-field-hint">匹配条目备注名 comment，不分大小写，支持正则；非法正则降级字面包含。默认过滤 MVU 机制条目，可删除。旧版酒馆无法提供条目对象且规则非空时停止辅助请求，避免排除失效。</p>
        <div class="bbs-striptag-bar"><input v-model="wiPatternDraft" class="bbs-input" type="text" placeholder="条目名或正则，如 附加 或 ^规则" @keydown.enter.prevent="addWiPattern" /><button class="bbs-btn bbs-btn-primary bbs-btn-sm" type="button" @click="addWiPattern"><Icon name="plus" />添加</button></div>
        <ul v-if="apiSettings.exclusions.excludedWorldInfoPatterns.length" class="bbs-exclude-chips"><li v-for="pat in apiSettings.exclusions.excludedWorldInfoPatterns" :key="pat" class="bbs-exclude-chip"><span class="bbs-exclude-chip-name">{{pat}}</span><button class="bbs-exclude-chip-x" type="button" title="移除规则" @click="removeWiPattern(pat)"><Icon name="close" /></button></li></ul>
      </Collapsible>
    </div>

    <ModalMask :open="!!editingChannel" @close="closeChannel">
      <div v-if="editingChannel" class="bbs-modal" role="dialog" aria-modal="true" aria-label="编辑渠道">
        <header class="bbs-modal-head"><span class="bbs-modal-title">编辑渠道</span><button class="bbs-icon-mini" type="button" title="关闭并丢弃草稿" @click="closeChannel"><Icon name="close" /></button></header>
        <label class="bbs-modal-field"><span class="bbs-modal-label">渠道名</span><input v-model="editingChannel.name" class="bbs-input" placeholder="渠道名" /></label>
        <label class="bbs-modal-field"><span class="bbs-modal-label">API 地址</span><input v-model="editingChannel.url" class="bbs-input" placeholder="如 https://api.openai.com/v1" /></label>
        <label class="bbs-modal-field"><span class="bbs-modal-label">API 密钥</span><div class="bbs-model-row"><input v-model="editingChannel.key" class="bbs-input" :type="showKey ? 'text' : 'password'" autocomplete="off" placeholder="API 密钥" /><button class="bbs-icon-mini" type="button" :title="showKey ? '隐藏密钥' : '显示密钥'" :aria-pressed="showKey" @click="showKey=!showKey"><Icon :name="showKey ? 'eye-off' : 'eye'" /></button></div></label>
        <label class="bbs-modal-field"><span class="bbs-modal-label">模型</span><div class="bbs-model-row">
          <div class="bbs-combo"><input v-model="editingChannel.model" class="bbs-input" :placeholder="modelList.length ? '搜索或输入模型名…' : '模型名，如 gpt-4o-mini'" @focus="openModelMenu" @input="modelQuery=editingChannel.model;modelMenuOpen=true" @blur="closeModelMenuSoon" /><span v-if="modelList.length" class="bbs-combo-caret" :class="{'is-open':modelMenuOpen}" aria-hidden="true" /><ul v-if="modelMenuOpen && modelList.length" class="bbs-combo-menu"><li v-if="!filteredModels.length" class="bbs-combo-empty">无匹配模型</li><li v-for="m in filteredModels" :key="m" class="bbs-combo-item" :class="{'is-active':m===editingChannel.model}" @mousedown.prevent="pickModel(m)">{{m}}</li></ul></div>
          <button class="bbs-icon-mini" type="button" :title="loadingModels[editingChannel.id] ? '拉取中…' : '拉取模型'" :disabled="loadingModels[editingChannel.id]" @click="pullModels(editingChannel)"><Icon name="refresh" /></button>
        </div></label>
        <div class="bbs-channel-row"><label class="bbs-mini-field"><span>温度</span><input v-model.number="editingChannel.temperature" class="bbs-input" type="number" step="0.1" min="0" max="2" /></label><label class="bbs-mini-field"><span>最大 token</span><input v-model.number="editingChannel.maxTokens" class="bbs-input" type="number" step="256" min="1" /></label><label class="bbs-mini-field"><span>超时（秒）</span><input v-model.number="editingChannel.timeoutSec" class="bbs-input" type="number" step="10" min="1" /></label><div class="bbs-mini-field"><span>思考强度</span><BbsSelect v-model="editingChannel.reasoningEffort" :options="REASONING_EFFORT_OPTIONS" aria-label="思考强度" /></div></div>
        <label class="bbs-switch-row"><span class="bbs-modal-label">流式传输</span><input v-model="editingChannel.stream" type="checkbox" class="bbs-checkbox" /></label>
        <label class="bbs-modal-field"><span class="bbs-modal-label">排除参数</span><input v-model="excludeParamsText" class="bbs-input" placeholder="逗号分隔，如 temperature, max_tokens" /><span class="bbs-field-hint">不能排除固定路由、凭据、模型和消息字段，防止误用其他连接。</span></label>
        <p class="bbs-field-hint">点完成即明确同意将本渠道密钥以明文保存在当前酒馆账户设置；×/遮罩只丢弃草稿。测试和拉模型会发送草稿密钥，但不会保存。</p>
        <p v-if="testing[editingChannel.id]" class="bbs-channel-test" role="status">{{testing[editingChannel.id]}}</p>
        <footer class="bbs-modal-foot"><button class="bbs-btn bbs-btn-danger" type="button" @click="confirmDeleteOpen=true"><Icon name="trash" />删除</button><span class="bbs-modal-foot-spacer"></span><button class="bbs-btn" type="button" :disabled="modalBusy" @click="doTest(editingChannel)"><Icon name="plug" /><span class="bbs-btn-label-full">测试渠道</span><span class="bbs-btn-label-short">测试</span></button><button class="bbs-btn bbs-btn-primary" type="button" :disabled="modalBusy" @click="confirmChannel">完成</button></footer>
        <ConfirmDialog v-model:open="confirmDeleteOpen" title="删除渠道" confirm-text="删除" confirm-icon="trash" tone="danger" top-layer @confirm="confirmRemoveChannel">确定删除渠道「{{editingChannel.name || '未命名渠道'}}」吗？已指派该渠道的任务会改为跟随主 API。</ConfirmDialog>
      </div>
    </ModalMask>
    <ModalMask :open="excludeWorldOpen" @close="closeExcludeWorld"><div class="bbs-modal" role="dialog" aria-modal="true" aria-label="编辑排除世界书名单"><header class="bbs-modal-head"><span class="bbs-modal-title">整本排除世界书</span><button class="bbs-icon-mini" type="button" title="关闭" @click="closeExcludeWorld"><Icon name="close" /></button></header><input v-model="excludeWorldSearch" class="bbs-input" type="search" placeholder="搜索世界书名…" spellcheck="false" /><div class="bbs-exclude-list"><label v-for="name in filteredWorldNames" :key="name" class="bbs-exclude-row"><input type="checkbox" class="bbs-checkbox" :checked="isWorldExcluded(name)" @change="toggleWorldExcluded(name)" /><span class="bbs-exclude-row-name">{{name}}</span></label><p v-if="!worldNames.length" class="bbs-field-hint">未读取到世界书，请先在酒馆加载 / 挂载。</p><p v-else-if="!filteredWorldNames.length" class="bbs-field-hint">没有匹配的世界书。</p></div><footer class="bbs-modal-foot"><span class="bbs-exclude-count">共 {{worldNames.length}} 本 · 已排除 {{apiSettings.exclusions.excludedWorldNames.length}}</span><span class="bbs-modal-foot-spacer"></span><button class="bbs-btn bbs-btn-primary" type="button" @click="closeExcludeWorld">完成</button></footer></div></ModalMask>
    <ModalMask :open="excludeCharOpen" @close="excludeCharOpen=false"><div class="bbs-modal" role="dialog" aria-modal="true" aria-label="编辑排除角色名单"><header class="bbs-modal-head"><span class="bbs-modal-title">排除角色</span><button class="bbs-icon-mini" type="button" title="关闭" @click="excludeCharOpen=false"><Icon name="close" /></button></header><input v-model="excludeCharSearch" class="bbs-input" type="search" placeholder="搜索角色名…" /><div class="bbs-exclude-list"><label v-for="name in filteredCharNames" :key="name" class="bbs-exclude-row"><input type="checkbox" class="bbs-checkbox" :checked="apiSettings.exclusions.excludedChars.includes(name)" @change="toggleCharExcluded(name)" /><span class="bbs-exclude-row-name">{{name}}</span></label></div><footer class="bbs-modal-foot"><span class="bbs-modal-foot-spacer"></span><button class="bbs-btn bbs-btn-primary" type="button" @click="excludeCharOpen=false">完成</button></footer></div></ModalMask>
  </section>
</template>

<style scoped>
/* 以下沿用源设置页的类名、变量和布局，移除未使用的摘要/向量样式。 */
.bbs-page { display:flex; flex-direction:column; }
.bbs-sections { display:flex; flex-direction:column; gap:12px; }
.bbs-page-head { display:flex; align-items:baseline; justify-content:space-between; gap:12px; }
.bbs-ver { padding:7px 12px; border-radius:var(--bbs-radius-pill); background:var(--bbs-accent); color:var(--bbs-accent-ink); font-family:var(--bbs-font-mono); font-size:13px; font-weight:600; }
.bbs-field { margin-bottom:18px; } .bbs-field:last-child { margin-bottom:0; }
.bbs-field-head { display:flex; align-items:baseline; justify-content:space-between; gap:8px; margin-bottom:10px; }
.bbs-field-label { font-size:14px; font-weight:600; color:var(--bbs-ink); }
.bbs-field-hint { margin:0 0 14px; font-size:12px; color:var(--bbs-ink-muted); line-height:1.6; }
.libei-storage-actions { display:flex; flex-wrap:wrap; gap:8px; margin:12px 0; }
.libei-storage-actions .bbs-btn { min-height:40px; white-space:normal; text-align:left; }
.libei-storage-error { color:var(--bbs-danger); font-size:12px; overflow-wrap:anywhere; }
.libei-storage-status { margin-top:10px; overflow-wrap:anywhere; }
.bbs-segmented { display:inline-flex; gap:4px; padding:4px; background:var(--bbs-surface-2); border-radius:var(--bbs-radius); }
.bbs-segmented-wrap { display:flex; flex-wrap:wrap; }
.bbs-seg { display:inline-flex; align-items:center; gap:7px; padding:8px 18px; background:transparent; border:0; border-radius:var(--bbs-radius-sm); color:var(--bbs-ink-soft); font-family:var(--bbs-font-sans); font-size:13px; cursor:pointer; transition:background var(--bbs-dur) var(--bbs-ease),color var(--bbs-dur) var(--bbs-ease); }
.bbs-seg:hover { color:var(--bbs-ink); } .bbs-seg.is-on { background:var(--bbs-surface); color:var(--bbs-accent); box-shadow:0 1px 3px oklch(0 0 0 / .08); }
.bbs-assign { display:flex; flex-direction:column; gap:10px; }
.bbs-assign-row { display:flex; align-items:center; justify-content:space-between; gap:12px; }
.bbs-assign-row .bbs-assign-select { flex:0 1 60%; min-width:0; }
.bbs-assign-select :deep(.bbs-select-trigger) { font-size:12px; }
.bbs-combo { position:relative; flex:1; min-width:0; }
.bbs-combo .bbs-input { width:100%; padding-right:26px; }
.bbs-combo-caret { position:absolute; top:50%; right:8px; width:14px; height:14px; transform:translateY(-50%); pointer-events:none; background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M6 9.5 12 15.5 18 9.5'/></svg>"); background-repeat:no-repeat; background-position:center; background-size:14px; transition:transform .15s ease; }
.bbs-combo-caret.is-open { transform:translateY(-50%) rotate(180deg); }
.bbs-combo-menu { position:absolute; top:calc(100% + 4px); left:0; right:0; z-index:6; list-style:none; margin:0; padding:4px; max-height:220px; overflow-y:auto; background:var(--bbs-surface); border:1px solid var(--bbs-line-strong); border-radius:var(--bbs-radius-sm); box-shadow:var(--bbs-shadow); }
.bbs-combo-item { padding:7px 9px; border-radius:var(--bbs-radius-sm); font-size:12.5px; color:var(--bbs-ink); cursor:pointer; word-break:break-all; }
.bbs-combo-item:hover { background:var(--bbs-surface-2); } .bbs-combo-item.is-active { color:var(--bbs-accent); font-weight:600; }
.bbs-combo-empty { padding:7px 9px; font-size:12px; color:var(--bbs-ink-muted); }
.bbs-btn-sm { padding:6px 11px; font-size:12px; } .bbs-btn-label-short { display:none; }
.bbs-channel-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
.bbs-channel-list { list-style:none; margin:0; padding:0; display:flex; flex-direction:column; gap:8px; }
.bbs-channel-item { display:flex; align-items:stretch; gap:8px; }
.bbs-channel-open { flex:1; min-width:0; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 14px; border:1px solid var(--bbs-line); border-radius:var(--bbs-radius); background:var(--bbs-surface-2); color:var(--bbs-ink); font-family:var(--bbs-font-sans); cursor:pointer; text-align:left; transition:border-color var(--bbs-dur) var(--bbs-ease),background var(--bbs-dur) var(--bbs-ease); }
.bbs-channel-open:hover { border-color:var(--bbs-accent); background:var(--bbs-surface); }
.bbs-channel-item-name { flex:1 1 auto; min-width:0; font-size:14px; font-weight:600; word-break:break-word; }
.bbs-channel-item-model { flex:0 1 auto; min-width:0; font-size:12px; color:var(--bbs-ink-muted); font-variant-numeric:tabular-nums; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.bbs-modal-foot-spacer { flex:1 1 auto; } .bbs-btn-danger { color:var(--bbs-danger); border-color:var(--bbs-line-strong); }
.bbs-btn-danger:hover { color:var(--bbs-danger); border-color:var(--bbs-danger); background:var(--bbs-danger-soft); }
.bbs-model-row { display:flex; gap:8px; align-items:center; } .bbs-model-row .bbs-input { flex:1; }
.bbs-icon-mini:disabled { opacity:.5; cursor:default; }
.bbs-icon-mini { flex:0 0 auto; display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; border:1px solid var(--bbs-line-strong); border-radius:var(--bbs-radius-sm); background:var(--bbs-surface); color:var(--bbs-ink-soft); cursor:pointer; font-size:14px; }
.bbs-icon-mini:hover { color:var(--bbs-accent); border-color:var(--bbs-accent); }
.bbs-channel-row { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
.bbs-mini-field { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--bbs-ink-muted); }
.bbs-channel-test { margin:2px 0 0; font-size:12px; color:var(--bbs-ink-soft); word-break:break-all; }
.bbs-switch-row { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:8px 0; }
.bbs-range { width:60%; height:4px; margin:6px 0 12px; border-radius:var(--bbs-radius-pill); accent-color:var(--bbs-accent); }
.bbs-master { display:flex; align-items:center; gap:14px; margin-bottom:16px; padding:16px 18px 16px 16px; border:1px solid var(--bbs-line); border-radius:var(--bbs-radius); background:var(--bbs-surface); box-shadow:var(--bbs-shadow); transition:opacity var(--bbs-dur) var(--bbs-ease); }
.bbs-master-spine { flex:0 0 auto; align-self:stretch; width:4px; border-radius:var(--bbs-radius-pill); background:var(--bbs-accent); transition:background var(--bbs-dur) var(--bbs-ease); }
.bbs-master.is-off .bbs-master-spine { background:var(--bbs-line-strong); } .bbs-master.is-off .bbs-master-text { opacity:.7; }
.bbs-master-text { flex:1 1 auto; min-width:0; display:flex; flex-direction:column; gap:3px; } .bbs-master-title { font-size:15px; font-weight:600; color:var(--bbs-ink); }
.bbs-toggle { flex:0 0 auto; position:relative; width:46px; height:26px; padding:0; border:0; border-radius:var(--bbs-radius-pill); background:var(--bbs-line-strong); cursor:pointer; transition:background var(--bbs-dur) var(--bbs-ease); }
.bbs-toggle.is-on { background:var(--bbs-accent); } .bbs-toggle:focus-visible { outline:2px solid var(--bbs-accent); outline-offset:2px; }
.bbs-toggle-knob { position:absolute; top:3px; left:3px; width:20px; height:20px; border-radius:50%; background:var(--bbs-surface); box-shadow:0 1px 3px oklch(0 0 0 / .25); transition:transform var(--bbs-dur) var(--bbs-ease); } .bbs-toggle.is-on .bbs-toggle-knob { transform:translateX(20px); }
.bbs-striptag-bar { display:flex; gap:8px; align-items:center; margin-top:10px; } .bbs-striptag-bar .bbs-input { flex:1; min-width:0; } .bbs-striptag-bar .bbs-btn { flex:none; }
.bbs-exclude-chips { list-style:none; margin:10px 0 0; padding:0; display:flex; flex-wrap:wrap; gap:8px; }
.bbs-exclude-chip { display:inline-flex; align-items:center; gap:4px; padding:4px 6px 4px 11px; border-radius:var(--bbs-radius-pill); background:var(--bbs-accent-soft); color:var(--bbs-accent); font-size:12px; font-weight:600; }
.bbs-exclude-chip-name { word-break:break-word; }
.bbs-exclude-chip-x { display:inline-flex; align-items:center; justify-content:center; width:18px; height:18px; padding:0; border:0; border-radius:50%; background:transparent; color:inherit; cursor:pointer; font-size:12px; opacity:.7; }
.bbs-exclude-chip-x:hover { opacity:1; background:oklch(0 0 0 / .08); }
.bbs-exclude-list { max-height:46vh; overflow-y:auto; display:flex; flex-direction:column; gap:2px; margin:2px 0; padding-right:2px; }
.bbs-exclude-row { display:flex; align-items:center; gap:10px; padding:8px; border-radius:var(--bbs-radius-sm); cursor:pointer; } .bbs-exclude-row:hover { background:var(--bbs-surface-2); }
.bbs-exclude-row-name { flex:1 1 auto; min-width:0; font-size:13px; color:var(--bbs-ink); word-break:break-word; } .bbs-exclude-count { font-size:12px; color:var(--bbs-ink-muted); }
@media(max-width:640px) { .bbs-channel-row { grid-template-columns:repeat(2,1fr); } .bbs-field-label,.bbs-channel-item-name { font-size:13px; } .bbs-field-hint,.bbs-channel-item-model { font-size:11px; } .bbs-seg { font-size:12px; } .bbs-btn-label-full { display:none; } .bbs-btn-label-short { display:inline; } }
</style>
