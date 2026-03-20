<template>
  <div class="group-list">
    <div class="group-list-header">
      <h3>聊天群</h3>
      <div class="header-actions">
        <button class="btn btn-primary btn-sm" @click="showCreateDialog = true">
          + 新建
        </button>
      </div>
    </div>

    <div class="group-list-items">
      <div
        v-for="group in groupsStore.groups"
        :key="group.id"
        :class="['group-item', { active: group.id === groupsStore.currentGroupId }]"
        @click="selectGroup(group)"
        @dblclick="openGroupSettings(group)"
        @mouseenter="hoveredGroupId = group.id"
        @mouseleave="hoveredGroupId = null"
      >
        <div class="group-content">
          <div class="group-name">{{ group.name }}</div>
          <div class="group-info">{{ group.llm_model }}</div>
        </div>
        <div
          v-show="hoveredGroupId === group.id || group.id === groupsStore.currentGroupId"
          class="group-actions"
        >
          <button
            class="btn-icon btn-action"
            @click.stop="handleDuplicate(group)"
            title="复制群组"
          >
            📋
          </button>
          <button
            class="btn-icon btn-action btn-danger"
            @click.stop="handleDelete(group)"
            title="删除群组"
          >
            🗑️
          </button>
        </div>
      </div>

      <div v-if="groupsStore.groups.length === 0" class="empty-state">
        <p>还没有聊天群</p>
        <p class="hint">点击右上角"新建"创建一个</p>
      </div>
    </div>

    <!-- 创建群组对话框 -->
    <CreateGroupDialog
      v-if="showCreateDialog"
      @close="showCreateDialog = false"
      @created="handleGroupCreated"
    />

    <!-- 群设置对话框 -->
    <GroupSettingsDialog
      v-if="showSettingsDialog && settingsGroupId"
      :group-id="settingsGroupId"
      @close="closeGroupSettings"
      @saved="handleGroupSettingsSaved"
    />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import CreateGroupDialog from '../config/CreateGroupDialog.vue'
import GroupSettingsDialog from '../config/GroupSettingsDialog.vue'

const groupsStore = useGroupsStore()
const showCreateDialog = ref(false)
const hoveredGroupId = ref(null)
const showSettingsDialog = ref(false)
const settingsGroupId = ref(null)

function selectGroup(group) {
  groupsStore.selectGroup(group.id)
}

function openGroupSettings(group) {
  settingsGroupId.value = group.id
  showSettingsDialog.value = true
}

function closeGroupSettings() {
  showSettingsDialog.value = false
  settingsGroupId.value = null
}

function handleGroupSettingsSaved() {
  // 重新加载群组列表以更新显示
  groupsStore.loadGroups()
}

function handleGroupCreated(group) {
  showCreateDialog.value = false
  groupsStore.selectGroup(group.id)
}

async function handleDuplicate(group) {
  try {
    const newGroup = await groupsStore.duplicateGroup(group.id)
    // 自动选中新复制的群组
    groupsStore.selectGroup(newGroup.id)
  } catch (error) {
    console.error('复制群组失败:', error)
    alert('复制群组失败：' + error.message)
  }
}

async function handleDelete(group) {
  // 确认删除
  const confirmed = confirm(`确定要删除群组"${group.name}"吗？此操作不可撤销！`)
  if (!confirmed) return

  try {
    await groupsStore.deleteGroup(group.id)
  } catch (error) {
    console.error('删除群组失败:', error)
    alert('删除群组失败：' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.group-list {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.group-list-header {
  padding: $spacing-lg;
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

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 18px;
  transition: background 0.2s;

  &:hover {
    background: $bg-secondary;
  }
}

.group-list-items {
  flex: 1;
  overflow-y: auto;
}

.group-item {
  padding: $spacing-lg;
  cursor: pointer;
  transition: background 0.2s;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: $spacing-md;

  &:hover {
    background: $bg-secondary;
  }

  &.active {
    background: $wechat-light-green;
  }
}

.group-content {
  flex: 1;
  min-width: 0;
}

.group-name {
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-info {
  font-size: $font-size-sm;
  color: $text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-actions {
  display: flex;
  gap: $spacing-xs;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.2s;

  .group-item:hover &,
  .group-item.active & {
    opacity: 1;
  }
}

.btn-action {
  width: 28px;
  height: 28px;
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

  &.btn-danger:hover {
    background: rgba(255, 59, 48, 0.2);
    color: #ff3b30;
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
