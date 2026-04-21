<template>
  <BaseDialog title="添加角色" @close="$emit('close')">
    <FormGroup label="角色名称">
      <input v-model="form.name" class="input" placeholder="例如：诸葛亮" />
    </FormGroup>

    <FormGroup label="角色设定" hint="提示：设定越详细，角色的回复越符合预期">
      <textarea
        v-model="form.systemPrompt"
        class="input textarea"
        rows="6"
        placeholder="描述角色的性格、背景、说话方式等..."
      />
    </FormGroup>

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">取消</button>
      <button class="btn btn-primary" @click="handleCreate" :disabled="!canCreate">添加</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useCharactersStore } from '../../stores/characters.js'
import { useToastStore } from '../../stores/toast'
import BaseDialog from '../common/BaseDialog.vue'
import FormGroup from '../common/FormGroup.vue'

const props = defineProps({ groupId: { type: String, required: true } })
const emit = defineEmits(['close', 'created'])

const charactersStore = useCharactersStore()
const toast = useToastStore()

const form = ref({ name: '', systemPrompt: '' })

const canCreate = computed(() => {
  return form.value.name.trim().length > 0 && form.value.systemPrompt.trim().length > 0
})

async function handleCreate() {
  if (!canCreate.value) return
  try {
    await charactersStore.createCharacter({
      groupId: props.groupId,
      name: form.value.name,
      systemPrompt: form.value.systemPrompt
    })
    emit('created')
  } catch (error) {
    toast.error('创建角色失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.input {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  background: $bg-primary;
  color: $text-primary;
  transition: border-color 0.2s;

  &:focus { outline: none; border-color: $color-primary; }
  &::placeholder { color: $text-placeholder; }

  &.textarea {
    resize: vertical;
    min-height: 80px;
    font-family: inherit;
    line-height: 1.5;
  }
}
</style>
