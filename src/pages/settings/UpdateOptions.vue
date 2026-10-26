<script setup lang="ts">
import {ref,watch} from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import {engineView as view,runEngine} from '@/state/engine';
const automatic=ref(false),contextMessages=ref(6),dirty=ref(false),saving=ref(false),error=ref(''),notice=ref('');
let loading=false;
watch(()=>view.value.config,value=>{if(dirty.value||saving.value)return;loading=true;automatic.value=!!value?.automatic;contextMessages.value=value?.contextMessages??6;loading=false},{immediate:true});
watch([automatic,contextMessages],()=>{if(!loading){dirty.value=true;notice.value=''}},{flush:'sync'});
async function save(){
 if(saving.value||view.value.busy)return;
 saving.value=true;error.value='';notice.value='';
 try{await runEngine('saveOptions',{...view.value.config,automatic:automatic.value,contextMessages:contextMessages.value});dirty.value=false;notice.value='状态更新选项已保存。'}
 catch(cause){error.value=cause instanceof Error?cause.message:String(cause)}
 finally{saving.value=false}
}
</script>
<template>
 <Collapsible title="状态更新选项" :open="false">
  <section class="libei-update-options" data-update-options>
   <p>这些更新选项由当前浏览器内所有角色共用，单独保存，不重置状态。</p>
   <label>正文完成后自动更新状态<input v-model="automatic" data-option="automatic" type="checkbox" class="bbs-checkbox" :disabled="saving||view.busy" /></label>
   <label>参考最近消息数（2～30；只结算目标楼层）<input v-model.number="contextMessages" data-option="contextMessages" type="number" min="2" max="30" class="bbs-input" :disabled="saving||view.busy" /></label>
   <button type="button" class="bbs-btn bbs-btn-primary" :disabled="!view.profileKey||saving||view.busy" @click="save">{{ saving?'保存中…':'保存更新选项' }}</button>
   <p v-if="error" role="alert">{{error}}</p><p v-if="notice" role="status">{{notice}}</p>
  </section>
 </Collapsible>
</template>
<style scoped>
.libei-update-options{display:grid;gap:12px;min-width:0}.libei-update-options label{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;flex-wrap:wrap}.libei-update-options p{font-size:12px;line-height:1.7;margin:0;color:var(--bbs-ink-soft)}.libei-update-options [role=alert]{color:var(--bbs-danger)}.libei-update-options input[type=number]{max-width:140px}.libei-update-options button{justify-self:start}
</style>
