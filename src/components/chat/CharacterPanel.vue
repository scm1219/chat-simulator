<template>
  <div class="character-panel">
    <div v-if="currentGroup" class="panel-content">
      <!-- 群设置 -->
      <div class="panel-section">
        <div class="section-header">
          <h3>群设置</h3>
          <button class="btn btn-link btn-sm" @click="showGroupSettings = true">
            ⚙️ 编辑
          </button>
        </div>
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
      </div>

      <!-- 角色列表 -->
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
              <button class="btn btn-link btn-sm collapse-btn" @click="togglePromptExpand(char.id)">
                ▲ 收起
              </button>
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
        </div>

        <div v-if="charactersStore.characters.length === 0" class="empty-state">
          <p>还没有角色</p>
          <p class="hint">点击"添加角色"创建一个</p>
        </div>
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
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import CreateCharacterDialog from '../config/CreateCharacterDialog.vue'
import EditCharacterDialog from '../config/EditCharacterDialog.vue'
import GroupSettingsDialog from '../config/GroupSettingsDialog.vue'

const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const messagesStore = useMessagesStore()
const toast = useToastStore()
const { confirm } = useDialog()
const showCreateDialog = ref(false)
const showEditDialog = ref(false)
const showGroupSettings = ref(false)
const expandedPrompts = ref({})
const editingCharacter = ref(null)

const currentGroup = computed(() => groupsStore.currentGroup)

// 获取非用户角色的数量
const aiCharacterCount = computed(() => {
  return charactersStore.characters.filter(c => c.is_user !== 1).length
})

function togglePromptExpand(charId) {
  expandedPrompts.value[charId] = !expandedPrompts.value[charId]
}

// 判断角色是否可以上移
function canMoveUp(index) {
  const char = charactersStore.characters[index]
  // 用户角色不能移动
  if (char.is_user === 1) return false
  // 找到当前角色在 AI 角色中的位置
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex > 0
}

// 判断角色是否可以下移
function canMoveDown(index) {
  const char = charactersStore.characters[index]
  // 用户角色不能移动
  if (char.is_user === 1) return false
  // 找到当前角色在 AI 角色中的位置
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex < aiCharacters.length - 1
}

// 移动角色
async function moveCharacter(char, direction) {
  try {
    await charactersStore.reorderCharacter(char.id, direction)
  } catch (error) {
    toast.error(`移动角色失败: ${error.message}`)
  }
}

async function toggleCharacter(char) {
  try {
    await charactersStore.toggleCharacter(char.id, char.enabled === 0)
    toast.success('角色状态已切换')
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
    toast.success('角色已删除')
  } catch (error) {
    toast.error('删除角色失败: ' + error.message)
  }
}

async function updateMaxHistory(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      maxHistory: parseInt(event.target.value)
    })
    toast.success('设置已更新')
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateResponseMode(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      responseMode: event.target.value
    })
    toast.success('回复模式已更新')
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
        console.error(`更新角色 ${char.name} 思考模式失败:`, err)
      }
    }

    // 重新加载角色列表以确保 UI 正确刷新
    await charactersStore.loadCharacters(currentGroup.value.id)
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

.character-prompt-input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-sm;
  min-height: 80px;
  margin-bottom: $spacing-sm;
  resize: vertical;
  font-family: inherit;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }

  &::placeholder {
    color: $text-placeholder;
  }
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
</style>
