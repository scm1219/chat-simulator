import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useGlobalCharactersStore = defineStore('globalCharacters', () => {
  const characters = ref([])
  const tags = ref([])
  const loading = ref(false)
  const searchKeyword = ref('')
  const selectedTagIds = ref([])
  const { load, call } = useApi('GlobalChars')

  const defaultTags = computed(() => tags.value.filter(t => t.is_default === 1))
  const customTags = computed(() => tags.value.filter(t => t.is_default !== 1))
  const characterCount = computed(() => characters.value.length)

  const filteredCharacters = computed(() => {
    let result = characters.value
    if (searchKeyword.value.trim()) {
      const keyword = searchKeyword.value.toLowerCase().trim()
      result = result.filter(c =>
        c.name.toLowerCase().includes(keyword) ||
        c.system_prompt.toLowerCase().includes(keyword)
      )
    }
    if (selectedTagIds.value.length > 0) {
      result = result.filter(c =>
        c.tags?.some(t => selectedTagIds.value.includes(t.id))
      )
    }
    return result
  })

  // ============ 角色管理 ============

  async function loadCharacters() {
    const data = await load(() => window.electronAPI.globalCharacter.getAllWithTags())
    if (data) characters.value = data
  }

  async function getCharacterById(id) {
    const result = await call(() => window.electronAPI.globalCharacter.getById(id))
    const tagsResult = await window.electronAPI.globalCharacter.getCharacterTags(id)
    result.tags = tagsResult.success ? tagsResult.data : []
    return result
  }

  async function createCharacter(data) {
    const result = await call(() => window.electronAPI.globalCharacter.create(data))
    characters.value.unshift(result)
    return result
  }

  async function updateCharacter(id, data) {
    const result = await call(() => window.electronAPI.globalCharacter.update(id, data))
    const index = characters.value.findIndex(c => c.id === id)
    if (index !== -1) characters.value[index] = result
    return result
  }

  async function deleteCharacter(id) {
    await call(() => window.electronAPI.globalCharacter.delete(id))
    characters.value = characters.value.filter(c => c.id !== id)
  }

  async function importToGroup(characterId, groupId) {
    return call(() => window.electronAPI.globalCharacter.importToGroup(characterId, groupId))
  }

  async function syncToGroup(characterId, groupId) {
    return call(() => window.electronAPI.globalCharacter.syncToGroup(characterId, groupId))
  }

  async function syncToAllGroups(characterId) {
    return call(() => window.electronAPI.globalCharacter.syncToAllGroups(characterId))
  }

  async function existsInLibrary(characterId) {
    try {
      const result = await window.electronAPI.globalCharacter.existsInLibrary(characterId)
      return result.success ? result.data : false
    } catch { return false }
  }

  function clearSearch() {
    searchKeyword.value = ''
  }

  // ============ 标签管理 ============

  async function loadTags() {
    try {
      const result = await window.electronAPI.globalCharacter.getAllTags()
      if (result.success) tags.value = result.data
    } catch (error) {
      console.error('加载标签失败:', error)
    }
  }

  async function createTag(data) {
    const result = await call(() => window.electronAPI.globalCharacter.createTag(data))
    tags.value.push(result)
    return result
  }

  async function updateTag(id, data) {
    const result = await call(() => window.electronAPI.globalCharacter.updateTag(id, data))
    const index = tags.value.findIndex(t => t.id === id)
    if (index !== -1) tags.value[index] = result
    return result
  }

  async function deleteTag(id) {
    await call(() => window.electronAPI.globalCharacter.deleteTag(id))
    tags.value = tags.value.filter(t => t.id !== id)
    characters.value.forEach(c => {
      if (c.tags) c.tags = c.tags.filter(t => t.id !== id)
    })
    selectedTagIds.value = selectedTagIds.value.filter(tid => tid !== id)
  }

  function toggleTagFilter(tagId) {
    const index = selectedTagIds.value.indexOf(tagId)
    if (index === -1) selectedTagIds.value.push(tagId)
    else selectedTagIds.value.splice(index, 1)
  }

  function clearTagFilter() {
    selectedTagIds.value = []
  }

  return {
    characters, tags, loading, searchKeyword, selectedTagIds,
    defaultTags, customTags, filteredCharacters, characterCount,
    loadCharacters, getCharacterById, createCharacter, updateCharacter,
    deleteCharacter, importToGroup, syncToGroup, syncToAllGroups,
    existsInLibrary, clearSearch,
    loadTags, createTag, updateTag, deleteTag, toggleTagFilter, clearTagFilter
  }
})
