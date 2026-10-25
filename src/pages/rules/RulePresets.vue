<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { runEngine } from '@/state/engine';
interface Preset { id:string; label:string; builtin:boolean; rules:any }
const props=defineProps<{ profileKey:string; rules:any; disabled?:boolean }>();
const emit=defineEmits<{ (event:'load',value:{name:string;rules:any}):void; (event:'save-library',name:string):void; (event:'export',name:string):void }>();
const presets=ref<Preset[]>([]), selected=ref('modern'), name=ref(''), busy=ref(false), error=ref(''), confirmDelete=ref(false);
const fileInput=ref<HTMLInputElement|null>(null);
const chosen=computed(()=>presets.value.find(item=>item.id===selected.value));
let alive=true, epoch=0, importProfile='';
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
function requestImport(){importProfile=props.profileKey;fileInput.value?.click()}
async function importFile(event:Event) {
 const input=event.target as HTMLInputElement,file=input.files?.[0];input.value='';if(!file)return;
 const key=importProfile,request=++epoch;busy.value=true;error.value='';
 try {
  if(!key||key!==props.profileKey)throw Error('选择文件时角色已切换，请重新导入。');
  if(file.size>1500000)throw Error('预设文件超过 1.5 MB，请缩小后重试。');
  const text=await file.text();if(!alive||request!==epoch||key!==props.profileKey)return;
  const result=await runEngine('parseRulePreset',text,key);
  if(!alive||request!==epoch||key!==props.profileKey)return;
  if(!result?.rules||typeof result.name!=='string')throw Error('预设文件缺少名称或字段规则。');
  emit('load',result);name.value=result.name;
 }catch(cause){if(alive&&request===epoch)error.value=cause instanceof Error?cause.message:String(cause)}
 finally{if(alive&&request===epoch)busy.value=false}
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
watch(()=>props.profileKey,()=>{presets.value=[];selected.value='';name.value=props.rules?.presetName||'自建预设';void refresh()},{immediate:true});
watch(()=>props.rules?.presetName,value=>{if(typeof value==='string'&&value)name.value=value});
watch(selected,()=>{confirmDelete.value=false});
onBeforeUnmount(()=>{alive=false;epoch++});
defineExpose({refresh});
</script>

<template>
 <section class="libei-presets" data-rule-presets aria-label="变量字段与规则预设" :aria-busy="busy">
  <div class="libei-preset-head"><h3>字段与规则预设</h3><span>当前草稿：{{ rules?.presetName || '黎北预设' }}</span></div>
  <p>默认预设适用于现代日常，不含生理玩法；黎北预设保留原有玩法。载入会替换未保存的草稿；审核应用后当前状态留空，由你手动生成，旧快照保留。</p>
  <label>选择预设<select v-model="selected" class="bbs-input" data-preset-select :disabled="disabled||busy"><option v-for="preset in presets" :key="preset.id" :value="preset.id">{{ preset.label }}{{ preset.builtin ? ' · 内置' : ' · 自建' }}</option></select></label>
  <div class="libei-preset-actions">
   <button class="bbs-btn" type="button" data-action="load-rule-preset" :disabled="disabled||busy||!chosen" @click="load">载入预设草稿</button>
   <button class="bbs-btn" type="button" data-action="import-rule-preset" :disabled="disabled||busy" @click="requestImport">导入预设</button>
   <button class="bbs-btn" type="button" data-action="export-rule-preset" :disabled="disabled||busy" @click="emit('export',name)">导出预设</button>
   <input ref="fileInput" data-preset-file type="file" accept=".json,application/json" hidden aria-label="导入字段与规则预设" @change="importFile" />
  </div>
  <div class="libei-preset-save"><label>另存名称<input v-model="name" class="bbs-input" data-preset-name maxlength="80" :disabled="disabled||busy" placeholder="例如：都市日常" /></label><button class="bbs-btn" type="button" data-action="save-rule-preset" :disabled="disabled||busy||!name.trim()" @click="emit('save-library',name)">另存为预设</button></div>
  <p>导出包含当前草稿的字段、初值与规则，不含聊天记录或 API 密钥。另存为预设只保存副本，不会替换内置版本，也不会应用到聊天。</p>
  <template v-if="chosen && !chosen.builtin"><button v-if="!confirmDelete" class="bbs-btn" type="button" :disabled="disabled||busy" @click="confirmDelete=true">删除所选自建预设</button><div v-else class="libei-preset-actions"><span>删除「{{ chosen.label }}」？当前角色配置和聊天不受影响。</span><button class="bbs-btn" type="button" data-action="confirm-delete-preset" :disabled="disabled||busy" @click="remove">确认删除预设</button><button class="bbs-btn" type="button" @click="confirmDelete=false">取消</button></div></template>
  <p v-if="error" class="libei-preset-error" role="alert">{{ error }} <button class="bbs-btn" type="button" :disabled="busy" @click="refresh">重新读取预设</button></p>
 </section>
</template>

<style scoped>
.libei-presets{display:grid;gap:12px;padding:16px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);min-width:0;background:var(--bbs-surface)}.libei-preset-head{display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}.libei-presets h3{font-size:15px;margin:0}.libei-presets p,.libei-preset-head span{font-size:12px;color:var(--bbs-ink-soft);line-height:1.7;margin:0;overflow-wrap:anywhere}.libei-presets label{display:grid;gap:6px;font-size:13px;min-width:0}.libei-preset-actions{display:flex;align-items:center;flex-wrap:wrap;gap:8px;font-size:12px}.libei-preset-save{display:flex;align-items:end;flex-wrap:wrap;gap:8px}.libei-preset-save label{flex:1 1 180px}.libei-presets .bbs-input{min-width:0;width:100%;max-width:100%;min-height:44px}.libei-presets .bbs-btn{min-height:44px;white-space:normal;overflow-wrap:anywhere}.libei-presets :is(input,select,button):focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:2px}.libei-presets .libei-preset-error{color:var(--bbs-danger)}@media(max-width:400px){.libei-presets{padding:12px}.libei-presets .bbs-input{font-size:16px}}
</style>
