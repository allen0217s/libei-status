<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { runEngine } from '@/state/engine';
interface Preset { id:string; label:string; builtin:boolean; rules:any }
const props=defineProps<{ profileKey:string; rules:any; disabled?:boolean; exportText:(name:string)=>Promise<string> }>();
const emit=defineEmits<{ (event:'load',value:{name:string;rules:any}):void; (event:'save-library',name:string):void }>();
const presets=ref<Preset[]>([]), selected=ref('modern'), name=ref(''), busy=ref(false), error=ref(''), confirmDelete=ref(false);
const text=ref(''), textArea=ref<HTMLTextAreaElement|null>(null), notice=ref('');
const chosen=computed(()=>presets.value.find(item=>item.id===selected.value));
let alive=true, epoch=0;
async function refresh() {
 const key=props.profileKey, request=++epoch;busy.value=true;error.value='';confirmDelete.value=false;
 try {
  const result=await runEngine('listRulePresets');
  if(!alive||request!==epoch||key!==props.profileKey)return;
  if(!Array.isArray(result)||result.some(item=>typeof item.id!=='string'||typeof item.label!=='string'||!item.rules))throw Error('预设列表格式不正确。');
  presets.value=result;
  if(!result.some(item=>item.id===selected.value))selected.value=result.find(item=>item.label===props.rules?.presetName)?.id||result[0]?.id||'';
 }catch(cause){if(alive&&request===epoch)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(alive&&request===epoch)busy.value=false}
}
function load() {
 if(props.disabled||busy.value||!chosen.value)return;
 error.value='';
 emit('load',{name:chosen.value.label,rules:JSON.parse(JSON.stringify(chosen.value.rules))});
}
async function importText() {
 if(props.disabled||busy.value)return;
 const key=props.profileKey,request=++epoch;busy.value=true;error.value='';notice.value='';
 try {
  const result=await runEngine('parseRulePreset',text.value,key);
  if(!alive||request!==epoch||key!==props.profileKey)return;
  if(!result?.rules?.fieldSchema||typeof result.name!=='string')throw Error('预设文本缺少名称或字段定义。');
  emit('load',result);name.value=result.name;
 }catch(cause){if(alive&&request===epoch)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(alive&&request===epoch)busy.value=false}
}
async function exportText() {
 if(props.disabled||busy.value)return;
 const key=props.profileKey,request=++epoch;busy.value=true;error.value='';notice.value='';
 try {
  const result=await props.exportText(name.value);
  if(!alive||request!==epoch||key!==props.profileKey)return;
  text.value=result;notice.value='已生成变量预设文本，可复制或编辑后重新导入。';
 }catch(cause){if(alive&&request===epoch)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(alive&&request===epoch)busy.value=false}
}
async function copyText() {
 const key=props.profileKey,request=epoch;notice.value='';error.value='';
 try {
  if(!navigator.clipboard?.writeText)throw Error('clipboard unavailable');
  await navigator.clipboard.writeText(text.value);
  if(alive&&key===props.profileKey&&request===epoch)notice.value='已复制变量预设文本。';
 }catch{
  if(!alive||key!==props.profileKey||request!==epoch)return;
  textArea.value?.focus();textArea.value?.select();notice.value='浏览器未允许复制，文本已选中，请按 Ctrl+C 或长按复制。';
 }
}
async function remove() {
 if(props.disabled||busy.value||!chosen.value||chosen.value.builtin||!confirmDelete.value)return;
 const key=props.profileKey,request=++epoch;busy.value=true;error.value='';
 try {
  await runEngine('deleteRulePreset',chosen.value.id,key);
  if(!alive||request!==epoch||key!==props.profileKey)return;
  selected.value='modern';await refresh();
 }catch(cause){if(alive&&request===epoch)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(alive&&request===epoch)busy.value=false}
}
watch(()=>props.profileKey,()=>{presets.value=[];selected.value='';text.value='';notice.value='';name.value=props.rules?.presetName||'自建预设';void refresh()},{immediate:true});
watch(()=>props.rules?.presetName,value=>{if(typeof value==='string'&&value)name.value=value});
watch(selected,()=>{confirmDelete.value=false});
onBeforeUnmount(()=>{alive=false;epoch++});
defineExpose({refresh});
</script>

<template>
 <section class="libei-presets" data-rule-presets aria-label="变量预设" :aria-busy="busy">
  <div class="libei-preset-head"><h3>变量预设</h3><span>当前草稿：{{ rules?.presetName || '未命名' }}</span></div>
  <p>预设包含字段、字段更新规则和多套初值方案。载入后默认无初值，可选择一套方案；保存前均为草稿，其他配置和旧快照保留。</p>
  <label>选择预设<select v-model="selected" class="bbs-input" data-preset-select :disabled="disabled||busy"><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }}{{ preset.builtin ? ' · 内置' : ' · 自建' }}</option></select></label>
  <div class="libei-preset-actions">
   <button class="bbs-btn" type="button" data-action="load-rule-preset" :disabled="disabled||busy||!chosen" @click="load">载入预设草稿</button>
   <button class="bbs-btn" type="button" data-action="export-rule-preset" :disabled="disabled||busy" @click="exportText">生成导出文本</button>
  </div>
  <slot name="initials" />
  <label>预设文本<textarea ref="textArea" v-model="text" class="bbs-input libei-preset-text" data-preset-text :disabled="disabled||busy" spellcheck="false" placeholder="点击“生成导出文本”，或在这里粘贴同格式的变量预设。" /></label>
  <div class="libei-preset-actions"><button class="bbs-btn" type="button" data-action="copy-rule-preset" :disabled="disabled||busy||!text" @click="copyText">复制文本</button><button class="bbs-btn" type="button" data-action="import-rule-preset" :disabled="disabled||busy||!text.trim()" @click="importText">解析导入草稿</button></div>
  <p>按原有完整字段结构填写 YAML：“名称”“字段”为必填，“初值方案”可省略。不要求固定首行，也不强制保留日期、时间字段。可先导出作模板；粘贴后点击解析，格式有误时保留文本与原草稿。</p>
  <p v-if="notice" role="status">{{ notice }}</p>
  <div class="libei-preset-save"><label>另存名称<input v-model="name" class="bbs-input" data-preset-name maxlength="80" :disabled="disabled||busy" placeholder="例如：都市日常" /></label><button class="bbs-btn" type="button" data-action="save-rule-preset" :disabled="disabled||busy||!name.trim()" @click="emit('save-library',name)">另存为预设</button></div>
  <p>另存、导出包含字段与初值方案，不包含当前选择、全局提示词、世界书引用、计算参数、聊天进度或 API 配置。另存只保存副本，不应用到聊天。</p>
  <template v-if="chosen && !chosen.builtin"><button v-if="!confirmDelete" class="bbs-btn" type="button" :disabled="disabled||busy" @click="confirmDelete=true">删除所选自建预设</button><div v-else class="libei-preset-actions"><span>删除「{{ chosen.label }}」？当前角色配置和聊天不受影响。</span><button class="bbs-btn" type="button" data-action="confirm-delete-preset" :disabled="disabled||busy" @click="remove">确认删除预设</button><button class="bbs-btn" type="button" @click="confirmDelete=false">取消</button></div></template>
  <p v-if="error" class="libei-preset-error" role="alert">{{ error }} <button class="bbs-btn" type="button" :disabled="busy" @click="refresh">重新读取预设</button></p>
 </section>
</template>

<style scoped>
.libei-presets textarea.libei-preset-text{min-height:240px;resize:vertical;white-space:pre;font-family:monospace;line-height:1.6}
.libei-presets{display:grid;gap:12px;padding:16px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);min-width:0;background:var(--bbs-surface)}.libei-preset-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.libei-presets h3{font-size:15px;margin:0}.libei-presets p,.libei-preset-head span{font-size:12px;color:var(--bbs-ink-soft);line-height:1.7;margin:0;overflow-wrap:anywhere}.libei-presets label{display:grid;gap:6px;font-size:13px;min-width:0}.libei-preset-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px}.libei-preset-save{display:flex;align-items:end;flex-wrap:wrap;gap:8px}.libei-preset-save label{flex:1 1 180px}.libei-presets .bbs-input{min-width:0;width:100%;max-width:100%;min-height:44px}.libei-presets .bbs-btn{min-height:44px;white-space:normal;overflow-wrap:anywhere}.libei-presets :is(input,select,button):focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:2px}.libei-presets .libei-preset-error{color:var(--bbs-danger)}@media(max-width:400px){.libei-presets{padding:12px}.libei-presets .bbs-input{font-size:16px}}
</style>
