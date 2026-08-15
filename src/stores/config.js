import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useApi } from '../composables/useApi.js'

export const useConfigStore = defineStore('config', () => {
  const llmConfig = ref(null)
  const { loading, load } = useApi('Config')

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

  // 全局代理配置（config:getProxyConfig/saveProxyConfig）保留在主进程以兼容旧数据，
  // 前端已改为按 LLM Profile 单独配置代理，此 store 不再暴露代理读写方法

  return {
    llmConfig, loading,
    loadLLMConfig, saveLLMConfig
  }
})
