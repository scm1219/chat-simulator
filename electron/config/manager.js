/**
 * 全局配置管理器
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const LLM_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'llm-config.json')
const GACHA_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'gacha-config.json')

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

// ============ 抽卡配置 ============

/**
 * 默认抽卡提示词配置
 */
const DEFAULT_GACHA_CONFIG = {
  systemPrompt: `你是一个专业的角色设定专家。根据用户的提示（如果有的话），创造一个有趣、立体的角色。

请严格按照以下 JSON 格式返回角色信息，不要添加任何其他文字：

{
  "name": "角色名称",
  "gender": "male 或 female 或 other",
  "age": 数字年龄,
  "systemPrompt": "详细的人物设定，包括性格特点、背景故事、说话风格等（200-500字）"
}

要求：
1. 角色名称简洁有趣，2-8个字符
2. 性别必须是 male、female 或 other 之一
3. 年龄必须是数字
4. 人物设定要详细且有特色，包括：性格、背景、说话风格、行为习惯等
5. 避免创造过于常见或陈词滥调的角色
6. 如果用户提供了提示，请参考用户的提示生成角色
7. 只返回 JSON，不要有其他文字`,
  userPromptTemplate: '请根据以下提示生成一个角色：{hint}',
  defaultUserPrompt: '请随机生成一个有趣的角色'
}

/**
 * 获取抽卡配置
 */
export function getGachaConfig() {
  try {
    if (fs.existsSync(GACHA_CONFIG_FILE)) {
      const data = fs.readFileSync(GACHA_CONFIG_FILE, 'utf-8')
      const config = { ...DEFAULT_GACHA_CONFIG, ...JSON.parse(data) }
      return config
    }
  } catch (error) {
    console.error('[Config] 加载抽卡配置失败', error)
  }
  return { ...DEFAULT_GACHA_CONFIG }
}

/**
 * 保存抽卡配置
 */
export function saveGachaConfig(config) {
  try {
    ensureConfigDir()
    fs.writeFileSync(GACHA_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('[Config] 保存抽卡配置失败', error)
    return false
  }
}

/**
 * 获取默认抽卡配置
 */
export function getDefaultGachaConfig() {
  return { ...DEFAULT_GACHA_CONFIG }
}
