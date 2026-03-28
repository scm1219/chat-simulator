/**
 * LLM 配置状态管理
 */
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useGroupsStore } from './groups.js'

export const useLLMProfilesStore = defineStore('llmProfiles', () => {
  // 状态
  const profiles = ref([])
  const loading = ref(false)

  // 计算属性
  const profileCount = computed(() => profiles.value.length)

  /**
   * 加载所有配置
   */
  async function loadProfiles() {
    loading.value = true
    try {
      const result = await window.electronAPI.config.llmProfile.getAll()
      if (result.success) {
        profiles.value = result.data
        return true
      } else {
        console.error('Failed to load profiles:', result.error)
        return false
      }
    } catch (error) {
      console.error('Failed to load profiles:', error)
      return false
    } finally {
      loading.value = false
    }
  }

  /**
   * 添加配置
   */
  async function addProfile(profile) {
    try {
      const result = await window.electronAPI.config.llmProfile.add(profile)
      if (result.success) {
        await loadProfiles() // 重新加载列表
        return { success: true, data: result.data }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Failed to add profile:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 更新配置
   */
  async function updateProfile(id, data) {
    try {
      const result = await window.electronAPI.config.llmProfile.update(id, data)
      if (result.success) {
        await loadProfiles() // 重新加载列表
        // 刷新群组列表，使 UI 反映同步后的配置
        const groupsStore = useGroupsStore()
        await groupsStore.loadGroups()
        if (result.syncedGroups > 0) {
          console.log(`[LLM Profiles] 已同步 ${result.syncedGroups} 个群组`)
        }
        return { success: true, data: result.data, syncedGroups: result.syncedGroups || 0 }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Failed to update profile:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除配置
   */
  async function deleteProfile(id) {
    try {
      const result = await window.electronAPI.config.llmProfile.delete(id)
      if (result.success) {
        await loadProfiles() // 重新加载列表
        return { success: true }
      } else {
        return { success: false, error: result.error }
      }
    } catch (error) {
      console.error('Failed to delete profile:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 根据 ID 获取配置
   */
  function getProfileById(id) {
    return profiles.value.find(p => p.id === id) || null
  }

  return {
    profiles,
    loading,
    profileCount,
    loadProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    getProfileById
  }
})
