<template>
  <div :class="['message-bubble', message.role, { highlighted: isHighlighted, aftermath: isAftermath, event: isEvent }]" ref="messageContainer">
    <div v-if="isUser" class="message-content-user">
      <div class="message-header">
        <div v-if="isEvent" class="event-tag">事件</div>
        <div v-if="isEvent && displayImpact" class="event-impact-tag">{{ displayImpact }}</div>
        <div v-if="character || message.characterName" class="character-name">
          {{ character?.name || message.characterName || '用户' }}
        </div>
        <div class="message-actions">
          <button v-if="!editing" class="action-btn" @click="startEdit" title="编辑">
            ✏️
          </button>
          <button
            class="action-btn danger"
            @click="handleDeleteClick"
            title="删除"
          >
            🗑️
          </button>
          <button
            v-if="!editing"
            :class="['action-btn', { disabled: sending }]"
            @click="handleResendClick"
            :disabled="sending"
            title="重发"
          >
            🔄
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
        <div v-if="isAftermath" class="aftermath-tag">余波</div>
        <div v-if="character || message.characterName" class="character-name">
          {{ character?.name || message.characterName || '角色' }}
        </div>
        <div class="message-actions">
          <button v-if="!editing" class="action-btn" @click="startEdit" title="编辑">
            ✏️
          </button>
          <button
            class="action-btn danger"
            @click="handleDeleteClick"
            title="删除"
          >
            🗑️
          </button>
        </div>
      </div>

      <!-- 思考过程展示区域 -->
      <div v-if="showReasoningContent" class="reasoning-content">
        <div class="reasoning-header" @click="toggleReasoningExpanded">
          <span class="reasoning-icon">🧠</span>
          <span class="reasoning-title">思考过程</span>
          <span class="reasoning-toggle">{{ reasoningExpanded ? '收起' : '展开' }}</span>
        </div>
        <div v-show="reasoningExpanded" class="reasoning-text">
          {{ displayReasoningContent }}
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
    <div class="message-time">
      <span class="time-text">{{ formattedTime }}</span>
      <span v-if="tokenInfo" class="token-info">
        <span class="token-item token-in" title="输入 token">&#8593;{{ tokenInfo.prompt }}</span>
        <span class="token-item token-out" title="输出 token">&#8595;{{ tokenInfo.completion }}</span>
        <span v-if="displayModel" class="token-item token-model" :title="'模型: ' + displayModel">{{ displayModel }}</span>
      </span>
      <span v-else-if="displayModel" class="token-info">
        <span class="token-item token-model" :title="'模型: ' + displayModel">{{ displayModel }}</span>
      </span>
    </div>
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

// 是否为搜索高亮的消息
const isHighlighted = computed(() => {
  return messagesStore.highlightMessageId === props.message.id
})

const messagesStore = useMessagesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const isUser = computed(() => props.message.role === 'user')

const isAftermath = computed(() => !!props.message.isAftermath || props.message.is_aftermath === 1 || props.message.message_type === 'aftermath')

const isEvent = computed(() => props.message.message_type === 'event')

const displayImpact = computed(() => props.message.event_impact || null)

// 获取发送状态
const sending = computed(() => messagesStore.sending)

const formattedTime = computed(() => {
  const date = new Date(props.message.timestamp)
  return date.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit'
  })
})

// 思考过程相关状态
const reasoningExpanded = ref(false)

// 是否显示思考内容
const showReasoningContent = computed(() => {
  if (isUser.value) return false

  // 检查是否有 reasoning_content
  const hasReasoning = props.message.reasoning_content ||
                       props.message.reasoningContent ||
                       (props.message.streamReasoningContent && props.message.streamReasoningContent.length > 0)

  return !!hasReasoning
})

// 显示的思考内容
const displayReasoningContent = computed(() => {
  // 优先使用 reasoning_content，其次 reasoningContent，最后 streamReasoningContent
  return props.message.reasoning_content ||
         props.message.reasoningContent ||
         props.message.streamReasoningContent ||
         ''
})

// 切换思考内容展开/折叠
function toggleReasoningExpanded() {
  reasoningExpanded.value = !reasoningExpanded.value
}

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

// Token 信息（仅 assistant 消息显示）
const tokenInfo = computed(() => {
  if (isUser.value) return null
  const prompt = props.message.prompt_tokens
  const completion = props.message.completion_tokens
  if (prompt == null && completion == null) return null
  return {
    prompt: prompt ?? 0,
    completion: completion ?? 0
  }
})

// 模型信息（仅 assistant 消息显示）
const displayModel = computed(() => {
  if (isUser.value) return null
  return props.message.model || null
})

// 编辑状态
const editing = ref(false)
const editContent = ref('')
const messageContainer = ref(null)
const editTextarea = ref(null)

// 记录编辑前气泡的宽度
const editWidth = ref(null)

async function startEdit() {
  // 记录当前气泡内容的实际宽度
  const bubble = messageContainer.value?.querySelector('.bubble-content')
  if (bubble) {
    editWidth.value = bubble.offsetWidth
  }

  editing.value = true
  editContent.value = props.message.content

  // 等待 DOM 更新后聚焦文本框并调整高度和宽度
  await nextTick()
  if (editTextarea.value) {
    if (editWidth.value) {
      editTextarea.value.style.width = editWidth.value + 'px'
    }
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
    } catch (error) {
      toast.error('编辑消息失败: ' + error.message)
      // 恢复原内容
      editContent.value = props.message.content
    }
  }

  editing.value = false
}

async function handleDeleteClick() {
  const confirmed = await confirm({
    title: '删除消息',
    message: '确定要删除这条消息吗？删除后不可恢复。',
    confirmText: '删除',
    cancelText: '取消',
    confirmType: 'danger'
  })
  if (confirmed) {
    await deleteMessage()
  }
}

async function deleteMessage() {
  try {
    await messagesStore.deleteMessage(props.message.id)
  } catch (error) {
    toast.error('删除消息失败: ' + error.message)
  }
}

async function handleResendClick() {
  const confirmed = await confirm({
    title: '重发消息',
    message: '确定要重新发送这条消息吗？',
    confirmText: '重发',
    cancelText: '取消',
    confirmType: 'warning'
  })
  if (confirmed) {
    await handleResend()
  }
}

async function handleResend() {
  try {
    await messagesStore.resendMessage(props.message.id)
  } catch (error) {
    toast.error('重发消息失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
@use 'sass:color';

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

  &:hover {
    background: $bg-tertiary;
  }

  &.danger:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  &.disabled {
    opacity: 0.3;
    cursor: not-allowed;

    &:hover {
      background: none;
    }
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
  border: 2px solid transparent;
  box-sizing: border-box;
}

.user .bubble-content {
  background: $bubble-user;
  color: $bubble-user-text;
  border-bottom-right-radius: 4px;
}

.assistant .bubble-content {
  background: $bubble-assistant;
  color: $bubble-assistant-text;
  border: 2px solid $border-color;
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
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.token-info {
  display: inline-flex;
  gap: $spacing-xs;
  font-size: 10px;
  opacity: 0.7;
}

.token-item {
  display: inline-flex;
  align-items: center;
  gap: 1px;
}

.token-in {
  color: $color-primary;
}

.token-out {
  color: $color-danger;
}

.token-model {
  color: $text-placeholder;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user .message-time {
  text-align: right;
}

.assistant .message-time {
  text-align: left;
}

// 搜索高亮样式
.message-bubble.highlighted {
  animation: highlight-pulse 2s ease-out;

  .bubble-content {
    box-shadow: 0 0 0 2px rgba(255, 214, 0, 0.6);
  }
}

// 余波消息样式
.message-bubble.aftermath {
  max-width: 60%;

  .character-name {
    color: #6a9a60;
  }

  .bubble-content {
    background: #f4f9f4;
    color: #4a6741;
    border: 1px dashed #b8d4b0;
    font-style: italic;
    cursor: default;
  }

  .message-time {
    opacity: 0.6;
  }
}

// 事件消息样式
.message-bubble.event {
  max-width: 65%;

  .character-name {
    color: #8a6d3b;
  }

  .bubble-content {
    background: #fef9f0;
    color: #6b5a3a;
    border: 1px dashed #e0c89a;
    font-style: italic;
  }
}

.user.message-bubble.event .bubble-content {
  background: #fef9f0;
  color: #6b5a3a;
  border: 1px dashed #e0c89a;
}

.aftermath-tag {
  font-size: 10px;
  background: #e8f5e9;
  color: #43a047;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 18px;
  flex-shrink: 0;
}

.event-tag {
  font-size: 10px;
  background: #fff3e0;
  color: #e65100;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 18px;
  flex-shrink: 0;
}

.event-impact-tag {
  font-size: 10px;
  background: #fff3e0;
  color: #bf360c;
  border: 1px solid #ffcc80;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 18px;
  flex-shrink: 0;
}

@keyframes highlight-pulse {
  0% {
    background: rgba(255, 214, 0, 0.3);
  }
  100% {
    background: transparent;
  }
}

// 思考过程样式
.reasoning-content {
  margin-bottom: $spacing-sm;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  background: $bg-secondary;
  overflow: hidden;
}

.reasoning-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  cursor: pointer;
  user-select: none;
  background: $bg-tertiary;
  transition: background 0.2s ease;

  &:hover {
    background: color.adjust($bg-tertiary, $lightness: -5%);
  }
}

.reasoning-icon {
  font-size: $font-size-md;
}

.reasoning-title {
  flex: 1;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-secondary;
}

.reasoning-toggle {
  font-size: $font-size-xs;
  color: $text-placeholder;
  transition: color 0.2s ease;

  .reasoning-header:hover & {
    color: $text-secondary;
  }
}

.reasoning-text {
  padding: $spacing-md;
  font-size: $font-size-sm;
  line-height: 1.6;
  color: $text-secondary;
  white-space: pre-wrap;
  word-wrap: break-word;
  background: $bg-secondary;
  border-top: 1px solid $border-color;
}
</style>
