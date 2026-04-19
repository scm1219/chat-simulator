/**
 * LLM 配置文件管理器
 * 管理多个 LLM 配置的增删改查
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { generateUUID } from '../utils/uuid.js'
import { DEFAULT_PROFILE_PROXY } from '../llm/proxy.js'
import { ensureConfigDir } from '../utils/config-dir.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('LLMProfiles')

const LLM_PROFILES_FILE = path.join(app.getPath('userData'), 'config', 'llm-profiles.json')

// 写操作串行化队列（防止并发 read-modify-write 竞态）
let _writeQueue = Promise.resolve()

/**
 * 串行化写操作：确保完整的 read-modify-write 周期不被其他写操作打断
 * @param {Function} fn - 返回结果的同步函数
 * @returns {Promise} 操作结果
 */
function enqueueWrite(fn) {
  const result = _writeQueue.then(() => fn())
  // 确保队列链不因前一个操作失败而断裂，同时保留当前操作的错误传播
  _writeQueue = result.catch(() => {}).then(() => {})
  return result
}

/**
 * 获取所有 LLM 配置
 */
export function getLLMProfiles() {
  try {
    if (fs.existsSync(LLM_PROFILES_FILE)) {
      const data = fs.readFileSync(LLM_PROFILES_FILE, 'utf-8')
      const profiles = JSON.parse(data)

      // 迁移：为没有 streamEnabled 字段的配置添加默认值
      let migrated = false
      profiles.forEach(profile => {
        if (profile.streamEnabled === undefined) {
          profile.streamEnabled = true // 默认启用
          migrated = true
        }
        // 迁移：为没有 useNativeApi 字段的配置添加默认值
        if (profile.useNativeApi === undefined) {
          profile.useNativeApi = false // 默认使用 OpenAI 兼容模式
          migrated = true
        }
        // 迁移：为没有 proxy 字段的配置添加默认值
        if (profile.proxy === undefined) {
          profile.proxy = { ...DEFAULT_PROFILE_PROXY }
          migrated = true
        }
      })

      // 如果有迁移，保存更新后的配置
      if (migrated) {
        saveLLMProfiles(profiles)
        log.info('已迁移配置，添加 streamEnabled 字段')
      }

      return profiles
    }
  } catch (error) {
    log.error('加载 LLM 配置列表失败', error)
  }
  return []
}

/**
 * 保存所有 LLM 配置
 */
function saveLLMProfiles(profiles) {
  try {
    ensureConfigDir(LLM_PROFILES_FILE)
    fs.writeFileSync(LLM_PROFILES_FILE, JSON.stringify(profiles, null, 2))
    return true
  } catch (error) {
    log.error('保存 LLM 配置列表失败', error)
    return false
  }
}

/**
 * 添加新的 LLM 配置（串行化，防止并发冲突）
 */
export function addLLMProfile(profile) {
  return enqueueWrite(() => {
    try {
      const profiles = getLLMProfiles()

      // 检查名称是否重复
      if (profiles.some(p => p.name === profile.name)) {
        return { success: false, error: '配置名称已存在' }
      }

      const newProfile = {
        id: generateUUID(),
        ...profile,
        createdAt: new Date().toISOString()
      }

      profiles.push(newProfile)

      if (saveLLMProfiles(profiles)) {
        return { success: true, data: newProfile }
      } else {
        return { success: false, error: '保存配置失败' }
      }
    } catch (error) {
      log.error('添加 LLM 配置失败', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * 更新 LLM 配置（串行化，防止并发冲突）
 */
export function updateLLMProfile(id, data) {
  return enqueueWrite(() => {
    try {
      const profiles = getLLMProfiles()
      const index = profiles.findIndex(p => p.id === id)

      if (index === -1) {
        return { success: false, error: '配置不存在' }
      }

      // 检查名称是否重复（排除自己）
      if (data.name && profiles.some(p => p.id !== id && p.name === data.name)) {
        return { success: false, error: '配置名称已存在' }
      }

      profiles[index] = {
        ...profiles[index],
        ...data,
        id // 保持 ID 不变
      }

      if (saveLLMProfiles(profiles)) {
        return { success: true, data: profiles[index] }
      } else {
        return { success: false, error: '保存配置失败' }
      }
    } catch (error) {
      log.error('更新 LLM 配置失败', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * 删除 LLM 配置（串行化，防止并发冲突）
 */
export function deleteLLMProfile(id) {
  return enqueueWrite(() => {
    try {
      const profiles = getLLMProfiles()
      const index = profiles.findIndex(p => p.id === id)

      if (index === -1) {
        return { success: false, error: '配置不存在' }
      }

      profiles.splice(index, 1)

      if (saveLLMProfiles(profiles)) {
        return { success: true }
      } else {
        return { success: false, error: '保存配置失败' }
      }
    } catch (error) {
      log.error('删除 LLM 配置失败', error)
      return { success: false, error: error.message }
    }
  })
}
