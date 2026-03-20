<template>
  <div class="chat-window">
    <div v-if="currentGroup" class="chat-container">
      <!-- 聊天头部 -->
      <div class="chat-header">
        <h2>{{ currentGroup.name }}</h2>
        <span class="llm-info">{{ currentGroup.llm_model }}</span>
      </div>

      <!-- 消息列表 -->
      <div class="chat-messages" ref="messagesContainer">
        <div v-if="messagesStore.messages.length === 0" class="empty-state">
          <p>开始对话吧</p>
          <p class="hint">输入消息后，AI 角色会自动回复</p>
        </div>

        <MessageBubble
          v-for="msg in messagesStore.messages"
          :key="msg.id"
          :message="msg"
          :character="getCharacter(msg.character_id)"
        />
      </div>

      <!-- 输入框 -->
      <div class="chat-input">
        <MessageInput
          @send="handleSendMessage"
          @clear="handleClearMessages"
          :disabled="messagesStore.sending"
        />
      </div>
    </div>

    <div v-else class="empty-group">
      <p>请选择或创建一个聊天群</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useCharactersStore } from '../../stores/characters.js'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'

const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()
const charactersStore = useCharactersStore()

const messagesContainer = ref(null)
const currentGroup = computed(() => groupsStore.currentGroup)

// 获取角色信息
function getCharacter(characterId) {
  if (!characterId) return null
  return charactersStore.characters.find(c => c.id === characterId)
}

// 发送消息
async function handleSendMessage(content) {
  try {
    await messagesStore.sendMessage(content)
  } catch (error) {
    alert('发送消息失败: ' + error.message)
  }
}

// 清空消息
async function handleClearMessages() {
  try {
    await messagesStore.clearMessages()
  } catch (error) {
    alert('清空消息失败: ' + error.message)
  }
}

// 滚动到底部
async function scrollToBottom() {
  await nextTick()
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// 监听群组变化
watch(() => groupsStore.currentGroupId, async (newGroupId) => {
  if (newGroupId) {
    await messagesStore.loadMessages(newGroupId)
    await charactersStore.loadCharacters(newGroupId)
    await scrollToBottom()
  } else {
    // 清空本地消息列表，不需要调用 IPC
    messagesStore.clearLocalMessages()
  }
})

// 监听消息变化，自动滚动到底部
watch(() => messagesStore.messages.length, async () => {
  await scrollToBottom()
}, { flush: 'post' })

// 监听新消息
onMounted(() => {
  // 设置普通消息监听器
  messagesStore.setupMessageListener((message) => {
    messagesStore.appendMessage(message)
  })

  // 设置流式消息监听器
  const cleanupStreamListeners = messagesStore.setupStreamListeners()

  // 组件卸载时清理监听器
  onUnmounted(() => {
    cleanupStreamListeners?.()
  })
})
</script>

<style lang="scss" scoped>
.chat-window {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-header {
  padding: $spacing-lg $spacing-xl;
  border-bottom: 1px solid $border-color;
  background: $bg-primary;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h2 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }

  .llm-info {
    font-size: $font-size-sm;
    color: $text-secondary;
    padding: 4px 8px;
    background: $bg-secondary;
    border-radius: $border-radius-sm;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.empty-state,
.empty-group {
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: $text-secondary;

  .hint {
    font-size: $font-size-sm;
    margin-top: $spacing-sm;
  }
}

.chat-input {
  border-top: 1px solid $border-color;
  background: $bg-primary;
  padding: $spacing-lg;
}
</style>
