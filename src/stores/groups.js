import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useGroupsStore = defineStore('groups', () => {
  const groups = ref([])
  const currentGroupId = ref(null)
  const { loading, load, call } = useApi('Groups')

  const currentGroup = computed(() => {
    return groups.value.find(g => g.id === currentGroupId.value)
  })

  async function loadGroups() {
    const data = await load(() => window.electronAPI.group.getAll())
    if (data) {
      groups.value = data
      if (groups.value.length > 0 && !currentGroupId.value) {
        currentGroupId.value = groups.value[0].id
      }
    }
  }

  async function createGroup(data) {
    const result = await call(() => window.electronAPI.group.create(data))
    groups.value.push(result)
    return result
  }

  async function updateGroup(id, data) {
    const result = await call(() => window.electronAPI.group.update(id, data))
    const index = groups.value.findIndex(g => g.id === id)
    if (index !== -1) groups.value[index] = result
    return result
  }

  async function deleteGroup(id) {
    await call(() => window.electronAPI.group.delete(id))
    groups.value = groups.value.filter(g => g.id !== id)
    if (currentGroupId.value === id) currentGroupId.value = null
  }

  async function duplicateGroup(id) {
    const result = await call(() => window.electronAPI.group.duplicate(id))
    groups.value.push(result)
    return result
  }

  function selectGroup(id) {
    currentGroupId.value = id
  }

  return {
    groups, currentGroupId, currentGroup, loading,
    loadGroups, createGroup, updateGroup, deleteGroup, duplicateGroup, selectGroup
  }
})
