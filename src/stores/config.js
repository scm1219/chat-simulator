import { defineStore } from 'pinia'
import { ref } from 'vue'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Config')

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
      log.error('加载 LLM 配置失败:', error)
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
      log.error('保存 LLM 配置失败:', error)
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
      log.error('加载代理配置失败:', error)
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
      log.error('保存代理配置失败:', error)
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
