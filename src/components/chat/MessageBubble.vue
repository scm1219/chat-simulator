<template>
  <div :class="['message-bubble', message.role]" ref="messageContainer">
    <div v-if="isUser" class="message-content-user">
      <div class="message-header">
        <div v-if="character || message.characterName" class="character-name">
          {{ character?.name || message.characterName || '用户' }}
        </div>
        <div class="message-actions">
          <button v-if="!editing" class="action-btn" @click="startEdit" title="编辑">
            ✏️
          </button>
          <button class="action-btn danger" @click="confirmDelete" title="删除">
            🗑️
          </button>
        </div>
      </div>
      <div
        v-if="!editing"
        class="bubble-content"
        @click="startEdit"
      >{{ showContent }}</div>
      <textarea
        v-else
        ref="editTextarea"
        v-model="editContent"
        :class="['edit-textarea', message.role]"
        rows="1"
        @blur="saveEdit"
      />
    </div>
    <div v-else class="message-content-assistant">
      <div class="message-header">
        <div v-if="character" class="character-name">{{ character.name }}</div>
        <div class="message-actions">
          <button v-if="!editing" class="action-btn" @click="startEdit" title="编辑">
            ✏️
          </button>
          <button class="action-btn danger" @click="confirmDelete" title="删除">
            🗑️
          </button>
        </div>
      </div>
      <div
        v-if="!editing"
        class="bubble-content"
        @click="startEdit"
      >
        <template v-if="showStreamingIndicator">
          正在输入...
        </template>
        <template v-else>
          {{ showContent }}
        </template>
      </div>
      <textarea
        v-else
        ref="editTextarea"
        v-model="editContent"
        :class="['edit-textarea', message.role]"
        rows="1"
        @blur="saveEdit"
      />
    </div>
    <div class="message-time">{{ formattedTime }}</div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useMessagesStore } from '../../stores/messages.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  character: {
    type: Object,
    default: null
  }
})

const messagesStore = useMessagesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const isUser = computed(() => props.message.role === 'user')

const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})

// 显示的内容
// - 用户消息：直接显示
// - AI 消息：如果是流式消息，显示 streamContent；否则显示 content
const showContent = computed(() => {
  if (isUser.value) {
    return props.message.content
  }

  // 如果是流式消息，显示 streamContent
  if (props.message.isStreaming && props.message.streamContent !== undefined) {
    return props.message.streamContent || '...'
  }

  // 历史消息直接显示完整内容
  return props.message.content || ''
})

// 是否显示"正在输入..."
const showStreamingIndicator = computed(() => {
  return !isUser.value && props.message.isStreaming && (!props.message.streamContent || props.message.streamContent.length === 0)
})

// 编辑状态
const editing = ref(false)
const editContent = ref('')
const messageContainer = ref(null)
const editTextarea = ref(null)

async function startEdit() {
  editing.value = true
  editContent.value = props.message.content

  // 等待 DOM 更新后聚焦文本框并调整高度
  await nextTick()
  if (editTextarea.value) {
    editTextarea.value.focus()
    adjustTextareaHeight()
  }
}

function adjustTextareaHeight() {
  if (!editTextarea.value) return

  const textarea = editTextarea.value

  // 重置高度以获取正确的 scrollHeight
  textarea.style.height = 'auto'

  // 计算新高度
  const newHeight = Math.max(textarea.scrollHeight, 40)
  textarea.style.height = newHeight + 'px'
}

// 监听内容变化，自动调整高度
watch(editContent, () => {
  nextTick(() => {
    adjustTextareaHeight()
  })
})

async function saveEdit() {
  if (!editing.value) return

  // 如果内容有变化才保存
  if (editContent.value.trim() !== props.message.content && editContent.value.trim().length > 0) {
    try {
      await messagesStore.updateMessage(props.message.id, editContent.value.trim())
      toast.success('消息已更新')
    } catch (error) {
      toast.error('编辑消息失败: ' + error.message)
      // 恢复原内容
      editContent.value = props.message.content
    }
  }

  editing.value = false
}

async function confirmDelete() {
  const confirmed = await confirm({
    title: '删除消息',
    message: '确定要删除这条消息吗？',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (confirmed) {
    deleteMessage()
  }
}

async function deleteMessage() {
  try {
    await messagesStore.deleteMessage(props.message.id)
    toast.success('消息已删除')
  } catch (error) {
    toast.error('删除消息失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.message-bubble {
  margin-bottom: $spacing-lg;
  max-width: 70%;

  &.user {
    align-self: flex-end;
  }

  &.assistant {
    align-self: flex-start;
  }
}

.message-content-user {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.message-content-assistant {
  display: flex;
  flex-direction: column;
}

// 消息头部（包含角色名和操作按钮）
.message-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: $spacing-xs;
}

.character-name {
  font-size: $font-size-sm;
  color: $text-secondary;
  font-weight: $font-weight-medium;
}

// 操作按钮
.message-actions {
  display: flex;
  gap: $spacing-xs;
}

.action-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: $spacing-xs $spacing-sm;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
  transition: background 0.2s ease;
  opacity: 0.6;

  &:hover {
    background: $bg-tertiary;
    opacity: 1;
  }

  &.danger:hover {
    background: #fee2e2;
    color: #dc2626;
  }
}

.user .message-header {
  align-self: flex-end;
}

.bubble-content {
  padding: $spacing-md $spacing-lg;
  border-radius: $bubble-radius;
  font-size: $font-size-md;
  line-height: 1.5;
  word-wrap: break-word;
  white-space: pre-wrap;
  cursor: pointer;
  transition: background 0.2s ease;

  &:hover {
    opacity: 0.9;
  }
}

.user .bubble-content {
  background: $bubble-user;
  color: $bubble-user-text;
  border-bottom-right-radius: 4px;
}

.assistant .bubble-content {
  background: $bubble-assistant;
  color: $bubble-assistant-text;
  border: 1px solid $border-color;
  border-bottom-left-radius: 4px;
}

// 内联编辑框
.edit-textarea {
  width: 100%;
  height: auto;
  padding: $spacing-md $spacing-lg;
  border-radius: $bubble-radius;
  font-size: $font-size-md;
  line-height: 1.5;
  font-family: inherit;
  resize: none;
  outline: none;
  border: 2px solid $color-primary;
  box-sizing: border-box;
  overflow: hidden;
  display: block;

  &.user {
    background: $bubble-user;
    color: $bubble-user-text;
    border-bottom-right-radius: 4px;
  }

  &.assistant {
    background: $bubble-assistant;
    color: $bubble-assistant-text;
    border-bottom-left-radius: 4px;
  }
}

.message-time {
  font-size: $font-size-xs;
  color: $text-placeholder;
  margin-top: $spacing-xs;
  text-align: right;
}

.user .message-time {
  text-align: right;
}

.assistant .message-time {
  text-align: left;
}
</style>
