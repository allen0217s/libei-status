<script setup lang="ts">
defineProps<{ value: any; depth?: number }>();
const isObject = (value: unknown) => value !== null && typeof value === 'object';
const label = (name: string) => name;
</script>
<template>
  <dl class="libei-tree" :class="{ 'is-root': !depth }">
    <template v-for="(child, name) in value" :key="String(name)">
      <dt>{{ label(String(name)) }}</dt>
      <dd><StateTree v-if="isObject(child) && Object.keys(child).length" :value="child" :depth="(depth || 0) + 1" /><span v-else>{{ isObject(child) || child === null || child === '' ? '无' : child }}</span></dd>
    </template>
  </dl>
</template>
<style scoped>
.libei-tree{display:grid;grid-template-columns:88px minmax(0,1fr);margin:0;gap:0;font-size:13px}.libei-tree.is-root{border:1px solid var(--bbs-line);border-radius:var(--bbs-radius);overflow:hidden;background:var(--bbs-surface)}dt,dd{margin:0;padding:10px 12px;border-bottom:1px solid var(--bbs-line);overflow-wrap:anywhere}dt{font-weight:600;color:var(--bbs-ink-soft)}dd{white-space:pre-wrap;min-width:0}.libei-tree:not(.is-root){grid-template-columns:85px minmax(0,1fr)}.libei-tree:not(.is-root)>dt,.libei-tree:not(.is-root)>dd{padding:7px 4px}.is-root>dt{background:var(--bbs-surface-2)}@media(max-width:640px){.libei-tree{grid-template-columns:62px minmax(0,1fr)}dt,dd{padding:8px}.libei-tree:not(.is-root){grid-template-columns:66px minmax(0,1fr)}}
</style>
