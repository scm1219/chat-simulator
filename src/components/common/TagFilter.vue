<template>
  <div class="tag-filter">
    <div class="filter-header">
      <span class="filter-title">标签筛选</span>
      <span v-if="selectedTagIds.length > 0" class="clear-btn" @click="clearFilter">
        清除 ({{ selectedTagIds.length }})
      </span>
    </div>
    <div class="tag-list">
      <span
        v-for="tag in tags"
        :key="tag.id"
        class="tag-item"
        :class="{ selected: selectedTagIds.includes(tag.id) }"
        :style="{ '--tag-color': tag.color }"
        @click="toggleFilter(tag.id)"
      >
        {{ tag.name }}
      </span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  tags: {
    type: Array,
    default: () => []
  },
  modelValue: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:modelValue', 'clear'])

const selectedTagIds = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

function toggleFilter(tagId) {
  const current = [...selectedTagIds.value]
  const index = current.indexOf(tagId)
  if (index === -1) {
    current.push(tagId)
  } else {
    current.splice(index, 1)
  }
  selectedTagIds.value = current
}

function clearFilter() {
  selectedTagIds.value = []
  emit('clear')
}
</script>

<style lang="scss" scoped>
.tag-filter {
  padding: 12px;
  background: #fafafa;
  border-radius: 8px;
  margin-bottom: 12px;

  .filter-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .filter-title {
    font-size: 12px;
    color: #999;
    font-weight: 500;
  }

  .clear-btn {
    font-size: 12px;
    color: #07c160;
    cursor: pointer;

    &:hover {
      color: #06ad56;
    }
  }

  .tag-list {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .tag-item {
    display: inline-flex;
    align-items: center;
    padding: 3px 10px;
    border-radius: 10px;
    font-size: 11px;
    cursor: pointer;
    background: #fff;
    color: #666;
    border: 1px solid #e0e0e0;
    transition: all 0.2s ease;

    &:hover {
      border-color: var(--tag-color);
    }

    &.selected {
      background: var(--tag-color);
      color: white;
      border-color: var(--tag-color);
    }
  }
}
</style>
