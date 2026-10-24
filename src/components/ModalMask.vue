<script setup lang="ts">
// 本地私用集成：源自 ST-BaiBai-Book/src/components/ModalMask.vue；保留 Shadow DOM 内弹层行为。
import { modalHost } from '@/state/ui';

defineProps<{
  open?: boolean;
  topLayer?: boolean;
}>();
const emit = defineEmits<{ (e: 'close'): void }>();
</script>

<template>
  <!-- 留在 shadow 内、位于主滚动容器之外；容器常驻才能保留离场动画。 -->
  <Teleport :to="modalHost" :disabled="!modalHost">
    <Transition name="bbs-modal">
      <div
        v-if="open"
        class="bbs-modal-mask"
        :class="{ 'bbs-modal-mask-top': topLayer }"
        @mousedown.self="emit('close')"
      >
        <slot />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bbs-modal-mask-top {
  z-index: 10002;
}
</style>
