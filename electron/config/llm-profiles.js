/**
 * LLM 配置文件管理器
 * 管理多个 LLM 配置的增删改查
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { generateUUID } from '../utils/uuid.js'

const LLM_PROFILES_FILE = path.join(app.getPath('userData'), 'config', 'llm-profiles.json')

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = path.dirname(LLM_PROFILES_FILE)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * 获取所有 LLM 配置
 */
export function getLLMProfiles() {
  try {
    if (fs.existsSync(LLM_PROFILES_FILE)) {
      const data = fs.readFileSync(LLM_PROFILES_FILE, 'utf-8')
      return JSON.parse(data)
    }
  } catch (error) {
    console.error('Failed to load LLM profiles:', error)
  }
  return []
}

/**
 * 保存所有 LLM 配置
 */
function saveLLMProfiles(profiles) {
  try {
    ensureConfigDir()
    fs.writeFileSync(LLM_PROFILES_FILE, JSON.stringify(profiles, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save LLM profiles:', error)
    return false
  }
}

/**
 * 添加新的 LLM 配置
 */
export function addLLMProfile(profile) {
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
    console.error('Failed to add LLM profile:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 更新 LLM 配置
 */
export function updateLLMProfile(id, data) {
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
    console.error('Failed to update LLM profile:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 删除 LLM 配置
 */
export function deleteLLMProfile(id) {
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
    console.error('Failed to delete LLM profile:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 根据 ID 获取 LLM 配置
 */
export function getLLMProfileById(id) {
  try {
    const profiles = getLLMProfiles()
    return profiles.find(p => p.id === id) || null
  } catch (error) {
    console.error('Failed to get LLM profile by id:', error)
    return null
  }
}
