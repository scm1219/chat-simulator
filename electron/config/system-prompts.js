/**
 * 系统提示词模板管理
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'system-prompts.json')

/**
 * 默认系统提示词模板
 */
const DEFAULT_TEMPLATES = [
  {
    id: 'multi-role-basic',
    name: '多角色对话基础',
    content: '你将扮演一个"多角色对话模拟器"中的一员。你的任务是根据提供的场景和人物设定，生成符合人物性格的对话内容。请完全沉浸在角色中，用第一人称说话，不要跳出角色，不要进行旁白解释。',
    category: '基础'
  },
  {
    id: 'multi-role-immersive',
    name: '沉浸式多人对话',
    content: '你正在参与一场多角色群聊。请完全融入你所扮演的角色，根据角色设定展现独特的性格、说话方式和思维模式。回复时使用第一人称，可以回应其他角色的发言，形成自然的对话互动。让对话伙伴感觉在与真实的人交流。',
    category: '高级'
  },
  {
    id: 'character-consistency',
    name: '角色一致性',
    content: '在多人对话中，请始终保持角色的一致性。你的语言风格、用词习惯、情绪反应都应符合角色设定。不要因为其他角色的发言而改变自己的核心性格特征。如果角色有特定的口癖或表达习惯，请在回复中体现。',
    category: '核心'
  },
  {
    id: 'natural-interaction',
    name: '自然互动',
    content: '在群聊中，请像真人一样自然地参与对话。可以对其他角色的话题表示赞同、反对或补充，也可以主动提出新话题。回复要有情感起伏，有时简短有力，有时详细阐述，让对话节奏自然流畅。',
    category: '互动'
  },
  {
    id: 'historical-group',
    name: '历史人物群聊',
    content: '你正在模拟一位历史人物参与群聊。请根据该人物的生平、思想、语言风格和时代背景进行对话。使用符合时代特征的表达方式，可以引用该人物的经典语录或思想观点。在与其他历史人物对话时，可以展现不同时代观点的碰撞。',
    category: '场景'
  },
  {
    id: 'debate-discussion',
    name: '辩论讨论模式',
    content: '在群聊中，请积极参与讨论和辩论。根据你的角色立场发表观点，可以与其他角色进行观点交锋。保持逻辑清晰，论证有力，引用事实或例子支撑观点。但也要尊重其他参与者，可以在争论中寻求共识或保留各自意见。',
    category: '互动'
  },
  {
    id: 'casual-chat',
    name: '轻松闲聊',
    content: '请以轻松、自然、友好的方式参与群聊。像与老朋友聊天一样，可以使用口语化表达、网络用语或表情符号。可以开玩笑、吐槽、分享日常，让对话氛围轻松愉快。回复可以简短随意，不必每次都很正式。',
    category: '风格'
  },
  {
    id: 'story-driven',
    name: '剧情推动模式',
    content: '你正在参与一场有剧情发展的群聊。请根据当前剧情情境，推动故事向前发展。你的回复可以包含角色的内心活动、对场景的观察、以及推动剧情的行动或对话。让每次回复都为整个故事增添新的内容。',
    category: '场景'
  }
]

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = path.dirname(CONFIG_FILE)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * 获取所有系统提示词模板
 * @returns {Array} 模板列表
 */
export function getSystemPromptTemplates() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = fs.readFileSync(CONFIG_FILE, 'utf-8')
      const config = JSON.parse(data)
      return config.templates || DEFAULT_TEMPLATES
    } else {
      // 首次运行，创建默认配置文件
      saveSystemPromptTemplates(DEFAULT_TEMPLATES)
      return DEFAULT_TEMPLATES
    }
  } catch (error) {
    console.error('[SystemPrompts] 加载模板配置失败', error)
    return DEFAULT_TEMPLATES
  }
}

/**
 * 保存系统提示词模板
 * @param {Array} templates 模板列表
 * @returns {boolean} 是否成功
 */
export function saveSystemPromptTemplates(templates) {
  try {
    ensureConfigDir()
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ templates }, null, 2))
    return true
  } catch (error) {
    console.error('[SystemPrompts] 保存模板配置失败', error)
    return false
  }
}

/**
 * 重置为默认模板
 * @returns {Array} 默认模板列表
 */
export function resetSystemPromptTemplates() {
  saveSystemPromptTemplates(DEFAULT_TEMPLATES)
  return DEFAULT_TEMPLATES
}

/**
 * 添加自定义模板
 * @param {Object} template 模板对象 { name, content, category }
 * @returns {Object|null} 添加的模板或 null
 */
export function addSystemPromptTemplate(template) {
  try {
    const templates = getSystemPromptTemplates()
    const newTemplate = {
      id: `custom-${Date.now()}`,
      name: template.name,
      content: template.content,
      category: template.category || '自定义'
    }
    templates.push(newTemplate)
    saveSystemPromptTemplates(templates)
    return newTemplate
  } catch (error) {
    console.error('[SystemPrompts] 添加模板失败', error)
    return null
  }
}

/**
 * 更新模板
 * @param {string} id 模板 ID
 * @param {Object} data 更新数据
 * @returns {Object|null} 更新后的模板或 null
 */
export function updateSystemPromptTemplate(id, data) {
  try {
    const templates = getSystemPromptTemplates()
    const index = templates.findIndex(t => t.id === id)
    if (index === -1) {
      console.warn('[SystemPrompts] 未找到模板', id)
      return null
    }
    templates[index] = { ...templates[index], ...data }
    saveSystemPromptTemplates(templates)
    return templates[index]
  } catch (error) {
    console.error('[SystemPrompts] 更新模板失败', error)
    return null
  }
}

/**
 * 删除模板
 * @param {string} id 模板 ID
 * @returns {boolean} 是否成功
 */
export function deleteSystemPromptTemplate(id) {
  try {
    const templates = getSystemPromptTemplates()
    const index = templates.findIndex(t => t.id === id)
    if (index === -1) {
      console.warn('[SystemPrompts] 未找到模板', id)
      return false
    }
    templates.splice(index, 1)
    saveSystemPromptTemplates(templates)
    return true
  } catch (error) {
    console.error('[SystemPrompts] 删除模板失败', error)
    return false
  }
}

/**
 * 获取默认模板列表（用于前端展示）
 * @returns {Array} 默认模板列表
 */
export function getDefaultTemplates() {
  return DEFAULT_TEMPLATES
}
