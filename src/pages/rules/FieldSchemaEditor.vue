<script setup lang="ts">
import { computed, nextTick, ref, toRaw, watch } from 'vue';

const props = defineProps<{ modelValue:any; disabled?:boolean }>();
const emit = defineEmits<{ (event:'update:modelValue', value:any):void; (event:'draft-change'):void }>();
const root = ref<HTMLElement | null>(null), openedId = ref(''), showErrors = ref(false);
const emptyDrafts = ():Record<string,string> => Object.create(null);
const jsonDrafts = ref<Record<string,string>>(emptyDrafts()), minDrafts = ref<Record<string,string>>(emptyDrafts()), maxDrafts = ref<Record<string,string>>(emptyDrafts());
const optionDrafts = ref<Record<string,string>>(emptyDrafts()), pendingTypes = ref<Record<string,string>>(emptyDrafts());
const fields = computed<any[]>(() => Array.isArray(props.modelValue?.fields) ? props.modelValue.fields : []);
const types = [{value:'string',label:'文字'},{value:'integer',label:'整数'},{value:'number',label:'数值'},{value:'boolean',label:'开关'},{value:'enum',label:'枚举'},{value:'array',label:'列表'},{value:'object',label:'对象'}];
const systemNames:Record<string,string> = {date:'日期',time:'时间',money:'钱财结算',energy:'元精结算',formula:'结算说明'};
const copy = (value:any):any => JSON.parse(JSON.stringify(value));
const format = (value:any):string => JSON.stringify(value, null, 2) ?? 'null';
const knownSystem = (field:any) => Object.hasOwn(systemNames, field.system || '');
let emittedSchema:any = null, sequence = 0;
watch(() => props.modelValue, value => {
  if (toRaw(value) === emittedSchema) return;
  jsonDrafts.value = emptyDrafts(); minDrafts.value = emptyDrafts(); maxDrafts.value = emptyDrafts(); optionDrafts.value = emptyDrafts(); pendingTypes.value = emptyDrafts();
  openedId.value = ''; showErrors.value = false;
}, {immediate:true});
function change(next:any[]) {
  if (props.disabled) return;
  emittedSchema = { version:1, fields:next };
  emit('update:modelValue', emittedSchema); emit('draft-change');
}
function patch(id:string, values:Record<string,any>, remove:string[] = []) {
  const next = copy(fields.value), field = next.find((item:any) => item.id === id);
  if (!field || props.disabled) return;
  Object.assign(field, values); for (const key of remove) delete field[key]; change(next);
}
function valueOf(event:Event) { return (event.target as HTMLInputElement).value; }
function checkOf(event:Event) { return (event.target as HTMLInputElement).checked; }
function text(field:any, key:string, event:Event) { patch(field.id, {[key]:valueOf(event)}); }
function jsonText(field:any) { return jsonDrafts.value[field.id] ?? format(field.default); }
function boundText(field:any, key:'min'|'max') { return (key === 'min' ? minDrafts : maxDrafts).value[field.id] ?? (field[key] === undefined ? '' : String(field[key])); }
function optionsText(field:any) { return optionDrafts.value[field.id] ?? (Array.isArray(field.options) ? field.options.join('\n') : ''); }
function editJson(field:any, event:Event) {
  const raw = valueOf(event); jsonDrafts.value[field.id] = raw; emit('draft-change');
  try { const value = JSON.parse(raw); patch(field.id, {default:value}); } catch { /* Invalid draft stays visible and blocks save through validate(). */ }
}
function editBound(field:any, key:'min'|'max', event:Event) {
  const raw = valueOf(event); (key === 'min' ? minDrafts : maxDrafts).value[field.id] = raw; emit('draft-change');
  if (!raw.trim()) patch(field.id, {}, [key]);
  else if (Number.isFinite(Number(raw))) patch(field.id, {[key]:Number(raw)});
}
function editOptions(field:any, event:Event) {
  const raw = valueOf(event); optionDrafts.value[field.id] = raw;
  patch(field.id, {options:raw.split(/\r?\n/).map(value => value.trim()).filter(Boolean)});
}
function seed(type:string):any { return type === 'boolean' ? false : type === 'array' ? [] : type === 'object' ? {} : ['integer','number'].includes(type) ? 0 : type === 'enum' ? '选项1' : ''; }
function requestType(field:any, event:Event) {
  const type = valueOf(event);
  if (knownSystem(field) || !types.some(item => item.value === type) || props.disabled) return;
  if (type === field.type) delete pendingTypes.value[field.id];
  else pendingTypes.value[field.id] = type;
  emit('draft-change');
}
function confirmType(field:any) {
  const type = pendingTypes.value[field.id];
  if (!type || knownSystem(field) || props.disabled) return;
  const initial = seed(type); jsonDrafts.value[field.id] = format(initial);
  delete minDrafts.value[field.id]; delete maxDrafts.value[field.id]; delete optionDrafts.value[field.id]; delete pendingTypes.value[field.id];
  patch(field.id, {type, default:initial, ...(type === 'enum' ? {options:['选项1']} : {})}, ['min','max',...(type === 'enum' ? [] : ['options'])]);
}
function newId() {
  let id:string;
  do { id = 'field_' + Date.now().toString(36) + '_' + (++sequence); } while (fields.value.some(field => field.id === id || JSON.stringify(field.path) === JSON.stringify(['主角','自定义',id])));
  return id;
}
function newPath(id:string):string[] {
  let suffix = 1, path:string[];
  do {
    path = ['主角',suffix === 1 ? '自定义' : '自定义' + suffix,id]; suffix++;
  } while (fields.value.some(field => Array.isArray(field.path) && field.path.slice(0,Math.min(field.path.length,path.length)).every((part:string,index:number) => part === path[index])));
  return path;
}
async function add(source?:any) {
  if (props.disabled || fields.value.length >= 128) return;
  const id = newId(), path = newPath(id);
  const field = source ? {...copy(source),id,path,label:(source.label || '变量') + ' · 副本',updateMode:source.updateMode === 'program' ? 'manual' : source.updateMode} : {id,path,label:'新变量',group:'自定义',type:'string',default:'',enabled:true,visible:true,updateMode:'ai',rule:''};
  delete field.system;
  change([...copy(fields.value),field]); openedId.value = id;
  await nextTick();
  const details = [...(root.value?.querySelectorAll<HTMLDetailsElement>('[data-field-id]') || [])].find(item => item.dataset.fieldId === id);
  details?.scrollIntoView({block:'nearest'}); details?.querySelector<HTMLInputElement>('[data-field-prop=label]')?.focus();
}
function move(index:number, offset:number) {
  const target = index + offset;
  if (props.disabled || target < 0 || target >= fields.value.length) return;
  const next = copy(fields.value); [next[index],next[target]] = [next[target],next[index]]; change(next);
}
function toggle(field:any) { patch(field.id, {enabled:!field.enabled}); }
function fieldError(field:any):string {
  if (pendingTypes.value[field.id]) return '请先确认或取消类型变更。';
  let initial:any;
  try { initial = JSON.parse(jsonText(field)); } catch { return '默认值不是合法 JSON。文字需要双引号，例如 "未记录"。'; }
  if (!String(field.label || '').trim()) return '显示名称不能为空。';
  if (field.type === 'string' && typeof initial !== 'string') return '文字默认值必须是 JSON 字符串。';
  if (field.type === 'boolean' && typeof initial !== 'boolean') return '开关默认值只能是 true 或 false。';
  if (field.type === 'array' && !Array.isArray(initial)) return '列表默认值必须是 JSON 数组，例如 []。';
  if (field.type === 'object' && (!initial || typeof initial !== 'object' || Array.isArray(initial))) return '对象默认值必须是 JSON 对象，例如 {}。';
  if (field.type === 'enum' && (typeof initial !== 'string' || !Array.isArray(field.options) || !field.options.includes(initial))) return '枚举默认值必须是选项中的文字。';
  if (field.type === 'enum' && (!field.options.length || new Set(field.options).size !== field.options.length)) return '枚举至少需要一个选项，且不能重复。';
  if (['integer','number'].includes(field.type)) {
    if (typeof initial !== 'number' || !Number.isFinite(initial) || (field.type === 'integer' && !Number.isSafeInteger(initial))) return '默认值必须是有效数值；整数类型只接受安全整数。';
    const low = boundText(field,'min').trim(), high = boundText(field,'max').trim();
    if ((low && !Number.isFinite(Number(low))) || (high && !Number.isFinite(Number(high)))) return '上下限必须是有限数值，或留空不限制。';
    if (low && high && Number(low) > Number(high)) return '下限不能高于上限。';
    if ((low && initial < Number(low)) || (high && initial > Number(high))) return '默认值超出了当前上下限。';
  }
  return '';
}
function validate() {
  showErrors.value = true;
  if (!props.modelValue || props.modelValue.version !== 1 || fields.value.length < 1 || fields.value.length > 128) throw Error('字段配置必须包含 1～128 个变量。');
  const ids = new Set<string>(), paths:string[][] = [];
  for (const field of fields.value) {
    const error = fieldError(field); if (error) { openedId.value = field.id; throw Error((field.label || field.id) + '：' + error); }
    if (!field.id || ids.has(field.id)) throw Error('字段 ID 为空或重复。'); ids.add(field.id);
    if (!Array.isArray(field.path) || !field.path.length || field.path.some((part:any) => typeof part !== 'string' || !part || ['__proto__','constructor','prototype'].includes(part) || part.startsWith('$'))) throw Error('字段路径不安全或不完整。');
    if (paths.some(path => path.slice(0,Math.min(path.length,field.path.length)).every((part,index) => part === field.path[index]))) throw Error('字段路径重复或存在父子重叠。');
    paths.push(field.path);
  }
}
defineExpose({validate});
</script>

<template>
  <section ref="root" class="libei-schema-editor" data-field-schema-editor aria-label="变量字段定义">
    <div class="libei-schema-head"><h3>变量字段</h3><button class="bbs-btn" type="button" data-action="add" :disabled="disabled || fields.length >= 128" @click="add()">新增变量</button></div>
    <p class="libei-schema-hint">{{ fields.length }} / 128 个变量。名称只影响显示；ID 和存储路径保持不变。停用相当于安全移除，不删除已有数据。</p>
    <p class="libei-schema-hint">默认值用于新初值与缺失字段的内存补值。保存配置不改写旧楼层；新值只在下一次正常更新或手动应用当前字段时保存。旧值类型不兼容会明确报错，不会静默转换。</p>
    <fieldset class="libei-schema-fields" :disabled="disabled">
      <legend class="libei-schema-sr">字段草稿</legend>
      <details v-for="(field,index) in fields" :key="field.id" class="libei-schema-row" :data-field-id="field.id" :open="field.id === openedId">
        <summary><strong>{{ field.label || '未命名变量' }}</strong><span>{{ field.group || '未分组' }} · {{ field.type }} · {{ field.enabled ? (field.visible ? '启用' : '隐藏') : '已停用' }}</span></summary>
        <div class="libei-schema-body">
          <p class="libei-schema-path">ID：{{ field.id }}<br />路径：{{ Array.isArray(field.path) ? field.path.join(' / ') : '无效路径' }}</p>
          <p v-if="knownSystem(field)" class="libei-schema-hint">内置{{ systemNames[field.system] }}字段：路径、类型和更新方式锁定。可停用或隐藏，原有数据保留。</p>
          <div class="libei-schema-grid">
            <label>显示名称<input class="bbs-input" data-field-prop="label" :value="field.label" :aria-label="field.label + '显示名称'" @input="text(field,'label',$event)" /></label>
            <label>分组<input class="bbs-input" data-field-prop="group" :value="field.group" :aria-label="field.label + '分组'" @input="text(field,'group',$event)" /></label>
            <label>数据类型<select class="bbs-input" data-field-prop="type" :value="pendingTypes[field.id] || field.type" :disabled="knownSystem(field)" :aria-label="field.label + '数据类型'" @change="requestType(field,$event)"><option v-for="type in types" :key="type.value" :value="type.value">{{ type.label }}</option></select></label>
            <label>更新方式<select class="bbs-input" data-field-prop="updateMode" :value="field.updateMode" :disabled="knownSystem(field)" :aria-label="field.label + '更新方式'" @change="text(field,'updateMode',$event)"><option value="ai">AI 按事实更新</option><option value="manual">仅手动维护</option><option v-if="knownSystem(field)" value="program">程序结算 · 只读</option></select></label>
          </div>
          <div v-if="pendingTypes[field.id]" class="libei-schema-type-review" role="status"><p>确认更改类型后，只将这份草稿的默认值设为新类型的空值；不会改写已有楼层。已有值不兼容时将阻止更新，修改默认值不能覆盖这些旧值。</p><div class="libei-schema-actions"><button class="bbs-btn" data-action="confirm-type" type="button" @click="confirmType(field)">确认类型并重设草稿默认值</button><button class="bbs-btn" data-action="cancel-type" type="button" @click="delete pendingTypes[field.id]">取消类型变更</button></div></div>
          <label class="libei-schema-label">默认值 · JSON<textarea class="bbs-input libei-schema-json" data-field-prop="default" :value="jsonText(field)" :aria-label="field.label + '默认值JSON'" spellcheck="false" rows="3" @input="editJson(field,$event)" /></label>
          <p class="libei-schema-hint">文字写成 "未记录"，开关写 true / false，列表写 []，对象写 {}。这里不执行 JavaScript 或自定义公式。</p>
          <div v-if="['integer','number'].includes(field.type)" class="libei-schema-grid"><label>下限（可留空）<input class="bbs-input" inputmode="decimal" data-field-prop="min" :value="boundText(field,'min')" :aria-label="field.label + '下限'" @input="editBound(field,'min',$event)" /></label><label>上限（可留空）<input class="bbs-input" inputmode="decimal" data-field-prop="max" :value="boundText(field,'max')" :aria-label="field.label + '上限'" @input="editBound(field,'max',$event)" /></label></div>
          <label v-if="field.type === 'enum'" class="libei-schema-label">枚举选项 · 每行一个<textarea class="bbs-input libei-schema-json" data-field-prop="options" :value="optionsText(field)" :aria-label="field.label + '枚举选项'" rows="3" @input="editOptions(field,$event)" /></label>
          <label class="libei-schema-label">更新规则<textarea class="bbs-input libei-schema-json" data-field-prop="rule" :value="field.rule" :aria-label="field.label + '更新规则'" rows="3" @input="text(field,'rule',$event)" /></label>
          <label class="libei-schema-toggle"><input type="checkbox" class="bbs-checkbox" data-field-prop="visible" :checked="field.visible" @change="patch(field.id,{visible:checkOf($event)})" />在状态界面显示</label>
          <p v-if="fieldError(field) && (showErrors || jsonDrafts[field.id] !== undefined || pendingTypes[field.id] || minDrafts[field.id] !== undefined || maxDrafts[field.id] !== undefined)" class="libei-schema-error" role="alert">{{ fieldError(field) }}</p>
          <div class="libei-schema-actions"><button class="bbs-btn" type="button" data-action="clone" :disabled="fields.length >= 128" :aria-label="'复制' + field.label" @click="add(field)">复制变量</button><button class="bbs-btn" type="button" data-action="move-up" :disabled="index === 0" :aria-label="'上移' + field.label" @click="move(index,-1)">上移</button><button class="bbs-btn" type="button" data-action="move-down" :disabled="index === fields.length - 1" :aria-label="'下移' + field.label" @click="move(index,1)">下移</button><button class="bbs-btn" type="button" data-action="disable"  :aria-label="(field.enabled ? '停用' : '启用') + field.label" @click="toggle(field)">{{ field.enabled ? '停用变量（保留数据）' : '重新启用' }}</button></div>
        </div>
      </details>
    </fieldset>
    <slot name="preview" />
  </section>
</template>

<style scoped>
.libei-schema-editor,.libei-schema-fields,.libei-schema-body{display:grid;gap:12px;min-width:0}.libei-schema-fields{border:0;padding:0;margin:0}.libei-schema-editor h3,.libei-schema-editor p{margin:0}.libei-schema-head{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.libei-schema-head h3{font-size:15px}.libei-schema-hint,.libei-schema-path{font-size:12px;line-height:1.7;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.libei-schema-row{min-width:0;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);overflow:hidden}.libei-schema-row>summary{min-height:44px;padding:12px;cursor:pointer;font-size:13px;overflow-wrap:anywhere}.libei-schema-row>summary span{font-size:11px;color:var(--bbs-ink-soft);margin-left:8px}.libei-schema-row[open]>summary{border-bottom:1px solid var(--bbs-line)}.libei-schema-body{padding:12px}.libei-schema-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.libei-schema-grid>label,.libei-schema-label{display:grid;gap:6px;min-width:0;font-size:13px}.libei-schema-editor .bbs-input{width:100%;min-width:0;max-width:100%;min-height:44px}.libei-schema-json{font:13px/1.7 var(--bbs-font-mono);resize:vertical;white-space:pre-wrap;overflow-wrap:anywhere}.libei-schema-actions{display:flex;flex-wrap:wrap;gap:8px}.libei-schema-editor .bbs-btn{min-height:44px;white-space:normal;overflow-wrap:anywhere}.libei-schema-toggle{display:flex;align-items:center;gap:10px;font-size:13px;min-height:44px}.libei-schema-type-review{display:grid;gap:8px;padding:10px;background:var(--bbs-surface-2);border-radius:var(--bbs-radius-sm);font-size:12px;line-height:1.7}.libei-schema-error{color:var(--bbs-danger);font-size:12px;line-height:1.7;overflow-wrap:anywhere}.libei-schema-editor :is(button,summary,input,select,textarea):focus-visible{outline:2px solid var(--bbs-ink-soft);outline-offset:2px}.libei-schema-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap}@media(max-width:480px){.libei-schema-grid{grid-template-columns:minmax(0,1fr)}.libei-schema-editor .bbs-input{font-size:16px}.libei-schema-actions>.bbs-btn{flex:1 1 100px}}
</style>
