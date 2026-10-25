<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import StateTree from './StateTree.vue';

const props = defineProps<{ state:any; schema:any; editable?:boolean; saving?:boolean }>();
const emit = defineEmits<{ (event:'apply', fieldId:string, value:any):void }>();
const emptyDrafts = ():Record<string,string> => Object.create(null);
const rawDrafts = ref<Record<string,string>>(emptyDrafts()), errors = ref<Record<string,string>>(emptyDrafts());
const groups = computed(() => {
  const output:Array<{name:string;fields:any[]}> = [];
  for (const field of Array.isArray(props.schema?.fields) ? props.schema.fields : []) {
    if (!field.enabled || !field.visible) continue;
    const name = typeof field.group === 'string' && field.group.trim() ? field.group : '未分组';
    let group = output.find(item => item.name === name);
    if (!group) { group = {name,fields:[]}; output.push(group); }
    group.fields.push(field);
  }
  return output;
});
watch([() => JSON.stringify(props.state), () => JSON.stringify(props.schema), () => props.editable], () => { rawDrafts.value = emptyDrafts(); errors.value = emptyDrafts(); });
function valueAt(field:any):any {
  let value = props.state;
  for (const part of Array.isArray(field.path) ? field.path : []) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value,part)) return undefined;
    value = value[part];
  }
  return value;
}
function complex(value:any) { return value !== null && typeof value === 'object'; }
function display(value:any):string { return value === undefined ? '未记录' : value === null ? '空值' : value === true ? '是' : value === false ? '否' : value === '' ? '空文字' : String(value); }
function manual(field:any) { return field.updateMode === 'manual' && !['date','time','money','energy','formula'].includes(field.system); }
function raw(field:any):string {
  if (Object.hasOwn(rawDrafts.value,field.id)) return rawDrafts.value[field.id];
  const value = valueAt(field);
  if (field.type === 'string' || field.type === 'enum') return value === undefined || value === null ? '' : String(value);
  if (field.type === 'array' || field.type === 'object') return JSON.stringify(value ?? field.default,null,2) ?? '';
  return value === undefined ? '' : String(value);
}
function edit(field:any, event:Event) { rawDrafts.value[field.id] = (event.target as HTMLInputElement).value; delete errors.value[field.id]; }
function apply(field:any) {
  if (!props.editable || props.saving || !manual(field)) return;
  try {
    const source = raw(field); let value:any = source;
    if (['integer','number'].includes(field.type)) {
      if (!source.trim() || !Number.isFinite(Number(source))) throw Error('请输入有效数值。');
      value = Number(source);
      if (field.type === 'integer' && !Number.isSafeInteger(value)) throw Error('请输入安全整数。');
      if ((field.min !== undefined && value < field.min) || (field.max !== undefined && value > field.max)) throw Error('数值超出了字段上下限。');
    } else if (field.type === 'boolean') {
      if (!['true','false'].includes(source)) throw Error('请选择是或否。');
      value = source === 'true';
    } else if (field.type === 'enum') {
      if (!Array.isArray(field.options) || !field.options.includes(source)) throw Error('请选择有效的枚举选项。');
    } else if (field.type === 'array' || field.type === 'object') {
      try { value = JSON.parse(source); } catch { throw Error('输入不是合法 JSON。'); }
      if (field.type === 'array' ? !Array.isArray(value) : !value || typeof value !== 'object' || Array.isArray(value)) throw Error(field.type === 'array' ? '请输入 JSON 数组。' : '请输入 JSON 对象。');
    }
    delete errors.value[field.id]; emit('apply',field.id,value);
  } catch (error) { errors.value[field.id] = error instanceof Error ? error.message : String(error); }
}
</script>

<template>
  <section class="libei-schema-state" aria-label="按字段定义显示的状态" data-schema-state>
    <p v-if="!groups.length" class="libei-state-hint">此快照没有启用且可见的字段。隐藏与停用不会删除原始数据。</p>
    <section v-for="group in groups" :key="group.name" class="libei-state-group">
      <h3>{{ group.name }}</h3>
      <dl class="libei-state-fields">
        <div v-for="field in group.fields" :key="field.id" class="libei-state-field" :data-field-value="field.id">
          <dt><strong>{{ field.label || field.id }}</strong></dt>
          <dd>
            <StateTree v-if="complex(valueAt(field))" :value="valueAt(field)" />
            <p v-else class="libei-state-scalar">{{ display(valueAt(field)) }}</p>
            <details v-if="manual(field) && editable" class="libei-manual-editor" :data-manual-field="field.id">
              <summary>手动修改{{ field.label }}</summary>
              <div class="libei-manual-body">
                <label>新值
                  <select v-if="field.type === 'boolean'" class="bbs-input" :value="raw(field)" :aria-label="field.label + '新值'" :disabled="saving" @change="edit(field,$event)"><option value="true">是</option><option value="false">否</option></select>
                  <select v-else-if="field.type === 'enum'" class="bbs-input" :value="raw(field)" :aria-label="field.label + '新值'" :disabled="saving" @change="edit(field,$event)"><option v-for="option in field.options || []" :key="option" :value="option">{{ option }}</option></select>
                  <textarea v-else-if="['string','array','object'].includes(field.type)" class="bbs-input" :value="raw(field)" :aria-label="field.label + '新值'" :disabled="saving" rows="3" @input="edit(field,$event)" />
                  <input v-else class="bbs-input" inputmode="decimal" :value="raw(field)" :aria-label="field.label + '新值'" :disabled="saving" @input="edit(field,$event)" />
                </label>
                <p class="libei-state-hint">输入只保留在草稿中；点击应用后才请求引擎校验并写入当前状态。{{ ['array','object'].includes(field.type) ? '列表和对象须填写合法 JSON。' : '' }}</p>
                <p v-if="errors[field.id]" class="libei-state-error" role="alert">{{ errors[field.id] }}</p>
                <button class="bbs-btn" type="button" data-action="apply-field" :disabled="saving || !editable" :aria-label="'应用' + field.label + '新值'" @click="apply(field)">{{ saving ? '正在写入…' : '应用此值' }}</button>
              </div>
            </details>
            <p v-else-if="manual(field)" class="libei-state-hint">当前为只读视图。只有最新、可写、空闲且无待结算楼层的状态可以手动修改。</p>
          </dd>
        </div>
      </dl>
    </section>
    <details class="libei-state-raw"><summary>查看此楼层完整原始数据（含隐藏字段）</summary><StateTree :value="state" /></details>
  </section>
</template>

<style scoped>
.libei-schema-state{display:grid;gap:8px;min-width:0}.libei-state-group{min-width:0;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);overflow:hidden}.libei-state-group h3{font-size:14px;margin:0;padding:8px 10px;background:var(--bbs-surface-2)}.libei-state-fields{margin:0;display:grid;min-width:0}.libei-state-field{display:grid;grid-template-columns:minmax(100px,.8fr) minmax(0,2fr);min-width:0;border-top:1px solid var(--bbs-line)}.libei-state-field>dt,.libei-state-field>dd{margin:0;padding:8px 10px;min-width:0}.libei-state-field>dt{display:flex;flex-direction:column;gap:6px;font-size:13px;overflow-wrap:anywhere}.libei-state-field>dd{font-size:13px;line-height:1.7}.libei-state-scalar{margin:0;white-space:pre-wrap;overflow-wrap:anywhere}.libei-state-hint{font-size:12px;color:var(--bbs-ink-soft);line-height:1.7;margin:0;overflow-wrap:anywhere}.libei-manual-editor{margin-top:10px;min-width:0}.libei-manual-editor>summary,.libei-state-raw>summary{cursor:pointer;min-height:44px;align-content:center;font-size:12px;overflow-wrap:anywhere}.libei-manual-body,.libei-manual-body>label{display:grid;gap:8px;min-width:0}.libei-manual-body .bbs-input{min-height:44px;width:100%;min-width:0;max-width:100%;resize:vertical;white-space:pre-wrap}.libei-manual-body .bbs-btn{min-height:44px;white-space:normal}.libei-state-error{color:var(--bbs-danger);font-size:12px;margin:0;overflow-wrap:anywhere}.libei-state-raw{min-width:0}.libei-schema-state :is(button,summary,input,select,textarea):focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:2px}@media(max-width:480px){.libei-state-field{grid-template-columns:minmax(0,1fr)}.libei-state-field>dt{padding-bottom:0}.libei-manual-body .bbs-input{font-size:16px}}
</style>
