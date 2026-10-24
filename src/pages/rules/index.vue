<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Icon from '@/components/Icon.vue';
import BbsSelect from '@/components/BbsSelect.vue';
import Collapsible from '@/components/Collapsible.vue';
import { engineView as view, operationError, act, runEngine } from '@/state/engine';
const clone = (value: any) => value ? JSON.parse(JSON.stringify(value)) : null;
const draft = ref<any>(clone(view.value.rules));
const dirty = ref(false), active = ref('initial:0'), fileInput=ref<HTMLInputElement | null>(null);
const optionsDraft = ref(clone(view.value.config));
watch(() => view.value.rules, value => { if (!dirty.value) draft.value=clone(value); });
const initialOptions = computed(() => [{value:'auto',label:'按当前开场自动匹配'},...(draft.value?.initials||[]).map((item:any)=>({value:item.id,label:item.label}))]);
const editOptions = computed(() => [...(draft.value?.initials||[]).map((item:any,i:number)=>({value:'initial:'+i,label:'变量初值 · '+item.label})),...Object.entries({updateRules:'变量更新规则',outputFormat:'变量输出格式',numericRules:'数值与事件规则',snapshotTemplate:'发给正文模型的当前状态模板'}).map(([value,label])=>({value,label}))]);
const text = computed({get:()=>{if(!draft.value)return '';return active.value.startsWith('initial:')?draft.value.initials?.[Number(active.value.slice(8))]?.text||'':draft.value[active.value]||''},set:(value:string)=>{dirty.value=true;if(active.value.startsWith('initial:'))draft.value.initials[Number(active.value.slice(8))].text=value;else draft.value[active.value]=value}});
async function save(){try{await runEngine('saveRules',clone(draft.value));dirty.value=false}catch(_){}}
function revert(){draft.value=clone(view.value.rules);dirty.value=false}
async function importRules(event:Event){const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;try{if(file.size>1500000)throw Error('规则文件过大。');const value=JSON.parse(await file.text());if(!value.rules)throw Error('不是包含 rules 的规则备份。');const checked=await runEngine('validateRules',value.rules);draft.value=clone(checked);dirty.value=true;active.value='initial:0'}catch(error){operationError.value=error instanceof Error?error.message:String(error)}}
</script>
<template>
 <section class="libei-rules-page">
  <div class="bbs-section-head"><h2 class="bbs-title bbs-title-sub">变量规则</h2><span class="libei-hint">{{ dirty ? '有未保存修改' : '已保存' }}</span></div>
  <p class="libei-hint">沿用黎北原初值与状态链。保存规则不会重置已有进度；YAML / JSON 仅作为数据，不执行其中代码。</p>
  <p v-if="operationError" class="libei-error" role="alert">{{ operationError }}</p>
  <template v-if="draft">
   <label class="libei-field"><span>新聊天初值方案</span><BbsSelect v-model="draft.initialChoice" :options="initialOptions" aria-label="新聊天初值方案" @update:model-value="dirty=true" /></label>
   <label class="libei-field"><span>编辑内容</span><BbsSelect v-model="active" :options="editOptions" aria-label="编辑规则" /></label>
   <textarea v-model="text" class="bbs-input libei-editor" spellcheck="false" aria-label="变量规则编辑器" />
   <div class="libei-actions"><button class="bbs-btn bbs-btn-primary" :disabled="view.busy" @click="save"><Icon name="check" />保存规则</button><button class="bbs-btn" @click="revert">放弃修改</button><button class="bbs-btn" @click="act('exportRules')"><Icon name="download" />导出规则</button><button class="bbs-btn" @click="fileInput?.click()">导入规则</button></div>
   <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="importRules" />
  </template>
  <Collapsible title="状态更新选项" icon="settings">
   <label class="libei-switch"><span>正文完成后自动更新状态</span><input v-model="optionsDraft.automatic" class="bbs-checkbox" type="checkbox" /></label>
   <label class="libei-field"><span>参考最近消息数（2～30；只结算目标楼层）</span><input v-model.number="optionsDraft.contextMessages" type="number" min="2" max="30" class="bbs-input" /></label>
   <label class="libei-switch"><span>向正文模型提供数值事件规则</span><input v-model="optionsDraft.sendNumericToStory" class="bbs-checkbox" type="checkbox" /></label>
   <button class="bbs-btn bbs-btn-primary" :disabled="view.busy" @click="act('saveOptions',optionsDraft)">保存更新选项</button>
  </Collapsible>
 </section>
</template>
<style scoped>
.libei-rules-page{display:flex;flex-direction:column;gap:16px}.libei-hint{font-size:12px;color:var(--bbs-ink-muted);margin:0}.libei-field{display:flex;flex-direction:column;gap:8px;font-size:13px}.libei-editor{min-height:340px;font:12px/1.7 ui-monospace,Consolas,monospace;resize:vertical;tab-size:2;white-space:pre}.libei-actions{display:flex;flex-wrap:wrap;gap:10px}.libei-error{color:var(--bbs-danger)}.libei-switch{display:flex;justify-content:space-between;gap:16px;margin-bottom:14px;font-size:13px}.libei-field{margin-bottom:12px}
</style>
