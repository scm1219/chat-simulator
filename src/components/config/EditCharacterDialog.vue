<template>
  <BaseDialog title="编辑角色" @close="$emit('close')">
    <template #header-badges>
      <span v-if="character.is_user === 1" class="type-badge type-user">用户角色</span>
      <span v-else class="type-badge type-ai">AI 角色</span>
    </template>

    <FormGroup label="角色名称">
      <input v-model="form.name" class="input" placeholder="例如：诸葛亮" />
    </FormGroup>

    <FormGroup>
      <template #label-extra>
        <span class="char-count" :class="{ 'over-limit': isOverLimit }">
          {{ charCount }} / {{ maxChars }}
        </span>
      </template>
      <textarea
        ref="textareaRef"
        v-model="form.systemPrompt"
        class="textarea auto-resize"
        :placeholder="placeholderText"
        @input="autoResize"
      />
      <template #hint>
        <template v-if="character.is_user === 1">
          这是你在聊天中的身份设定，AI 会根据这个设定来理解你
        </template>
        <template v-else>
          设定越详细，角色的回复越符合预期。支持描述性格、背景、说话方式、口头禅等
        </template>
      </template>
    </FormGroup>

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">取消</button>
      <button class="btn btn-primary" @click="handleSave" :disabled="!canSave">保存</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import { useCharactersStore } from '../../stores/characters.js'
import { useToastStore } from '../../stores/toast'
import BaseDialog from '../common/BaseDialog.vue'
import FormGroup from '../common/FormGroup.vue'

const props = defineProps({
  character: { type: Object, required: true }
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
</style>
