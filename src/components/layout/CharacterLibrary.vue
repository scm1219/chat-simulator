<template>
  <div class="character-library">
    <div class="library-header">
      <h3>角色库</h3>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
          + 新建
        </button>
      </div>
    </div>

    <!-- 搜索框 -->
    <div class="search-box">
      <input
        v-model="searchKeyword"
        type="text"
        class="input search-input"
        placeholder="搜索角色..."
        @input="handleSearch"
      />
    </div>

    <!-- 角色列表 -->
    <div class="character-list">
      <div v-if="globalCharsStore.loading" class="loading-state">
        加载中...
      </div>

      <template v-else-if="displayCharacters.length > 0">
        <div
          v-for="character in displayCharacters"
          :key="character.id"
          class="character-card"
        >
          <div class="char-info">
            <div class="char-name">{{ character.name }}</div>
            <div class="char-meta">
              <span v-if="character.gender" class="char-gender">
                {{ getGenderLabel(character.gender) }}
              </span>
              <span v-if="character.age" class="char-age">
                {{ character.age }}岁
              </span>
            </div>
            <div class="char-prompt-preview">
              {{ truncateText(character.system_prompt, 50) }}
            </div>
          </div>

          <div class="char-actions">
            <button
              v-if="groupsStore.currentGroupId && !isCharacterInGroup(character.name)"
              class="btn-icon btn-action btn-import"
              @click="handleImport(character)"
              title="导入到当前群组"
            >
              📥
            </button>
            <button
              class="btn-icon btn-action"
              @click="handleEdit(character)"
              title="编辑"
            >
              ✏️
            </button>
            <button
              class="btn-icon btn-action btn-danger"
              @click="handleDelete(character)"
              title="删除"
            >
              🗑️
            </button>
          </div>
        </div>
      </template>

      <div v-else class="empty-state">
        <p>{{ searchKeyword ? '未找到匹配的角色' : '角色库为空' }}</p>
        <p v-if="!searchKeyword" class="hint">点击右上角"新建"添加角色</p>
      </div>
    </div>

    <!-- 创建/编辑角色对话框 -->
    <GlobalCharacterDialog
      v-if="showCreateDialog || editingCharacter"
      :character="editingCharacter"
      @close="closeDialog"
      @saved="handleSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import GlobalCharacterDialog from '../config/GlobalCharacterDialog.vue'

const globalCharsStore = useGlobalCharactersStore()
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()

const searchKeyword = ref('')
const showCreateDialog = ref(false)
const editingCharacter = ref(null)

// 显示的角色列表
const displayCharacters = computed(() => {
  if (searchKeyword.value.trim()) {
    return globalCharsStore.filteredCharacters
  }
  return globalCharsStore.characters
})

// 性别标签
function getGenderLabel(gender) {
  const labels = {
    male: '男',
    female: '女',
    other: '其他'
  }
  return labels[gender] || ''
}

// 截断文本
function truncateText(text, maxLength) {
  if (!text) return ''
  return text.length > maxLength ? text.slice(0, maxLength) + '...' : text
}

// 检查角色是否已在当前群组中（通过名称匹配）
function isCharacterInGroup(characterName) {
  return charactersStore.characters.some(c => c.name === characterName)
}

// 搜索
function handleSearch() {
  globalCharsStore.searchKeyword = searchKeyword.value
}

// 导入到群组
async function handleImport(character) {
  if (!groupsStore.currentGroupId) {
    alert('请先选择一个群组')
    return
  }

  const confirmed = confirm(`确定要将"${character.name}"导入到当前群组吗？`)
  if (!confirmed) return

  try {
    const newChar = await globalCharsStore.importToGroup(
      character.id,
      groupsStore.currentGroupId
    )
    // 刷新群组角色列表
    await charactersStore.loadCharacters(groupsStore.currentGroupId)
    alert(`角色"${character.name}"已成功导入`)
  } catch (error) {
    alert('导入失败：' + error.message)
  }
}

// 编辑
function handleEdit(character) {
  editingCharacter.value = { ...character }
}

// 删除
async function handleDelete(character) {
  const confirmed = confirm(`确定要删除角色"${character.name}"吗？此操作不可撤销！`)
  if (!confirmed) return

  try {
    await globalCharsStore.deleteCharacter(character.id)
  } catch (error) {
    alert('删除失败：' + error.message)
  }
}

// 关闭对话框
function closeDialog() {
  showCreateDialog.value = false
  editingCharacter.value = null
}

// 保存成功
function handleSaved() {
  closeDialog()
}

onMounted(() => {
  globalCharsStore.loadCharacters()
})
</script>

<style lang="scss" scoped>
.character-library {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.library-header {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }
}

.header-actions {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
}

.search-box {
  padding: $spacing-md $spacing-lg;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.search-input {
  width: 100%;
}

.character-list {
  flex: 1;
  overflow-y: auto;
}

.loading-state {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-secondary;
}

.character-card {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: $spacing-md;
  cursor: default;
  transition: background 0.2s;

  &:hover {
    background: $bg-secondary;
  }
}

.char-info {
  flex: 1;
  min-width: 0;
}

.char-name {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-meta {
  font-size: $font-size-sm;
  color: $text-secondary;
  margin-bottom: 4px;

  .char-gender,
  .char-age {
    &:not(:last-child)::after {
      content: ' · ';
      color: $text-placeholder;
    }
  }
}

.char-prompt-preview {
  font-size: $font-size-xs;
  color: $text-placeholder;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.char-actions {
  display: flex;
  gap: $spacing-xs;
  flex-shrink: 0;
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 14px;
  transition: background 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(0, 0, 0, 0.1);
  }
}

.btn-action {
  width: 28px;
  height: 28px;
  font-size: 13px;

  &.btn-import:hover {
    background: rgba(7, 193, 96, 0.2);
  }

  &.btn-danger:hover {
    background: rgba(255, 59, 48, 0.2);
  }
}

.empty-state {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-secondary;

  .hint {
    font-size: $font-size-sm;
    margin-top: $spacing-sm;
  }
}
</style>
