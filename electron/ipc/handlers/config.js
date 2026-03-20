/**
 * 配置 IPC 处理器
 */
import { ipcMain } from 'electron'
import { getGlobalLLMConfig, saveGlobalLLMConfig } from '../../config/manager.js'
import { getProxyConfig, saveProxyConfig } from '../../llm/proxy.js'
import {
  getLLMProfiles,
  addLLMProfile,
  updateLLMProfile,
  deleteLLMProfile
} from '../../config/llm-profiles.js'
import {
  getSystemPromptTemplates,
  saveSystemPromptTemplates,
  resetSystemPromptTemplates,
  addSystemPromptTemplate,
  updateSystemPromptTemplate,
  deleteSystemPromptTemplate
} from '../../config/system-prompts.js'

export function setupConfigHandlers() {
  // 获取全局 LLM 配置
  ipcMain.handle('config:getLLMConfig', async () => {
    try {
      const config = getGlobalLLMConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 保存全局 LLM 配置
  ipcMain.handle('config:saveLLMConfig', async (event, config) => {
    try {
      const result = saveGlobalLLMConfig(config)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取代理配置
  ipcMain.handle('config:getProxyConfig', async () => {
    try {
      const config = getProxyConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 保存代理配置
  ipcMain.handle('config:saveProxyConfig', async (event, config) => {
    try {
      const result = saveProxyConfig(config)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ LLM 配置管理 ============

  // 获取所有 LLM 配置
  ipcMain.handle('llmProfile:getAll', async () => {
    try {
      const profiles = getLLMProfiles()
      return { success: true, data: profiles }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 添加 LLM 配置
  ipcMain.handle('llmProfile:add', async (event, profile) => {
    try {
      const result = addLLMProfile(profile)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新 LLM 配置
  ipcMain.handle('llmProfile:update', async (event, id, data) => {
    try {
      const result = updateLLMProfile(id, data)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除 LLM 配置
  ipcMain.handle('llmProfile:delete', async (event, id) => {
    try {
      const result = deleteLLMProfile(id)
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // ============ 系统提示词模板 ============

  // 获取所有系统提示词模板
  ipcMain.handle('systemPrompt:getAll', async () => {
    try {
      const templates = getSystemPromptTemplates()
      return { success: true, data: templates }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 保存系统提示词模板
  ipcMain.handle('systemPrompt:save', async (event, templates) => {
    try {
      const result = saveSystemPromptTemplates(templates)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 重置为默认模板
  ipcMain.handle('systemPrompt:reset', async () => {
    try {
      const templates = resetSystemPromptTemplates()
      return { success: true, data: templates }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 添加模板
  ipcMain.handle('systemPrompt:add', async (event, template) => {
    try {
      const result = addSystemPromptTemplate(template)
      if (result) {
        return { success: true, data: result }
      }
      return { success: false, error: '添加模板失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新模板
  ipcMain.handle('systemPrompt:update', async (event, id, data) => {
    try {
      const result = updateSystemPromptTemplate(id, data)
      if (result) {
        return { success: true, data: result }
      }
      return { success: false, error: '未找到模板' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除模板
  ipcMain.handle('systemPrompt:delete', async (event, id) => {
    try {
      const result = deleteSystemPromptTemplate(id)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
