import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Groups')

export const useGroupsStore = defineStore('groups', () => {
  // 状态
  const groups = ref([])
  const currentGroupId = ref(null)
  const loading = ref(false)

  // 计算属性
  const currentGroup = computed(() => {
    return groups.value.find(g => g.id === currentGroupId.value)
  })

  // 方法
  async function loadGroups() {
    loading.value = true
    try {
      const result = await window.electronAPI.group.getAll()
      if (result.success) {
        groups.value = result.data
        // 启动时自动选中第一个群
        if (groups.value.length > 0 && !currentGroupId.value) {
          currentGroupId.value = groups.value[0].id
        }
      }
    } catch (error) {
      log.error('加载群组失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function createGroup(data) {
    try {
      const result = await window.electronAPI.group.create(data)
      if (result.success) {
        groups.value.push(result.data)
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('创建群组失败:', error)
      throw error
    }
  }

  async function updateGroup(id, data) {
    try {
      const result = await window.electronAPI.group.update(id, data)
      if (result.success) {
        const index = groups.value.findIndex(g => g.id === id)
        if (index !== -1) {
          groups.value[index] = result.data
        }
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('更新群组失败:', error)
      throw error
    }
  }

  async function deleteGroup(id) {
    try {
      const result = await window.electronAPI.group.delete(id)
      if (result.success) {
        groups.value = groups.value.filter(g => g.id !== id)
        if (currentGroupId.value === id) {
          currentGroupId.value = null
        }
        return
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('删除群组失败:', error)
      throw error
    }
  }

  async function duplicateGroup(id) {
    try {
      const result = await window.electronAPI.group.duplicate(id)
      if (result.success) {
        groups.value.push(result.data)
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('复制群组失败:', error)
      throw error
    }
  }

  function selectGroup(id) {
    currentGroupId.value = id
  }

  return {
    groups,
    currentGroupId,
    currentGroup,
    loading,
    loadGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    duplicateGroup,
    selectGroup
  }
})
