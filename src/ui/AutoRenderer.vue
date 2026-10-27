<script setup lang="ts">
import { computed } from 'vue';
import Collapsible from '@/components/Collapsible.vue';
import { object, progressValue, type JsonValue, type State } from '@/core/parser';
const props = withDefaults(defineProps<{ value: State; previous?: State | null; depth?: number }>(), { depth: 0 });
const rows = computed(() => Object.entries(props.value).map(([key, value]) => {
  const old = props.previous?.[key];
  return { key, value, old, progress: progressValue(key, value, props.value), diff: typeof value === 'number' && typeof old === 'number' && value !== old ? Number((value - old).toFixed(6)) : null };
}));
const text = (value: JsonValue | undefined) => value === null || value === undefined || value === '' ? '未记录' : typeof value === 'boolean' ? value ? '是' : '否' : String(value);
const tags = (value: JsonValue[]) => value.every(item => !object(item) && !Array.isArray(item));
const indexed = (value: JsonValue[]) => Object.fromEntries(value.map((item, index) => [String(index + 1), item])) as State;
</script>
<template>
  <div class="auto-state" :class="{ nested: depth > 0 }" data-auto-renderer>
    <template v-for="row in rows" :key="row.key">
      <Collapsible v-if="object(row.value)" :title="row.key" :open="depth === 0">
        <AutoRenderer v-if="Object.keys(row.value).length" :value="row.value as State" :previous="object(row.old) ? row.old as State : null" :depth="depth + 1" />
        <p v-else class="empty">暂无记录</p>
      </Collapsible>
      <div v-else class="state-row" :data-state-key="row.key">
        <div class="field-name">{{ row.key }}<span v-if="row.diff !== null" class="diff" :class="{ negative: row.diff < 0 }" aria-label="数值变化">{{ row.diff > 0 ? '+' : '' }}{{ row.diff }}</span></div>
        <div class="field-value">
          <template v-if="Array.isArray(row.value)">
            <div v-if="tags(row.value)" class="tags"><span v-for="(item,index) in row.value" :key="index" class="tag">{{ text(item) }}</span><span v-if="!row.value.length" class="empty">暂无记录</span></div>
            <AutoRenderer v-else :value="indexed(row.value)" :previous="Array.isArray(row.old) ? indexed(row.old) : null" :depth="depth + 1" />
          </template>
          <template v-else-if="row.progress">
            <span>{{ text(row.value) }}<small v-if="row.progress.assumed" title="此字段未给出上限，按约定以 100 展示"> / 100</small></span>
            <progress :value="Math.max(0, Math.min(row.progress.max, row.progress.value))" :max="row.progress.max" :aria-label="row.key">{{ row.progress.value }}/{{ row.progress.max }}</progress>
          </template>
          <span v-else>{{ text(row.value) }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
<style scoped>
.auto-state{display:grid;gap:12px;min-width:0}.state-row{display:grid;grid-template-columns:minmax(80px,1fr) minmax(0,3fr);gap:12px;padding:12px 14px;border:1px solid var(--bbs-line);border-radius:var(--bbs-radius-sm);background:var(--bbs-surface)}.nested .state-row{border:0;border-bottom:1px solid var(--bbs-line);border-radius:0;padding:8px 0;background:transparent}.field-name{font-size:12px;font-weight:600;color:var(--bbs-ink-soft);overflow-wrap:anywhere}.field-value{font-size:13px;line-height:1.7;white-space:pre-wrap;overflow-wrap:anywhere;min-width:0}.field-value small,.empty{color:var(--bbs-ink-soft);font-size:12px}.tags{display:flex;flex-wrap:wrap;gap:6px}.tag{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius-sm);padding:2px 8px;background:var(--bbs-surface-2);max-width:100%;overflow-wrap:anywhere}.diff{display:inline-block;margin-left:6px;font:600 11px var(--bbs-font-mono);color:#21815c;animation:changed .65s ease-out}.diff.negative{color:var(--bbs-danger)}progress{display:block;width:100%;height:7px;margin-top:7px;accent-color:var(--bbs-accent)}@keyframes changed{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.diff{animation:none}}@media(max-width:480px){.state-row{grid-template-columns:minmax(64px,1fr) minmax(0,2fr);gap:8px;padding:10px}}
</style>
