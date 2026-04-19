import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { createLogger } from '../utils/logger.js'

const log = createLogger('GlobalChars')

export const useGlobalCharactersStore = defineStore('globalCharacters', () => {
  // 状态
  const characters = ref([])
  const tags = ref([])
  const loading = ref(false)
  const searchKeyword = ref('')
  const selectedTagIds = ref([])

  // 计算属性 - 标签分类
  const defaultTags = computed(() =>
    tags.value.filter(t => t.is_default === 1)
  )

  const customTags = computed(() =>
    tags.value.filter(t => t.is_default !== 1)
  )

  // 计算属性 - 筛选后的角色
  const filteredCharacters = computed(() => {
    let result = characters.value

    // 按关键词筛选
    if (searchKeyword.value.trim()) {
      const keyword = searchKeyword.value.toLowerCase().trim()
      result = result.filter(c =>
        c.name.toLowerCase().includes(keyword) ||
        c.system_prompt.toLowerCase().includes(keyword)
      )
    }

    // 按标签筛选（仅当有选中的标签时才过滤）
    if (selectedTagIds.value.length > 0) {
      result = result.filter(c => {
        // 角色没有标签时，如果选中了标签则不显示
        if (!c.tags || c.tags.length === 0) {
          return false
        }
        return c.tags.some(t => selectedTagIds.value.includes(t.id))
      })
    }

    return result
  })

  const characterCount = computed(() => characters.value.length)

  // ============ 角色管理方法 ============

  async function loadCharacters() {
    loading.value = true
    try {
      const result = await window.electronAPI.globalCharacter.getAllWithTags()
      if (result.success) {
        characters.value = result.data
      } else {
        log.error('加载全局角色失败:', result.error)
      }
    } catch (error) {
      log.error('加载全局角色失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function getCharacterById(id) {
    try {
      const result = await window.electronAPI.globalCharacter.getById(id)
      if (result.success) {
        // 获取角色的标签
        const tagsResult = await window.electronAPI.globalCharacter.getCharacterTags(id)
        const character = result.data
        character.tags = tagsResult.success ? tagsResult.data : []
        return character
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('获取角色失败:', error)
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
      log.error('创建角色失败:', error)
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
      log.error('更新角色失败:', error)
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
      log.error('删除角色失败:', error)
      throw error
    }
  }

  async function searchCharacters(keyword) {
    searchKeyword.value = keyword
    // 使用本地筛选，不再调用 API
    return filteredCharacters.value
  }

  async function importToGroup(characterId, groupId) {
    try {
      const result = await window.electronAPI.globalCharacter.importToGroup(characterId, groupId)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('导入角色到群组失败:', error)
      throw error
    }
  }

  // 从角色库同步最新设定到群组角色
  async function syncToGroup(characterId, groupId) {
    try {
      const result = await window.electronAPI.globalCharacter.syncToGroup(characterId, groupId)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('同步角色到群组失败:', error)
      throw error
    }
  }

  // 从角色库同步最新设定到所有关联群组
  async function syncToAllGroups(characterId) {
    try {
      const result = await window.electronAPI.globalCharacter.syncToAllGroups(characterId)
      if (result.success) {
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('同步角色到所有群组失败:', error)
      throw error
    }
  }

  // 检查角色是否存在于角色库
  async function existsInLibrary(characterId) {
    try {
      const result = await window.electronAPI.globalCharacter.existsInLibrary(characterId)
      if (result.success) {
        return result.data
      }
      return false
    } catch (error) {
      return false
    }
  }

  function clearSearch() {
    searchKeyword.value = ''
  }

  // ============ 标签管理方法 ============

  async function loadTags() {
    try {
      const result = await window.electronAPI.globalCharacter.getAllTags()
      if (result.success) {
        tags.value = result.data
      } else {
        log.error('加载标签失败:', result.error)
      }
    } catch (error) {
      log.error('加载标签失败:', error)
    }
  }

  async function createTag(data) {
    try {
      const result = await window.electronAPI.globalCharacter.createTag(data)
      if (result.success) {
        tags.value.push(result.data)
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('创建标签失败:', error)
      throw error
    }
  }

  async function updateTag(id, data) {
    try {
      const result = await window.electronAPI.globalCharacter.updateTag(id, data)
      if (result.success) {
        const index = tags.value.findIndex(t => t.id === id)
        if (index !== -1) {
          tags.value[index] = result.data
        }
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('更新标签失败:', error)
      throw error
    }
  }

  async function deleteTag(id) {
    try {
      const result = await window.electronAPI.globalCharacter.deleteTag(id)
      if (result.success) {
        tags.value = tags.value.filter(t => t.id !== id)
        // 从角色中移除该标签
        characters.value.forEach(c => {
          if (c.tags) {
            c.tags = c.tags.filter(t => t.id !== id)
          }
        })
        // 从选中列表中移除
        selectedTagIds.value = selectedTagIds.value.filter(tid => tid !== id)
        return true
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('删除标签失败:', error)
      throw error
    }
  }

  function toggleTagFilter(tagId) {
    const index = selectedTagIds.value.indexOf(tagId)
    if (index === -1) {
      selectedTagIds.value.push(tagId)
    } else {
      selectedTagIds.value.splice(index, 1)
    }
  }

  function clearTagFilter() {
    selectedTagIds.value = []
  }

  return {
    // 状态
    characters,
    tags,
    loading,
    searchKeyword,
    selectedTagIds,
    // 计算属性
    defaultTags,
    customTags,
    filteredCharacters,
    characterCount,
    // 角色方法
    loadCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    searchCharacters,
    importToGroup,
    syncToGroup,
    syncToAllGroups,
    existsInLibrary,
    clearSearch,
    // 标签方法
    loadTags,
    createTag,
    updateTag,
    deleteTag,
    toggleTagFilter,
    clearTagFilter
  }
})
