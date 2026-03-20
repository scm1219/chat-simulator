import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

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
      }
    } catch (error) {
      console.error('Failed to load groups:', error)
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
      console.error('Failed to create group:', error)
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
      console.error('Failed to update group:', error)
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
      console.error('Failed to delete group:', error)
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
      console.error('Failed to duplicate group:', error)
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
