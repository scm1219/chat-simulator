/**
 * 叙事引擎主控
 * 编排情绪、关系、事件三个子系统，集成到 LLM 对话流程
 */

import { EmotionManager } from './emotion-manager.js'
import { RelationshipManager } from './relationship-manager.js'
import { EventTrigger } from './event-trigger.js'
import { NarrativePromptBuilder } from './prompt-builder.js'
import { extractJSON } from '../utils/json-extractor.js'
import { generateUUID } from '../utils/uuid.js'

export class NarrativeEngine {
  constructor() {
    this.emotion = new EmotionManager()
    this.relationship = new RelationshipManager()
    this.eventTrigger = new EventTrigger()
    this.promptBuilder = new NarrativePromptBuilder()
  }

  setDBManager(dbManager) {
    this._dbManager = dbManager
  }

  _getGroupDB(groupId) {
    return this._dbManager.getGroupDB(groupId)
  }

  preGenerate(db, characterId, groupId, userContent, senderCharacterId, allCharacters) {
    // 关键词快速判断情绪更新（针对所有角色）
    for (const char of allCharacters) {
      if (char.id === characterId) continue
      this.emotion.updateFromMessage(db, char.id, userContent)
    }
    return this.promptBuilder.buildNarrativeContext(db, characterId, groupId, allCharacters)
  }

  async postCharacterResponse(db, characterId, groupId, userContent, responseContent, allCharacters, createClientForCharacter, group, llmProfiles, apiKey) {
    // 好感度更新
    for (const char of allCharacters) {
      if (char.id === characterId) continue
      const emotion = this.emotion.getEmotion(db, char.id)
      const result = this.relationship.updateFavorability(db, characterId, char.id, responseContent, emotion)
      if (result.change !== 0) {
        console.log(`[Narrative] 好感度变化: ${characterId} → ${char.id} (${result.reason}) ${result.change > 0 ? '+' : ''}${result.change}`)
      }
    }

    // LLM 情绪推断（关键节点）
    const shouldInfer = this.emotion.shouldInferFromLLM(db, characterId, userContent)
    if (shouldInfer) {
      try {
        const targetChar = allCharacters.find(c => c.id === characterId)
        const { client } = createClientForCharacter(targetChar, group, llmProfiles, apiKey)
        const inferMessages = [
          {
            role: 'system',
            content: '根据以下对话片段，判断角色当前的情绪。返回 JSON：{"emotion":"情绪词","intensity":0.0-1.0}。只返回 JSON，不要其他内容。'
          },
          {
            role: 'user',
            content: `用户说：${userContent}\n角色回复：${responseContent}`
          }
        ]
        const inferResult = await client.chat(inferMessages, {
          maxTokens: 100,
          thinkingEnabled: false,
          responseFormat: { type: 'json_object' }
        })
        if (inferResult.success && inferResult.content) {
          const parsed = extractJSON(inferResult.content)
          if (parsed.success && parsed.data) {
            this.emotion.updateFromLLM(db, characterId, parsed.data.emotion, parsed.data.intensity)
          }
        }
      } catch (err) {
        console.error('[Narrative] LLM 情绪推断失败，降级为关键词规则:', err.message)
      }
    }

    return { aftermath: null }
  }

  async generateAftermath(db, groupId, userContent, allResponses, allCharacters, createClientForCharacter, group, llmProfiles, apiKey) {
    if (!group || group.narrative_enabled !== 1 || group.aftermath_enabled !== 1) return []
    // 默认随机触发（60% 概率），高情绪/角色提及/紧张关系时必定触发
    if (!this._shouldTriggerAftermath(allResponses, allCharacters, db, groupId)) return []

    try {
      // 随机选择一个非用户角色作为余波触发者
      const eligibleChars = allCharacters.filter(c => !c.is_user)
      if (eligibleChars.length === 0) return []
      const triggerChar = eligibleChars[Math.floor(Math.random() * eligibleChars.length)]
      console.log(`[Narrative] 余波触发角色: ${triggerChar.name}`)

      const { client } = createClientForCharacter(triggerChar, group, llmProfiles, apiKey)
      const recentMessages = db.prepare(`
        SELECT * FROM messages WHERE group_id = ? ORDER BY timestamp DESC LIMIT 20
      `).all(groupId).reverse()

      const prompt = this.promptBuilder.buildAftermathPrompt(db, groupId, triggerChar, allCharacters, recentMessages)
      const result = await client.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 150, thinkingEnabled: false }
      )

      if (!result.success || !result.content) return []
      return this._parseSingleAftermath(result.content, triggerChar, db, groupId, {
        model: result.model || null,
        promptTokens: result.usage?.prompt_tokens || 0,
        completionTokens: result.usage?.completion_tokens || 0
      })
    } catch (err) {
      console.error('[Narrative] 余波生成失败:', err.message)
      return []
    }
  }

  checkStaleness(db, groupId) {
    return this.eventTrigger.checkStaleness(db, groupId)
  }

  getEventSuggestions(db, groupId, sceneType, count = 3) {
    return this.eventTrigger.getEventSuggestions(db, groupId, sceneType, count)
  }

  triggerEvent(db, groupId, eventKey, content, impact, triggeredBy = 'user') {
    return this.eventTrigger.triggerEvent(db, groupId, eventKey, content, impact, triggeredBy)
  }

  deleteEvent(db, eventId) {
    return this.eventTrigger.deleteEvent(db, eventId)
  }

  _shouldTriggerAftermath(responses, allCharacters, db, groupId) {
    // 高情绪必定触发
    const highEmotions = db.prepare(
      'SELECT COUNT(*) as count FROM character_emotions WHERE intensity > 0.7'
    ).get()
    if (highEmotions.count > 0) return true
    // 角色提及必定触发
    const characterNames = allCharacters.map(c => c.name)
    for (const resp of responses) {
      if (!resp.success || !resp.content) continue
      for (const name of characterNames) {
        if (resp.content.includes(name) && resp.characterName !== name) return true
      }
    }
    // 紧张关系必定触发
    const activeIds = responses.filter(r => r.success).map(r => r.characterId)
    if (activeIds.length > 0) {
      const tenseRels = db.prepare(`
        SELECT COUNT(*) as count FROM character_relationships
        WHERE favorability < -20 AND from_id IN (${activeIds.map(() => '?').join(',')})
      `).get(...activeIds)
      if (tenseRels.count > 0) return true
    }
    // 默认 60% 随机触发
    return Math.random() < 0.6
  }

  _parseAftermath(content, allCharacters, db, groupId) {
    const characterMap = new Map(allCharacters.map(c => [c.name, c.id]))
    const messages = []
    const lines = content.split('\n').filter(l => l.trim())
    for (const line of lines) {
      const match = line.match(/^([^:：]+)[：:](.+)$/)
      if (!match) continue
      const name = match[1].trim()
      const text = match[2].trim()
      if (text.length > 50) continue
      const characterId = characterMap.get(name)
      if (!characterId) continue
      const msgId = generateUUID()
      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content)
        VALUES (?, ?, ?, 'assistant', ?)
      `).run(msgId, groupId, characterId, text)
      messages.push({
        id: msgId, groupId, characterId, characterName: name,
        role: 'assistant', content: text, isAftermath: true,
        timestamp: new Date().toISOString()
      })
      this.emotion.updateFromMessage(db, characterId, text)
    }
    return messages
  }

  _parseSingleAftermath(content, triggerChar, db, groupId, tokenInfo = {}) {
    // 清理 LLM 输出中可能残留的角色名前缀
    let text = content.trim()
    const prefixPattern = new RegExp(`^${triggerChar.name}[：:，,]\\s*`)
    text = text.replace(prefixPattern, '').trim()
    // 去除引号包裹
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('"') && text.endsWith('"'))) {
      text = text.slice(1, -1)
    }
    if (!text || text.length > 80) return []

    const msgId = generateUUID()
    db.prepare(`
      INSERT INTO messages (id, group_id, character_id, role, content, is_aftermath, message_type, model, prompt_tokens, completion_tokens)
      VALUES (?, ?, ?, 'assistant', ?, 1, 'aftermath', ?, ?, ?)
    `).run(msgId, groupId, triggerChar.id, text, tokenInfo.model || null, tokenInfo.promptTokens || 0, tokenInfo.completionTokens || 0)
    this.emotion.updateFromMessage(db, triggerChar.id, text)
    return [{
      id: msgId, groupId, characterId: triggerChar.id, characterName: triggerChar.name,
      role: 'assistant', content: text, isAftermath: true,
      model: tokenInfo.model || null,
      prompt_tokens: tokenInfo.promptTokens || 0,
      completion_tokens: tokenInfo.completionTokens || 0,
      timestamp: new Date().toISOString()
    }]
  }
}
