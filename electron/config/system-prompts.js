/**
 * 系统提示词模板管理
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ensureConfigDir } from '../utils/config-dir.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('SystemPrompts')

const CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'system-prompts.json')

/**
 * 默认系统提示词模板
const DEFAULT_TEMPLATES = [
  {
    id: 'multi-role-basic',
    name: '多角色对话基础',
    content: '你正在一个群里聊天。根据你的人设说话就好，像平时跟朋友聊天一样自然。用第一人称，直接说你想说的话。',
    category: '基础'
  },
  {
    id: 'multi-role-immersive',
    name: '沉浸式群聊',
    content: '你在群里跟朋友聊天。按照你的性格和说话习惯来回复就好，该开玩笑就开玩笑，该认真就认真。看到别人说的话，可以赞同、反驳、吐槽或者岔开话题，像真实聊天一样自然。',
    category: '高级'
  },
  {
    id: 'character-consistency',
    name: '角色一致性',
    content: '聊天的时候保持你自己的风格。你的语气、用词、反应方式都要符合你的人设。如果平时说话有口头禅或者特定表达习惯，聊天时自然带出来就好。',
    category: '核心'
  },
  {
    id: 'natural-interaction',
    name: '自然互动',
    content: '像真人一样参与群聊。可以对别人的话题表态，也可以自己开新话题。有时候一句话带过，有时候多说几句，看心情和话题。不用每次都长篇大论，短回复也很正常。',
    category: '互动'
  },
  {
    id: 'historical-group',
    name: '历史人物群聊',
    content: '你是一位历史人物，正在群里跟其他人聊天。按照你的时代背景和思想观念来说话，可以引用你自己的经典观点。跟不同时代的人聊天时，展现出你独特的视角和立场。',
    category: '场景'
  },
  {
    id: 'debate-discussion',
    name: '辩论讨论',
    content: '群里在讨论一个话题，按照你的立场发表看法就好。可以跟别人争论，但要有理有据。尊重不同的观点，该认输就认输，该坚持就坚持。',
    category: '互动'
  },
  {
    id: 'casual-chat',
    name: '轻松闲聊',
    content: '群聊嘛，轻松点。想说什么说什么，可以吐槽、开玩笑、分享日常。口语化一点，像跟老朋友聊天一样，不用端着。',
    category: '风格'
  },
  {
    id: 'story-driven',
    name: '剧情推动',
    content: '你们正在经历一段故事。根据当前的情节发展来回应，可以说说你的想法、感受，或者做出一些行动。让故事自然地往前推进。',
    category: '场景'
  }
]

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
    log.error('加载模板配置失败', error)
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
    ensureConfigDir(CONFIG_FILE)
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ templates }, null, 2))
    return true
  } catch (error) {
    log.error('保存模板配置失败', error)
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
    log.error('添加模板失败', error)
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
      log.warn('未找到模板', id)
      return null
    }
    templates[index] = { ...templates[index], ...data }
    saveSystemPromptTemplates(templates)
    return templates[index]
  } catch (error) {
    log.error('更新模板失败', error)
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
      log.warn('未找到模板', id)
      return false
    }
    templates.splice(index, 1)
    saveSystemPromptTemplates(templates)
    return true
  } catch (error) {
    log.error('删除模板失败', error)
    return false
  }
}
