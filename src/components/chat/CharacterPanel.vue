<template>
  <div class="character-panel">
    <div v-if="currentGroup" class="panel-content">
      <div class="panel-section">
        <h3>角色列表</h3>
        <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
          + 添加角色
        </button>
      </div>

      <div class="character-list">
        <div
          v-for="char in charactersStore.characters"
          :key="char.id"
          :class="['character-item', { 'user-character': char.is_user === 1 }]"
        >
          <div class="character-header">
            <input
              v-model="char.name"
              class="character-name-input"
              @change="updateCharacter(char)"
              placeholder="角色名称"
            />
            <label v-if="char.is_user !== 1" class="toggle-switch">
              <input
                type="checkbox"
                :checked="char.enabled === 1"
                @change="toggleCharacter(char)"
              />
              <span class="slider"></span>
            </label>
            <span v-else class="user-badge">用户</span>
          </div>

          <textarea
            v-model="char.system_prompt"
            class="character-prompt-input"
            @change="updateCharacter(char)"
            :placeholder="char.is_user === 1 ? '用户设定...' : '角色设定...'"
            rows="4"
          />

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

          <div v-if="char.is_user !== 1" class="character-actions">
            <button class="btn btn-danger btn-sm" @click="deleteCharacter(char.id)">
              删除
            </button>
          </div>
        </div>

        <div v-if="charactersStore.characters.length === 0" class="empty-state">
          <p>还没有角色</p>
          <p class="hint">点击"添加角色"创建一个</p>
        </div>
      </div>

      <!-- 群设置 -->
      <div class="panel-section">
        <div class="section-header">
          <h3>群设置</h3>
          <button class="btn btn-link btn-sm" @click="showGroupSettings = true">
            ⚙️ 编辑
          </button>
        </div>
        <div class="setting-item">
          <label>最大历史轮数</label>
          <input
            type="number"
            :value="currentGroup.max_history"
            @change="updateMaxHistory"
            class="input setting-input"
            min="1"
            max="50"
          />
        </div>
        <div class="setting-item">
          <label>回复模式</label>
          <select
            :value="currentGroup.response_mode"
            @change="updateResponseMode"
            class="input setting-input"
          >
            <option value="sequential">顺序</option>
            <option value="parallel">并行</option>
          </select>
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
import CreateCharacterDialog from '../config/CreateCharacterDialog.vue'
import GroupSettingsDialog from '../config/GroupSettingsDialog.vue'

const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const messagesStore = useMessagesStore()
const showCreateDialog = ref(false)
const showGroupSettings = ref(false)

const currentGroup = computed(() => groupsStore.currentGroup)

async function updateCharacter(char) {
  try {
    await charactersStore.updateCharacter(char.id, {
      name: char.name,
      systemPrompt: char.system_prompt
    })
  } catch (error) {
    alert('更新角色失败: ' + error.message)
  }
}

async function toggleCharacter(char) {
  try {
    await charactersStore.toggleCharacter(char.id, char.enabled === 0)
  } catch (error) {
    alert('切换角色状态失败: ' + error.message)
  }
}

async function deleteCharacter(id) {
  if (!confirm('确定要删除这个角色吗？')) return

  try {
    await charactersStore.deleteCharacter(id)
  } catch (error) {
    alert('删除角色失败: ' + error.message)
  }
}

async function updateMaxHistory(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      maxHistory: parseInt(event.target.value)
    })
  } catch (error) {
    alert('更新设置失败: ' + error.message)
  }
}

async function updateResponseMode(event) {
  try {
    await groupsStore.updateGroup(currentGroup.value.id, {
      responseMode: event.target.value
    })
  } catch (error) {
    alert('更新设置失败: ' + error.message)
  }
}

function handleCharacterCreated() {
  showCreateDialog.value = false
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
    alert('发送指令失败: ' + error.message)
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

    .character-name-input {
      background: rgba(255, 255, 255, 0.2);
      color: white;
      border-color: rgba(255, 255, 255, 0.3);

      &::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }
    }

    .character-prompt-input {
      background: rgba(255, 255, 255, 0.15);
      color: white;
      border-color: rgba(255, 255, 255, 0.3);

      &::placeholder {
        color: rgba(255, 255, 255, 0.6);
      }
    }

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
  }
}

.character-header {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-bottom: $spacing-sm;
}

.character-name-input {
  flex: 1;
  @extend .input !optional;
  font-weight: $font-weight-medium;
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

.character-actions {
  display: flex;
  justify-content: flex-end;
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

  .setting-input {
    width: 100%;
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
