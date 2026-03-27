<template>
  <div class="chat-window">
    <div v-if="currentGroup" class="chat-container">
      <!-- 聊天头部 -->
      <div class="chat-header">
        <h2>{{ currentGroup.name }}</h2>
        <div class="header-actions">
          <button
            class="export-button"
            @click="handleExportMessages"
            :disabled="exporting"
            title="导出聊天记录"
          >
            {{ exporting ? '导出中...' : '导出' }}
          </button>
          <div class="model-selector">
            <select
              v-model="selectedProfileId"
              class="model-select"
              :disabled="switchingModel"
              @change="handleModelChange"
            >
              <option value="" disabled>-- 请选择模型 --</option>
              <option
                v-for="profile in llmProfilesStore.profiles"
                :key="profile.id"
                :value="profile.id"
              >
                {{ profile.name }} ({{ profile.model }})
              </option>
            </select>
            <span v-if="switchingModel" class="switching-indicator">切换中...</span>
          </div>
        </div>
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
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'

const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()
const charactersStore = useCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const toast = useToastStore()

const messagesContainer = ref(null)
const currentGroup = computed(() => groupsStore.currentGroup)

// 模型选择器状态
const selectedProfileId = ref('')
const switchingModel = ref(false)
const exporting = ref(false)

// 根据当前群组配置找到对应的 profile ID
function findCurrentProfileId() {
  if (!currentGroup.value || !llmProfilesStore.profiles.length) return ''

  const group = currentGroup.value
  // 匹配 provider + model + apiKey + baseUrl
  const matchedProfile = llmProfilesStore.profiles.find(p =>
    p.provider === group.llm_provider &&
    p.model === group.llm_model &&
    (p.apiKey || null) === (group.llm_api_key || null) &&
    (p.baseURL || null) === (group.llm_base_url || null)
  )

  return matchedProfile ? matchedProfile.id : ''
}

// 切换模型
async function handleModelChange() {
  if (!selectedProfileId.value || !currentGroup.value) return

  const profile = llmProfilesStore.getProfileById(selectedProfileId.value)
  if (!profile) return

  // 检查是否与当前配置相同
  const group = currentGroup.value
  if (
    profile.provider === group.llm_provider &&
    profile.model === group.llm_model &&
    (profile.apiKey || null) === (group.llm_api_key || null) &&
    (profile.baseURL || null) === (group.llm_base_url || null)
  ) {
    return
  }

  switchingModel.value = true
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      llmProvider: profile.provider,
      llmModel: profile.model,
      llmApiKey: profile.apiKey || null,
      llmBaseUrl: profile.baseURL || null,
      useGlobalApiKey: !profile.apiKey // 如果配置有 API Key，则使用独立配置
    })
  } catch (error) {
    toast.error('切换模型失败: ' + error.message)
    // 恢复原来的选择
    selectedProfileId.value = findCurrentProfileId()
  } finally {
    switchingModel.value = false
  }
}

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
    toast.error('发送消息失败: ' + error.message)
  }
}

// 清空消息
async function handleClearMessages() {
  try {
    await messagesStore.clearMessages()
  } catch (error) {
    toast.error('清空消息失败: ' + error.message)
  }
}

// 导出聊天记录
async function handleExportMessages() {
  if (!currentGroup.value) return

  exporting.value = true
  try {
    const result = await window.electronAPI.message.exportToZip(
      currentGroup.value.id,
      currentGroup.value.name
    )

    if (result.success) {
      // 将 base64 数据转换为 Blob
      const binaryString = atob(result.data.buffer)
      const bytes = new Uint8Array(binaryString.length)
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i)
      }

      const blob = new Blob([bytes], { type: 'application/zip' })

      // 创建下载链接并触发下载
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = result.data.filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      toast.success(`导出成功！文件大小：${(result.data.size / 1024).toFixed(2)} KB`)
    } else {
      toast.error('导出失败: ' + result.error)
    }
  } catch (error) {
    toast.error('导出失败: ' + error.message)
  } finally {
    exporting.value = false
  }
}

// 滚动到底部（使用平滑滚动）
async function scrollToBottom(smooth = true) {
  await nextTick()
  // 使用 requestAnimationFrame 确保 DOM 完全渲染
  requestAnimationFrame(() => {
    if (messagesContainer.value) {
      const container = messagesContainer.value
      if (smooth) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        })
      } else {
        container.scrollTop = container.scrollHeight
      }
    }
  })
}

// 监听群组变化
watch(() => groupsStore.currentGroupId, async (newGroupId) => {
  if (newGroupId) {
    await messagesStore.loadMessages(newGroupId)
    await charactersStore.loadCharacters(newGroupId)
    await scrollToBottom()
    // 更新模型选择器
    selectedProfileId.value = findCurrentProfileId()
  } else {
    // 清空本地消息列表，不需要调用 IPC
    messagesStore.clearLocalMessages()
    selectedProfileId.value = ''
  }
})

// 监听群组配置变化，更新选择器
watch(() => currentGroup.value, (newGroup) => {
  if (newGroup) {
    selectedProfileId.value = findCurrentProfileId()
  }
}, { deep: true })

// 监听消息变化，自动滚动到底部
watch(() => messagesStore.messages.length, async () => {
  await scrollToBottom()
}, { flush: 'post' })

// 监听流式消息内容变化，实时滚动（使用深度 watch）
watch(
  () => {
    // 计算所有流式消息的内容总长度
    return messagesStore.messages
      .filter(m => m.isStreaming)
      .reduce((total, m) => {
        return total + (m.streamContent?.length || 0) + (m.streamReasoningContent?.length || 0)
      }, 0)
  },
  async (newLen, oldLen) => {
    // 只有长度变化时才滚动
    if (newLen !== oldLen) {
      await scrollToBottom(false) // 流式输出时使用即时滚动，不使用动画
    }
  },
  { flush: 'post' }
)

// 监听新消息
onMounted(async () => {
  // 加载 LLM 配置列表
  await llmProfilesStore.loadProfiles()
  // 初始化模型选择器
  if (currentGroup.value) {
    selectedProfileId.value = findCurrentProfileId()
  }

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

  .header-actions {
    display: flex;
    align-items: center;
    gap: $spacing-md;
  }

  .export-button {
    padding: 6px 16px;
    background: $wechat-green;
    color: white;
    border: none;
    border-radius: $border-radius-md;
    font-size: $font-size-sm;
    cursor: pointer;
    transition: opacity 0.2s;

    &:hover:not(:disabled) {
      opacity: 0.9;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .model-selector {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

  .model-select {
    font-size: $font-size-sm;
    padding: 6px 12px;
    border: 1px solid $border-color;
    border-radius: $border-radius-md;
    background: $bg-secondary;
    color: $text-primary;
    cursor: pointer;
    transition: border-color 0.2s, background-color 0.2s;
    min-width: 180px;

    &:hover:not(:disabled) {
      border-color: $color-primary;
    }

    &:focus {
      outline: none;
      border-color: $color-primary;
    }

    &:disabled {
      opacity: 0.6;
      cursor: not-allowed;
    }
  }

  .switching-indicator {
    font-size: $font-size-xs;
    color: $text-secondary;
  }
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
  display: flex;
  flex-direction: column;
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
