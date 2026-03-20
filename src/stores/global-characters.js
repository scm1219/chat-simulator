import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGroupsStore } from './groups.js'

export const useGlobalCharactersStore = defineStore('globalCharacters', () => {
  // 状态
  const characters = ref([])
  const loading = ref(false)
  const searchKeyword = ref('')

  // 计算属性
  const filteredCharacters = computed(() => {
    if (!searchKeyword.value.trim()) {
      return characters.value
    }
    const keyword = searchKeyword.value.toLowerCase().trim()
    return characters.value.filter(c =>
      c.name.toLowerCase().includes(keyword) ||
      c.system_prompt.toLowerCase().includes(keyword)
    )
  })

  const characterCount = computed(() => characters.value.length)

  // 方法
  async function loadCharacters() {
    loading.value = true
    try {
      const result = await window.electronAPI.globalCharacter.getAll()
      if (result.success) {
        characters.value = result.data
      } else {
        console.error('Failed to load global characters:', result.error)
      }
    } catch (error) {
      console.error('Failed to load global characters:', error)
    } finally {
      loading.value = false
    }
  }

  async function getCharacterById(id) {
    try {
      const result = await window.electronAPI.globalCharacter.getById(id)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to get character:', error)
      throw error
    }
  }

  async function createCharacter(data) {
    try {
      const result = await window.electronAPI.globalCharacter.create(data)
      if (result.success) {
        characters.value.unshift(result.data)
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
      const result = await window.electronAPI.globalCharacter.update(id, data)
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
      const result = await window.electronAPI.globalCharacter.delete(id)
      if (result.success) {
        characters.value = characters.value.filter(c => c.id !== id)
        return true
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to delete character:', error)
      throw error
    }
  }

  async function searchCharacters(keyword) {
    searchKeyword.value = keyword
    if (!keyword.trim()) {
      return characters.value
    }

    loading.value = true
    try {
      const result = await window.electronAPI.globalCharacter.search(keyword)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to search characters:', error)
      throw error
    } finally {
      loading.value = false
    }
  }

  async function importToGroup(characterId, groupId) {
    try {
      const result = await window.electronAPI.globalCharacter.importToGroup(characterId, groupId)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      console.error('Failed to import character to group:', error)
      throw error
    }
  }

  function clearSearch() {
    searchKeyword.value = ''
  }

  return {
    characters,
    loading,
    searchKeyword,
    filteredCharacters,
    characterCount,
    loadCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    searchCharacters,
    importToGroup,
    clearSearch
  }
})
