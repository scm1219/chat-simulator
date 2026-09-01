<template>
  <ConfirmDialog
    v-if="confirmStore.visible && confirmStore.options"
    :key="confirmKey"
    ref="dialogRef"
    v-bind="confirmStore.options"
    @confirm="confirmStore.resolve(true)"
    @cancel="confirmStore.resolve(false)"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useConfirmStore } from '../../stores/confirm.js'
import ConfirmDialog from './ConfirmDialog.vue'

const confirmStore = useConfirmStore()
const dialogRef = ref(null)

// 连续两次 confirm 内容不同时强制重建，确保动画与状态复位
const confirmKey = computed(() =>
  ['title', 'message', 'confirmText', 'confirmType']
    .map(k => confirmStore.options?.[k] ?? '')
    .join('|')
)

// ConfirmDialog 内部 visible 初始为 false，需调用暴露的 show()
watch(() => confirmStore.visible, async (visible) => {
  if (visible) {
    await nextTick()
    dialogRef.value?.show()
  }
})
</script>
