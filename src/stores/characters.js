import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useCharactersStore = defineStore('characters', () => {
  const characters = ref([])
  const { loading, load, call } = useApi('Characters')

  const enabledCharacters = computed(() => characters.value.filter(c => c.enabled === 1))

  const characterMap = computed(() => {
    const map = new Map()
    for (const c of characters.value) map.set(c.id, c)
    return map
  })

  async function loadCharacters(groupId) {
    if (!groupId) { characters.value = []; return }
    const data = await load(() => window.electronAPI.character.getByGroupId(groupId))
    if (data) characters.value = data
  }

  async function createCharacter(data) {
    const result = await call(() => window.electronAPI.character.create(data))
    characters.value.push(result)
    return result
  }

  async function updateCharacter(id, data) {
    const result = await call(() => window.electronAPI.character.update(id, data))
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) characters.value[index] = result
    return result
  }

  async function deleteCharacter(id) {
    await call(() => window.electronAPI.character.delete(id))
    characters.value = characters.value.filter(c => c.id !== id)
  }

  async function toggleCharacter(id, enabled) {
    const result = await call(() => window.electronAPI.character.toggle(id, enabled))
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) characters.value[index] = result
    return result
  }

  async function reorderCharacter(id, direction) {
    const result = await call(() => window.electronAPI.character.reorder(id, direction))
    characters.value = result
    return result
  }

  function getCharacterById(id) {
    if (!id) return null
    return characterMap.value.get(id) || null
  }

  return {
    characters, enabledCharacters, characterMap, loading,
    loadCharacters, createCharacter, updateCharacter, deleteCharacter,
    toggleCharacter, reorderCharacter, getCharacterById
  }
})
