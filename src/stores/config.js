import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfigStore = defineStore('config', () => {
  // 状态
  const llmConfig = ref(null)
  const proxyConfig = ref(null)
  const loading = ref(false)

  // 方法
  async function loadLLMConfig() {
    loading.value = true
    try {
      const result = await window.electronAPI.config.getLLMConfig()
      if (result.success) {
        llmConfig.value = result.data
      }
    } catch (error) {
      console.error('Failed to load LLM config:', error)
    } finally {
      loading.value = false
    }
  }

  async function saveLLMConfig(config) {
    try {
      const result = await window.electronAPI.config.saveLLMConfig(config)
      if (result.success) {
        llmConfig.value = config
      }
      return result.success
    } catch (error) {
      console.error('Failed to save LLM config:', error)
      return false
    }
  }

  async function loadProxyConfig() {
    loading.value = true
    try {
      const result = await window.electronAPI.config.getProxyConfig()
      if (result.success) {
        proxyConfig.value = result.data
      }
    } catch (error) {
      console.error('Failed to load proxy config:', error)
    } finally {
      loading.value = false
    }
  }

  async function saveProxyConfig(config) {
    try {
      const result = await window.electronAPI.config.saveProxyConfig(config)
      if (result.success) {
        proxyConfig.value = config
      }
      return result.success
    } catch (error) {
      console.error('Failed to save proxy config:', error)
      return false
    }
  }

  return {
    llmConfig,
    proxyConfig,
    loading,
    loadLLMConfig,
    saveLLMConfig,
    loadProxyConfig,
    saveProxyConfig
  }
})
