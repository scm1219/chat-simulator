import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Memory')

export const useMemoryStore = defineStore('memory', () => {
  // 按角色名缓存的记忆 { characterName: Memory[] }
  const memoriesMap = ref({})
  const loading = ref(false)

  // 加载指定角色的记忆列表
  async function loadMemories(characterName) {
    if (!characterName) return
    try {
      const result = await window.electronAPI.memory.getByName(characterName)
      if (result.success) {
        memoriesMap.value[characterName] = result.data
      }
    } catch (error) {
      log.error('加载记忆失败:', error)
    }
  }

  // 添加新记忆
  async function addMemory({ characterName, content, source = 'manual', groupId = null }) {
    try {
      const result = await window.electronAPI.memory.add({ characterName, content, source, groupId })
      if (result.success) {
        if (!memoriesMap.value[characterName]) {
          memoriesMap.value[characterName] = []
        }
        memoriesMap.value[characterName].unshift(result.data)
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('添加记忆失败:', error)
      throw error
    }
  }

  // 更新记忆内容
  async function updateMemory(id, content, characterName) {
    try {
      const result = await window.electronAPI.memory.update(id, content)
      if (result.success) {
        const list = memoriesMap.value[characterName]
        if (list) {
          const index = list.findIndex(m => m.id === id)
          if (index !== -1) {
            list[index] = result.data
          }
        }
        return result.data
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('更新记忆失败:', error)
      throw error
    }
  }

  // 删除记忆
  async function deleteMemory(id, characterName) {
    try {
      const result = await window.electronAPI.memory.delete(id)
      if (result.success) {
        const list = memoriesMap.value[characterName]
        if (list) {
          memoriesMap.value[characterName] = list.filter(m => m.id !== id)
        }
        return
      }
      throw new Error(result.error)
    } catch (error) {
      log.error('删除记忆失败:', error)
      throw error
    }
  }

  // 获取指定角色的记忆列表
  function getMemories(characterName) {
    return memoriesMap.value[characterName] || []
  }

  return { memoriesMap, loading, loadMemories, addMemory, updateMemory, deleteMemory, getMemories }
})
