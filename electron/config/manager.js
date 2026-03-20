/**
 * 全局配置管理器
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const LLM_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'llm-config.json')

/**
 * 默认 LLM 配置
 */
const DEFAULT_LLM_CONFIG = {
  provider: 'openai',
  apiKey: '',
  model: 'gpt-3.5-turbo',
  baseURL: ''
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = path.dirname(LLM_CONFIG_FILE)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * 获取全局 LLM 配置
 */
export function getGlobalLLMConfig() {
  try {
    if (fs.existsSync(LLM_CONFIG_FILE)) {
      const data = fs.readFileSync(LLM_CONFIG_FILE, 'utf-8')
      const config = { ...DEFAULT_LLM_CONFIG, ...JSON.parse(data) }
      console.log('[Config] 全局 LLM 配置已加载', {
        provider: config.provider,
        hasApiKey: !!config.apiKey,
        model: config.model
      })
      return config
    } else {
      console.log('[Config] 配置文件不存在，使用默认配置')
    }
  } catch (error) {
    console.error('[Config] 加载 LLM 配置失败', error)
  }
  return { ...DEFAULT_LLM_CONFIG }
}

/**
 * 保存全局 LLM 配置
 */
export function saveGlobalLLMConfig(config) {
  try {
    ensureConfigDir()
    fs.writeFileSync(LLM_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save LLM config:', error)
    return false
  }
}

/**
 * 获取默认 LLM 配置
 */
export function getDefaultLLMConfig() {
  return { ...DEFAULT_LLM_CONFIG }
}
