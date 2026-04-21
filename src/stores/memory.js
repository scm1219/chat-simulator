import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useMemoryStore = defineStore('memory', () => {
  const memoriesMap = ref({})
  const { call } = useApi('Memory')

  async function loadMemories(characterName) {
    if (!characterName) return
    try {
      const result = await window.electronAPI.memory.getByName(characterName)
      if (result.success) memoriesMap.value[characterName] = result.data
    } catch (error) {
      console.error('加载记忆失败:', error)
    }
  }

  async function addMemory({ characterName, content, source = 'manual', groupId = null }) {
    const data = await call(() => window.electronAPI.memory.add({ characterName, content, source, groupId }))
    if (!memoriesMap.value[characterName]) memoriesMap.value[characterName] = []
    memoriesMap.value[characterName].unshift(data)
    return data
  }

  async function updateMemory(id, content, characterName) {
    const data = await call(() => window.electronAPI.memory.update(id, content))
    const list = memoriesMap.value[characterName]
    if (list) {
      const index = list.findIndex(m => m.id === id)
      if (index !== -1) list[index] = data
    }
    return data
  }

  async function deleteMemory(id, characterName) {
    await call(() => window.electronAPI.memory.delete(id))
    const list = memoriesMap.value[characterName]
    if (list) memoriesMap.value[characterName] = list.filter(m => m.id !== id)
  }

  function getMemories(characterName) {
    return memoriesMap.value[characterName] || []
  }

  return { memoriesMap, loadMemories, addMemory, updateMemory, deleteMemory, getMemories }
})
