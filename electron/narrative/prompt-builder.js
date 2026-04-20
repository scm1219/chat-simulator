/**
 * 叙事上下文 Prompt 构建器
 * 将情绪、关系、事件状态注入 LLM system prompt
 */

import { TONE_HINTS, getFavorabilityLevel, getRelationshipType } from './constants.js'

export class NarrativePromptBuilder {

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
    const placeholders = characterIds.map(() => '?').join(',')
    const emotions = db.prepare(
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
    const relationships = db.prepare(
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
    const events = db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ?
      AND datetime(created_at) > datetime('now', 'localtime', '-1 hour')
      ORDER BY created_at DESC LIMIT 3
    `).all(groupId)
    if (events.length === 0) return ''
    const lines = events.map(e => `[${e.event_type === 'user_triggered' ? '事件' : '自动事件'}] ${e.content}`)
    return `刚刚发生了这些事：\n${lines.join('\n')}`
  }
}
