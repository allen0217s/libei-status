<script setup lang="ts">
import { computed } from 'vue';
import Icon from '@/components/Icon.vue';
import Collapsible from '@/components/Collapsible.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import StatusOverview from './StatusOverview.vue';
import { engineView as view, operationError, act } from '@/state/engine';
const selected = computed<string>({ get: () => view.value.selection ?? 'latest', set: value => act('setFloor', value === 'latest' ? null : Number(value)) });
const options = computed(() => [{ value: 'latest', label: '跟随最新状态' }, ...view.value.floors.slice().reverse().map((f: any) => ({value:String(f.id),label:`第 ${f.id} 楼${f.settled ? '' : ' · 待结算'}`}))]);
</script>
<template>
  <section class="libei-state-page">
    <div class="bbs-section-head"><h2 class="bbs-title bbs-title-sub">当前状态</h2><span class="libei-badge">{{ view.writerReady ? '可写' : '只读' }}</span></div>
    <p class="libei-subtitle">{{ view.cardName || '当前角色' }} · {{ view.floor >= 0 ? `第 ${view.floor} 楼` : '等待聊天' }} · 待结算 {{ view.pending.length }} 楼</p>
    <p v-if="view.error || operationError" class="libei-error" role="alert">{{ operationError || view.error }}</p>
    <div class="libei-floor-tools"><BbsSelect v-model="selected" :options="options" aria-label="查看状态楼层" /><button class="bbs-btn" type="button" @click="act('refresh')"><Icon name="refresh" />刷新</button></div>
    <div class="libei-actions"><button class="bbs-btn bbs-btn-primary" :disabled="!view.canUpdate" @click="act('update')"><Icon name="refresh" />手动更新 / 重算末楼</button><button v-if="view.busy" class="bbs-btn" @click="act('cancel')">取消请求</button></div>
    <p class="libei-status" :class="{ 'libei-error': view.statusError }" role="status">{{ view.status }}</p>
    <StatusOverview v-if="view.state" :value="view.state" :name="view.protagonistName || view.cardName || '主角'" />
    <div v-else class="bbs-empty">{{ view.rules?.initialChoice ? '所选楼层尚无匹配快照。请先打开当前角色聊天，或手动补算待结算楼层。' : '请先在“变量规则”中手动选择初值方案；选择前不会初始化新聊天。' }}</div>
    <Collapsible title="本次更新明细" :open="false"><pre class="libei-code">{{ view.lastPatch || '尚无请求。' }}</pre></Collapsible>
  </section>
</template>
<style scoped>
.libei-state-page{display:flex;flex-direction:column;gap:12px;min-width:0}.libei-subtitle,.libei-status{font-size:12px;color:var(--bbs-ink-soft);margin:0;overflow-wrap:anywhere}.libei-badge{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius-pill);padding:3px 10px;color:var(--bbs-ink-soft);font-size:12px}.libei-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.libei-floor-tools{display:flex;gap:8px;align-items:center}.libei-floor-tools>:first-child{flex:1;min-width:0}.libei-floor-tools>.bbs-btn{flex:none;min-height:38px}.libei-error{color:var(--bbs-danger)!important}.libei-code{font:12px/1.7 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm);padding:12px;margin:0}
</style>
