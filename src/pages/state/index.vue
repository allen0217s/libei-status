<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import StatusOverview from './StatusOverview.vue';
import { engineView as view, operationError, runEngine, act } from '@/state/engine';
const manualText = ref(''), dirty = ref(false), notice = ref('');
watch(() => [view.value.profileKey, view.value.chatId, view.value.selection], () => { dirty.value = false; notice.value = ''; manualText.value = view.value.state ? JSON.stringify(view.value.state, null, 2) : ''; });
watch(() => view.value.state, state => { if (!dirty.value) manualText.value = state ? JSON.stringify(state, null, 2) : ''; }, { immediate: true });
const updatingText = computed(() => view.value.config?.mode === 'background' ? '手动生成状态' : '提取当前回复状态');
async function choosePreset(event: Event) { try { await runEngine('selectPreset', (event.target as HTMLSelectElement).value); } catch {} }
async function saveState() { try { await runEngine('setState', manualText.value); dirty.value = false; notice.value = '状态已保存。'; } catch {} }
</script>
<template>
  <section class="bbs-page status-page" data-status-page>
    <div class="bbs-page-head"><h2>当前状态</h2><span class="chat-name">{{ view.cardName || '等待聊天' }}</span></div>
    <hr class="bbs-rule" />
    <div class="toolbar">
      <label>聊天预设<select class="bbs-input" aria-label="当前聊天预设" :value="view.presetId" :disabled="!view.profileKey || !view.writerReady" @change="choosePreset"><option v-for="preset in view.presets" :key="preset.id" :value="preset.id">{{ preset.name }}</option></select></label>
      <button class="bbs-btn bbs-btn-primary" type="button" :disabled="!view.canUpdate" @click="act('update')">{{ view.busy ? '处理中…' : updatingText }}</button>
      <button v-if="view.busy" class="bbs-btn" type="button" @click="act('cancel')">取消本次更新</button>
    </div>
    <p v-if="view.readOnlyReason" class="hint" role="status">{{ view.readOnlyReason }}</p>
    <p v-if="operationError || view.error" role="alert" class="error">{{ operationError || view.error }}</p>
    <p class="hint" role="status">{{ view.status }}<span v-if="view.lastUpdate"> · {{ (view.lastUpdate.durationMs / 1000).toFixed(1) }} 秒</span></p>
    <label v-if="view.history?.length" class="history">状态历史<select class="bbs-input" aria-label="状态历史" :value="view.selection" @change="act('setHistory', ($event.target as HTMLSelectElement).value)"><option value="latest">当前分支最新状态</option><option v-for="node in view.history" :key="node.id" :value="node.id">第 {{ node.floor + 1 }} 条消息 · 分支 {{ node.swipe + 1 }} · {{ new Date(node.createdAt).toLocaleTimeString() }}</option></select></label>
    <p v-if="view.selection !== 'latest'" class="hint">正在查看历史快照。选择“当前分支最新状态”后可继续更新。</p>
    <StatusOverview v-if="view.state" :value="view.state" :previous="view.previous" :name="view.cardName" />
    <div v-else class="empty-state"><h3>还没有状态记录</h3><p>选择合适的预设后继续聊天，或在设置中选择独立生成。模板提供结构，状态由实际剧情建立。</p><button v-if="view.preset" type="button" class="bbs-btn" :disabled="view.busy || view.generating || view.latest < 0" @click="act('setState', view.preset.template)">以模板内容手动初始化</button></div>
    <Collapsible title="手动查看与修订" :open="false">
      <p class="hint">可直接编辑 JSON / YAML，保存为当前回复的新快照。</p>
      <textarea v-model="manualText" class="bbs-input code" aria-label="手动状态" rows="10" spellcheck="false" @input="dirty = true" />
      <button class="bbs-btn" type="button" :disabled="!dirty || view.busy || view.generating || view.selection !== 'latest' || view.latest < 0" @click="saveState">保存手动状态</button>
      <p v-if="notice" class="hint" role="status">{{ notice }}</p>
    </Collapsible>
    <p v-if="view.hideAvailable === false" class="hint">当前宿主缺少消息格式化接口，状态块会保留在消息中显示。</p>
  </section>
</template>
<style scoped>
.status-page{display:grid;gap:14px;align-content:start}.bbs-page-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.bbs-page-head h2{font-size:20px;margin:0}.status-page>.bbs-rule{margin:0}.toolbar{display:flex;gap:10px;align-items:end;flex-wrap:wrap}.toolbar label{display:grid;gap:6px;flex:1;min-width:160px;font-size:12px;color:var(--bbs-ink-soft)}.toolbar .bbs-input{width:100%}.hint{font-size:12px;color:var(--bbs-ink-soft);line-height:1.75;margin:0}.error{color:var(--bbs-danger);font-size:13px;white-space:pre-wrap}.chat-name{font-size:12px;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.history{display:grid;gap:6px;font-size:12px}.empty-state{padding:25px 18px;text-align:center;border:1px dashed var(--bbs-line);border-radius:var(--bbs-radius)}.empty-state h3{font-size:16px}.empty-state p{font-size:13px;line-height:1.8;color:var(--bbs-ink-soft)}.code{width:100%;resize:vertical;font-family:var(--bbs-font-mono);font-size:12px;line-height:1.7;margin:8px 0}
</style>
