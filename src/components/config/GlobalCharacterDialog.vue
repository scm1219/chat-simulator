<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <h3>{{ isEditing ? '编辑角色' : '新建角色' }}</h3>
        <button class="btn-close" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
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
          <label class="form-label required">人物设定</label>
          <textarea
            v-model="form.systemPrompt"
            class="input textarea"
            placeholder="请输入角色的人物设定，包括性格特点、背景故事、说话风格等..."
            rows="8"
            maxlength="5000"
          ></textarea>
          <div class="form-hint">
            {{ form.systemPrompt.length }}/5000
          </div>
        </div>

        <!-- 标签选择 -->
        <div class="form-group">
          <label class="form-label">标签</label>
          <TagSelector
            v-model="form.tagIds"
            :tags="globalCharsStore.tags"
            :show-add-tag="true"
            @create-tag="handleCreateTag"
          />
        </div>

        <!-- 记忆管理（仅编辑模式） -->
        <div v-if="isEditing" class="form-group">
          <label class="form-label">记忆 ({{ memories.length }})</label>
          <div class="memory-panel">
            <div v-if="memories.length > 0" class="memory-list">
              <div
                v-for="mem in memories"
                :key="mem.id"
                class="memory-item"
              >
                <span class="memory-source" :class="mem.source">{{ mem.source === 'manual' ? '手动' : '自动' }}</span>
                <span class="memory-content">{{ mem.content }}</span>
                <button class="btn-delete-memory" @click="deleteMemory(mem.id)" title="删除">×</button>
              </div>
            </div>
            <div v-else class="memory-empty">暂无记忆</div>
            <div class="memory-add">
              <input
                v-model="newMemoryContent"
                class="input memory-input"
                placeholder="添加新记忆..."
                @keyup.enter="addMemory"
              />
              <button class="btn btn-sm btn-memory-add" @click="addMemory" :disabled="!newMemoryContent.trim()">添加</button>
            </div>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">
          取消
        </button>
        <button
          class="btn btn-primary"
          :disabled="!isFormValid || saving"
          @click="handleSave"
        >
          {{ saving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, toRaw } from 'vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useMemoryStore } from '../../stores/memory.js'
import { useToastStore } from '../../stores/toast'
import TagSelector from '../common/TagSelector.vue'

const props = defineProps({
  character: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['close', 'saved'])

const globalCharsStore = useGlobalCharactersStore()
const memoryStore = useMemoryStore()
const toast = useToastStore()

const isEditing = computed(() => !!props.character)

const form = ref({
  name: '',
  gender: '',
  age: null,
  systemPrompt: '',
  tagIds: []
})

const saving = ref(false)
const newMemoryContent = ref('')

const memories = computed(() => {
  if (!isEditing.value || !props.character) return []
  return memoryStore.getMemories(props.character.name)
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

const isFormValid = computed(() => {
  return (
    form.value.name.trim() &&
    form.value.systemPrompt.trim()
  )
})

// 初始化表单
onMounted(async () => {
  // 加载标签
  await globalCharsStore.loadTags()

  if (props.character) {
    form.value = {
      name: props.character.name || '',
      gender: props.character.gender || '',
      age: props.character.age || null,
      systemPrompt: props.character.system_prompt || '',
      tagIds: props.character.tags ? props.character.tags.map(t => t.id) : []
    }
    // 加载角色记忆
    await memoryStore.loadMemories(props.character.name)
  }
})

// 创建标签
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
</script>

<style lang="scss" scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 480px;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
}

.dialog-header {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }
}

.btn-close {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  font-size: 24px;
  color: $text-secondary;
  cursor: pointer;
  border-radius: $border-radius-sm;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: $bg-secondary;
  }
}

.dialog-body {
  padding: $spacing-lg;
  overflow-y: auto;
  flex: 1;
}

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
  min-height: 120px;
  font-family: inherit;
  line-height: 1.6;
}

.form-hint {
  font-size: $font-size-xs;
  color: $text-placeholder;
  text-align: right;
  margin-top: $spacing-xs;
}

.dialog-footer {
  padding: $spacing-lg;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}

// 记忆管理
.memory-panel {
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  overflow: hidden;
}

.memory-list {
  max-height: 200px;
  overflow-y: auto;
}

.memory-item {
  display: flex;
  align-items: flex-start;
  gap: $spacing-xs;
  padding: 6px 10px;
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
  font-size: 10px;
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
  font-size: 14px;
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
  color: $text-placeholder;
  font-size: $font-size-sm;
}

.memory-add {
  display: flex;
  gap: $spacing-sm;
  padding: $spacing-sm;
  border-top: 1px solid $border-color;
  background: $bg-secondary;
}

.memory-input {
  flex: 1;
  padding: 4px 8px;
  font-size: $font-size-sm;
}

.btn-memory-add {
  flex-shrink: 0;
  padding: 4px 12px;
  font-size: $font-size-sm;
}
</style>
