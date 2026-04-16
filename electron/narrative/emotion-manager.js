/**
 * 角色情绪管理器
 * 混合模式：关键词规则快速判断 + LLM 关键节点推断
 */

// 内置情绪词典
const DEFAULT_EMOTION_KEYWORDS = {
  '开心':   { words: ['哈哈', '嘿嘿', '太好了', '棒', '开心', '喜欢', '爱你'], intensity: 0.6 },
  '愤怒':   { words: ['闭嘴', '烦死', '滚', '笨蛋', '混蛋', '气死', '废物'], intensity: 0.8 },
  '尴尬':   { words: ['那个...', '咳', '不是', '误会', '其实不是'], intensity: 0.5 },
  '感动':   { words: ['谢谢', '谢谢你', '太感动', '没想到', '你真好'], intensity: 0.7 },
  '悲伤':   { words: ['难过', '伤心', '不想说', '算了', '无所谓了'], intensity: 0.6 },
  '惊讶':   { words: ['啊？', '什么？', '不会吧', '真的假的', '不可能'], intensity: 0.7 },
  '嫉妒':   { words: ['凭什么', '羡慕', '不公平', '为什么不是我'], intensity: 0.6 },
  '疲惫':   { words: ['累了', '困', '无聊', '不想聊了', '打哈欠'], intensity: 0.4 }
}

export class EmotionManager {
  constructor() {
    this.keywords = { ...DEFAULT_EMOTION_KEYWORDS }
  }

  matchFromContent(content) {
    if (!content) return { emotion: null, intensity: 0 }
    let bestMatch = null
    let bestScore = 0
    for (const [emotion, config] of Object.entries(this.keywords)) {
      for (const word of config.words) {
        if (content.includes(word)) {
          const count = (content.match(new RegExp(escapeRegExp(word), 'g')) || []).length
          const score = config.intensity * Math.min(count, 3) / 1
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
    const current = this.getEmotion(db, characterId)
    const match = this.matchFromContent(content)
    if (!match.emotion) {
      if (current.intensity > 0) {
        const newIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))
        if (newIntensity < 0.1) {
          this._saveEmotion(db, characterId, '平静', 0, 'keyword')
          return { emotion: '平静', intensity: 0, changed: true }
        }
        this._saveEmotion(db, characterId, current.emotion, newIntensity, current.source)
        return { emotion: current.emotion, intensity: newIntensity, changed: true }
      }
      return { ...current, changed: false }
    }
    if (match.emotion === current.emotion) {
      const newIntensity = Math.min(1.0, current.intensity + match.intensity * 0.5)
      this._saveEmotion(db, characterId, match.emotion, newIntensity, 'keyword')
      return { emotion: match.emotion, intensity: newIntensity, changed: true }
    } else {
      const decayedIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))
      if (match.intensity > decayedIntensity) {
        this._saveEmotion(db, characterId, match.emotion, match.intensity, 'keyword')
        return { emotion: match.emotion, intensity: match.intensity, changed: true }
      }
      return { ...current, changed: false }
    }
  }

  updateFromLLM(db, characterId, emotion, intensity) {
    if (!emotion || typeof intensity !== 'number') return
    this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'llm')
  }

  updateFromEvent(db, characterId, impact) {
    if (!impact) return
    const config = this.keywords[impact]
    const intensity = config ? config.intensity * 0.8 : 0.6
    this._saveEmotion(db, characterId, impact, intensity, 'event')
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
