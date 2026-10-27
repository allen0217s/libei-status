<script setup lang="ts">
import AutoRenderer from '@/ui/AutoRenderer.vue';
import StateTree from './StateTree.vue';
import type { State } from '@/core/parser';
defineProps<{ value: State; previous?: State | null; name?: string }>();
</script>
<template>
  <section class="status-overview" aria-label="通用状态">
    <AutoRenderer :value="value" :previous="previous" />
    <details><summary>查看原始状态</summary><StateTree :value="value" /></details>
  </section>
</template>
<style scoped>
.status-overview{display:grid;gap:16px;min-width:0}summary{cursor:pointer;color:var(--bbs-ink-soft);font-size:12px;padding:10px 0}
</style>
