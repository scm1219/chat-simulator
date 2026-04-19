<template>
  <div class="character-panel">
    <div v-if="currentGroup" class="panel-content">
      <!-- 群设置 -->
      <div class="panel-section group-settings-section">
        <div class="section-header" @click="groupSettingsCollapsed = !groupSettingsCollapsed">
          <h3>群设置</h3>
          <div class="section-header-actions">
            <button class="btn btn-link btn-sm" @click.stop="showGroupSettings = true">
              ⚙️ 编辑
            </button>
            <span class="collapse-icon" :class="{ collapsed: groupSettingsCollapsed }">▼</span>
          </div>
        </div>
        <div class="group-settings-body" :class="{ collapsed: groupSettingsCollapsed }">
          <div class="group-settings-body-inner">
          <div class="setting-item inline-setting">
            <label>最大历史轮数</label>
            <input
              type="number"
              :value="currentGroup.max_history"
              @change="updateMaxHistory"
              class="input setting-input number-input"
              min="1"
              max="50"
            />
          </div>
          <div class="setting-item inline-setting">
            <label>回复模式</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="response-mode"
                  :value="currentGroup.response_mode"
                  :checked="currentGroup.response_mode === 'sequential'"
                  @change="updateResponseMode({ target: { value: 'sequential' }})"
                />
                <span>顺序</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="response-mode"
                  :value="currentGroup.response_mode"
                  :checked="currentGroup.response_mode === 'parallel'"
                  @change="updateResponseMode({ target: { value: 'parallel' }})"
                />
                <span>并行</span>
              </label>
            </div>
          </div>
          <div class="setting-item inline-setting">
            <label>思考模式</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="thinking-mode"
                  :checked="currentGroup.thinking_enabled === 1"
                  @change="updateThinkingMode({ target: { checked: true }})"
                />
                <span>是</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="thinking-mode"
                  :checked="currentGroup.thinking_enabled === 0"
                  @change="updateThinkingMode({ target: { checked: false }})"
                />
                <span>否</span>
              </label>
            </div>
          </div>
          <div class="setting-item inline-setting">
            <label>随机发言</label>
            <div class="radio-group">
              <label class="radio-option">
                <input
                  type="radio"
                  name="random-order"
                  :checked="currentGroup.random_order === 1"
                  @change="updateRandomOrder({ target: { checked: true }})"
                />
                <span>是</span>
              </label>
              <label class="radio-option">
                <input
                  type="radio"
                  name="random-order"
                  :checked="currentGroup.random_order === 0"
                  @change="updateRandomOrder({ target: { checked: false }})"
                />
                <span>否</span>
              </label>
            </div>
          </div>
          </div>
        </div>
      </div>

      <!-- Tab 切换 -->
      <div class="tab-bar">
        <button :class="{ active: activeTab === 'characters' }" @click="activeTab = 'characters'">角色</button>
        <button :class="{ active: activeTab === 'relationships' }" @click="activeTab = 'relationships'">关系</button>
      </div>

      <!-- 角色列表 Tab -->
      <div v-if="activeTab === 'characters'">
        <div class="panel-section">
          <h3>角色列表</h3>
          <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
            + 添加角色
          </button>
        </div>

        <div class="character-list">
        <div
          v-for="(char, index) in charactersStore.characters"
          :key="char.id"
          :class="['character-item', { 'user-character': char.is_user === 1 }]"
        >
          <div class="character-header">
            <div class="character-actions-left">
              <button
                v-if="char.is_user !== 1"
                class="btn-delete-icon"
                @click="deleteCharacter(char.id)"
                title="删除角色"
              >❌</button>
            </div>
            <span class="character-name">{{ char.name }}</span>
            <EmotionTag
              :emotion="getCharEmotion(char.id)?.emotion || '平静'"
              :intensity="getCharEmotion(char.id)?.intensity || 0"
              :character-id="char.id"
              :editable="char.is_user !== 1 && !!currentGroup?.narrative_enabled"
              @update="(e) => updateEmotion(char.id, e)"
            />
              <button
                v-if="char.is_user !== 1"
                class="btn-memory-icon"
                @click="openMemoryDialog(char)"
                title="角色记忆"
              >📝</button>
            <div class="character-actions-right">
              <!-- AI 角色的控制按钮 -->
              <template v-if="char.is_user !== 1">
                <!-- 上移按钮 -->
                <button
                  class="btn-order-icon"
                  @click="moveCharacter(char, 'up')"
                  :disabled="!canMoveUp(index)"
                  :class="{ 'btn-disabled': !canMoveUp(index) }"
                  title="上移"
                >⬆️</button>
                <!-- 下移按钮 -->
                <button
                  class="btn-order-icon"
                  @click="moveCharacter(char, 'down')"
                  :disabled="!canMoveDown(index)"
                  :class="{ 'btn-disabled': !canMoveDown(index) }"
                  title="下移"
                >⬇️</button>
                <!-- 思考模式开关 -->
                <label class="checkbox-switch" :title="char.thinking_enabled === 1 ? '思考模式已开启' : '思考模式已关闭'">
                  <input
                    type="checkbox"
                    :checked="char.thinking_enabled === 1"
                    @change="toggleCharacterThinking(char)"
                  />
                  <span class="checkbox-icon">🧠</span>
                </label>
                <!-- 启用开关 -->
                <label class="toggle-switch">
                  <input
                    type="checkbox"
                    :checked="char.enabled === 1"
                    @change="toggleCharacter(char)"
                  />
                  <span class="slider"></span>
                </label>
              </template>
              <!-- 用户角色的操作 -->
              <div v-else class="user-actions">
                <span class="user-badge">用户</span>
                <button class="btn-edit-icon" @click="editCharacter(char)" title="编辑用户设定">
                  ✏️
                </button>
              </div>
            </div>
          </div>

          <!-- 折叠的角色设定（只读） -->
          <div class="character-prompt-collapsed" v-if="!expandedPrompts[char.id]">
            <button class="btn btn-link btn-sm expand-btn" @click="togglePromptExpand(char.id)">
              📄 展开设定
            </button>
          </div>
          <div class="character-prompt-expanded" v-else>
            <div class="prompt-header">
              <span class="prompt-label">角色设定（只读）</span>
              <div class="prompt-header-actions">
                <button
                  v-if="libraryCharIds.has(char.id)"
                  class="btn btn-link btn-sm sync-btn"
                  @click="syncFromLibrary(char)"
                  :disabled="syncingIds.has(char.id)"
                  title="从角色库同步最新设定"
                >{{ syncingIds.has(char.id) ? '⏳' : '🔄' }}</button>
                <button class="btn btn-link btn-sm collapse-btn" @click="togglePromptExpand(char.id)">
                  ▲ 收起
                </button>
              </div>
            </div>
            <div class="character-prompt-readonly">{{ char.system_prompt || '暂无设定' }}</div>
          </div>

          <!-- 指令输入和发送（仅 AI 角色） -->
          <div v-if="char.is_user !== 1" class="character-command">
            <input
              v-model="char.command"
              type="text"
              class="command-input"
              placeholder="输入指令让角色回复..."
              @keyup.enter="sendCommand(char)"
            />
            <button
              class="btn btn-primary btn-sm command-btn"
              @click="sendCommand(char)"
              :disabled="!char.command || char.sending"
            >
              {{ char.sending ? '发送中...' : '发送' }}
            </button>
          </div>

          <!-- 独立模型设置（仅 AI 角色） -->
          <div v-if="char.is_user !== 1" class="character-model-setting">
            <label class="model-checkbox-label">
              <input
                type="checkbox"
                :checked="!!char.custom_llm_profile_id"
                @change="toggleCustomModel(char)"
              />
              <span>独立设置模型</span>
            </label>
            <select
              v-if="char.custom_llm_profile_id"
              class="model-select"
              :value="char.custom_llm_profile_id"
              @change="updateCharacterModel(char, $event.target.value)"
            >
              <option value="">-- 使用群组默认 --</option>
              <optgroup
                v-for="group in profileGroups"
                :key="group.providerId"
                :label="group.providerName"
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
          </div>
        </div>

        <div v-if="charactersStore.characters.length === 0" class="empty-state">
          <p>还没有角色</p>
          <p class="hint">点击"添加角色"创建一个</p>
        </div>
      </div>
      </div>

      <!-- 关系管理 Tab -->
      <div v-else class="relationship-tab">
        <RelationshipPanel :group-id="currentGroup.id" :characters="charactersStore.characters" />
      </div>
    </div>

    <div v-else class="empty-panel">
      <p>请选择一个聊天群</p>
    </div>

    <!-- 创建角色对话框 -->
    <CreateCharacterDialog
      v-if="showCreateDialog"
      :group-id="currentGroup?.id"
      @close="showCreateDialog = false"
      @created="handleCharacterCreated"
    />

    <!-- 编辑角色对话框 -->
    <EditCharacterDialog
      v-if="showEditDialog"
      :character="editingCharacter"
      @close="showEditDialog = false"
      @saved="handleCharacterSaved"
    />

    <!-- 群设置对话框 -->
    <GroupSettingsDialog
      v-if="showGroupSettings"
      :group-id="currentGroup?.id"
      @close="showGroupSettings = false"
      @saved="handleGroupSettingsSaved"
    />

    <!-- 角色记忆对话框 -->
    <div v-if="memoryDialogVisible" class="dialog-overlay" @click.self="memoryDialogVisible = false">
      <div class="dialog memory-dialog">
        <div class="dialog-header">
          <h3>{{ memoryDialogChar?.name }} 的记忆</h3>
          <button class="close-btn" @click="memoryDialogVisible = false">×</button>
        </div>
        <div class="dialog-body">
          <div class="memory-dialog-list">
            <div
              v-for="mem in memoryStore.getMemories(memoryDialogChar?.name)"
              :key="mem.id"
              class="memory-item"
            >
              <span class="memory-source" :class="mem.source">{{ mem.source === 'manual' ? '手动' : '自动' }}</span>
              <span class="memory-content">{{ mem.content }}</span>
              <button class="btn-delete-memory" @click="deleteMemory(mem.id, memoryDialogChar)" title="删除">×</button>
            </div>
            <div v-if="memoryStore.getMemories(memoryDialogChar?.name).length === 0" class="memory-empty">
              暂无记忆
            </div>
          </div>
          <div class="memory-add">
            <input
              v-model="memoryDialogInput"
              type="text"
              class="memory-input"
              placeholder="添加新记忆..."
              @keyup.enter="addMemoryFromDialog"
            />
            <button class="btn btn-primary btn-sm" @click="addMemoryFromDialog" :disabled="!memoryDialogInput?.trim()">
              添加
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useToastStore } from '../../stores/toast'
import { useMemoryStore } from '../../stores/memory.js'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useNarrativeStore } from '../../stores/narrative.js'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import CreateCharacterDialog from '../config/CreateCharacterDialog.vue'
import EditCharacterDialog from '../config/EditCharacterDialog.vue'
import GroupSettingsDialog from '../config/GroupSettingsDialog.vue'
import EmotionTag from './EmotionTag.vue'
import RelationshipPanel from './RelationshipPanel.vue'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('CharPanel')

const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const messagesStore = useMessagesStore()
const toast = useToastStore()
const memoryStore = useMemoryStore()
const globalCharsStore = useGlobalCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const narrativeStore = useNarrativeStore()
const { confirm } = useDialog()
const showCreateDialog = ref(false)
const activeTab = ref('characters') // 'characters' | 'relationships'
const showEditDialog = ref(false)
const showGroupSettings = ref(false)
const expandedPrompts = ref({})
const groupSettingsCollapsed = ref(true)  // 群设置收起状态（默认收起）
const memoryDialogVisible = ref(false)  // 记忆对话框可见性
const memoryDialogChar = ref(null)  // 记忆对话框当前角色
const memoryDialogInput = ref('')  // 记忆对话框输入
const editingCharacter = ref(null)
const libraryCharIds = ref(new Set()) // 记录哪些角色存在于角色库
const syncingIds = ref(new Set()) // 正在同步的角色 ID

const currentGroup = computed(() => groupsStore.currentGroup)

// LLM Profile 按供应商分组（用于下拉框）
const profileGroups = computed(() => {
  const profiles = llmProfilesStore.profiles
  if (!profiles || profiles.length === 0) return []

  const groups = {}
  Object.values(LLM_PROVIDERS).forEach(provider => {
    groups[provider.id] = {
      providerId: provider.id,
      providerName: provider.name,
      profiles: []
    }
  })

  profiles.forEach(profile => {
    if (groups[profile.provider]) {
      groups[profile.provider].profiles.push(profile)
    }
  })

  return Object.values(groups)
    .filter(group => group.profiles.length > 0)
    .sort((a, b) => a.providerName.localeCompare(b.providerName))
})

// 获取供应商名称
function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

// 加载 LLM Profile 列表
onMounted(async () => {
  await llmProfilesStore.loadProfiles()
})

// 获取角色情绪
function getCharEmotion(characterId) {
  const emotion = narrativeStore.emotions.find(e => e.character_id === characterId)
  if (emotion && emotion.emotion !== '平静' && emotion.intensity > 0.1) return emotion
  return null
}

// 手动更新角色情绪
async function updateEmotion(characterId, { emotion, intensity }) {
  const groupId = currentGroup.value?.id
  if (!groupId) return
  await window.electronAPI.narrative.setEmotion(groupId, characterId, emotion, intensity)
  await narrativeStore.fetchEmotions(groupId)
}

// 监听当前群组变化，获取情绪数据
watch(() => currentGroup.value?.id, async (newId) => {
  if (newId) {
    activeTab.value = 'characters'
    narrativeStore.fetchEmotions(newId)
  }
})

// 获取非用户角色的数量
const aiCharacterCount = computed(() => {
  return charactersStore.characters.filter(c => c.is_user !== 1).length
})

function togglePromptExpand(charId) {
  expandedPrompts.value[charId] = !expandedPrompts.value[charId]
  // 展开时检查角色是否存在于角色库
  if (expandedPrompts.value[charId] && !libraryCharIds.value.has(charId)) {
    globalCharsStore.existsInLibrary(charId).then(exists => {
      if (exists) {
        libraryCharIds.value.add(charId)
      }
    })
  }
}

// 同步角色设定从角色库到群组
async function syncFromLibrary(char) {
  if (!currentGroup.value) return
  syncingIds.value.add(char.id)
  try {
    await globalCharsStore.syncToGroup(char.id, currentGroup.value.id)
    await charactersStore.loadCharacters(currentGroup.value.id)
    toast.success(`已同步 ${char.name} 的最新设定`)
  } catch (error) {
    toast.error('同步失败: ' + error.message)
  } finally {
    syncingIds.value.delete(char.id)
  }
}

// 打开记忆对话框
async function openMemoryDialog(char) {
  memoryDialogChar.value = char
  memoryDialogInput.value = ''
  await memoryStore.loadMemories(char.name)
  memoryDialogVisible.value = true
}

// 从对话框添加记忆
async function addMemoryFromDialog() {
  const content = memoryDialogInput.value?.trim()
  if (!content || !memoryDialogChar.value) return
  try {
    await memoryStore.addMemory({
      characterName: memoryDialogChar.value.name,
      content
    })
    memoryDialogInput.value = ''
  } catch (error) {
    toast.error('添加记忆失败: ' + error.message)
  }
}

// 删除记忆
async function deleteMemory(memoryId, char) {
  try {
    await memoryStore.deleteMemory(memoryId, char.name)
  } catch (error) {
    toast.error('删除记忆失败: ' + error.message)
  }
}

// 判断角色是否可以上移
function canMoveUp(index) {
  const char = charactersStore.characters[index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex > 0
}

// 判断角色是否可以下移
function canMoveDown(index) {
  const char = charactersStore.characters[index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex < aiCharacters.length - 1
}

// 移动角色
async function moveCharacter(char, direction) {
  try {
    await charactersStore.reorderCharacter(char.id, direction)
  } catch (error) {
    log.error('移动角色失败:', error)
    toast.error(`移动角色失败: ${error.message}`)
  }
}

async function toggleCharacter(char) {
  try {
    await charactersStore.toggleCharacter(char.id, char.enabled === 0)
  } catch (error) {
    toast.error('切换角色状态失败: ' + error.message)
  }
}

async function deleteCharacter(id) {
  const confirmed = await confirm({
    title: '删除角色',
    message: '确定要删除这个角色吗？',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    await charactersStore.deleteCharacter(id)
  } catch (error) {
    toast.error('删除角色失败: ' + error.message)
  }
}

async function updateMaxHistory(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      maxHistory: parseInt(event.target.value)
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateResponseMode(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      responseMode: event.target.value
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateThinkingMode(event) {
  try {
    const enabled = event.target.checked
    await groupsStore.updateGroup(currentGroup.value.id, {
      thinkingEnabled: enabled
    })

    // 同步更新所有 AI 角色的思考模式
    const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
    for (const char of aiCharacters) {
      try {
        await charactersStore.updateCharacter(char.id, {
          thinkingEnabled: enabled
        })
      } catch (err) {
        log.error(`更新角色 ${char.name} 思考模式失败:`, err)
      }
    }

    // 重新加载角色列表以确保 UI 正确刷新
    await charactersStore.loadCharacters(currentGroup.value.id)
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateRandomOrder(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      randomOrder: event.target.checked
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function toggleCharacterThinking(char) {
  try {
    const newEnabled = char.thinking_enabled === 0
    await charactersStore.updateCharacter(char.id, {
      thinkingEnabled: newEnabled
    })
  } catch (error) {
    toast.error('更新角色思考模式失败: ' + error.message)
  }
}

// 切换角色独立模型设置
async function toggleCustomModel(char) {
  try {
    const newValue = char.custom_llm_profile_id ? null : (llmProfilesStore.profiles[0]?.id || null)
    await charactersStore.updateCharacter(char.id, {
      customLlmProfileId: newValue
    })
    // 重新加载角色列表以更新 UI
    if (currentGroup.value) {
      await charactersStore.loadCharacters(currentGroup.value.id)
    }
  } catch (error) {
    toast.error('更新角色模型设置失败: ' + error.message)
  }
}

// 更新角色使用的 LLM Profile
async function updateCharacterModel(char, profileId) {
  try {
    await charactersStore.updateCharacter(char.id, {
      customLlmProfileId: profileId || null
    })
  } catch (error) {
    toast.error('更新角色模型失败: ' + error.message)
  }
}

function handleCharacterCreated() {
  showCreateDialog.value = false
}

function editCharacter(char) {
  editingCharacter.value = char
  showEditDialog.value = true
}

function handleCharacterSaved() {
  showEditDialog.value = false
  editingCharacter.value = null
}

function handleGroupSettingsSaved() {
  showGroupSettings.value = false
}

async function sendCommand(char) {
  if (!char.command || !char.command.trim()) return

  const command = char.command.trim()
  char.command = ''
  char.sending = true

  try {
    // 构建特殊的指令消息
    const instructionMessage = `【角色指令】\n请${char.name}按照以下指令进行回复：\n${command}\n\n请保持角色人设，以角色的身份回应。`

    await messagesStore.sendMessageToCharacter(char.id, instructionMessage)
  } catch (error) {
    toast.error('发送指令失败: ' + error.message)
    // 如果失败，恢复指令内容
    char.command = command
  } finally {
    char.sending = false
  }
}
</script>

<style lang="scss" scoped>
.character-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-content {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.tab-bar {
  display: flex;
  border-bottom: 1px solid #e8e8e8;
  margin-bottom: 8px;

  button {
    flex: 1;
    padding: 8px;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    font-size: 13px;
    color: #999;
    cursor: pointer;

    &.active {
      color: #07c160;
      border-bottom-color: #07c160;
    }
  }
}

.relationship-tab {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.panel-section {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;

  h3 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    margin-bottom: $spacing-md;
  }

  .section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $spacing-md;

    h3 {
      margin-bottom: 0;
    }
  }

  &.group-settings-section {
    .section-header {
      cursor: pointer;
      user-select: none;
      margin-bottom: 0;

      &:hover {
        h3 {
          color: $color-primary;
        }
      }
    }

    .section-header-actions {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
    }

    .collapse-icon {
      font-size: $font-size-xs;
      color: $text-secondary;
      transition: transform 0.2s ease;
      display: inline-block;

      &.collapsed {
        transform: rotate(-90deg);
      }
    }

    .group-settings-body {
      display: grid;
      grid-template-rows: 1fr;
      transition: grid-template-rows 0.3s ease;

      &.collapsed {
        grid-template-rows: 0fr;
      }

      .group-settings-body-inner {
        overflow: hidden;
      }
    }
  }
}

.character-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-lg;
}

.character-item {
  background: $bg-secondary;
  border-radius: $border-radius-md;
  padding: $spacing-md;
  margin-bottom: $spacing-md;

  &.user-character {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: 2px solid #5a67d8;

    .user-badge {
      background: rgba(255, 255, 255, 0.3);
      color: white;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: $font-size-sm;
      font-weight: $font-weight-medium;
    }

    .command-input {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-color: rgba(255, 255, 255, 0.3);

      &::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }

      &:focus {
        border-color: rgba(255, 255, 255, 0.5);
      }
    }

    .character-prompt-collapsed .expand-btn {
      color: rgba(255, 255, 255, 0.8);
    }

    .character-prompt-expanded {
      background: rgba(255, 255, 255, 0.1);

      .prompt-header {
        background: rgba(255, 255, 255, 0.15);
        border-bottom-color: rgba(255, 255, 255, 0.2);

        .prompt-label {
          color: rgba(255, 255, 255, 0.9);
        }

        .collapse-btn {
          color: rgba(255, 255, 255, 0.8);
        }
      }

      .character-prompt-readonly {
        color: rgba(255, 255, 255, 0.95);
      }
    }
  }
}

.character-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.character-actions-left {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
}

.character-actions-right {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
}

.btn-delete-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  line-height: 1;
  opacity: 0.6;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

.btn-order-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;

  &:hover:not(.btn-disabled) {
    opacity: 1;
  }

  &.btn-disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }
}

.btn-edit-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

.checkbox-switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;

  input {
    position: absolute;
    opacity: 0;
    width: 0;
    height: 0;
  }

  .checkbox-icon {
    font-size: 16px;
    opacity: 0.3;
    transition: opacity 0.2s, transform 0.2s;
  }

  input:checked + .checkbox-icon {
    opacity: 1;
    transform: scale(1.1);
  }

  &:hover .checkbox-icon {
    opacity: 0.6;
  }

  input:checked:hover + .checkbox-icon {
    opacity: 1;
  }
}

.user-actions {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
}

.character-name {
  flex: 1;
  font-weight: $font-weight-medium;
  font-size: $font-size-md;
}

.character-prompt-collapsed {
  margin-bottom: $spacing-sm;

  .expand-btn {
    font-size: $font-size-sm;
    color: $text-secondary;
  }
}

.character-prompt-expanded {
  margin-bottom: $spacing-sm;
  background: rgba(0, 0, 0, 0.03);
  border-radius: $border-radius-sm;
  overflow: hidden;

  .prompt-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 6px 10px;
    background: rgba(0, 0, 0, 0.05);
    border-bottom: 1px solid $border-color;

    .prompt-label {
      font-size: $font-size-sm;
      color: $text-secondary;
      font-weight: $font-weight-medium;
    }

    .collapse-btn {
      font-size: $font-size-xs;
      color: $text-secondary;
    }

    .prompt-header-actions {
      display: flex;
      align-items: center;
      gap: $spacing-sm;
    }

    .sync-btn {
      font-size: $font-size-xs;
      color: $color-primary;

      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      &:hover:not(:disabled) {
        opacity: 0.8;
      }
    }
  }

  .character-prompt-readonly {
    padding: 10px;
    font-size: $font-size-sm;
    color: $text-primary;
    white-space: pre-wrap;
    word-break: break-word;
    max-height: 150px;
    overflow-y: auto;
    line-height: 1.5;
  }
}

.character-command {
  display: flex;
  gap: $spacing-sm;
  margin-bottom: $spacing-sm;
}

.character-model-setting {
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
  margin-bottom: $spacing-sm;
  padding-top: $spacing-xs;
  border-top: 1px solid rgba(0, 0, 0, 0.06);

  .model-checkbox-label {
    display: flex;
    align-items: center;
    gap: $spacing-xs;
    cursor: pointer;
    user-select: none;
    font-size: $font-size-xs;
    color: $text-secondary;

    input[type="checkbox"] {
      cursor: pointer;
      width: 14px;
      height: 14px;
      accent-color: $color-primary;
    }

    &:hover {
      color: $text-primary;
    }
  }

  .model-select {
    width: 100%;
    padding: 6px 8px;
    border: 1px solid $border-color;
    border-radius: $border-radius-sm;
    font-size: $font-size-sm;
    background: $bg-primary;
    color: $text-primary;
    cursor: pointer;
    outline: none;
    transition: border-color 0.2s;

    &:focus {
      border-color: $color-primary;
    }

    optgroup {
      font-weight: $font-weight-medium;
      color: $text-secondary;
    }

    option {
      color: $text-primary;
      padding: 4px 0;
    }
  }
}

.command-input {
  flex: 1;
  @extend .input !optional;
  padding: 6px 12px;
  font-size: $font-size-sm;
}

.command-btn {
  white-space: nowrap;
  flex-shrink: 0;
}

.toggle-switch {
  position: relative;
  display: inline-block;
  width: 44px;
  height: 24px;

  input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #ccc;
    transition: 0.3s;
    border-radius: 24px;

    &:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: 0.3s;
      border-radius: 50%;
    }
  }

  input:checked + .slider {
    background-color: $color-primary;
  }

  input:checked + .slider:before {
    transform: translateX(20px);
  }
}

.setting-item {
  margin-top: $spacing-md;

  label {
    display: block;
    font-size: $font-size-sm;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
  }

  &.inline-setting {
    display: flex;
    align-items: center;
    gap: $spacing-md;

    label {
      flex-shrink: 0;
      margin-bottom: 0;
      white-space: nowrap;
    }

    .number-input {
      width: 80px;
      flex-shrink: 0;
    }
  }

  .setting-input {
    width: 100%;
  }

  .radio-group {
    display: flex;
    gap: $spacing-lg;
    padding: 0;

    .radio-option {
      display: flex;
      align-items: center;
      gap: $spacing-xs;
      cursor: pointer;
      user-select: none;

      input[type="radio"] {
        cursor: pointer;
        width: 16px;
        height: 16px;
        accent-color: $color-primary;
      }

      span {
        font-size: $font-size-md;
        color: $text-primary;
      }

      &:hover span {
        color: $color-primary;
      }
    }
  }
}

.empty-state,
.empty-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  color: $text-secondary;
  padding: $spacing-xl;

  .hint {
    font-size: $font-size-sm;
    margin-top: $spacing-sm;
  }
}

.btn-link {
  background: none;
  border: none;
  color: $color-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}

.user-badge {
  flex-shrink: 0;
}

.btn-memory-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  padding: 0 2px;
  line-height: 1;
  opacity: 0.5;
  transition: opacity 0.2s;

  &:hover {
    opacity: 1;
  }
}

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
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.dialog-header {
  padding: $spacing-lg $spacing-xl;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;

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

    &:hover {
      color: $text-primary;
    }
  }
}

.dialog-body {
  padding: $spacing-xl;
}

.memory-dialog {
  max-width: 480px;
  width: 90%;

  .dialog-body {
    display: flex;
    flex-direction: column;
    max-height: 60vh;
  }

  .memory-dialog-list {
    flex: 1;
    overflow-y: auto;
    padding: $spacing-xs 0;
  }

  .memory-item {
    display: flex;
    align-items: flex-start;
    gap: $spacing-xs;
    padding: $spacing-xs $spacing-sm;
    font-size: $font-size-sm;
    line-height: 1.4;
    border-bottom: 1px solid rgba(0, 0, 0, 0.05);

    &:last-child {
      border-bottom: none;
    }
  }

  .memory-source {
    flex-shrink: 0;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: $font-size-xs;
    font-weight: $font-weight-medium;

    &.manual {
      background: rgba($color-primary, 0.1);
      color: $color-primary;
    }

    &.auto {
      background: rgba(255, 152, 0, 0.1);
      color: #ff9800;
    }
  }

  .memory-content {
    flex: 1;
    word-break: break-word;
  }

  .btn-delete-memory {
    flex-shrink: 0;
    background: none;
    border: none;
    color: $text-secondary;
    cursor: pointer;
    font-size: 16px;
    line-height: 1;
    opacity: 0.5;
    padding: 0 2px;

    &:hover {
      opacity: 1;
      color: #e53935;
    }
  }

  .memory-empty {
    padding: $spacing-md;
    text-align: center;
    color: $text-secondary;
    font-size: $font-size-sm;
  }

  .memory-add {
    display: flex;
    gap: $spacing-xs;
    padding: $spacing-sm 0 0;
    border-top: 1px solid $border-color;
    margin-top: $spacing-sm;
  }

  .memory-input {
    flex: 1;
    padding: 4px 8px;
    border: 1px solid $border-color;
    border-radius: $border-radius-sm;
    font-size: $font-size-sm;
    background: $bg-primary;

    &:focus {
      outline: none;
      border-color: $color-primary;
    }
  }
}
</style>
