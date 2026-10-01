<template>
  <BaseDialog :title="`${character?.name ?? ''} 的记忆`" max-width="480px" @close="$emit('close')">
    <div class="memory-dialog-body">
      <div class="memory-dialog-list">
        <div
          v-for="mem in memories"
          :key="mem.id"
          class="memory-item"
        >
          <span class="memory-source" :class="mem.source">{{ mem.source === 'manual' ? '手动' : '自动' }}</span>
          <span class="memory-content">{{ mem.content }}</span>
          <button class="btn-delete-memory" @click="deleteMemory(mem.id)" title="删除">×</button>
        </div>
        <div v-if="memories.length === 0" class="memory-empty">
          暂无记忆
        </div>
      </div>
      <div class="memory-add">
        <input
          v-model="newMemory"
          type="text"
          class="memory-input"
          placeholder="添加新记忆..."
          @keyup.enter="addMemory"
        />
        <button class="btn btn-primary btn-sm" @click="addMemory" :disabled="!newMemory?.trim()">
          添加
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import BaseDialog from '../common/BaseDialog.vue'
import { useMemoryStore } from '../../stores/memory.js'
import { useToastStore } from '../../stores/toast'

const props = defineProps({
  character: { type: Object, required: true }
})

defineEmits(['close'])

const memoryStore = useMemoryStore()
const toast = useToastStore()
const newMemory = ref('')

const memories = computed(() => memoryStore.getMemories(props.character?.name))

onMounted(() => {
  memoryStore.loadMemories(props.character.name)
})

async function addMemory() {
  const content = newMemory.value?.trim()
  if (!content) return
  try {
    await memoryStore.addMemory({
      characterName: props.character.name,
      content
    })
    newMemory.value = ''
  } catch (error) {
    toast.error('添加记忆失败: ' + error.message)
  }
}

async function deleteMemory(memoryId) {
  try {
    await memoryStore.deleteMemory(memoryId, props.character.name)
  } catch (error) {
    toast.error('删除记忆失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.memory-dialog-body {
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
</style>
