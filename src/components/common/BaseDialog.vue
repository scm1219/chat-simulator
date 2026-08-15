<template>
  <div class="dialog-overlay" @click.self="handleOverlayClick">
    <div class="dialog" role="dialog" aria-modal="true" :style="dialogStyle" @click.stop>
      <div class="dialog-header">
        <div class="header-left">
          <h3>{{ title }}</h3>
          <slot name="header-badges" />
        </div>
        <button class="close-btn" aria-label="关闭" @click="$emit('close')">&times;</button>
      </div>

      <slot name="header-extra" />

      <div class="dialog-body">
        <slot />
      </div>

      <div v-if="$slots.footer" class="dialog-footer">
        <slot name="footer" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  maxWidth: { type: String, default: '520px' },
  closeOnOverlay: { type: Boolean, default: true }
})

const emit = defineEmits(['close'])

const dialogStyle = computed(() => ({
  maxWidth: props.maxWidth
}))

function handleOverlayClick() {
  if (props.closeOnOverlay) emit('close')
}

function onDocumentKeydown(e) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => {
  document.addEventListener('keydown', onDocumentKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 90%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
}

.dialog-header {
  padding: $spacing-lg $spacing-xl;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }

  .close-btn {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: $text-secondary;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: $border-radius-sm;
    transition: background 0.2s;

    &:hover {
      background: $bg-secondary;
      color: $text-primary;
    }
  }
}

.dialog-body {
  padding: $spacing-xl;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  flex-shrink: 0;
}
</style>
