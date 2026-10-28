<script setup lang="ts">
import UniversalRules from './UniversalRules.vue';
defineOptions({ name: 'RuleEditor' });
</script>
<template><section class="bbs-page" data-universal-page><div class="bbs-page-head"><h2>通用规则</h2><span>MVU 变量格式</span></div><hr class="bbs-rule" /><UniversalRules /></section></template>

<style scoped>
.bbs-page-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px}.bbs-page-head h2{font-size:20px;margin:0}.bbs-page-head>span{font-size:12px;color:var(--bbs-ink-soft)}
</style>
