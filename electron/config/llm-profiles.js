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
import { atomicWriteJson } from '../utils/atomic-write.js'
import { createLogger } from '../utils/logger.js'
import { encryptSecret, decryptSecret } from '../utils/secure-storage.js'

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
      let profiles = JSON.parse(data)

      // 防御：文件内容损坏或被篡改为非数组时回退为空列表
      if (!Array.isArray(profiles)) {
        log.warn('LLM 配置文件格式异常（非数组），已重置为空列表')
        profiles = []
      }

      // 读取后立即解密 apiKey：内存中的 Profile 始终持有明文
      // （须在下方迁移触发的 saveLLMProfiles 之前完成，否则会对存储密文二次加密）
      for (const profile of profiles) {
        if (profile.apiKey != null && profile.apiKey !== '') {
          profile.apiKey = decryptSecret(profile.apiKey)
        }
      }

      // 迁移：为没有 streamEnabled 字段的配置添加默认值
      let migrated = false
      profiles.forEach(profile => {
        if (profile.streamEnabled === undefined) {
          profile.streamEnabled = true // 默认启用
          migrated = true
        }
        // 迁移：为没有 useNativeApi 字段的配置添加默认值
        if (profile.useNativeApi === undefined) {
          // Ollama 默认使用原生 API（性能远优于 OpenAI 兼容端点，且避免间歇性 400）
          profile.useNativeApi = profile.provider === 'ollama'
          migrated = true
        }
        // 迁移：将误配为 OpenAI 兼容模式(false)的 Ollama 配置纠正为原生 API
        // 原因：/v1 端点对 MoE 模型极慢（18~30s/次）且偶发 400，原生 /api/chat 仅 1~2s
        if (profile.provider === 'ollama' && profile.useNativeApi === false) {
          profile.useNativeApi = true
          // 同步修正 baseURL：原生 API 不需要 /v1 后缀
          if (typeof profile.baseURL === 'string' && profile.baseURL.endsWith('/v1')) {
            profile.baseURL = profile.baseURL.slice(0, -3)
          }
          migrated = true
          log.info(`已将 Ollama 配置"${profile.name}"迁移为原生 API 模式`)
        }
        // 迁移：为没有 proxy 字段的配置添加默认值
        if (profile.proxy === undefined) {
          profile.proxy = { ...DEFAULT_PROFILE_PROXY }
          migrated = true
        }
      })

      // 如果有迁移，保存更新后的配置（入写队列，避免与并发写操作交错）
      if (migrated) {
        enqueueWrite(() => saveLLMProfiles(profiles))
        log.info('已迁移配置：补充 streamEnabled/useNativeApi/proxy 字段')
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
 * 内存中的 Profile 始终持有明文 apiKey（getLLMProfiles 已解密 / 渲染进程输入即为明文），
 * 落盘前统一加密，避免调用方各自加密导致的双重加密问题
 */
function saveLLMProfiles(profiles) {
  try {
    ensureConfigDir(LLM_PROFILES_FILE)
    const serialized = profiles.map(profile => ({ ...profile, apiKey: encryptSecret(profile.apiKey) }))
    atomicWriteJson(LLM_PROFILES_FILE, serialized)
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
        ...profile,
        id: generateUUID(),
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
