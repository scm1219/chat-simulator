<template>
  <div
    class="character-item"
    :class="{ 'user-character': character.is_user === 1 }"
  >
    <div class="character-header">
      <div class="character-actions-left">
        <button
          v-if="character.is_user !== 1"
          class="btn-delete-icon"
          @click="deleteCharacter()"
          title="删除角色"
        >❌</button>
      </div>
      <span class="character-name">{{ character.name }}</span>
      <EmotionTag
        :emotion="getCharEmotion(character.id)?.emotion || '平静'"
        :intensity="getCharEmotion(character.id)?.intensity || 0"
        :character-id="character.id"
        :editable="character.is_user !== 1 && !!groupsStore.currentGroup?.narrative_enabled"
        @update="(e) => updateEmotion(character.id, e)"
      />
        <button
          v-if="character.is_user !== 1"
          class="btn-memory-icon"
          @click="$emit('open-memory')"
          title="角色记忆"
        >📝</button>
      <div class="character-actions-right">
        <!-- AI 角色的控制按钮 -->
        <template v-if="character.is_user !== 1">
          <!-- 上移按钮 -->
          <button
            class="btn-order-icon"
            @click="moveCharacter('up')"
            :disabled="!canMoveUp()"
            :class="{ 'btn-disabled': !canMoveUp() }"
            title="上移"
          >⬆️</button>
          <!-- 下移按钮 -->
          <button
            class="btn-order-icon"
            @click="moveCharacter('down')"
            :disabled="!canMoveDown()"
            :class="{ 'btn-disabled': !canMoveDown() }"
            title="下移"
          >⬇️</button>
          <!-- 思考模式开关 -->
          <label class="checkbox-switch" :title="character.thinking_enabled === 1 ? '思考模式已开启' : '思考模式已关闭'">
            <input
              type="checkbox"
              :checked="character.thinking_enabled === 1"
              @change="toggleCharacterThinking()"
            />
            <span class="checkbox-icon">🧠</span>
          </label>
          <!-- 启用开关 -->
          <label class="toggle-switch">
            <input
              type="checkbox"
              :checked="character.enabled === 1"
              @change="toggleCharacter()"
            />
            <span class="slider"></span>
          </label>
        </template>
        <!-- 用户角色的操作 -->
        <div v-else class="user-actions">
          <span class="user-badge">用户</span>
          <button class="btn-edit-icon" @click="$emit('edit')" title="编辑用户设定">
            ✏️
          </button>
        </div>
      </div>
    </div>

    <!-- 折叠的角色设定（只读） -->
    <div class="character-prompt-collapsed" v-if="!expanded">
      <button class="btn btn-link btn-sm expand-btn" @click="togglePromptExpand()">
        📄 展开设定
      </button>
    </div>
    <div class="character-prompt-expanded" v-else>
      <div class="prompt-header">
        <span class="prompt-label">角色设定（只读）</span>
        <div class="prompt-header-actions">
          <button
            v-if="librarySynced"
            class="btn btn-link btn-sm sync-btn"
            @click="syncFromLibrary()"
            :disabled="syncing"
            title="从角色库同步最新设定"
          >{{ syncing ? '⏳' : '🔄' }}</button>
          <button class="btn btn-link btn-sm collapse-btn" @click="togglePromptExpand()">
            ▲ 收起
          </button>
        </div>
      </div>
      <div class="character-prompt-readonly">{{ character.system_prompt || '暂无设定' }}</div>
    </div>

    <!-- 指令输入和发送（仅 AI 角色） -->
    <div v-if="character.is_user !== 1" class="character-command">
      <input
        :value="commandDraft"
        type="text"
        class="command-input"
        placeholder="输入指令让角色回复..."
        @input="e => commandDraft = e.target.value"
        @keyup.enter="sendCommand()"
      />
      <button
        class="btn btn-primary btn-sm command-btn"
        @click="sendCommand()"
        :disabled="!commandDraft.trim() || character.sending"
      >
        {{ character.sending ? '发送中...' : '发送' }}
      </button>
    </div>

    <!-- 独立模型设置（仅 AI 角色） -->
    <div v-if="character.is_user !== 1" class="character-model-setting">
      <label class="model-checkbox-label">
        <input
          type="checkbox"
          :checked="!!character.custom_llm_profile_id"
          @change="toggleCustomModel()"
        />
        <span>独立设置模型</span>
      </label>
      <select
        v-if="character.custom_llm_profile_id"
        class="model-select"
        :value="character.custom_llm_profile_id"
        @change="updateCharacterModel($event.target.value)"
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
</template>

<script setup>
import { ref, computed } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useToastStore } from '../../stores/toast'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useNarrativeStore } from '../../stores/narrative.js'
import { useDialog } from '../../composables/useDialog'
import { groupProfilesByProvider } from '../../utils/llm-providers.js'
import { createLogger } from '../../utils/logger.js'
import EmotionTag from './EmotionTag.vue'

const props = defineProps({
  character: { type: Object, required: true },
  index: { type: Number, required: true }
})

defineEmits(['edit', 'open-memory'])

const log = createLogger('CharCard')
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const messagesStore = useMessagesStore()
const toast = useToastStore()
const globalCharsStore = useGlobalCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const narrativeStore = useNarrativeStore()
const { confirm } = useDialog()

// 卡片本地状态（原面板级 Map/Set 按卡片拆解，语义不变）
const expanded = ref(false)
const librarySynced = ref(false)
const syncing = ref(false)
const commandDraft = ref('') // 指令输入草稿（本地状态，避免直改 store）

const profileGroups = computed(() => groupProfilesByProvider(llmProfilesStore.profiles))

// 获取角色情绪
function getCharEmotion(characterId) {
  const emotion = narrativeStore.emotions.find(e => e.character_id === characterId)
  if (emotion && emotion.emotion !== '平静' && emotion.intensity > 0.1) return emotion
  return null
}

// 手动更新角色情绪
async function updateEmotion(characterId, { emotion, intensity }) {
  const groupId = groupsStore.currentGroup?.id
  if (!groupId) return
  await window.electronAPI.narrative.setEmotion(groupId, characterId, emotion, intensity)
  await narrativeStore.fetchEmotions(groupId)
}

// 展开设定时检查角色是否存在于角色库
function togglePromptExpand() {
  expanded.value = !expanded.value
  if (expanded.value && !librarySynced.value) {
    globalCharsStore.existsInLibrary(props.character.id).then(exists => {
      if (exists) librarySynced.value = true
    })
  }
}

// 同步角色设定从角色库到群组
async function syncFromLibrary() {
  const group = groupsStore.currentGroup
  if (!group) return
  syncing.value = true
  try {
    await globalCharsStore.syncToGroup(props.character.id, group.id)
    await charactersStore.loadCharacters(group.id)
    toast.success(`已同步 ${props.character.name} 的最新设定`)
  } catch (error) {
    toast.error('同步失败: ' + error.message)
  } finally {
    syncing.value = false
  }
}

// 判断角色是否可以上移/下移（与原实现同语义，基于列表与索引）
function canMoveUp() {
  const char = charactersStore.characters[props.index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex > 0
}

function canMoveDown() {
  const char = charactersStore.characters[props.index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex < aiCharacters.length - 1
}

async function moveCharacter(direction) {
  try {
    await charactersStore.reorderCharacter(props.character.id, direction)
  } catch (error) {
    log.error('移动角色失败:', error)
    toast.error(`移动角色失败: ${error.message}`)
  }
}

async function toggleCharacter() {
  try {
    await charactersStore.toggleCharacter(props.character.id, props.character.enabled === 0)
  } catch (error) {
    toast.error('切换角色状态失败: ' + error.message)
  }
}

async function deleteCharacter() {
  const confirmed = await confirm({
    title: '删除角色',
    message: '确定要删除这个角色吗？',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    await charactersStore.deleteCharacter(props.character.id)
  } catch (error) {
    toast.error('删除角色失败: ' + error.message)
  }
}

async function toggleCharacterThinking() {
  try {
    const newEnabled = props.character.thinking_enabled === 0
    await charactersStore.updateCharacter(props.character.id, {
      thinkingEnabled: newEnabled
    })
  } catch (error) {
    toast.error('更新角色思考模式失败: ' + error.message)
  }
}

// 切换角色独立模型设置
async function toggleCustomModel() {
  try {
    const char = props.character
    const newValue = char.custom_llm_profile_id ? null : (llmProfilesStore.profiles[0]?.id || null)
    await charactersStore.updateCharacter(char.id, {
      customLlmProfileId: newValue
    })
    if (groupsStore.currentGroup) {
      await charactersStore.loadCharacters(groupsStore.currentGroup.id)
    }
  } catch (error) {
    toast.error('更新角色模型设置失败: ' + error.message)
  }
}

// 更新角色使用的 LLM Profile
async function updateCharacterModel(profileId) {
  try {
    await charactersStore.updateCharacter(props.character.id, {
      customLlmProfileId: profileId || null
    })
  } catch (error) {
    toast.error('更新角色模型失败: ' + error.message)
  }
}

async function sendCommand() {
  const char = props.character
  const draft = commandDraft.value.trim()
  if (!draft || char.sending) return

  const command = draft
  commandDraft.value = ''
  char.sending = true

  try {
    // 构建特殊的指令消息
    const instructionMessage = `【角色指令】\n请${char.name}按照以下指令进行回复：\n${command}\n\n请保持角色人设，以角色的身份回应。`

    await messagesStore.sendMessageToCharacter(char.id, instructionMessage)
  } catch (error) {
    toast.error('发送指令失败: ' + error.message)
    // 失败时恢复指令内容；若用户已重新输入则不覆盖
    if (!commandDraft.value.trim()) {
      commandDraft.value = command
    }
  } finally {
    char.sending = false
  }
}
</script>

<style lang="scss" scoped>
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

.user-badge {
  flex-shrink: 0;
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
</style>
