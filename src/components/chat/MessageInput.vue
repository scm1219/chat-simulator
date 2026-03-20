<template>
  <div class="message-input">
    <textarea
      v-model="content"
      class="input-textarea"
      placeholder="输入消息..."
      rows="3"
      @keydown="handleKeyDown"
      :disabled="disabled"
    />
    <div class="input-actions">
      <span class="hint">Enter 发送，Shift + Enter 换行</span>
      <div class="action-buttons">
        <button
          class="btn btn-secondary"
          @click="handleClearMessages"
          :disabled="disabled"
          title="清空所有消息"
        >
          清空
        </button>
        <button
          class="btn btn-primary"
          @click="sendMessage"
          :disabled="!canSend"
        >
          {{ disabled ? '发送中...' : '发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useDialog } from '../../composables/useDialog'

const props = defineProps({
  disabled: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['send', 'clear'])

const { confirm } = useDialog()
const content = ref('')

const canSend = computed(() => {
  return !props.disabled && content.value.trim().length > 0
})

function sendMessage() {
  if (!canSend.value) return

  emit('send', content.value.trim())
  content.value = ''
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    sendMessage()
  }
}

async function handleClearMessages() {
  const confirmed = await confirm({
    title: '清空消息',
    message: '确认清空所有消息吗？此操作不可恢复。',
    confirmText: '清空',
    cancelText: '取消'
  })
  if (confirmed) {
    emit('clear')
  }
}
</script>

<style lang="scss" scoped>
.message-input {
  display: flex;
  flex-direction: column;
  gap: $spacing-md;
}

.input-textarea {
  @extend .textarea !optional;
  width: 100%;
  min-height: 80px;
  max-height: 200px;
  resize: vertical;
}

.input-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.action-buttons {
  display: flex;
  gap: $spacing-sm;
}

.hint {
  font-size: $font-size-xs;
  color: $text-placeholder;
}
</style>
