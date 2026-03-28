/**
 * 配置 IPC 处理器
 */
import { ipcMain } from 'electron'
import { getGlobalLLMConfig, saveGlobalLLMConfig, getGachaConfig, saveGachaConfig, getDefaultGachaConfig } from '../../config/manager.js'
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

export function setupConfigHandlers(dbManager) {
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
      // 获取旧配置，用于匹配需要同步的群组
      const oldProfile = getLLMProfiles().find(p => p.id === id) || null
      const result = updateLLMProfile(id, data)

      // 同步更新所有使用旧配置的群组
      if (result.success && oldProfile && dbManager) {
        const syncedGroups = syncGroupsProfile(dbManager, oldProfile, data)
        console.log(`[Config] Profile "${data.name}" 已同步更新 ${syncedGroups} 个群组`)
        result.syncedGroups = syncedGroups
      }

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

  // ============ 抽卡配置 ============

  // 获取抽卡配置
  ipcMain.handle('gachaConfig:get', async () => {
    try {
      const config = getGachaConfig()
      return { success: true, data: config }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 保存抽卡配置
  ipcMain.handle('gachaConfig:save', async (event, config) => {
    try {
      const result = saveGachaConfig(config)
      return { success: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 重置抽卡配置为默认值
  ipcMain.handle('gachaConfig:reset', async () => {
    try {
      const defaultConfig = getDefaultGachaConfig()
      const result = saveGachaConfig(defaultConfig)
      if (result) {
        return { success: true, data: defaultConfig }
      }
      return { success: false, error: '重置失败' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}

/**
 * 同步更新所有匹配旧 Profile 配置的群组
 * @param {object} dbManager - 数据库管理器
 * @param {object} oldProfile - 更新前的 Profile 数据
 * @param {object} newProfileData - 更新后的 Profile 数据
 * @returns {number} 同步更新的群组数量
 */
function syncGroupsProfile(dbManager, oldProfile, newProfileData) {
  let syncedCount = 0
  const groupIds = dbManager.getGroupDBFiles()

  for (const groupId of groupIds) {
    try {
      const db = dbManager.getGroupDB(groupId)
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
      if (!group) continue

      // 匹配条件：provider + model + apiKey + baseURL 完全一致
      const matches =
        group.llm_provider === oldProfile.provider &&
        group.llm_model === oldProfile.model &&
        (group.llm_api_key || null) === (oldProfile.apiKey || null) &&
        (group.llm_base_url || null) === (oldProfile.baseURL || null)

      if (matches) {
        db.prepare(`
          UPDATE groups SET
            llm_provider = ?,
            llm_model = ?,
            llm_api_key = ?,
            llm_base_url = ?,
            use_global_api_key = ?
          WHERE id = ?
        `).run(
          newProfileData.provider || oldProfile.provider,
          newProfileData.model || oldProfile.model,
          newProfileData.apiKey ? String(newProfileData.apiKey) : null,
          newProfileData.baseURL ? String(newProfileData.baseURL) : null,
          newProfileData.apiKey ? 0 : 1,
          groupId
        )
        syncedCount++
        console.log(`[Config] 群组 "${group.name}" 已同步更新`)
      }
    } catch (error) {
      console.error(`[Config] 同步群组 ${groupId} 失败:`, error.message)
    }
  }

  return syncedCount
}
