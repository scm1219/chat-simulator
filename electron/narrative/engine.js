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

  /**
   * 对话前处理：更新所有角色情绪 + 构建叙事上下文
   * 所有角色（含发言角色）都会通过关键词快速更新情绪
   * 发言角色后续在 postCharacterResponse 中还会进行 LLM 深度推断
   */
  preGenerate(db, characterId, groupId, userContent, senderCharacterId, allCharacters) {
    // 关键词快速判断情绪更新（所有角色）
    for (const char of allCharacters) {
      this.emotion.updateFromMessage(db, char.id, userContent)
    }
    return this.promptBuilder.buildNarrativeContext(db, characterId, groupId, allCharacters)
  }

  /**
   * 对话后处理：好感度更新 + LLM 情绪推断
   * @param {object} db - 数据库连接
   * @param {string} characterId - 回复角色 ID
   * @param {string} groupId - 群组 ID
   * @param {string} userContent - 用户消息内容
   * @param {string} responseContent - 角色回复内容
   * @param {Array} allCharacters - 所有角色
   * @param {object} clientCtx - LLM 客户端上下文 { createClientForCharacter, group, llmProfiles, apiKey }
   */
  async postCharacterResponse(db, characterId, groupId, userContent, responseContent, allCharacters, clientCtx) {
    const { createClientForCharacter, group, llmProfiles, apiKey } = clientCtx

    // 构建角色名→ID映射（用于@提及解析）
    const characterNameMap = new Map(allCharacters.map(c => [c.name, c.id]))

    // 好感度更新（双向 + @解析 + 多模式匹配）
    for (const char of allCharacters) {
      if (char.id === characterId) continue
      const emotion = this.emotion.getEmotion(db, char.id)
      const result = this.relationship.updateFavorability(
        db, characterId, char.id, responseContent, emotion, characterNameMap
      )
      if (result.change !== 0) {
        console.log(`[Narrative] 好感度变化: ${characterId} → ${char.id} (${result.reason}) ${result.change > 0 ? '+' : ''}${result.change}${result.reverseChange ? ` (反向${result.reverseChange > 0 ? '+' : ''}${result.reverseChange})` : ''}`)
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
            content: '根据以下对话片段，判断角色当前的情绪。返回 JSON：{"emotion":"情绪词","intensity":0.0-1.0}。只返回 JSON，不要其他内容。可选情绪：开心、愤怒、尴尬、感动、悲伤、惊讶、嫉妒、疲惫、紧张、惊慌、好奇、无奈、沮丧、焦虑、恐慌、平静。'
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

  /**
   * 生成余波追评
   * @param {object} db - 数据库连接
   * @param {string} groupId - 群组 ID
   * @param {string} userContent - 用户消息内容
   * @param {Array} allResponses - 所有角色回复
   * @param {Array} allCharacters - 所有角色
   * @param {object} clientCtx - LLM 客户端上下文 { createClientForCharacter, group, llmProfiles, apiKey }
   * @returns {Promise<Array>} 余波消息列表
   */
  async generateAftermath(db, groupId, userContent, allResponses, allCharacters, clientCtx) {
    const { createClientForCharacter, group, llmProfiles, apiKey } = clientCtx
    if (!group || group.narrative_enabled !== 1 || group.aftermath_enabled !== 1) return []
    // 默认随机触发（60% 概率），高情绪/角色提及/紧张关系时必定触发
    if (!this._shouldTriggerAftermath(allResponses, allCharacters, db, groupId)) return []

    try {
      // 加权选择触发者：优先选择情绪强度最高的角色
      const eligibleChars = allCharacters.filter(c => !c.is_user)
      if (eligibleChars.length === 0) return []
      const triggerChar = this._selectAftermathTrigger(db, eligibleChars)
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

  /**
   * 清理角色相关的所有叙事数据
   * 在角色删除时调用，清理情绪记录和双向关系记录
   */
  removeCharacter(db, characterId) {
    // 清理情绪记录
    db.prepare('DELETE FROM character_emotions WHERE character_id = ?').run(characterId)
    // 清理关系记录（双向：作为 from_id 和 to_id 的记录都要删除）
    db.prepare('DELETE FROM character_relationships WHERE from_id = ?').run(characterId)
    db.prepare('DELETE FROM character_relationships WHERE to_id = ?').run(characterId)
    console.log(`[Narrative] 已清理角色 ${characterId} 的叙事数据`)
  }

  /**
   * 选择余波触发者
   * 策略：优先选择情绪强度最高的角色，情绪都低时随机选择
   */
  _selectAftermathTrigger(db, eligibleChars) {
    let bestChar = null
    let bestIntensity = 0

    for (const char of eligibleChars) {
      const emotion = this.emotion.getEmotion(db, char.id)
      if (emotion.intensity > bestIntensity) {
        bestIntensity = emotion.intensity
        bestChar = char
      }
    }

    // 情绪强度 >= 0.5 时选择情绪最高的角色，否则随机
    if (bestChar && bestIntensity >= 0.5) {
      return bestChar
    }
    return eligibleChars[Math.floor(Math.random() * eligibleChars.length)]
  }

  _shouldTriggerAftermath(responses, allCharacters, db, groupId) {
    // 空数组保护：先计算活跃角色 ID
    const activeIds = responses.filter(r => r.success).map(r => r.characterId)
    if (activeIds.length === 0) return false

    // 高情绪必定触发（仅检查参与对话的角色）
    const highEmotions = db.prepare(
      `SELECT COUNT(*) as count FROM character_emotions
       WHERE intensity > 0.7 AND character_id IN (${activeIds.map(() => '?').join(',')})`
    ).get(...activeIds)
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
    const tenseRels = db.prepare(`
      SELECT COUNT(*) as count FROM character_relationships
      WHERE favorability < -20 AND from_id IN (${activeIds.map(() => '?').join(',')})
    `).get(...activeIds)
    if (tenseRels.count > 0) return true

    // 默认 60% 随机触发
    return Math.random() < 0.6
  }

  _parseSingleAftermath(content, triggerChar, db, groupId, tokenInfo = {}) {
    // 清理 LLM 输出中可能残留的角色名前缀
    let text = content.trim()
    const prefixPattern = new RegExp(`^${triggerChar.name}[：:，,]\\s*`)
    text = text.replace(prefixPattern, '').trim()
    // 去除引号包裹
    if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('\u201C') && text.endsWith('\u201D'))) {
      text = text.slice(1, -1)
    }
    // 统一上限 50 字，与 Prompt 要求一致
    if (!text || text.length > 50) return []

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
