import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useConfigStore = defineStore('config', () => {
  const llmConfig = ref(null)
  const proxyConfig = ref(null)
  const { loading, load, call } = useApi('Config')

  async function loadLLMConfig() {
    const data = await load(() => window.electronAPI.config.getLLMConfig())
    if (data) llmConfig.value = data
  }

  async function saveLLMConfig(config) {
    try {
      const result = await window.electronAPI.config.saveLLMConfig(config)
      if (result.success) llmConfig.value = config
      return result.success
    } catch (error) {
      console.error('保存 LLM 配置失败:', error)
      return false
    }
  }

  async function loadProxyConfig() {
    const data = await load(() => window.electronAPI.config.getProxyConfig())
    if (data) proxyConfig.value = data
  }

  async function saveProxyConfig(config) {
    try {
      const result = await window.electronAPI.config.saveProxyConfig(config)
      if (result.success) proxyConfig.value = config
      return result.success
    } catch (error) {
      console.error('保存代理配置失败:', error)
      return false
    }
  }

  return {
    llmConfig, proxyConfig, loading,
    loadLLMConfig, saveLLMConfig, loadProxyConfig, saveProxyConfig
  }
})
