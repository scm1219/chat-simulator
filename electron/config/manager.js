/**
 * 全局配置管理器
 * 使用工厂函数统一管理配置的读取、保存和默认值
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ensureConfigDir } from '../utils/config-dir.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Config')

// ============ 配置文件路径 ============

const LLM_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'llm-config.json')
const GACHA_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'gacha-config.json')
const QUICK_GROUP_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'quick-group-config.json')

// ============ 默认配置 ============

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
 * 默认抽卡提示词配置
 */
const DEFAULT_GACHA_CONFIG = {
  systemPrompt: `你擅长创造真实、鲜活的角色。想象你身边一个真实存在的人，用写朋友介绍的方式而不是角色设定文档的方式。

请严格按照以下 JSON 格式返回，不要添加任何其他文字：

{
  "name": "角色名称",
  "gender": "male 或 female 或 other",
  "age": 数字年龄,
  "systemPrompt": "用第二人称写这个角色的自然描述（100-300字）"
}

systemPrompt 写法要求：
- 用"你是xxx"开头，像在跟一个真人介绍另一个人
- 写这个人的性格怎么体现（比如"说话慢，喜欢先想再说"而不是"性格沉稳"）
- 写具体的习惯和口头禅（比如"经常说'不是吧'开头"、"聊到吃的就来劲"）
- 写真实的背景细节（比如"在奶茶店打工三年"、"考研二战失败"），不要用概括性描述
- 不要用"设定"、"背景"、"性格"这类分类标题，就是一段自然的描述
- 不要写"你是一个xxx的角色"、"请扮演xxx"这类元叙事
- 避免完美人设，真实的缺点更有趣（比如"容易激动"、"爱炫耀但经常翻车"）
- 如果用户提供了提示，请参考提示生成
- 只返回 JSON，不要有其他文字`,
  userPromptTemplate: '请根据以下提示生成一个角色：{hint}',
  defaultUserPrompt: '请随机生成一个有趣的普通人角色'
}

/**
 * 默认快速建群提示词配置
 */
const DEFAULT_QUICK_GROUP_CONFIG = {
  systemPrompt: `你擅长设计真实感强的聊天群组。想象一个你真的会加入的群，里面是你身边会出现的真人。

请严格按照以下 JSON 格式返回，不要添加任何其他文字：

{
  "name": "群名称（2-10个字符）",
  "background": "群组场景的自然描述（100-300字）",
  "user": {
    "name": "用户在群中的姓名",
    "systemPrompt": "用户身份的自然描述（50-150字）"
  },
  "characters": [
    {
      "name": "角色名称",
      "gender": "male 或 female 或 other",
      "age": 数字年龄,
      "systemPrompt": "用第二人称写这个角色的自然描述（100-300字）"
    }
  ]
}

systemPrompt 写法要求：
- 用"你是xxx"开头，像在跟一个真人介绍另一个人
- 写具体的习惯和口头禅，不要写概括性的"性格xxx"
- 写真实的背景细节（具体的工作、经历），不要用模板化的描述
- 不要用"设定"、"背景"、"性格特点"这类分类标题，就是一段自然的描述
- 角色要有缺点和小毛病，不要完美人设
- 角色之间要有自然的交集（同事、同学、邻居等），不是强行凑在一起

其他要求：
1. 群名称简洁自然，像真实的群名
2. 背景描述写具体的时间、地点和氛围，像在描述一个你见过的场景
3. 用户的姓名和身份要融入群组背景
4. 根据用户描述的角色数量和性别要求生成
5. 只返回 JSON，不要有其他文字`,
  userPromptTemplate: '请根据以下描述生成一个聊天群组：{description}',
  defaultUserPrompt: '请随机生成一个有趣的多人聊天群组，包含4-6个角色'
}

// ============ 通用配置工厂函数 ============

/**
 * 创建配置管理器
 * 统一配置的读取、保存和默认值逻辑，消除重复代码
 * @param {string} configFilePath - 配置文件路径
 * @param {object} defaults - 默认配置对象
 * @param {string} label - 配置名称（用于日志）
 * @returns {{ get: () => object, save: (config: object) => boolean, getDefault: () => object }}
 */
function createConfigManager(configFilePath, defaults, label) {
  return {
    get() {
      try {
        if (fs.existsSync(configFilePath)) {
          const data = fs.readFileSync(configFilePath, 'utf-8')
          return { ...defaults, ...JSON.parse(data) }
        }
      } catch (error) {
        log.error(`加载${label}配置失败`, error)
      }
      return { ...defaults }
    },
    save(config) {
      try {
        ensureConfigDir(configFilePath)
        fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2))
        return true
      } catch (error) {
        log.error(`保存${label}配置失败`, error)
        return false
      }
    },
    getDefault() {
      return { ...defaults }
    }
  }
}

// ============ 创建配置实例 ============

const llmConfigManager = createConfigManager(LLM_CONFIG_FILE, DEFAULT_LLM_CONFIG, 'LLM')
const gachaConfigManager = createConfigManager(GACHA_CONFIG_FILE, DEFAULT_GACHA_CONFIG, '抽卡')
const quickGroupConfigManager = createConfigManager(QUICK_GROUP_CONFIG_FILE, DEFAULT_QUICK_GROUP_CONFIG, '快速建群')

// ============ 导出（保持原有函数签名，确保向后兼容） ============

// LLM 配置
export const getGlobalLLMConfig = () => llmConfigManager.get()
export const saveGlobalLLMConfig = (config) => llmConfigManager.save(config)
export const getDefaultLLMConfig = () => llmConfigManager.getDefault()

// 抽卡配置
export const getGachaConfig = () => gachaConfigManager.get()
export const saveGachaConfig = (config) => gachaConfigManager.save(config)
export const getDefaultGachaConfig = () => gachaConfigManager.getDefault()

// 快速建群配置
export const getQuickGroupConfig = () => quickGroupConfigManager.get()
export const saveQuickGroupConfig = (config) => quickGroupConfigManager.save(config)
export const getDefaultQuickGroupConfig = () => quickGroupConfigManager.getDefault()
