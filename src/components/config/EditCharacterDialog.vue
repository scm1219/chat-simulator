<template>
  <div class="dialog-overlay" @click.self="$emit('close')">
    <div class="dialog">
      <div class="dialog-header">
        <div class="header-left">
          <h3>编辑角色</h3>
          <span v-if="character.is_user === 1" class="type-badge type-user">用户角色</span>
          <span v-else class="type-badge type-ai">AI 角色</span>
        </div>
        <button class="close-btn" @click="$emit('close')">&times;</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>角色名称</label>
          <input v-model="form.name" class="input" placeholder="例如：诸葛亮" />
        </div>

        <div class="form-group">
          <div class="label-row">
            <label>角色设定</label>
            <span class="char-count" :class="{ 'over-limit': isOverLimit }">
              {{ charCount }} / {{ maxChars }}
            </span>
          </div>
          <textarea
            ref="textareaRef"
            v-model="form.systemPrompt"
            class="textarea auto-resize"
            :placeholder="placeholderText"
            @input="autoResize"
          />
          <div class="hint">
            <template v-if="character.is_user === 1">
              这是你在聊天中的身份设定，AI 会根据这个设定来理解你
            </template>
            <template v-else>
              设定越详细，角色的回复越符合预期。支持描述性格、背景、说话方式、口头禅等
            </template>
          </div>
        </div>
      </div>

      <div class="dialog-footer">
        <button class="btn btn-secondary" @click="$emit('close')">取消</button>
        <button class="btn btn-primary" @click="handleSave" :disabled="!canSave">
          保存
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCharactersStore } from '../../stores/characters.js'
import { useToastStore } from '../../stores/toast'

const props = defineProps({
  character: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['close', 'saved'])

const charactersStore = useCharactersStore()
const toast = useToastStore()
const textareaRef = ref(null)

const maxChars = 2000

const form = ref({
  name: '',
  systemPrompt: ''
})

const charCount = computed(() => form.value.systemPrompt.length)
const isOverLimit = computed(() => charCount.value > maxChars)

const canSave = computed(() => {
  return form.value.name.trim().length > 0
    && form.value.systemPrompt.trim().length > 0
    && !isOverLimit.value
})

const placeholderText = computed(() => {
  return props.character.is_user === 1
    ? '描述你在这个群聊中的身份和性格...'
    : '描述角色的性格、背景、说话方式、口头禅等...'
})

onMounted(() => {
  form.value.name = props.character.name || ''
  form.value.systemPrompt = props.character.system_prompt || ''
  nextTick(() => autoResize())
})

function autoResize() {
  const el = textareaRef.value
  if (!el) return
  el.style.height = 'auto'
  const minHeight = 120
  const maxHeight = 400
  el.style.height = Math.min(Math.max(el.scrollHeight, minHeight), maxHeight) + 'px'
}

async function handleSave() {
  if (!canSave.value) return

  try {
    await charactersStore.updateCharacter(props.character.id, {
      name: form.value.name,
      systemPrompt: form.value.systemPrompt
    })
    emit('saved')
  } catch (error) {
    toast.error('更新角色失败: ' + error.message)
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
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background: $bg-primary;
  border-radius: $border-radius-lg;
  width: 90%;
  max-width: 520px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: $shadow-lg;
}

.dialog-header {
  padding: $spacing-lg $spacing-xl;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  .header-left {
    display: flex;
    align-items: center;
    gap: $spacing-sm;
  }

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
    border-radius: $border-radius-sm;
    transition: background 0.2s;

    &:hover {
      background: $bg-secondary;
      color: $text-primary;
    }
  }
}

.type-badge {
  font-size: $font-size-xs;
  padding: 2px 8px;
  border-radius: 10px;
  font-weight: $font-weight-medium;
  line-height: 1.4;

  &.type-user {
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
  }

  &.type-ai {
    background: rgba($color-primary, 0.1);
    color: $color-primary;
  }
}

.dialog-body {
  padding: $spacing-xl;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}

.form-group {
  margin-bottom: $spacing-lg;

  &:last-child {
    margin-bottom: 0;
  }

  label {
    display: block;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
    font-weight: $font-weight-medium;
  }

  .label-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: $spacing-sm;

    label {
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

  .textarea {
    width: 100%;
    line-height: 1.6;
    font-size: $font-size-md;
  }

  .auto-resize {
    resize: vertical;
    min-height: 120px;
    overflow-y: auto;
  }

  .hint {
    font-size: $font-size-xs;
    color: $text-placeholder;
    margin-top: $spacing-sm;
    line-height: 1.5;
  }
}

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  flex-shrink: 0;
}
</style>
