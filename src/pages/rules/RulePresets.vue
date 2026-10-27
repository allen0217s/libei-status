<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import { engineView as view, runEngine } from '@/state/engine';
import { convertLegacyPreset, exportPreset, importPreset, validatePreset, type StatusPreset } from '@/core/parser';
import { BUILTIN_PRESETS } from '@/presets/builtin';
const selected = ref('universal'), name = ref(''), template = ref(''), instruction = ref(''), transfer = ref(''), dirty = ref(false), allowLegacy = ref(false), error = ref(''), notice = ref('');
const transferBox = ref<HTMLTextAreaElement | null>(null);
const newId = () => 'user-' + (crypto.randomUUID?.() ?? Date.now().toString(36) + Math.random().toString(36).slice(2));
function draft(preset: StatusPreset) { selected.value = preset.id; name.value = preset.name; template.value = preset.template; instruction.value = preset.instruction; dirty.value = false; error.value = ''; }
function load(id: string) { const preset = view.value.presets?.find((item: StatusPreset) => item.id === id); if (preset) draft(preset); }
watch(() => [view.value.profileKey, view.value.chatId], () => { load(view.value.presetId || 'universal'); transfer.value = ''; notice.value = ''; allowLegacy.value = false; }, { immediate: true });
const builtin = computed(() => BUILTIN_PRESETS.some(item => item.id === selected.value));
function current(id = selected.value): StatusPreset { return validatePreset({ id, name: name.value, template: template.value, instruction: instruction.value }); }
async function save(apply = false) {
  error.value = ''; notice.value = '';
  try {
    let id = selected.value;
    if (dirty.value || !view.value.presets.some((item: StatusPreset) => item.id === id)) {
      id = builtin.value ? newId() : id;
      const saved = await runEngine('savePreset', current(id)); draft(saved);
    }
    if (apply) { await runEngine('selectPreset', id); notice.value = '已应用到当前聊天，等待生成新状态；旧快照仍在历史中。'; }
    else notice.value = '预设已保存。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
async function saveCopy() { try { draft(await runEngine('savePreset', current(newId()))); notice.value = '已另存为自建预设。'; } catch (cause) { error.value = String(cause); } }
async function remove() { try { await runEngine('deletePreset', selected.value); load('universal'); } catch (cause) { error.value = String(cause); } }
function exportText() { try { transfer.value = exportPreset(current()); notice.value = '预设文本已生成，可直接复制。'; error.value = ''; } catch (cause) { error.value = String(cause); } }
function importText(legacy = false) {
  error.value = '';
  try {
    if (legacy && !allowLegacy.value) throw Error('请先确认旧字段权限与程序结算不迁入。');
    const preset = legacy ? convertLegacyPreset(transfer.value, newId()) : importPreset(transfer.value, newId());
    draft(preset); dirty.value = true;
    notice.value = legacy ? '旧字段已转换为模板草稿。请检查更新指令；旧字段权限、显示筛选、初值方案和程序结算未迁入。' : '已载入预设草稿，保存或应用后才生效。';
  } catch (cause) { error.value = cause instanceof Error ? cause.message : String(cause); }
}
async function copyText() {
  try { await navigator.clipboard.writeText(transfer.value); notice.value = '已复制预设文本。'; }
  catch { transferBox.value?.focus(); transferBox.value?.select(); notice.value = '已选中文本，请手动复制。'; }
}
</script>
<template>
  <div class="preset-editor">
    <p class="hint">选一份模板，写清怎么更新即可。预设库全局共用；当前预设和状态按聊天保存。</p>
    <label>载入预设<select class="bbs-input" aria-label="载入预设" :value="selected" @change="load(($event.target as HTMLSelectElement).value)"><option v-for="preset in view.presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label>
    <label>名称<input v-model="name" class="bbs-input" aria-label="预设名称" maxlength="80" @input="dirty = true" /></label>
    <label>状态示例（JSON / YAML）<textarea v-model="template" class="bbs-input code" aria-label="状态模板" rows="12" spellcheck="false" @input="dirty = true" /></label>
    <label>简短更新指令<textarea v-model="instruction" class="bbs-input" aria-label="更新指令" rows="4" @input="dirty = true" /></label>
    <div class="actions"><button class="bbs-btn bbs-btn-primary" type="button" :disabled="view.busy || view.generating || !view.profileKey" @click="save(true)">保存并应用到当前聊天</button><button class="bbs-btn" type="button" :disabled="view.busy || view.generating" @click="saveCopy">另存为预设</button><button v-if="!builtin" class="bbs-btn" type="button" :disabled="view.busy || view.generating" @click="remove">删除自建预设</button></div>
    <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" class="hint" role="status">{{ notice }}</p>
    <Collapsible title="复制与粘贴预设" :open="false">
      <div class="actions"><button class="bbs-btn" type="button" @click="exportText">生成导出文本</button><button class="bbs-btn" type="button" :disabled="!transfer" @click="copyText">复制文本</button><button class="bbs-btn" type="button" @click="importText(false)">解析导入草稿</button></div>
      <textarea ref="transferBox" v-model="transfer" class="bbs-input code" aria-label="预设导入导出文本" rows="10" spellcheck="false" />
      <p class="hint">格式含“名称”“模板”“更新指令”，不携带 API、密钥、聊天记录或状态历史。</p>
      <label class="legacy"><input v-model="allowLegacy" type="checkbox" class="bbs-checkbox" />转换旧版完整字段时，只保留默认值与文字规则；旧字段权限和程序结算不迁入。</label>
      <button class="bbs-btn" type="button" :disabled="!allowLegacy" @click="importText(true)">转换旧版完整字段草稿</button>
    </Collapsible>
    <Collapsible title="当前提示词预览" :open="false"><pre class="preview">{{ view.injection || '当前没有注入提示词。' }}</pre></Collapsible>
  </div>
</template>
<style scoped>
.preset-editor{display:grid;gap:14px}.preset-editor>label{display:grid;gap:6px;font-size:13px}.code{font-family:var(--bbs-font-mono);font-size:12px;line-height:1.7;resize:vertical;width:100%}.actions{display:flex;gap:8px;flex-wrap:wrap;margin:8px 0}.hint,.legacy{font-size:12px;color:var(--bbs-ink-soft);line-height:1.8;margin:0}.legacy{display:flex;gap:8px;align-items:start;margin:12px 0}.error{font-size:13px;color:var(--bbs-danger);white-space:pre-wrap}.preview{font-size:12px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;max-height:320px;overflow:auto}
</style>
