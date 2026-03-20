<template>
  <div class="tag-selector">
    <div class="tag-list">
      <span
        v-for="tag in tags"
        :key="tag.id"
        class="tag-item"
        :class="{ selected: selectedTagIds.includes(tag.id), disabled }"
        :style="{ '--tag-color': tag.color }"
        @click="!disabled && toggleTag(tag.id)"
      >
        {{ tag.name }}
      </span>
    </div>

    <!-- 添加自定义标签 -->
    <div v-if="!disabled && showAddTag" class="add-tag-section">
      <div v-if="!isAddingTag" class="add-tag-btn" @click="startAddTag">
        + 添加标签
      </div>
      <div v-else class="add-tag-form">
        <input
          v-model="newTagName"
          type="text"
          class="tag-input"
          placeholder="标签名称"
          maxlength="20"
          @keyup.enter="confirmAddTag"
          @keyup.escape="cancelAddTag"
        />
        <div class="color-picker">
          <span
            v-for="color in presetColors"
            :key="color"
            class="color-option"
            :class="{ active: newTagColor === color }"
            :style="{ backgroundColor: color }"
            @click="newTagColor = color"
          />
        </div>
        <div class="add-tag-actions">
          <button class="btn-confirm" @click="confirmAddTag">确定</button>
          <button class="btn-cancel" @click="cancelAddTag">取消</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  tags: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: Array,
    default: () => []
  },
  disabled: {
    type: Boolean,
    default: false
  },
  showAddTag: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['update:modelValue', 'createTag'])

const selectedTagIds = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

const isAddingTag = ref(false)
const newTagName = ref('')
const newTagColor = ref('#07c160')

const presetColors = [
  '#07c160', '#4169e1', '#9932cc', '#8b4513', '#cd853f',
  '#ff69b4', '#00ced1', '#ffa500', '#dc143c', '#32cd32',
  '#6b7280', '#1f2937'
]

function toggleTag(tagId) {
  const current = [...selectedTagIds.value]
  const index = current.indexOf(tagId)
  if (index === -1) {
    current.push(tagId)
  } else {
    current.splice(index, 1)
  }
  selectedTagIds.value = current
}

function startAddTag() {
  isAddingTag.value = true
  newTagName.value = ''
  newTagColor.value = '#07c160'
}

function cancelAddTag() {
  isAddingTag.value = false
  newTagName.value = ''
}

async function confirmAddTag() {
  if (!newTagName.value.trim()) {
    return
  }

  emit('createTag', {
    name: newTagName.value.trim(),
    color: newTagColor.value
  })

  isAddingTag.value = false
  newTagName.value = ''
}
</script>

<style lang="scss" scoped>
.tag-selector {
  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tag-item {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 12px;
    cursor: pointer;
    background: #f0f0f0;
    color: #666;
    border: 1px solid transparent;
    transition: all 0.2s ease;

    &:hover:not(.disabled) {
      border-color: var(--tag-color);
    }

    &.selected {
      background: var(--tag-color);
      color: white;
      border-color: var(--tag-color);
    }

    &.disabled {
      cursor: not-allowed;
      opacity: 0.6;
    }
  }

  .add-tag-section {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px dashed #e0e0e0;
  }

  .add-tag-btn {
    font-size: 12px;
    color: #07c160;
    cursor: pointer;
    padding: 4px 0;

    &:hover {
      color: #06ad56;
    }
  }

  .add-tag-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tag-input {
    padding: 6px 10px;
    border: 1px solid #e0e0e0;
    border-radius: 4px;
    font-size: 12px;
    outline: none;

    &:focus {
      border-color: #07c160;
    }
  }

  .color-picker {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .color-option {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    cursor: pointer;
    border: 2px solid transparent;

    &:hover {
      transform: scale(1.1);
    }

    &.active {
      border-color: #333;
    }
  }

  .add-tag-actions {
    display: flex;
    gap: 8px;

    button {
      padding: 4px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      border: none;
    }

    .btn-confirm {
      background: #07c160;
      color: white;

      &:hover {
        background: #06ad56;
      }
    }

    .btn-cancel {
      background: #f0f0f0;
      color: #666;

      &:hover {
        background: #e0e0e0;
      }
    }
  }
}
</style>
