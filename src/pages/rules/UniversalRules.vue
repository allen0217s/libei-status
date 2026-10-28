<script setup lang="ts">
import { ref, watch } from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import { engineView as view, runEngine } from '@/state/engine';
import { exportUniversalConfig, importUniversalConfig, validateUniversalConfig, type UniversalConfig } from '@/core/parser';
const initialVariables = ref(''), updateRules = ref(''), transfer = ref(''), dirty = ref(false), error = ref(''), notice = ref('');
const transferBox = ref<HTMLTextAreaElement | null>(null);
function load(config: UniversalConfig) { initialVariables.value = config.initialVariables; updateRules.value = config.updateRules; dirty.value = false; }
watch(() => view.value.universal, config => { if (config && !dirty.value) load(config); }, { immediate: true, deep: true });
function current() { return validateUniversalConfig({ initialVariables: initialVariables.value, updateRules: updateRules.value }); }
async function save() {
  error.value = ''; notice.value = '';
  try { load(await runEngine('saveUniversalConfig', current())); notice.value = '通用规则已保存，所有聊天共用；已有 stat_data 和历史保持原值。'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
function exportText() {
  try { transfer.value = exportUniversalConfig(current()); error.value = ''; notice.value = '通用配置文本已生成。'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
function importText() {
  try { const config = importUniversalConfig(transfer.value); load(config); dirty.value = true; error.value = ''; notice.value = '已载入通用规则草稿，点击保存后生效；不会建立或切换预设。'; }
  catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
async function copyText() {
  try { await navigator.clipboard.writeText(transfer.value); notice.value = '已复制通用配置。'; }
  catch { transferBox.value?.focus(); transferBox.value?.select(); notice.value = '已选中文本，请手动复制。'; }
}
</script>
<template>
  <div class="universal-editor" data-universal-editor>
    <p class="hint">固定使用“通用”这一份规则，所有角色共用，不提供预设切换。每个聊天的 stat_data 单独保存。</p>
    <label>初始变量（MVU InitVar，JSON / YAML）<textarea v-model="initialVariables" class="bbs-input code" aria-label="MVU 初始变量" rows="12" spellcheck="false" @input="dirty = true" /></label>
    <p class="hint">这里填写 InitVar 的变量对象；也能识别 stat_data 包装，不会多套一层。已有状态优先，修改初值不会覆盖已保存状态。</p>
    <label>变量更新规则<textarea v-model="updateRules" class="bbs-input" aria-label="MVU 更新规则" rows="5" @input="dirty = true" /></label>
    <div class="actions"><button class="bbs-btn bbs-btn-primary" type="button" :disabled="!dirty || !view.writerReady" @click="save">保存通用规则</button></div>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" class="hint" role="status">{{ notice }}</p>
    <Collapsible title="MVU 输出格式" :open="false">
      <pre class="preview">&lt;UpdateVariable&gt;
&lt;Analysis&gt;一句话说明可核对的变化&lt;/Analysis&gt;
&lt;JSONPatch&gt;
[
  {"op":"replace","path":"/角色/心情","value":"平静"}
]
&lt;/JSONPatch&gt;
&lt;/UpdateVariable&gt;</pre>
      <p class="hint">path 相对于 stat_data；无变化时输出空数组。支持 replace、insert/add、remove、delta、move。</p>
    </Collapsible>
    <Collapsible title="复制与粘贴通用配置" :open="false">
      <div class="actions"><button class="bbs-btn" type="button" @click="exportText">生成导出文本</button><button class="bbs-btn" type="button" :disabled="!transfer" @click="copyText">复制文本</button><button class="bbs-btn" type="button" @click="importText">解析通用配置草稿</button></div>
      <textarea ref="transferBox" v-model="transfer" class="bbs-input code" aria-label="通用配置导入导出文本" rows="10" spellcheck="false" />
      <p class="hint">只含 stat_data 初值和变量更新规则，不携带 API、密钥、聊天记录或旧预设。</p>
    </Collapsible>
    <Collapsible title="当前提示词预览" :open="false"><pre class="preview">{{ view.injection || '当前没有注入提示词。' }}</pre></Collapsible>
  </div>
</template>
<style scoped>
.universal-editor{display:grid;gap:14px}.universal-editor>label{display:grid;gap:6px;font-size:13px}.code{font-family:var(--bbs-font-mono);font-size:12px;line-height:1.7;resize:vertical;width:100%}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.hint{font-size:12px;color:var(--bbs-ink-soft);line-height:1.8;margin:0}.error{font-size:13px;color:var(--bbs-danger);white-space:pre-wrap}.preview{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto}
</style>
