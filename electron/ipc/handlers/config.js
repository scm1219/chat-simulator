/**
 * 配置 IPC 处理器
 */
import { ipcMain } from 'electron'
import { getGlobalLLMConfig, saveGlobalLLMConfig, getGachaConfig, saveGachaConfig, getDefaultGachaConfig, getQuickGroupConfig, saveQuickGroupConfig, getDefaultQuickGroupConfig } from '../../config/manager.js'
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
import { createHandler } from '../handler-wrapper.js'

/**
 * 注册 get/save/reset 三件套配置 Handler
 * @param {string} prefix - IPC 通道前缀（如 'gachaConfig'）
 * @param {object} fns - 配置操作函数
 * @param {() => object} fns.get - 获取配置
 * @param {(config: object) => boolean} fns.save - 保存配置
 * @param {() => object} fns.getDefault - 获取默认配置
 */
function registerConfigCRUD(prefix, { get, save, getDefault }) {
  ipcMain.handle(`${prefix}:get`, createHandler(async () => {
    const config = get()
    return { success: true, data: config }
  }))

  ipcMain.handle(`${prefix}:save`, createHandler(async (event, config) => {
    const result = save(config)
    return { success: result }
  }))

  ipcMain.handle(`${prefix}:reset`, createHandler(async () => {
    const defaultConfig = getDefault()
    const result = save(defaultConfig)
    if (result) {
      return { success: true, data: defaultConfig }
    }
    return { success: false, error: '重置失败' }
  }))
}

export function setupConfigHandlers(dbManager) {
  // 获取全局 LLM 配置
  ipcMain.handle('config:getLLMConfig', createHandler(async () => {
    const config = getGlobalLLMConfig()
    return { success: true, data: config }
  }))

  // 保存全局 LLM 配置
  ipcMain.handle('config:saveLLMConfig', createHandler(async (event, config) => {
    const result = saveGlobalLLMConfig(config)
    return { success: result }
  }))

  // 获取代理配置
  ipcMain.handle('config:getProxyConfig', createHandler(async () => {
    const config = getProxyConfig()
    return { success: true, data: config }
  }))

  // 保存代理配置
  ipcMain.handle('config:saveProxyConfig', createHandler(async (event, config) => {
    const result = saveProxyConfig(config)
    return { success: result }
  }))

  // ============ LLM 配置管理 ============

  // 获取所有 LLM 配置
  ipcMain.handle('llmProfile:getAll', createHandler(async () => {
    const profiles = getLLMProfiles()
    return { success: true, data: profiles }
  }))

  // 添加 LLM 配置
  ipcMain.handle('llmProfile:add', createHandler(async (event, profile) => {
    const result = addLLMProfile(profile)
    return result
  }))

  // 更新 LLM 配置
  ipcMain.handle('llmProfile:update', createHandler(async (event, id, data) => {
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
  }, 'Config:llmProfile:update'))

  // 删除 LLM 配置
  ipcMain.handle('llmProfile:delete', createHandler(async (event, id) => {
    const result = deleteLLMProfile(id)
    return result
  }))

  // ============ 系统提示词模板 ============

  // 获取所有系统提示词模板
  ipcMain.handle('systemPrompt:getAll', createHandler(async () => {
    const templates = getSystemPromptTemplates()
    return { success: true, data: templates }
  }))

  // 保存系统提示词模板
  ipcMain.handle('systemPrompt:save', createHandler(async (event, templates) => {
    const result = saveSystemPromptTemplates(templates)
    return { success: result }
  }))

  // 重置为默认模板
  ipcMain.handle('systemPrompt:reset', createHandler(async () => {
    const templates = resetSystemPromptTemplates()
    return { success: true, data: templates }
  }))

  // 添加模板
  ipcMain.handle('systemPrompt:add', createHandler(async (event, template) => {
    const result = addSystemPromptTemplate(template)
    if (result) {
      return { success: true, data: result }
    }
    return { success: false, error: '添加模板失败' }
  }))

  // 更新模板
  ipcMain.handle('systemPrompt:update', createHandler(async (event, id, data) => {
    const result = updateSystemPromptTemplate(id, data)
    if (result) {
      return { success: true, data: result }
    }
    return { success: false, error: '未找到模板' }
  }))

  // 删除模板
  ipcMain.handle('systemPrompt:delete', createHandler(async (event, id) => {
    const result = deleteSystemPromptTemplate(id)
    return { success: result }
  }))

  // ============ 抽卡配置 & 快速建群配置（使用工厂函数） ============

  registerConfigCRUD('gachaConfig', {
    get: getGachaConfig,
    save: saveGachaConfig,
    getDefault: getDefaultGachaConfig
  })

  registerConfigCRUD('quickGroupConfig', {
    get: getQuickGroupConfig,
    save: saveQuickGroupConfig,
    getDefault: getDefaultQuickGroupConfig
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
