import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGroupsStore } from './groups.js'

export const useCharactersStore = defineStore('characters', () => {
  // 状态
  const characters = ref([])
  const loading = ref(false)

  // 计算属性
  const enabledCharacters = computed(() => {
    return characters.value.filter(c => c.enabled === 1)
  })

  // 方法
  async function loadCharacters(groupId) {
    if (!groupId) {
      characters.value = []
      return
    }

    loading.value = true
    try {
      const result = await window.electronAPI.character.getByGroupId(groupId)
      if (result.success) {
        characters.value = result.data
      }
    } catch (error) {
      console.error('Failed to load characters:', error)
    } finally {
      loading.value = false
    }
  }

  async function createCharacter(data) {
    try {
      const result = await window.electronAPI.character.create(data)
      if (result.success) {
        characters.value.push(result.data)
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to create character:', error)
      throw error
    }
  }

  async function updateCharacter(id, data) {
    try {
      const result = await window.electronAPI.character.update(id, data)
      if (result.success) {
        const index = characters.value.findIndex(c => c.id === id)
        if (index !== -1) {
          characters.value[index] = result.data
        }
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to update character:', error)
      throw error
    }
  }

  async function deleteCharacter(id) {
    try {
      const result = await window.electronAPI.character.delete(id)
      if (result.success) {
        characters.value = characters.value.filter(c => c.id !== id)
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to delete character:', error)
      throw error
    }
  }

  async function toggleCharacter(id, enabled) {
    try {
      const result = await window.electronAPI.character.toggle(id, enabled)
      if (result.success) {
        const index = characters.value.findIndex(c => c.id === id)
        if (index !== -1) {
          characters.value[index] = result.data
        }
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to toggle character:', error)
      throw error
    }
  }

  return {
    characters,
    enabledCharacters,
    loading,
    loadCharacters,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    toggleCharacter
  }
})
