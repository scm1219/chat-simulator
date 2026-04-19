import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGroupsStore } from './groups.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Characters')

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
      log.error('加载角色失败:', error)
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
      log.error('创建角色失败:', error)
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
      log.error('更新角色失败:', error)
      throw error
    }
  }

  async function deleteCharacter(id) {
    try {
      const result = await window.electronAPI.character.delete(id)
      if (result.success) {
        characters.value = characters.value.filter(c => c.id !== id)
        return
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('删除角色失败:', error)
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
      log.error('切换角色状态失败:', error)
      throw error
    }
  }

  async function reorderCharacter(id, direction) {
    try {
      const result = await window.electronAPI.character.reorder(id, direction)
      if (result.success) {
        // 更新整个角色列表
        characters.value = result.data
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('排序角色失败:', error)
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
    toggleCharacter,
    reorderCharacter
  }
})
