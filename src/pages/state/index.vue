<script setup lang="ts">
import { computed, ref } from 'vue';
import Icon from '@/components/Icon.vue';
import Collapsible from '@/components/Collapsible.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import StateTree from './StateTree.vue';
import { engineView as view, operationError, act } from '@/state/engine';
const selected = computed<string>({ get: () => view.value.selection ?? 'latest', set: value => act('setFloor', value === 'latest' ? null : Number(value)) });
const options = computed(() => [{ value: 'latest', label: '跟随最新状态' }, ...view.value.floors.slice().reverse().map((f: any) => ({value:String(f.id),label:`第 ${f.id} 楼${f.settled ? '' : ' · 待结算'}`}))]);
const archiveInput = ref<HTMLInputElement | null>(null);
function importArchive(event: Event) { const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(file)act('importTimeline',file); }
</script>
<template>
  <section class="libei-state-page">
    <div class="bbs-section-head"><h2 class="bbs-title bbs-title-sub">当前状态</h2><span class="libei-badge">{{ view.writerReady ? '可写' : '只读' }}</span></div>
    <p class="libei-subtitle">黎北的府邸生活 · {{ view.floor >= 0 ? `第 ${view.floor} 楼` : '等待聊天' }} · 待结算 {{ view.pending.length }} 楼</p>
    <p v-if="view.error || operationError" class="libei-error" role="alert">{{ operationError || view.error }}</p>
    <div class="libei-actions"><BbsSelect v-model="selected" :options="options" aria-label="查看状态楼层" /><button class="bbs-btn" type="button" @click="act('refresh')"><Icon name="refresh" />刷新</button></div>
    <StateTree v-if="view.state" :value="view.state" />
    <div v-else class="bbs-empty">{{ view.rules?.initialChoice ? '所选楼层尚无匹配快照。请先打开黎北聊天，或手动补算待结算楼层。' : '请先在“变量规则”中手动选择初值方案；选择前不会初始化新聊天。' }}</div>
    <div class="libei-actions"><button class="bbs-btn bbs-btn-primary" :disabled="!view.canUpdate" @click="act('update')"><Icon name="refresh" />手动更新 / 重算末楼</button><button v-if="view.busy" class="bbs-btn" @click="act('cancel')">取消请求</button><button class="bbs-btn" @click="act('exportState')"><Icon name="download" />导出当前状态</button></div>
    <p class="libei-status" :class="{ 'libei-error': view.statusError }" role="status">{{ view.status }}</p>
    <Collapsible title="存档与存储管理" icon="archive">
      <p class="libei-note">状态链仍保存在此浏览器，不随角色卡或聊天自动同步。换设备前请导出完整存档。主 API 请求取消仅丢弃结果，不强停正在运行的酒馆主模型。</p>
      <div class="libei-actions"><button class="bbs-btn" @click="act('exportTimeline')">导出完整存档</button><button class="bbs-btn" @click="archiveInput?.click()">导入完整存档</button><button class="bbs-btn" @click="act('acquireLease')">启用本页写入</button><button class="bbs-btn" @click="act('cleanBranches')">清理非活动分支</button><button class="bbs-btn" @click="act('recoverGeneration')">恢复生成标记</button><button class="bbs-btn" :disabled="!view.rules?.initialChoice || !view.state" @click="act('reset')">用初值重置末楼</button><button class="bbs-btn" @click="act('restore')">恢复重置备份</button><button class="bbs-btn libei-danger" @click="act('clear')">清除本聊天状态</button></div>
      <input ref="archiveInput" type="file" accept=".json,application/json" hidden @change="importArchive" />
    </Collapsible>
    <Collapsible title="本次更新明细" icon="code"><pre class="libei-code">{{ view.lastPatch || '尚无请求。' }}</pre></Collapsible>
  </section>
</template>
<style scoped>
.libei-state-page{display:flex;flex-direction:column;gap:16px}.libei-subtitle,.libei-note,.libei-status{font-size:12px;color:var(--bbs-ink-muted);margin:0}.libei-badge{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius-pill);padding:3px 10px;color:var(--bbs-accent);font-size:12px}.libei-actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.libei-actions>:first-child{max-width:340px}.libei-error,.libei-danger{color:var(--bbs-danger)!important}.libei-code{font:12px/1.7 monospace;white-space:pre-wrap;overflow-wrap:anywhere;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm);padding:12px;margin:0}
</style>
