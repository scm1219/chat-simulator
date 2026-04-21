import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useApi } from '../composables/useApi.js'
import { useGroupsStore } from './groups.js'

export const useLLMProfilesStore = defineStore('llmProfiles', () => {
  const profiles = ref([])
  const { loading, load, call } = useApi('LLMProfiles')

  const profileCount = computed(() => profiles.value.length)

  async function loadProfiles() {
    const data = await load(() => window.electronAPI.config.llmProfile.getAll())
    if (data) profiles.value = data
    return !!data
  }

  async function addProfile(profile) {
    try {
      const result = await window.electronAPI.config.llmProfile.add(profile)
      if (result.success) {
        await loadProfiles()
        return { success: true, data: result.data }
      }
      return { success: false, error: result.error }
    } catch (error) {
      console.error('添加配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  async function updateProfile(id, data) {
    try {
      const result = await window.electronAPI.config.llmProfile.update(id, data)
      if (result.success) {
        await loadProfiles()
        const groupsStore = useGroupsStore()
        await groupsStore.loadGroups()
        if (result.syncedGroups > 0) console.info(`已同步 ${result.syncedGroups} 个群组`)
        return { success: true, data: result.data, syncedGroups: result.syncedGroups || 0 }
      }
      return { success: false, error: result.error }
    } catch (error) {
      console.error('更新配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  async function deleteProfile(id) {
    try {
      const result = await window.electronAPI.config.llmProfile.delete(id)
      if (result.success) {
        await loadProfiles()
        return { success: true }
      }
      return { success: false, error: result.error }
    } catch (error) {
      console.error('删除配置失败:', error)
      return { success: false, error: error.message }
    }
  }

  function getProfileById(id) {
    return profiles.value.find(p => p.id === id) || null
  }

  return {
    profiles, loading, profileCount,
    loadProfiles, addProfile, updateProfile, deleteProfile, getProfileById
  }
})
