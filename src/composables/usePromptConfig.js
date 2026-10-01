import { ref, reactive, computed } from 'vue'
import { useToastStore } from '../stores/toast'
import { createLogger } from '../utils/logger.js'

// 提示词配置（快速建群 quickGroupConfig / 角色抽卡 gachaConfig 共用）。
// 收敛自 QuickGroupDialog:322-341,513-572 与 CharacterGachaDialog:187-207,266-324 的整段复制。
export function usePromptConfig(channelKey) {
  const api = window.electronAPI.config[channelKey]
  const toast = useToastStore()
  const log = createLogger('PromptConfig')

  const promptLoading = ref(false)
  const promptSaving = ref(false)
  const promptForm = reactive({
    systemPrompt: '',
    userPromptTemplate: '',
    defaultUserPrompt: ''
  })
  const savedPrompt = reactive({
    systemPrompt: '',
    userPromptTemplate: '',
    defaultUserPrompt: ''
  })

  const promptDirty = computed(() => {
    return (
      promptForm.systemPrompt !== savedPrompt.systemPrompt ||
      promptForm.userPromptTemplate !== savedPrompt.userPromptTemplate ||
      promptForm.defaultUserPrompt !== savedPrompt.defaultUserPrompt
    )
  })

  function applyData(data) {
    promptForm.systemPrompt = data.systemPrompt
    promptForm.userPromptTemplate = data.userPromptTemplate
    promptForm.defaultUserPrompt = data.defaultUserPrompt
    savedPrompt.systemPrompt = data.systemPrompt
    savedPrompt.userPromptTemplate = data.userPromptTemplate
    savedPrompt.defaultUserPrompt = data.defaultUserPrompt
  }

  async function loadPromptConfig() {
    promptLoading.value = true
    try {
      const result = await api.get()
      if (result.success) applyData(result.data)
    } catch (error) {
      log.error('加载提示词配置失败', error)
    } finally {
      promptLoading.value = false
    }
  }

  async function savePrompt() {
    promptSaving.value = true
    try {
      const result = await api.save({
        systemPrompt: promptForm.systemPrompt,
        userPromptTemplate: promptForm.userPromptTemplate,
        defaultUserPrompt: promptForm.defaultUserPrompt
      })
      if (result.success) {
        applyData(promptForm)
        toast.success('提示词配置已保存')
      } else {
        toast.error('保存失败')
      }
    } catch (error) {
      toast.error('保存失败：' + error.message)
    } finally {
      promptSaving.value = false
    }
  }

  async function resetPrompt() {
    try {
      const result = await api.reset()
      if (result.success) {
        applyData(result.data)
        toast.success('已恢复默认配置')
      }
    } catch (error) {
      toast.error('重置失败：' + error.message)
    }
  }

  return {
    promptForm,
    promptDirty,
    promptLoading,
    promptSaving,
    loadPromptConfig,
    savePrompt,
    resetPrompt
  }
}
