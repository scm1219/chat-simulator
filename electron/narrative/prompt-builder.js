/**
 * 叙事上下文 Prompt 构建器
 * 将情绪、关系、事件状态注入 LLM system prompt
 */

import { TONE_HINTS, EMOTION_KEYWORDS, getFavorabilityLevel, getRelationshipType } from './constants.js'
import { prepareCached } from '../utils/statement-cache.js'

export class NarrativePromptBuilder {

  /**
   * 构建 LLM 事件推荐 prompt（纯函数，不访问 db）
   * @param {object} input - 上下文数据
   * @param {string} input.sceneLabel - 场景中文标签
   * @param {string|null} input.background - 群背景
   * @param {Array<{id: string, name: string, system_prompt: string}>} input.characters - 群成员
   * @param {Array<{character_id: string, emotion: string, intensity: number}>} input.emotions - 活跃情绪
   * @param {Array<{from_id: string, to_id: string, type: string, favorability: number}>} input.relationships - 角色关系
   * @param {Array<{content: string, impact: string}>} input.sampleEvents - 静态池示例事件
   * @param {Array<{role: string, character_name: string|null, content: string}>} input.recentMessages - 最近对话
   * @param {number} input.count - 生成事件数
   * @returns {string} 完整 prompt
   */
  buildEventSuggestionPrompt({ sceneLabel, background, characters, emotions, relationships, sampleEvents, recentMessages, count }) {
    const sections = []

    sections.push(`请为下面这个群聊生成 ${count} 个突发事件，用来推动剧情发展。`)

    const sceneParts = [`场景：${sceneLabel}`]
    if (background) sceneParts.push(`背景：${background}`)
    sections.push(sceneParts.join('\n'))

    const memberLines = characters.map(c => {
      const firstLine = c.system_prompt?.split('\n').find(l => l.trim()) || c.name
      const summary = firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine
      return `- ${c.name}: ${summary}`
    })
    if (memberLines.length > 0) sections.push(`群成员：\n${memberLines.join('\n')}`)

    if (emotions && emotions.length > 0) {
      const nameMap = new Map(characters.map(c => [c.id, c.name]))
      const emotionLines = emotions.map(e =>
        `- ${nameMap.get(e.character_id) || '未知角色'}（${e.emotion} ${Number(e.intensity).toFixed(1)}）`
      )
      sections.push(`当前情绪：\n${emotionLines.join('\n')}`)
    }

    if (relationships && relationships.length > 0) {
      const nameMap = new Map(characters.map(c => [c.id, c.name]))
      const relLines = relationships.map(r => {
        const level = getFavorabilityLevel(r.favorability)
        const typeConfig = getRelationshipType(r.type)
        return `- ${nameMap.get(r.from_id) || '未知角色'} → ${nameMap.get(r.to_id) || '未知角色'}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）`
      })
      sections.push(`角色关系：\n${relLines.join('\n')}`)
    }

    if (recentMessages && recentMessages.length > 0) {
      const chatLines = recentMessages.map(m => {
        const prefix = m.role === 'assistant' ? (m.character_name || '角色') : '用户'
        return `${prefix}：${m.content}`
      })
      sections.push(`最近对话：\n${chatLines.join('\n')}`)
    }

    if (sampleEvents && sampleEvents.length > 0) {
      const sampleLines = sampleEvents.map(e => `- ${e.content}（${e.impact}）`)
      sections.push(`事件风格示例（仅作参考，不要照抄）：\n${sampleLines.join('\n')}`)
    }

    const emotionWords = Object.keys(EMOTION_KEYWORDS).join('、')
    sections.push(`输出要求：
- 只返回 JSON，格式 {"events":[{"content":"事件描述","impact":"情绪词"}]}，不要输出其他内容
- 恰好 ${count} 条
- impact 只能从这些词中选：${emotionWords}
- 每条 content 不超过 40 字
- 事件要贴合当前剧情、场景与人物关系，可以涉及具体角色
- 事件应能引发讨论、推动对话`)

    return sections.join('\n\n')
  }

  buildNarrativeContext(db, characterId, groupId, allCharacters) {
    const contextMessages = []
    const emotionSection = this._buildEmotionSection(db, allCharacters)
    if (emotionSection) {
      contextMessages.push({ role: 'system', content: emotionSection })
    }
    const relationshipSection = this._buildRelationshipSection(db, characterId, allCharacters)
    if (relationshipSection) {
      contextMessages.push({ role: 'system', content: relationshipSection })
    }
    const eventSection = this._buildEventSection(db, groupId)
    if (eventSection) {
      contextMessages.push({ role: 'system', content: eventSection })
    }
    return contextMessages
  }

  buildAftermathPrompt(db, groupId, triggerChar, allCharacters, recentMessages) {
    // 余波只需触发者自身的情绪和关系信息，减少 token 消耗
    const emotionSection = this._buildEmotionSection(db, [triggerChar])
    const relationshipSection = this._buildRelationshipSection(db, triggerChar.id, allCharacters)
    const recentChat = recentMessages.slice(-10).map(m => {
      const prefix = m.role === 'assistant' ? (m.character_name || '角色') : '用户'
      return `${prefix}：${m.content}`
    }).join('\n')

    return `你是${triggerChar.name}，刚看完上面的对话，想说一句简短的追评或反应。
要求：
- 直接输出你说的话，不要加角色名前缀
- 不超过 50 字
- 符合你当前的情绪和与其他角色的关系
- 不要重复对话中已经说过的话

${emotionSection ? emotionSection + '\n' : ''}${relationshipSection ? relationshipSection + '\n' : ''}
最近对话：
${recentChat}

${triggerChar.name}的追评：`
  }

  _buildEmotionSection(db, allCharacters) {
    const characterIds = allCharacters.map(c => c.id)
    // 空数组防护：避免生成 "IN ()" 非法 SQL
    if (characterIds.length === 0) return ''
    const placeholders = characterIds.map(() => '?').join(',')
    const emotions = prepareCached(db,
      `SELECT * FROM character_emotions WHERE intensity > 0.1 AND character_id IN (${placeholders})`
    ).all(...characterIds)
    if (emotions.length === 0) return ''
    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = emotions.map(e => {
      const name = characterMap.get(e.character_id) || '未知角色'
      const toneHint = TONE_HINTS[e.emotion] || '请根据情绪调整语气'
      return `- ${name}（当前情绪：${e.emotion} ${e.intensity.toFixed(1)}）— ${toneHint}`
    })
    return `现在大家的情绪：\n${lines.join('\n')}`
  }

  _buildRelationshipSection(db, characterId, allCharacters) {
    const relationships = prepareCached(db,
      'SELECT * FROM character_relationships WHERE from_id = ?'
    ).all(characterId)
    if (relationships.length === 0) return ''
    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = relationships.map(r => {
      const toName = characterMap.get(r.to_id) || '未知角色'
      const level = getFavorabilityLevel(r.favorability)
      const typeConfig = getRelationshipType(r.type)
      return `- ${characterMap.get(characterId) || '你'} → ${toName}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）— ${level.hint}`
    })
    return `你和他们的关系：\n${lines.join('\n')}`
  }

  _buildEventSection(db, groupId) {
    const events = prepareCached(db, `
      SELECT * FROM narrative_events WHERE group_id = ?
      AND datetime(created_at) > datetime('now', 'localtime', '-1 hour')
      ORDER BY created_at DESC LIMIT 3
    `).all(groupId)
    if (events.length === 0) return ''
    const lines = events.map(e => `[${e.event_type === 'user_triggered' ? '事件' : '自动事件'}] ${e.content}`)
    return `刚刚发生了这些事：\n${lines.join('\n')}`
  }
}
