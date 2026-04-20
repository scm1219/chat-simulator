<template>
  <div class="chat-window">
    <div v-if="currentGroup" class="chat-container">
      <!-- 聊天头部 -->
      <div class="chat-header">
        <h2>{{ currentGroup.name }}</h2>
        <div class="header-actions">
          <button
            :class="['toggle-view-btn', { active: displayMode === 'table' }]"
            @click="toggleDisplayMode"
            :title="displayMode === 'bubble' ? '表格视图' : '气泡视图'"
          >
            <svg v-if="displayMode === 'bubble'" width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="1" width="6" height="2" rx="0.5" fill="currentColor"/>
              <rect x="1" y="4.5" width="14" height="2" rx="0.5" fill="currentColor"/>
              <rect x="1" y="8" width="14" height="2" rx="0.5" fill="currentColor"/>
              <rect x="1" y="11.5" width="14" height="2" rx="0.5" fill="currentColor"/>
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="2" width="7" height="5" rx="1" fill="currentColor" opacity="0.3"/>
              <rect x="9" y="9" width="6" height="5" rx="1" fill="currentColor" opacity="0.3"/>
              <rect x="1" y="9" width="5" height="5" rx="1" fill="currentColor" opacity="0.15"/>
              <rect x="8" y="2" width="7" height="5" rx="1" fill="currentColor" opacity="0.15"/>
            </svg>
          </button>
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
              <optgroup
                v-for="group in profileGroups"
                :key="group.id"
                :label="group.name"
              >
                <option
                  v-for="profile in group.profiles"
                  :key="profile.id"
                  :value="profile.id"
                >
                  {{ profile.name }} ({{ profile.model }})
                </option>
              </optgroup>
            </select>
            <span v-if="switchingModel" class="switching-indicator">切换中...</span>
          </div>
          <button
            class="toggle-panel-btn"
            @click="toggleRightPanel"
            :title="rightPanelVisible ? '隐藏侧栏' : '显示侧栏'"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <rect x="1.5" y="1.5" width="13" height="13" rx="2" stroke="currentColor" stroke-width="1.2"/>
              <line x1="11" y1="2" x2="11" y2="14" stroke="currentColor" stroke-width="1.2"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- 消息列表 -->
      <div class="chat-messages" ref="messagesContainer">
        <div v-if="messagesStore.messages.length === 0" class="empty-state">
          <p>开始对话吧</p>
          <p class="hint">输入消息后，AI 角色会自动回复</p>
        </div>

        <!-- 气泡视图（虚拟滚动） -->
        <template v-if="displayMode === 'bubble' && messagesStore.messages.length > 0">
          <div
            :style="{
              height: `${rowVirtualizer.getTotalSize()}px`,
              width: '100%',
              position: 'relative',
            }"
          >
            <div
              v-for="virtualRow in rowVirtualizer.getVirtualItems()"
              :key="virtualRow.key"
              :data-index="virtualRow.index"
              :data-message-id="messagesStore.messages[virtualRow.index]?.id"
              :ref="(el) => { if (el) measureElementRef(el, virtualRow.index) }"
              :style="{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                display: 'flex',
                flexDirection: 'column',
                transform: `translateY(${virtualRow.start}px)`,
              }"
            >
              <MessageBubble
                :message="messagesStore.messages[virtualRow.index]"
                :character="charactersStore.getCharacterById(messagesStore.messages[virtualRow.index]?.character_id)"
              />
            </div>
          </div>
        </template>

        <!-- 表格视图 -->
        <div v-else class="table-view">
          <table class="messages-table">
            <thead>
              <tr>
                <th class="col-index">#</th>
                <th class="col-role">角色</th>
                <th class="col-content">内容</th>
                <th class="col-type">类型</th>
                <th class="col-time">时间</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(msg, index) in messagesStore.messages"
                :key="msg.id"
                :data-message-id="msg.id"
                :class="['msg-row', msg.role, { highlighted: isHighlighted(msg.id) }]"
              >
                <td class="col-index">{{ index + 1 }}</td>
                <td class="col-role">
                  <span :class="['role-badge', msg.role]">
                    {{ getCharacterName(msg) }}
                  </span>
                </td>
                <td class="col-content">
                  <div
                    v-if="editingId !== msg.id"
                    class="content-text"
                    @dblclick="startTableEdit(msg)"
                    :title="'双击编辑'"
                  >{{ msg.content || '' }}</div>
                  <textarea
                    v-else
                    ref="tableEditTextarea"
                    v-model="tableEditContent"
                    class="content-edit"
                    rows="1"
                    @keydown.enter.ctrl="saveTableEdit(msg)"
                    @keydown.escape="cancelTableEdit"
                    @blur="saveTableEdit(msg)"
                  />
                </td>
                <td class="col-type">
                  <template v-if="msg.message_type === 'event'">
                    <span class="type-tag event-tag">事件</span>
                    <span v-if="msg.event_impact" class="type-tag event-impact-tag">{{ msg.event_impact }}</span>
                  </template>
                  <span v-else-if="msg.is_aftermath || msg.message_type === 'aftermath'" class="type-tag aftermath-tag">余波</span>
                </td>
                <td class="col-time">{{ formatTime(msg.timestamp) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- 平淡提示 & 事件面板（输入框上方） -->
      <StalenessTip
        :visible="showStalenessTip"
        @showEvents="showEventPanel = true"
        @dismiss="showStalenessTip = false"
      />
      <EventPanel
        v-if="showEventPanel"
        :group-id="currentGroup?.id"
        :scene-type="currentGroup?.event_scene_type || 'general'"
        @eventTriggered="handleEventTriggered"
        @eventDeleted="handleEventDeleted"
      />

      <!-- 输入框 -->
      <div class="chat-input">
        <MessageInput
          @send="handleSendMessage"
          @clear="handleClearMessages"
          @toggle-event="showEventPanel = !showEventPanel"
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted, inject } from 'vue'
import { useVirtualizer } from '@tanstack/vue-virtual'
import { useGroupsStore } from '../../stores/groups.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import MessageBubble from './MessageBubble.vue'
import MessageInput from './MessageInput.vue'
import StalenessTip from './StalenessTip.vue'
import EventPanel from './EventPanel.vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const groupsStore = useGroupsStore()
const messagesStore = useMessagesStore()
const charactersStore = useCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const toast = useToastStore()
const narrativeStore = useNarrativeStore()

// 事件面板 & 平淡提示
const showStalenessTip = ref(false)
const showEventPanel = ref(false)

// 右侧面板控制
const rightPanelVisible = inject('rightPanelVisible')
const toggleRightPanel = inject('toggleRightPanel')

const messagesContainer = ref(null)
const currentGroup = computed(() => groupsStore.currentGroup)

// 虚拟滚动：动态高度消息列表
// 注意：count 必须用 getter 而非 computed()，否则 TanStack 内部展开 options 时
// 无法建立响应式依赖，导致 count 变化时虚拟化器不更新
const rowVirtualizer = useVirtualizer({
  get count() { return messagesStore.messages.length },
  getScrollElement: () => messagesContainer.value,
  estimateSize: () => 100,
  overscan: 5,
})

// measureElement 回调（动态测量消息高度）
function measureElementRef(el) {
  // @tanstack/vue-virtual 的 measureElement 需要元素带 data-index 属性
  // 直接通过 virtualizer API 测量
  if (el) {
    rowVirtualizer.value.measureElement(el)
  }
}

// 展示模式：bubble（气泡）| table（表格）
const displayMode = ref('bubble')

// 表格编辑状态
const editingId = ref(null)
const tableEditContent = ref('')
const tableEditTextarea = ref(null)

// 模型选择器状态
const selectedProfileId = ref('')
const switchingModel = ref(false)
const exporting = ref(false)

// 按供应商分组的模型列表（供应商名称排序，组内模型名称排序）
const profileGroups = computed(() => {
  const groups = {}
  llmProfilesStore.profiles.forEach(profile => {
    const providerId = profile.provider
    const providerName = LLM_PROVIDERS[providerId]?.name || providerId
    if (!groups[providerId]) {
      groups[providerId] = { id: providerId, name: providerName, profiles: [] }
    }
    groups[providerId].profiles.push(profile)
  })
  return Object.values(groups)
    .map(group => ({
      ...group,
      profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
})

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

// 获取角色名称（表格视图用）
function getCharacterName(msg) {
  if (msg.role === 'user') {
    const userChar = charactersStore.getCharacterById(
      charactersStore.characters.find(c => c.is_user === 1)?.id
    )
    return userChar?.name || '用户'
  }
  const char = charactersStore.getCharacterById(msg.character_id)
  return char?.name || msg.characterName || '角色'
}

// 切换展示模式
function toggleDisplayMode() {
  displayMode.value = displayMode.value === 'bubble' ? 'table' : 'bubble'
  editingId.value = null
}

// 格式化时间（表格视图用）
function formatTime(timestamp) {
  if (!timestamp) return ''
  const date = new Date(timestamp)
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

// 判断消息是否高亮（表格视图用）
function isHighlighted(messageId) {
  return messagesStore.highlightMessageId === messageId
}

// 表格内联编辑
async function startTableEdit(msg) {
  // 流式消息不可编辑
  if (msg.isStreaming) return
  editingId.value = msg.id
  tableEditContent.value = msg.content || ''
  await nextTick()
  // 聚焦并调整高度
  const textareas = tableEditTextarea.value
  if (textareas) {
    const el = Array.isArray(textareas) ? textareas[0] : textareas
    el?.focus()
    adjustTableTextareaHeight(el)
  }
}

function adjustTableTextareaHeight(el) {
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(el.scrollHeight, 32) + 'px'
}

async function saveTableEdit(msg) {
  if (editingId.value !== msg.id) return
  const newContent = tableEditContent.value.trim()
  if (newContent && newContent !== msg.content) {
    try {
      await messagesStore.updateMessage(msg.id, newContent)
    } catch (error) {
      toast.error('编辑消息失败: ' + error.message)
    }
  }
  editingId.value = null
}

function cancelTableEdit() {
  editingId.value = null
}

// 发送消息
async function handleSendMessage(content) {
  // 发送时自动切换到气泡视图
  if (displayMode.value === 'table') {
    displayMode.value = 'bubble'
    editingId.value = null
  }
  try {
    await messagesStore.sendMessage(content)
    // 发送完成后检查平淡度
    if (groupsStore.currentGroupId) {
      await narrativeStore.checkStaleness(groupsStore.currentGroupId)
      showStalenessTip.value = narrativeStore.staleness.stale
    }
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
      toast.success(`导出成功！文件大小：${(result.data.size / 1024).toFixed(2)} KB`)
    } else if (!result.canceled) {
      toast.error('导出失败: ' + result.error)
    }
  } catch (error) {
    toast.error('导出失败: ' + error.message)
  } finally {
    exporting.value = false
  }
}

// 事件触发后的处理：立即以事件内容发起一轮对话
async function handleEventTriggered(event) {
  showEventPanel.value = false
  showStalenessTip.value = false
  try {
    await messagesStore.sendMessage(event.content, { messageType: 'event', eventImpact: event.impact })
    if (groupsStore.currentGroupId) {
      await narrativeStore.checkStaleness(groupsStore.currentGroupId)
      showStalenessTip.value = narrativeStore.staleness.stale
    }
  } catch (error) {
    toast.error('事件触发对话失败: ' + error.message)
  }
}

// 事件删除后刷新聊天记录
async function handleEventDeleted() {
  if (groupsStore.currentGroupId) {
    await messagesStore.loadMessages(groupsStore.currentGroupId)
  }
}

// 滚动到底部（虚拟滚动版本）
async function scrollToBottom(smooth = true) {
  await nextTick()
  const count = messagesStore.messages.length
  if (count === 0) return
  rowVirtualizer.value.scrollToIndex(count - 1, {
    align: 'end',
    behavior: smooth ? 'smooth' : 'instant'
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
    // 重置叙事相关状态
    showStalenessTip.value = false
    showEventPanel.value = false
    narrativeStore.clearAftermath()
  } else {
    // 清空本地消息列表，不需要调用 IPC
    messagesStore.clearLocalMessages()
    selectedProfileId.value = ''
    showStalenessTip.value = false
    showEventPanel.value = false
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

// 监听高亮消息，滚动到对应位置
watch(() => messagesStore.highlightMessageId, async (messageId) => {
  if (!messageId) return

  await nextTick()

  // 直接通过索引定位（替代 DOM 轮询）
  const index = messagesStore.messages.findIndex(m => m.id === messageId)
  if (index !== -1) {
    rowVirtualizer.value.scrollToIndex(index, { align: 'center', behavior: 'smooth' })
  }

  // 3秒后清除高亮
  setTimeout(() => {
    messagesStore.clearHighlight()
  }, 3000)
})

// 监听流式消息内容变化，实时滚动
// 使用 Map.size 替代 O(n) 遍历，新 chunk 到达时 Map 中消息引用的属性已直接更新
watch(
  () => messagesStore.streamingMessages.size,
  () => {
    scrollToBottom(false) // 流式输出时使用即时滚动，不使用动画
  },
  { flush: 'post' }
)

// 流式消息监听器清理引用
let cleanupStreamListeners = null
let cleanupAftermath = null

// 监听余波消息，添加到消息列表（只处理新增的部分）
watch(() => narrativeStore.aftermathMessages.length, (newLen, oldLen) => {
  if (newLen <= oldLen) return
  const msgs = narrativeStore.aftermathMessages
  for (let i = oldLen; i < newLen; i++) {
    const msg = msgs[i]
    messagesStore.appendMessage({
      id: msg.id,
      group_id: msg.groupId,
      character_id: msg.characterId,
      character_name: msg.characterName,
      role: msg.role,
      content: msg.content,
      reasoning_content: null,
      isAftermath: true,
      model: msg.model || null,
      prompt_tokens: msg.prompt_tokens || null,
      completion_tokens: msg.completion_tokens || null,
      timestamp: msg.timestamp
    })
  }
})

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
  cleanupStreamListeners = messagesStore.setupStreamListeners()

  // 设置余波消息监听器
  cleanupAftermath = narrativeStore.setupAftermathListener()
})

// 组件卸载时清理监听器
onUnmounted(() => {
  cleanupStreamListeners?.()
  cleanupAftermath?.()
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

  .toggle-panel-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid $border-color;
    border-radius: $border-radius-md;
    color: $text-secondary;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: $wechat-green;
      border-color: $wechat-green;
      background: rgba($wechat-green, 0.05);
    }
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

  .toggle-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    background: transparent;
    border: 1px solid $border-color;
    border-radius: $border-radius-md;
    color: $text-secondary;
    cursor: pointer;
    transition: all 0.2s;

    &:hover {
      color: $wechat-green;
      border-color: $wechat-green;
      background: rgba($wechat-green, 0.05);
    }

    &.active {
      color: white;
      background: $wechat-green;
      border-color: $wechat-green;
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

  // 表格视图时取消 padding，让表格自适应宽度
  &:has(.table-view) {
    padding: 0;
  }
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

// 表格视图样式
.table-view {
  width: 100%;
  overflow-x: auto;
}

.messages-table {
  width: 100%;
  border-collapse: collapse;
  font-size: $font-size-sm;

  thead {
    position: sticky;
    top: 0;
    z-index: 1;

    th {
      background: $bg-secondary;
      padding: $spacing-sm $spacing-md;
      text-align: left;
      font-weight: $font-weight-medium;
      color: $text-secondary;
      border-bottom: 2px solid $border-color;
      white-space: nowrap;
    }
  }

  tbody {
    tr {
      border-bottom: 1px solid $border-color;
      transition: background 0.15s;

      &:hover {
        background: rgba($wechat-green, 0.03);
      }

      &.highlighted {
        animation: table-highlight 2s ease-out;
      }
    }

    td {
      padding: $spacing-sm $spacing-md;
      vertical-align: top;
    }
  }
}

.col-index {
  width: 36px;
  text-align: center;
  color: $text-placeholder;
  font-size: $font-size-xs;
}

.col-role {
  width: 80px;
  white-space: nowrap;
}

.col-content {
  min-width: 200px;
}

.col-type {
  width: auto;
  min-width: 48px;
  text-align: center;
  white-space: nowrap;
}

.col-time {
  width: 70px;
  white-space: nowrap;
  color: $text-placeholder;
  font-size: $font-size-xs;
}

.role-badge {
  display: inline-block;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: $font-size-xs;

  &.user {
    background: $bubble-user;
    color: $bubble-user-text;
  }

  &.assistant {
    background: $bubble-assistant;
    color: $bubble-assistant-text;
    border: 1px solid $border-color;
  }

  &.system {
    background: $bg-tertiary;
    color: $text-secondary;
  }
}

.type-tag {
  font-size: 10px;
  border-radius: 8px;
  padding: 0 6px;
  line-height: 18px;
  display: inline-block;
  margin-right: 2px;

  &.event-tag {
    background: #fff3e0;
    color: #e65100;
  }

  &.event-impact-tag {
    background: #fff3e0;
    color: #bf360c;
    border: 1px solid #ffcc80;
  }

  &.aftermath-tag {
    background: #e8f5e9;
    color: #43a047;
  }
}

.content-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.5;
  cursor: default;
  min-height: 22px;
  padding: 2px 0;
}

.content-edit {
  width: 100%;
  min-height: 32px;
  padding: 4px 8px;
  border: 1px solid $color-primary;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
  line-height: 1.5;
  font-family: inherit;
  resize: vertical;
  outline: none;
  background: white;
}

@keyframes table-highlight {
  0% {
    background: rgba(255, 214, 0, 0.3);
  }
  100% {
    background: transparent;
  }
}
</style>
