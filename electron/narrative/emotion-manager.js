/**
 * 角色情绪管理器
 * 混合模式：关键词规则快速判断 + LLM 关键节点推断
 */

import { EMOTION_KEYWORDS, mapEventImpactToEmotion } from './constants.js'

export class EmotionManager {
  constructor() {
    this.keywords = { ...EMOTION_KEYWORDS }
  }

  matchFromContent(content) {
    if (!content) return { emotion: null, intensity: 0 }
    let bestMatch = null
    let bestScore = 0
    for (const [emotion, config] of Object.entries(this.keywords)) {
      for (const word of config.words) {
        if (content.includes(word)) {
          const count = (content.match(new RegExp(escapeRegExp(word), 'g')) || []).length
          const score = config.intensity * Math.min(count, 3)
          if (score > bestScore) {
            bestScore = score
            bestMatch = { emotion, intensity: Math.min(score, 1.0) }
          }
        }
      }
    }
    return bestMatch || { emotion: null, intensity: 0 }
  }

  updateFromMessage(db, characterId, content) {
    const match = this.matchFromContent(content)

    // 优化：无匹配且无活跃情绪时跳过数据库操作
    if (!match.emotion) {
      const current = this.getEmotion(db, characterId)
      if (current.intensity <= 0) {
        return { emotion: '平静', intensity: 0, changed: false }
      }
      // 有活跃情绪，执行衰减
      const newIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))
      if (newIntensity < 0.1) {
        this._saveEmotion(db, characterId, '平静', 0, 'keyword')
        return { emotion: '平静', intensity: 0, changed: true }
      }
      this._saveEmotion(db, characterId, current.emotion, newIntensity, current.source)
      return { emotion: current.emotion, intensity: newIntensity, changed: true }
    }

    // 有匹配：先读取当前状态
    const current = this.getEmotion(db, characterId)

    // 先对当前情绪执行衰减
    const decayedIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))

    if (match.emotion === current.emotion) {
      // 同种情绪：在衰减后的强度上累积
      const newIntensity = Math.min(1.0, decayedIntensity + match.intensity * 0.5)
      this._saveEmotion(db, characterId, match.emotion, newIntensity, 'keyword')
      return { emotion: match.emotion, intensity: newIntensity, changed: true }
    } else {
      // 不同情绪：新情绪强度需超过衰减后的旧情绪才替换
      if (match.intensity > decayedIntensity) {
        this._saveEmotion(db, characterId, match.emotion, match.intensity, 'keyword')
        return { emotion: match.emotion, intensity: match.intensity, changed: true }
      }
      // 新情绪不够强，保留衰减后的旧情绪
      if (decayedIntensity !== current.intensity && decayedIntensity >= 0.1) {
        this._saveEmotion(db, characterId, current.emotion, decayedIntensity, current.source)
        return { emotion: current.emotion, intensity: decayedIntensity, changed: true }
      }
      return { emotion: current.emotion, intensity: decayedIntensity, changed: false }
    }
  }

  updateFromLLM(db, characterId, emotion, intensity) {
    if (!emotion || typeof intensity !== 'number') return
    this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'llm')
  }

  updateFromEvent(db, characterId, impact) {
    if (!impact) return
    // 将非标准情绪映射到标准情绪词
    const standardEmotion = mapEventImpactToEmotion(impact)
    const config = this.keywords[standardEmotion]
    const intensity = config ? config.intensity * 0.8 : 0.6
    this._saveEmotion(db, characterId, standardEmotion, intensity, 'event')
  }

  getEmotion(db, characterId) {
    const row = db.prepare('SELECT * FROM character_emotions WHERE character_id = ?').get(characterId)
    return row
      ? { emotion: row.emotion, intensity: row.intensity, decay_rate: row.decay_rate, source: row.source }
      : { emotion: '平静', intensity: 0, decay_rate: 0.1, source: 'keyword' }
  }

  getAllEmotions(db) {
    return db.prepare('SELECT * FROM character_emotions').all()
  }

  setEmotion(db, characterId, emotion, intensity) {
    this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'manual')
  }

  shouldInferFromLLM(db, characterId, content, senderFavorability = null) {
    const atMatch = content.match(new RegExp(`@[^\\s\\u3000]+`))
    if (atMatch) return true
    if (senderFavorability !== null && senderFavorability < 0) return true
    const emotion = this.getEmotion(db, characterId)
    if (emotion.intensity > 0.7) return true
    return false
  }

  _saveEmotion(db, characterId, emotion, intensity, source) {
    db.prepare(`
      INSERT INTO character_emotions (character_id, emotion, intensity, decay_rate, source, updated_at)
      VALUES (?, ?, ?, 0.1, ?, datetime('now', 'localtime'))
      ON CONFLICT(character_id) DO UPDATE SET
        emotion = excluded.emotion,
        intensity = excluded.intensity,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run(characterId, emotion, intensity, source)
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
