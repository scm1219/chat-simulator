<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="visible" class="confirm-overlay" @click="handleCancel">
        <div class="confirm-dialog" @click.stop>
          <div class="confirm-header">
            <h3>{{ title }}</h3>
          </div>
          <div class="confirm-body">
            <p>{{ message }}</p>
          </div>
          <div class="confirm-footer">
            <button class="btn btn-cancel" @click="handleCancel">
              {{ cancelText }}
            </button>
            <button class="btn btn-confirm" :class="confirmType" @click="handleConfirm">
              {{ confirmText }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  title: {
    type: String,
    default: '确认操作'
  },
  message: {
    type: String,
    required: true
  },
  confirmText: {
    type: String,
    default: '确定'
  },
  cancelText: {
    type: String,
    default: '取消'
  },
  confirmType: {
    type: String,
    default: 'danger',
    validator: (value) => ['danger', 'warning', 'primary'].includes(value)
  }
})

const emit = defineEmits(['confirm', 'cancel'])

const visible = ref(false)

const show = () => {
  visible.value = true
  return new Promise((resolve) => {
    const originalConfirm = () => {
      visible.value = false
      emit('confirm')
      resolve(true)
    }
    const originalCancel = () => {
      visible.value = false
      emit('cancel')
      resolve(false)
    }

    handleConfirm.value = originalConfirm
    handleCancel.value = originalCancel
  })
}

const handleConfirm = ref(() => {})
const handleCancel = ref(() => {})

defineExpose({
  show
})
</script>

<style scoped lang="scss">
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.confirm-dialog {
  background: var(--msg-bg);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  min-width: 400px;
  max-width: 500px;
  overflow: hidden;
}

.confirm-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border-color);

  h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

.confirm-body {
  padding: 24px;
  color: var(--text-primary);
  font-size: 15px;
  line-height: 1.6;
}

.confirm-footer {
  padding: 16px 24px;
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--chat-bg);
}

.btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;

  &.btn-cancel {
    background: var(--msg-bg);
    color: var(--text-primary);
    border: 1px solid var(--border-color);

    &:hover {
      background: var(--hover-bg);
    }
  }

  &.btn-confirm {
    color: white;

    &.danger {
      background: #f44336;

      &:hover {
        background: #d32f2f;
      }
    }

    &.warning {
      background: #ff9800;

      &:hover {
        background: #f57c00;
      }
    }

    &.primary {
      background: var(--wechat-green);

      &:hover {
        background: #2e7d32;
      }
    }
  }
}
</style>
