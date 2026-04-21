<template>
  <BaseDialog
    :title="isEditing ? '编辑角色' : '新建角色'"
    maxWidth="520px"
    @close="$emit('close')"
  >
    <template #header-extra>
      <div class="tab-nav">
        <button
          v-for="tab in visibleTabs"
          :key="tab.key"
          :class="['tab-btn', { active: activeTab === tab.key }]"
          @click="activeTab = tab.key"
        >
          <span class="tab-icon">{{ tab.icon }}</span>
          <span class="tab-label">{{ tab.label }}</span>
          <span v-if="tab.badge !== undefined" class="tab-badge">{{ tab.badge }}</span>
        </button>
      </div>
    </template>

    <!-- Tab 内容 -->
    <!-- 基本信息 Tab -->
    <div v-show="activeTab === 'basic'" class="tab-panel">
      <div class="form-group">
        <label class="form-label required">姓名</label>
        <input
          v-model="form.name"
          type="text"
          class="input"
          placeholder="请输入角色姓名"
          maxlength="50"
        />
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label">性别</label>
          <select v-model="form.gender" class="input">
            <option value="">请选择</option>
            <option value="male">男</option>
            <option value="female">女</option>
            <option value="other">其他</option>
          </select>
        </div>

        <div class="form-group">
          <label class="form-label">年龄</label>
          <input
            v-model.number="form.age"
            type="number"
            class="input"
            placeholder="请输入年龄"
            min="1"
            max="999"
          />
        </div>
      </div>

      <div class="form-group">
        <div class="label-row">
          <label class="form-label required">人物设定</label>
          <span class="char-count" :class="{ 'over-limit': isOverLimit }">
            {{ form.systemPrompt.length }} / 5000
          </span>
        </div>

        <!-- 重新生成设定（仅编辑模式） -->
        <div v-if="isEditing" class="regenerate-bar">
          <div class="style-options">
            <label
              v-for="s in promptStyles"
              :key="s.value"
              class="style-radio"
              :class="{ active: selectedStyle === s.value }"
            >
              <input
                type="radio"
                :value="s.value"
                v-model="selectedStyle"
                class="style-radio-input"
              />
              <span class="style-radio-label">{{ s.label }}</span>
            </label>
          </div>
          <div class="regenerate-action">
            <select v-model="selectedProfileId" class="input profile-select">
              <option v-for="p in sortedProfiles" :key="p.id" :value="p.id">
                {{ p.provider }} / {{ p.model }}
              </option>
            </select>
            <div class="regenerate-buttons">
              <button
                class="btn btn-regenerate"
                :disabled="regenerating || !originalSystemPrompt"
                @click="handleRegenerate"
              >
                {{ regenerating ? '生成中...' : '生成' }}
              </button>
              <button
                class="btn btn-reset"
                :disabled="form.systemPrompt === originalSystemPrompt"
                @click="handleResetPrompt"
              >
                重置
              </button>
            </div>
          </div>
        </div>

        <textarea
          v-model="form.systemPrompt"
          class="input textarea"
          placeholder="请输入角色的人物设定，包括性格特点、背景故事、说话风格等..."
          rows="10"
          maxlength="5000"
        ></textarea>
      </div>
    </div>

    <!-- 标签 Tab -->
    <div v-show="activeTab === 'tags'" class="tab-panel">
      <div class="tab-panel-header">
        <p class="tab-desc">为角色添加标签，方便分类和检索</p>
      </div>
      <TagSelector
        v-model="form.tagIds"
        :tags="globalCharsStore.tags"
        :show-add-tag="true"
        @create-tag="handleCreateTag"
      />

      <!-- 已选标签预览 -->
      <div v-if="form.tagIds.length > 0" class="selected-tags-preview">
        <div class="preview-header">已选标签 ({{ form.tagIds.length }})</div>
        <div class="preview-tags">
          <span
            v-for="tag in selectedTags"
            :key="tag.id"
            class="preview-tag"
            :style="{ '--tag-color': tag.color }"
          >
            {{ tag.name }}
          </span>
        </div>
      </div>
    </div>

    <!-- 记忆 Tab -->
    <div v-if="isEditing" v-show="activeTab === 'memory'" class="tab-panel">
      <div class="tab-panel-header">
        <p class="tab-desc">管理角色的记忆，AI 对话时会参考这些记忆内容</p>
      </div>

      <div class="memory-panel">
        <div v-if="memories.length > 0" class="memory-list">
          <div
            v-for="mem in memories"
            :key="mem.id"
            class="memory-item"
          >
            <span class="memory-source" :class="mem.source">
              {{ mem.source === 'manual' ? '手动' : '自动' }}
            </span>
            <span class="memory-content">{{ mem.content }}</span>
            <button class="btn-delete-memory" @click="deleteMemory(mem.id)" title="删除">×</button>
          </div>
        </div>
        <div v-else class="memory-empty">
          <span class="empty-icon">📝</span>
          <p>暂无记忆</p>
          <p class="empty-hint">添加记忆可以让角色更了解自己的经历和背景</p>
        </div>
        <div class="memory-add">
          <input
            v-model="newMemoryContent"
            class="input memory-input"
            placeholder="输入记忆内容..."
            @keyup.enter="addMemory"
          />
          <button class="btn btn-primary btn-sm" @click="addMemory" :disabled="!newMemoryContent.trim()">
            添加
          </button>
        </div>
      </div>
    </div>

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">
        取消
      </button>
      <button
        v-if="isEditing"
        class="btn btn-outline"
        :disabled="syncing"
        @click="handleSync"
      >
        {{ syncing ? '同步中...' : '同步到群组' }}
      </button>
      <button
        class="btn btn-primary"
        :disabled="!isFormValid || saving"
        @click="handleSave"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted, toRaw } from 'vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useMemoryStore } from '../../stores/memory.js'
import { useToastStore } from '../../stores/toast'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useDialog } from '../../composables/useDialog'
import TagSelector from '../common/TagSelector.vue'
import BaseDialog from '../common/BaseDialog.vue'

const props = defineProps({
  character: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const globalCharsStore = useGlobalCharactersStore()
const memoryStore = useMemoryStore()
const llmProfilesStore = useLLMProfilesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const isEditing = computed(() => !!props.character)
const activeTab = ref('basic')

const form = ref({
  name: '',
  gender: '',
  age: null,
  systemPrompt: '',
  tagIds: []
})

const saving = ref(false)
const syncing = ref(false)
const regenerating = ref(false)
const selectedStyle = ref('daily')
const selectedProfileId = ref('')
const originalSystemPrompt = ref('')

const sortedProfiles = computed(() =>
  [...llmProfilesStore.profiles].sort((a, b) => a.model.localeCompare(b.model))
)
const newMemoryContent = ref('')

const promptStyles = [
  { value: 'daily', label: '日常' },
  { value: 'professional', label: '专业' },
  { value: 'literary', label: '文学' },
  { value: 'humorous', label: '搞笑' },
  { value: 'chuunibyou', label: '中二' },
  { value: 'artsy', label: '文艺' },
  { value: 'dramatic', label: '戏剧' },
  { value: 'concise', label: '简洁' },
  { value: 'detailed', label: '详细' }
]

const isOverLimit = computed(() => form.value.systemPrompt.length > 5000)

const selectedTags = computed(() => {
  return globalCharsStore.tags.filter(t => form.value.tagIds.includes(t.id))
})

const memories = computed(() => {
  if (!isEditing.value || !props.character) return []
  return memoryStore.getMemories(props.character.name)
})

const visibleTabs = computed(() => {
  const tabs = [
    { key: 'basic', icon: '👤', label: '基本信息' },
    { key: 'tags', icon: '🏷️', label: '标签', badge: form.value.tagIds.length || undefined }
  ]
  if (isEditing.value) {
    tabs.push({ key: 'memory', icon: '📝', label: '记忆', badge: memories.value.length || undefined })
  }
  return tabs
})

const isFormValid = computed(() => {
  return (
    form.value.name.trim() &&
    form.value.systemPrompt.trim() &&
    !isOverLimit.value
  )
})

// 检测表单是否有修改
const isDirty = computed(() => {
  if (!props.character) return false
  return (
    form.value.name.trim() !== (props.character.name || '') ||
    form.value.systemPrompt.trim() !== (props.character.system_prompt || '') ||
    form.value.gender !== (props.character.gender || '') ||
    form.value.age !== (props.character.age || null) ||
    JSON.stringify(form.value.tagIds) !== JSON.stringify(
      props.character.tags ? props.character.tags.map(t => t.id) : []
    )
  )
})

async function addMemory() {
  if (!newMemoryContent.value.trim() || !props.character) return
  try {
    await memoryStore.addMemory({
      characterName: props.character.name,
      content: newMemoryContent.value.trim(),
      source: 'manual'
    })
    newMemoryContent.value = ''
  } catch (error) {
    toast.error('添加记忆失败：' + error.message)
  }
}

async function deleteMemory(memoryId) {
  if (!props.character) return
  try {
    await memoryStore.deleteMemory(memoryId, props.character.name)
  } catch (error) {
    toast.error('删除记忆失败：' + error.message)
  }
}

onMounted(async () => {
  await globalCharsStore.loadTags()
  await llmProfilesStore.loadProfiles()

  if (sortedProfiles.value.length > 0 && !selectedProfileId.value) {
    selectedProfileId.value = sortedProfiles.value[0].id
  }

  if (props.character) {
    form.value = {
      name: props.character.name || '',
      gender: props.character.gender || '',
      age: props.character.age || null,
      systemPrompt: props.character.system_prompt || '',
      tagIds: props.character.tags ? props.character.tags.map(t => t.id) : []
    }
    originalSystemPrompt.value = form.value.systemPrompt
    await memoryStore.loadMemories(props.character.name)
  }
})

async function handleCreateTag(data) {
  try {
    await globalCharsStore.createTag(data)
  } catch (error) {
    toast.error('创建标签失败：' + error.message)
  }
}

async function handleSave() {
  if (!isFormValid.value || saving.value) return

  saving.value = true

  try {
    const data = {
      name: form.value.name.trim(),
      gender: form.value.gender || null,
      age: form.value.age || null,
      systemPrompt: form.value.systemPrompt.trim(),
      tagIds: toRaw(form.value.tagIds)
    }

    if (isEditing.value) {
      await globalCharsStore.updateCharacter(props.character.id, data)
    } else {
      await globalCharsStore.createCharacter(data)
    }

    emit('saved')
  } catch (error) {
    toast.error('保存失败：' + error.message)
  } finally {
    saving.value = false
  }
}

async function handleSync() {
  if (syncing.value || !props.character) return

  const confirmed = await confirm({
    title: '同步到群组',
    message: '确定将该角色的最新设定同步到所有关联群组吗？群组中的角色名称和人物设定将被覆盖。',
    confirmText: '确定同步',
    cancelText: '取消'
  })
  if (!confirmed) return

  syncing.value = true
  try {
    // 如果有修改，先自动保存
    if (isDirty.value) {
      if (!isFormValid.value) {
        toast.error('表单验证未通过，无法保存')
        return
      }
      const data = {
        name: form.value.name.trim(),
        gender: form.value.gender || null,
        age: form.value.age || null,
        systemPrompt: form.value.systemPrompt.trim(),
        tagIds: toRaw(form.value.tagIds)
      }
      await globalCharsStore.updateCharacter(props.character.id, data)
      emit('saved')
    }

    // 同步到所有关联群组
    const result = await globalCharsStore.syncToAllGroups(props.character.id)
    if (result.count === 0) {
      toast.info('该角色尚未导入到任何群组')
    } else {
      const names = result.groups.map(g => g.groupName).join('、')
      toast.success(`已同步到 ${result.count} 个群组：${names}`)
    }
  } catch (error) {
    toast.error('同步失败：' + error.message)
  } finally {
    syncing.value = false
  }
}

async function handleRegenerate() {
  if (regenerating.value || !props.character || !originalSystemPrompt.value) return

  const styleLabel = promptStyles.find(s => s.value === selectedStyle.value)?.label || selectedStyle.value

  regenerating.value = true
  try {
    const result = await window.electronAPI.globalCharacter.regeneratePrompt(
      props.character.id,
      selectedStyle.value,
      selectedProfileId.value,
      originalSystemPrompt.value
    )

    if (result.success) {
      form.value.systemPrompt = result.data.systemPrompt
    } else {
      toast.error('生成失败：' + result.error)
    }
  } catch (error) {
    toast.error('生成失败：' + error.message)
  } finally {
    regenerating.value = false
  }
}

function handleResetPrompt() {
  form.value.systemPrompt = originalSystemPrompt.value
}
</script>

<style lang="scss" scoped>
// ============ Dialog body padding override ============
:deep(.dialog-body) {
  padding: 0;
}

// ============ Tab 导航 ============
.tab-nav {
  display: flex;
  padding: 0 $spacing-xl;
  border-bottom: 1px solid $border-color;
  background: $bg-primary;
  gap: 0;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-md $spacing-lg;
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: $font-size-sm;
  color: $text-secondary;
  position: relative;
  transition: color 0.2s;
  white-space: nowrap;

  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: $spacing-md;
    right: $spacing-md;
    height: 2px;
    background: transparent;
    border-radius: 1px;
    transition: background 0.2s;
  }

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: $color-primary;
    font-weight: $font-weight-medium;

    &::after {
      background: $color-primary;
    }
  }

  .tab-icon {
    font-size: 14px;
  }

  .tab-badge {
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: $font-weight-medium;
    line-height: 16px;
    text-align: center;
    background: $bg-tertiary;
    color: $text-secondary;
  }

  &.active .tab-badge {
    background: rgba($color-primary, 0.1);
    color: $color-primary;
  }
}

// ============ Tab 面板 ============
.tab-panel {
  padding: $spacing-lg $spacing-xl;
}

.tab-panel-header {
  margin-bottom: $spacing-lg;

  .tab-desc {
    font-size: $font-size-sm;
    color: $text-secondary;
    line-height: 1.5;
  }
}

// ============ 表单样式 ============
.form-group {
  margin-bottom: $spacing-lg;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: $spacing-lg;
  margin-bottom: $spacing-lg;

  .form-group {
    margin-bottom: 0;
  }
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  margin-bottom: $spacing-sm;
  color: $text-primary;

  &.required::after {
    content: ' *';
    color: $color-danger;
  }
}

.label-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-sm;

  .form-label {
    margin-bottom: 0;
  }
}

.char-count {
  font-size: $font-size-xs;
  color: $text-placeholder;
  transition: color 0.2s;

  &.over-limit {
    color: $color-danger;
    font-weight: $font-weight-medium;
  }
}

.input {
  width: 100%;
  padding: $spacing-md;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  transition: border-color 0.2s;

  &:focus {
    outline: none;
    border-color: $wechat-green;
  }

  &::placeholder {
    color: $text-placeholder;
  }
}

.textarea {
  resize: vertical;
  min-height: 160px;
  font-family: inherit;
  line-height: 1.6;
}

// ============ 重新生成设定 ============
.regenerate-bar {
  display: flex;
  align-items: center;
  gap: $spacing-md;
  margin-bottom: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  background: $bg-secondary;
  border-radius: $border-radius-md;
  flex-wrap: wrap;
}

.regenerate-action {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: $spacing-xs;
}

.regenerate-buttons {
  display: flex;
  gap: $spacing-xs;
  justify-content: flex-end;
}

.profile-select {
  width: 100%;
  min-width: 160px;
  padding: 3px 8px;
  font-size: $font-size-xs;
  height: auto;
  cursor: pointer;
}

.style-options {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  flex: 1;
}

.style-radio {
  cursor: pointer;
}

.style-radio-input {
  display: none;
}

.style-radio-label {
  display: inline-block;
  padding: 2px 10px;
  font-size: $font-size-xs;
  color: $text-secondary;
  border-radius: 10px;
  border: 1px solid transparent;
  transition: all 0.15s;

  &:hover {
    color: $text-primary;
    background: rgba(0, 0, 0, 0.04);
  }
}

.style-radio.active .style-radio-label {
  color: $wechat-green;
  background: rgba($wechat-green, 0.1);
  border-color: rgba($wechat-green, 0.3);
}

.btn-regenerate {
  flex-shrink: 0;
  padding: 4px 14px;
  font-size: $font-size-xs;
  color: $wechat-green;
  background: rgba($wechat-green, 0.1);
  border: 1px solid rgba($wechat-green, 0.3);
  border-radius: $border-radius-sm;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &:hover:not(:disabled) {
    background: rgba($wechat-green, 0.18);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-reset {
  flex-shrink: 0;
  padding: 4px 14px;
  font-size: $font-size-xs;
  color: $text-secondary;
  background: transparent;
  border: 1px solid $border-color;
  border-radius: $border-radius-sm;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;

  &:hover {
    color: $text-primary;
    border-color: $text-secondary;
  }
}

// ============ 已选标签预览 ============
.selected-tags-preview {
  margin-top: $spacing-xl;
  padding-top: $spacing-lg;
  border-top: 1px dashed $border-color;

  .preview-header {
    font-size: $font-size-xs;
    color: $text-secondary;
    margin-bottom: $spacing-sm;
    font-weight: $font-weight-medium;
  }

  .preview-tags {
    display: flex;
    flex-wrap: wrap;
    gap: $spacing-xs;
  }

  .preview-tag {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: $font-size-xs;
    background: var(--tag-color);
    color: white;
  }
}

// ============ 记忆管理 ============
.memory-panel {
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  overflow: hidden;
}

.memory-list {
  max-height: 300px;
  overflow-y: auto;
}

.memory-item {
  display: flex;
  align-items: flex-start;
  gap: $spacing-sm;
  padding: $spacing-md $spacing-lg;
  font-size: $font-size-sm;
  line-height: 1.5;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);
  transition: background 0.15s;

  &:hover {
    background: rgba(0, 0, 0, 0.02);
  }

  &:last-child {
    border-bottom: none;
  }
}

.memory-source {
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 10px;
  font-weight: $font-weight-medium;
  margin-top: 2px;

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
  color: $text-primary;
}

.btn-delete-memory {
  flex-shrink: 0;
  background: none;
  border: none;
  color: $text-secondary;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: 0;
  padding: 2px 4px;
  transition: opacity 0.15s, color 0.15s;

  .memory-item:hover & {
    opacity: 0.5;
  }

  &:hover {
    opacity: 1 !important;
    color: #e53935;
  }
}

.memory-empty {
  padding: $spacing-xxl $spacing-lg;
  text-align: center;
  color: $text-secondary;

  .empty-icon {
    font-size: 32px;
    display: block;
    margin-bottom: $spacing-md;
    opacity: 0.5;
  }

  p {
    font-size: $font-size-sm;
    margin-bottom: $spacing-xs;
  }

  .empty-hint {
    font-size: $font-size-xs;
    color: $text-placeholder;
  }
}

.memory-add {
  display: flex;
  gap: $spacing-sm;
  padding: $spacing-sm $spacing-md;
  border-top: 1px solid $border-color;
  background: $bg-secondary;

  .input {
    padding: $spacing-sm $spacing-md;
    font-size: $font-size-sm;
  }

  .btn-sm {
    white-space: nowrap;
    padding: $spacing-sm $spacing-md;
  }
}

// ============ 底部按钮 ============
.btn-outline {
  background: transparent;
  border: 1px solid $color-primary;
  color: $color-primary;
  padding: $spacing-sm $spacing-lg;
  border-radius: $border-radius-md;
  cursor: pointer;
  font-size: $font-size-sm;
  transition: background 0.2s, opacity 0.2s;

  &:hover:not(:disabled) {
    background: rgba($color-primary, 0.08);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}
</style>
