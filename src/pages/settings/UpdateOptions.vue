<script setup lang="ts">
import { ref, watch } from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import { engineView as view, runEngine } from '@/state/engine';
import type { GenerationOptions } from '@/api/settings';
const draft = ref<GenerationOptions>({ mode: 'inline', automatic: true, contextMessages: 3, depth: 0 });
const dirty = ref(false), error = ref(''), notice = ref('');
watch(() => view.value.config, config => { if (!dirty.value && config?.mode) draft.value = { ...config }; }, { immediate: true, deep: true });
async function save() { error.value = ''; try { await runEngine('saveOptions', { ...draft.value }); dirty.value = false; notice.value = '生成选项已保存。'; } catch (cause) { error.value = String(cause); } }
</script>
<template>
  <Collapsible title="状态生成方式" :open="true">
    <div class="update-options" data-update-options>
      <label>生成模式<select v-model="draft.mode" class="bbs-input" aria-label="生成模式" @change="dirty = true"><option value="inline">随正文生成</option><option value="background">独立请求生成</option></select></label>
      <p v-if="draft.mode === 'inline'">每次正文末尾附带状态，浮窗自动读取。与正文共用一次请求，状态部分仍占用上下文和输出 token。</p>
      <p v-else>正文完成后额外请求一次状态；可使用当前主 API，或下方配置的副渠道。参考最近消息与旧状态，不读取世界书。</p>
      <label>自动处理新回复<input v-model="draft.automatic" type="checkbox" class="bbs-checkbox" aria-label="自动处理新回复" @change="dirty = true" /></label>
      <label v-if="draft.mode === 'background'">参考最近消息数（1–30）<input v-model.number="draft.contextMessages" type="number" class="bbs-input" min="1" max="30" aria-label="参考消息数" @input="dirty = true" /></label>
      <label>注入深度（0–10）<input v-model.number="draft.depth" type="number" class="bbs-input" min="0" max="10" aria-label="注入深度" @input="dirty = true" /></label>
      <button type="button" class="bbs-btn bbs-btn-primary" :disabled="!dirty || view.busy || view.generating" @click="save">保存生成选项</button>
      <p v-if="error" role="alert" class="error">{{ error }}</p><p v-if="notice" role="status">{{ notice }}</p>
    </div>
  </Collapsible>
</template>
<style scoped>
.update-options{display:grid;gap:12px}.update-options label{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:13px}.update-options select{min-width:160px}.update-options input[type=number]{max-width:100px}.update-options p{font-size:12px;line-height:1.8;color:var(--bbs-ink-soft);margin:0}.update-options .error{color:var(--bbs-danger)}.update-options button{justify-self:start}
</style>
