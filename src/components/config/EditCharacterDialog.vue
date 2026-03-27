<template>
  <div class="dialog-overlay">
    <div class="dialog">
      <div class="dialog-header">
        <h3>编辑角色</h3>
        <button class="close-btn" @click="$emit('close')">×</button>
      </div>

      <div class="dialog-body">
        <div class="form-group">
          <label>角色名称</label>
          <input v-model="form.name" class="input" placeholder="例如：诸葛亮" />
        </div>

        <div class="form-group">
          <label>角色设定</label>
          <textarea
            v-model="form.systemPrompt"
            class="textarea"
            rows="8"
            placeholder="描述角色的性格、背景、说话方式等..."
          />
          <div class="hint">
            <template v-if="character.is_user === 1">
              提示：这是你在聊天中的身份设定，AI 会根据这个设定来理解你
            </template>
            <template v-else>
              提示：设定越详细，角色的回复越符合预期
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
import { ref, computed, onMounted } from 'vue'
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

const form = ref({
  name: '',
  systemPrompt: ''
})

const canSave = computed(() => {
  return form.value.name.trim().length > 0 && form.value.systemPrompt.trim().length > 0
})

onMounted(() => {
  // 初始化表单数据
  form.value.name = props.character.name
  form.value.systemPrompt = props.character.system_prompt
})

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
  max-width: 500px;
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

.form-group {
  margin-bottom: $spacing-lg;

  label {
    display: block;
    margin-bottom: $spacing-sm;
    font-size: $font-size-sm;
    color: $text-secondary;
  }

  .textarea {
    width: 100%;
  }

  .hint {
    font-size: $font-size-xs;
    color: $text-placeholder;
    margin-top: $spacing-xs;
  }
}

.dialog-footer {
  padding: $spacing-lg $spacing-xl;
  border-top: 1px solid $border-color;
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
}
</style>
