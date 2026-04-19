/**
 * 全局配置管理器
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ensureConfigDir } from '../utils/config-dir.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Config')

const LLM_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'llm-config.json')
const GACHA_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'gacha-config.json')
const QUICK_GROUP_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'quick-group-config.json')

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
 * 获取全局 LLM 配置
 */
export function getGlobalLLMConfig() {
  try {
    if (fs.existsSync(LLM_CONFIG_FILE)) {
      const data = fs.readFileSync(LLM_CONFIG_FILE, 'utf-8')
      return { ...DEFAULT_LLM_CONFIG, ...JSON.parse(data) }
    }
  } catch (error) {
    log.error('加载 LLM 配置失败', error)
  }
  return { ...DEFAULT_LLM_CONFIG }
}

/**
 * 保存全局 LLM 配置
 */
export function saveGlobalLLMConfig(config) {
  try {
    ensureConfigDir(LLM_CONFIG_FILE)
    fs.writeFileSync(LLM_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    log.error('保存 LLM 配置失败', error)
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
    log.error('加载抽卡配置失败', error)
  }
  return { ...DEFAULT_GACHA_CONFIG }
}

/**
 * 保存抽卡配置
 */
export function saveGachaConfig(config) {
  try {
    ensureConfigDir(GACHA_CONFIG_FILE)
    fs.writeFileSync(GACHA_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    log.error('保存抽卡配置失败', error)
    return false
  }
}

/**
 * 获取默认抽卡配置
 */
export function getDefaultGachaConfig() {
  return { ...DEFAULT_GACHA_CONFIG }
}

// ============ 快速建群配置 ============

/**
 * 默认快速建群提示词配置
 */
const DEFAULT_QUICK_GROUP_CONFIG = {
  systemPrompt: `你是一个专业的聊天群组设计专家。根据用户的简单描述，生成一个完整的聊天群组方案，包括群名称、群背景设定、用户角色设定和多个AI角色。

请严格按照以下 JSON 格式返回群组信息，不要添加任何其他文字：

{
  "name": "群名称（简洁有趣，2-10个字符）",
  "background": "群组背景设定（场景描述、时间、氛围、人物关系等，100-300字）",
  "user": {
    "name": "用户在群中的姓名",
    "systemPrompt": "用户的身份设定，包括在群中的角色身份、背景、与其他角色的关系等（50-150字）"
  },
  "characters": [
    {
      "name": "角色名称",
      "gender": "male 或 female 或 other",
      "age": 数字年龄,
      "systemPrompt": "详细的人物设定，包括性格特点、背景故事、说话风格、与其他角色的关系等（200-500字）"
    }
  ]
}

要求：
1. 群名称要简洁有趣，能体现群组主题
2. 群背景设定要具体，包含时间、地点、氛围等细节，为角色对话提供场景
3. user 字段为用户在群中的身份设定，姓名要符合群组背景场景（如办公室群可叫"小李"，古代群可叫"少侠"），设定要简洁
4. 根据用户描述中的角色数量要求生成对应数量的AI角色
5. 每个角色的性别、年龄要符合用户要求
6. 角色之间要有明确的关系和互动可能性
7. 人物设定要详细且有特色，性格鲜明，说话风格各异
8. 角色之间的关系要自然，有张力或趣味性
9. 只返回 JSON，不要有其他文字`,
  userPromptTemplate: '请根据以下描述生成一个聊天群组：{description}',
  defaultUserPrompt: '请随机生成一个有趣的多人聊天群组，包含4-6个角色'
}

/**
 * 获取快速建群配置
 */
export function getQuickGroupConfig() {
  try {
    if (fs.existsSync(QUICK_GROUP_CONFIG_FILE)) {
      const data = fs.readFileSync(QUICK_GROUP_CONFIG_FILE, 'utf-8')
      const config = { ...DEFAULT_QUICK_GROUP_CONFIG, ...JSON.parse(data) }
      return config
    }
  } catch (error) {
    log.error('加载快速建群配置失败', error)
  }
  return { ...DEFAULT_QUICK_GROUP_CONFIG }
}

/**
 * 保存快速建群配置
 */
export function saveQuickGroupConfig(config) {
  try {
    ensureConfigDir(QUICK_GROUP_CONFIG_FILE)
    fs.writeFileSync(QUICK_GROUP_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    log.error('保存快速建群配置失败', error)
    return false
  }
}

/**
 * 获取默认快速建群配置
 */
export function getDefaultQuickGroupConfig() {
  return { ...DEFAULT_QUICK_GROUP_CONFIG }
}
