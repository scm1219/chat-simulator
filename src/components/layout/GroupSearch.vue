<template>
  <div class="group-search">
    <div class="search-input-wrapper">
      <span class="search-icon">🔍</span>
      <input
        ref="searchInput"
        v-model="keyword"
        type="text"
        class="search-input"
        placeholder="搜索聊天记录或角色..."
        @input="handleInput"
        @keydown.esc="clearSearch"
      />
      <button v-if="keyword" class="clear-btn" @click="clearSearch" title="清除搜索">✕</button>
    </div>

    <!-- 搜索结果 -->
    <div v-if="keyword.trim()" class="search-results">
      <div v-if="loading" class="search-loading">搜索中...</div>
      <div v-else-if="results.length === 0" class="search-empty">未找到相关结果</div>
      <div v-else class="search-result-list">
        <div
          v-for="item in results"
          :key="item.type + '-' + (item.messageId || item.characterId)"
          class="search-result-item"
          @click="handleResultClick(item)"
        >
          <!-- 消息结果 -->
          <template v-if="item.type === 'message'">
            <div class="result-header">
              <span class="result-group-name">{{ item.groupName }}</span>
              <span v-if="item.characterName" class="result-character">{{ item.characterName }}</span>
            </div>
            <div class="result-content" v-html="highlightKeyword(item.snippet)"></div>
          </template>

          <!-- 角色结果 -->
          <template v-else>
            <div class="result-header">
              <span class="result-group-name">{{ item.groupName }}</span>
              <span class="result-type-badge">角色</span>
            </div>
            <div class="result-content" v-html="highlightKeyword(item.characterName)"></div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const emit = defineEmits(['select-message', 'select-group'])

const keyword = ref('')
const results = ref([])
const loading = ref(false)
const searchInput = ref(null)
let debounceTimer = null

function handleInput() {
  clearTimeout(debounceTimer)
  const trimmed = keyword.value.trim()
  if (!trimmed) {
    results.value = []
    return
  }
  loading.value = true
  debounceTimer = setTimeout(async () => {
    try {
      const res = await window.electronAPI.search.global(trimmed)
      if (res.success) {
        results.value = res.data
      }
    } catch (err) {
      console.error('搜索失败:', err)
    } finally {
      loading.value = false
    }
  }, 300)
}

function clearSearch() {
  keyword.value = ''
  results.value = []
  clearTimeout(debounceTimer)
  searchInput.value?.focus()
}

/**
 * 高亮关键词，返回 HTML 字符串
 */
function highlightKeyword(text) {
  if (!text || !keyword.value.trim()) return text || ''
  const kw = keyword.value.trim()
  // 转义正则特殊字符
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`(${escaped})`, 'gi')
  return text.replace(regex, '<mark class="search-highlight">$1</mark>')
}

function handleResultClick(item) {
  if (item.type === 'message') {
    emit('select-message', {
      groupId: item.groupId,
      messageId: item.messageId
    })
  } else {
    emit('select-group', {
      groupId: item.groupId
    })
  }
  // 点击后清空搜索
  clearSearch()
}
</script>

<style lang="scss" scoped>
.group-search {
  position: relative;
  flex-shrink: 0;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  padding: $spacing-sm $spacing-lg;
  gap: $spacing-sm;
  background: $bg-primary;
  border-bottom: 1px solid $border-color;
}

.search-icon {
  font-size: 14px;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: $font-size-sm;
  background: transparent;
  color: $text-primary;
  padding: 4px 0;

  &::placeholder {
    color: $text-placeholder;
  }
}

.clear-btn {
  border: none;
  background: transparent;
  cursor: pointer;
  color: $text-secondary;
  font-size: 12px;
  padding: 2px 4px;
  border-radius: $border-radius-sm;
  flex-shrink: 0;

  &:hover {
    background: $bg-secondary;
    color: $text-primary;
  }
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  max-height: 400px;
  overflow-y: auto;
  background: $bg-primary;
  border: 1px solid $border-color;
  border-top: none;
  box-shadow: $shadow-md;
  z-index: 100;
}

.search-loading,
.search-empty {
  padding: $spacing-lg;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.search-result-item {
  padding: $spacing-md $spacing-lg;
  cursor: pointer;
  border-bottom: 1px solid $border-color-light;
  transition: background 0.15s;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: $bg-secondary;
  }
}

.result-header {
  display: flex;
  align-items: center;
  gap: $spacing-sm;
  margin-bottom: 4px;
}

.result-group-name {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-primary;
}

.result-character {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.result-type-badge {
  font-size: $font-size-xs;
  background: rgba($wechat-green, 0.1);
  color: $wechat-green;
  padding: 1px 6px;
  border-radius: $border-radius-sm;
}

.result-content {
  font-size: $font-size-xs;
  color: $text-secondary;
  line-height: 1.5;
  word-break: break-all;
}
</style>

<style lang="scss">
/* 全局样式：关键词高亮（不受 scoped 限制） */
mark.search-highlight {
  background: rgba(255, 214, 0, 0.4);
  color: inherit;
  padding: 0 1px;
  border-radius: 2px;
}
</style>
