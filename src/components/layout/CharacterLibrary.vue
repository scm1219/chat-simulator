<template>
  <div class="character-library">
    <div class="library-header">
      <h3>角色库</h3>
      <div class="header-actions">
        <button class="btn btn-gacha btn-sm" @click="showGachaDialog = true" title="AI 角色抽卡">
          🎲 抽卡
        </button>
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

    <!-- 标签筛选 -->
    <div class="filter-section">
      <TagFilter
        v-model="globalCharsStore.selectedTagIds"
        :tags="globalCharsStore.tags"
        @clear="globalCharsStore.clearTagFilter"
      />
    </div>

    <!-- 角色列表 -->
    <div class="character-list">
      <!-- 分页栏 -->
      <div v-if="totalPages > 1" class="pagination-bar">
        <button
          class="btn btn-page"
          :disabled="currentPage <= 1"
          @click="currentPage = 1"
          title="首页"
        >&laquo;</button>
        <button
          class="btn btn-page"
          :disabled="currentPage <= 1"
          @click="currentPage--"
          title="上一页"
        >&lsaquo;</button>
        <span class="page-info">{{ currentPage }} / {{ totalPages }} (共 {{ filteredAll.length }} 条)</span>
        <button
          class="btn btn-page"
          :disabled="currentPage >= totalPages"
          @click="currentPage++"
          title="下一页"
        >&rsaquo;</button>
        <button
          class="btn btn-page"
          :disabled="currentPage >= totalPages"
          @click="currentPage = totalPages"
          title="末页"
        >&raquo;</button>
      </div>

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
            <!-- 角色标签 -->
            <div v-if="character.tags && character.tags.length > 0" class="char-tags">
              <span
                v-for="tag in character.tags"
                :key="tag.id"
                class="char-tag"
                :style="{ backgroundColor: tag.color }"
              >
                {{ tag.name }}
              </span>
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
        <p>{{ hasFilter ? '未找到匹配的角色' : '角色库为空' }}</p>
        <p v-if="!hasFilter" class="hint">点击右上角"新建"添加角色</p>
      </div>
    </div>

    <!-- 创建/编辑角色对话框 -->
    <GlobalCharacterDialog
      v-if="showCreateDialog || editingCharacter"
      :character="editingCharacter"
      @close="closeDialog"
      @saved="handleSaved"
    />

    <!-- 角色抽卡对话框 -->
    <CharacterGachaDialog
      v-if="showGachaDialog"
      @close="closeGachaDialog"
      @created="handleGachaCreated"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'

import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import GlobalCharacterDialog from '../config/GlobalCharacterDialog.vue'
import CharacterGachaDialog from '../config/CharacterGachaDialog.vue'
import TagFilter from '../common/TagFilter.vue'

const globalCharsStore = useGlobalCharactersStore()
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()

const toast = useToastStore()
const { confirm } = useDialog()

const searchKeyword = ref('')
const showCreateDialog = ref(false)
const showGachaDialog = ref(false)
const editingCharacter = ref(null)

// 分页
const pageSize = 5
const currentPage = ref(1)

// 是否有筛选条件
const hasFilter = computed(() => {
  return searchKeyword.value.trim() || globalCharsStore.selectedTagIds.length > 0
})

// 显示的角色列表（分页后）
const filteredAll = computed(() => globalCharsStore.filteredCharacters)
const totalPages = computed(() => Math.max(1, Math.ceil(filteredAll.value.length / pageSize)))
const displayCharacters = computed(() => {
  const start = (currentPage.value - 1) * pageSize
  return filteredAll.value.slice(start, start + pageSize)
})

// 筛选条件变化时重置页码
watch([() => searchKeyword.value, () => globalCharsStore.selectedTagIds.length], () => {
  currentPage.value = 1
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
    toast.warning('请先选择一个群组')
    return
  }

  const confirmed = await confirm({
    title: '导入角色',
    message: `确定要将"${character.name}"导入到当前群组吗？`,
    confirmText: '导入',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    const newChar = await globalCharsStore.importToGroup(
      character.id,
      groupsStore.currentGroupId
    )
    // 刷新群组角色列表
    await charactersStore.loadCharacters(groupsStore.currentGroupId)
    toast.success(`角色"${character.name}"已成功导入`)
  } catch (error) {
    toast.error('导入失败：' + error.message)
  }
}

// 编辑
function handleEdit(character) {
  editingCharacter.value = { ...character }
}

// 删除
async function handleDelete(character) {
  const confirmed = await confirm({
    title: '删除角色',
    message: `确定要删除角色"${character.name}"吗？此操作不可撤销！`,
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    await globalCharsStore.deleteCharacter(character.id)
  } catch (error) {
    toast.error('删除失败：' + error.message)
  }
}

// 关闭对话框
function closeDialog() {
  showCreateDialog.value = false
  editingCharacter.value = null
}

// 关闭抽卡对话框
function closeGachaDialog() {
  showGachaDialog.value = false
}

// 抽卡成功
async function handleGachaCreated() {
  closeGachaDialog()
  // 重新加载角色列表
  await globalCharsStore.loadCharacters()
}

// 保存成功
async function handleSaved() {
  closeDialog()
  // 重新加载角色列表
  await globalCharsStore.loadCharacters()
}

onMounted(async () => {
  await globalCharsStore.loadCharacters()
  await globalCharsStore.loadTags()
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

.filter-section {
  padding: 0 $spacing-lg;
  flex-shrink: 0;
}

.character-list {
  flex: 1;
  overflow-y: auto;
}

.pagination-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: $spacing-xs;
  padding: $spacing-sm $spacing-lg;
  border-bottom: 1px solid $border-color;
  flex-shrink: 0;
}

.page-info {
  font-size: $font-size-sm;
  color: $text-secondary;
  min-width: 60px;
  text-align: center;
}

.btn-page {
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: 1px solid $border-color;
  background: white;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: $font-size-md;
  line-height: 1;
  color: $text-primary;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: $bg-secondary;
  }

  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
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
  margin-bottom: 6px;
}

.char-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.char-tag {
  display: inline-flex;
  padding: 2px 8px;
  border-radius: 8px;
  font-size: 10px;
  color: white;
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

.btn-gacha {
  background: linear-gradient(135deg, #ff9a56 0%, #ff6b6b 100%);
  color: white;
  border: none;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(255, 107, 107, 0.3);
  }

  &:active {
    transform: translateY(0);
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
