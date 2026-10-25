<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import Collapsible from '@/components/Collapsible.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import StatusOverview from './StatusOverview.vue';
import SchemaStateView from './SchemaStateView.vue';
import { engineView as view, operationError, act, runEngine } from '@/state/engine';
const selected = computed<string>({ get: () => view.value.selection ?? 'latest', set: value => act('setFloor', value === 'latest' ? null : Number(value)) });
const options = computed(() => [{ value: 'latest', label: '跟随最新状态' }, ...view.value.floors.slice().reverse().map((f: any) => ({value:String(f.id),label:`第 ${f.id} 楼${f.settled ? '' : ' · 待结算'}`}))]);
const manualBusy = ref(false), localError = ref(''), notice = ref('');
const stateSchema = computed(() => view.value.stateFieldSchema ?? (selected.value === 'latest' ? view.value.fieldSchema : null));
const latestWritable = computed(() => !!view.value.state && view.value.writerReady && selected.value === 'latest' && !view.value.busy && !view.value.generating && !view.value.error);
const manualEditable = computed(() => latestWritable.value && view.value.floor === view.value.latest && !(view.value.pending?.length));
let alive = true;
function identityToken() { return JSON.stringify([view.value.profileKey,view.value.chatId,view.value.floor,selected.value]); }
watch(() => identityToken(), () => { localError.value = ''; notice.value = ''; });
async function setFieldValue(fieldId:string, value:any) {
  if (!manualEditable.value || manualBusy.value) return;
  const token = identityToken(), key = view.value.profileKey; manualBusy.value = true; localError.value = ''; notice.value = '';
  try {
    await runEngine('setFieldValue',fieldId,value,key);
    if (alive && token === identityToken()) notice.value = '该手动字段已通过引擎校验并写入当前状态。';
  } catch (error) { if (alive && token === identityToken()) localError.value = error instanceof Error ? error.message : String(error); }
  finally { if (alive) manualBusy.value = false; }
}
onBeforeUnmount(() => { alive = false; });
</script>
<template>
  <section class="libei-state-page">
    <div class="bbs-section-head"><h2 class="bbs-title bbs-title-sub">当前状态</h2><span class="libei-badge">{{ view.writerReady ? '可写' : '只读' }}</span></div>
    <p class="libei-subtitle">{{ view.cardName || '当前角色' }} · {{ view.floor >= 0 ? `第 ${view.floor} 楼` : '等待聊天' }} · 待结算 {{ view.pending.length }} 楼</p>
    <p v-if="view.error || operationError" class="libei-error" role="alert">{{ operationError || view.error }}</p>
    <div class="libei-floor-tools"><BbsSelect v-model="selected" :options="options" aria-label="查看状态楼层" /><button class="bbs-btn" type="button" @click="act('refresh')"><Icon name="refresh" />刷新</button></div>
    <div class="libei-actions"><button class="bbs-btn bbs-btn-primary" :disabled="!view.canUpdate" @click="act('update')"><Icon name="refresh" />手动更新 / 重算末楼</button><button v-if="view.busy" class="bbs-btn" @click="act('cancel')">取消请求</button></div>
    <p class="libei-status" :class="{ 'libei-error': view.statusError }" role="status">{{ view.status }}</p>
    <p v-if="localError" class="libei-error" role="alert">{{ localError }}</p><p v-if="notice" class="libei-status" role="status">{{ notice }}</p>
    <p v-if="view.fieldStateError" class="libei-error" role="alert">{{ view.fieldStateError }} 旧值没有被转换或覆盖，请先核对字段类型与约束。</p>
    <p v-if="view.state && stateSchema" class="libei-status">{{ selected === 'latest' ? '当前显示按字段定义补齐的内存视图，缺失默认值会在下次正常更新或手动写入当前字段时保存。' : '按此历史楼层保存的字段定义显示，只读，不套用新字段配置。' }} 隐藏和停用不会删除原始值。</p>
    <SchemaStateView v-if="view.state && stateSchema" :key="identityToken()" :state="view.state" :schema="stateSchema" :editable="manualEditable" :saving="manualBusy" @apply="setFieldValue" />
    <StatusOverview v-else-if="view.state" :value="view.state" :name="view.protagonistName || view.cardName || '主角'" />
    <div v-else class="bbs-empty">{{ view.rules?.initialChoice ? '所选楼层尚无匹配快照。请先打开当前角色聊天，或手动补算待结算楼层。' : '请先在“变量规则”中手动选择初值方案；选择前不会初始化新聊天。' }}</div>
    <Collapsible title="本次更新明细" :open="false"><pre class="libei-code">{{ view.lastPatch || '尚无请求。' }}</pre></Collapsible>
  </section>
</template>
<style scoped>
.libei-state-page{display:flex;flex-direction:column;gap:12px;min-width:0}.libei-subtitle,.libei-status{font-size:12px;color:var(--bbs-ink-soft);margin:0;overflow-wrap:anywhere}.libei-badge{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius-pill);padding:3px 10px;color:var(--bbs-ink-soft);font-size:12px}.libei-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.libei-floor-tools{display:flex;gap:8px;align-items:center}.libei-floor-tools>:first-child{flex:1;min-width:0}.libei-floor-tools>.bbs-btn{flex:none;min-height:38px}.libei-error{color:var(--bbs-danger)!important}.libei-code{font:12px/1.7 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm);padding:12px;margin:0}
</style>
