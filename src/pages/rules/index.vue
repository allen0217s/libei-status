<script setup lang="ts">
import RulePresets from './RulePresets.vue';
defineOptions({ name: 'RuleEditor' });
</script>
<template><section class="bbs-page" data-presets-page><div class="bbs-page-head"><h2>状态预设</h2><span>模板与更新指令</span></div><hr class="bbs-rule" /><RulePresets /></section></template>

<style scoped>
.bbs-page-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.bbs-page-head h2{font-size:20px;margin:0}.bbs-page-head>span{font-size:12px;color:var(--bbs-ink-soft)}
</style>
