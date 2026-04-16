/**
 * 角色关系管理器
 * 双向动态关系 + 好感度系统
 */

const DEFAULT_RELATIONSHIP_TYPES = {
  friend:    { label: '朋友',   defaultFavor: 30,  promptHint: '友好、亲近、会开玩笑' },
  lover:     { label: '恋人',   defaultFavor: 70,  promptHint: '亲密、温柔、关心对方' },
  rival:     { label: '对手',   defaultFavor: -20, promptHint: '竞争、不服气、暗中较劲' },
  mentor:    { label: '师徒',   defaultFavor: 40,  promptHint: '尊重但保持距离、偶尔严厉' },
  colleague: { label: '同事',   defaultFavor: 10,  promptHint: '礼貌、合作、有分寸' },
  family:    { label: '家人',   defaultFavor: 50,  promptHint: '随意、亲密、说话不加修饰' },
  stranger:  { label: '陌生人', defaultFavor: 0,   promptHint: '客气、试探、保持距离' }
}

const FAVORABILITY_LEVELS = [
  { min: 70,  max: 100, label: '深厚', hint: '无条件信任，会为对方出头' },
  { min: 40,  max: 69,  label: '亲密', hint: '主动分享，会维护对方' },
  { min: 10,  max: 39,  label: '友好', hint: '正常交流，偶尔关心' },
  { min: -10, max: 9,   label: '中立', hint: '礼貌但疏远' },
  { min: -50, max: -11, label: '不满', hint: '带有负面情绪，说话带刺' },
  { min: -100, max: -51, label: '敌对', hint: '极度厌恶，言辞尖锐，可能拒绝交流' }
]

const INTERACTION_PATTERNS = [
  { type: 'praise',    words: ['你说得对', '谢谢你', '厉害', '不错', '真棒', '佩服'], range: [3, 8] },
  { type: 'criticize', words: ['你错了', '别说了', '无聊', '差劲', '胡说'], range: [-8, -3] },
  { type: 'share',     words: ['我觉得', '我之前', '告诉你', '其实我'], range: [2, 5] },
  { type: 'empathy',   words: ['我也', '同感', '理解', '我也是'], range: [2, 5] }
]

export class RelationshipManager {
  constructor() {
    this.types = { ...DEFAULT_RELATIONSHIP_TYPES }
  }

  getRelationshipTypes() {
    return this.types
  }

  getFavorabilityLevel(favorability) {
    return FAVORABILITY_LEVELS.find(l => favorability >= l.min && favorability <= l.max) || FAVORABILITY_LEVELS[3]
  }

  setRelationship(db, fromId, toId, type, description = '') {
    const config = this.types[type] || this.types.stranger
    db.prepare(`
      INSERT INTO character_relationships (from_id, to_id, type, favorability, description, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(from_id, to_id) DO UPDATE SET
        type = excluded.type,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(fromId, toId, type, description || config.promptHint)
    return this.getRelationship(db, fromId, toId)
  }

  getRelationship(db, fromId, toId) {
    return db.prepare('SELECT * FROM character_relationships WHERE from_id = ? AND to_id = ?').get(fromId, toId)
  }

  getAllRelationships(db) {
    return db.prepare('SELECT * FROM character_relationships').all()
  }

  removeRelationship(db, fromId, toId) {
    db.prepare('DELETE FROM character_relationships WHERE from_id = ? AND to_id = ?').run(fromId, toId)
  }

  updateFavorability(db, senderId, receiverId, content, receiverEmotion = null) {
    let totalChange = 0
    let reason = ''
    for (const pattern of INTERACTION_PATTERNS) {
      for (const word of pattern.words) {
        if (content.includes(word)) {
          let [minChange, maxChange] = pattern.range
          const change = minChange + Math.floor(Math.random() * (maxChange - minChange + 1))
          if (receiverEmotion) {
            if (pattern.type === 'praise' && receiverEmotion.emotion === '愤怒') {
              reason = `${receiverEmotion.emotion}状态下被夸赞，效果减半`
              totalChange += Math.floor(change * 0.5)
            } else if (pattern.type === 'criticize' && receiverEmotion.emotion === '开心') {
              reason = `${receiverEmotion.emotion}状态下被批评，效果加倍`
              totalChange += change * 2
            } else {
              totalChange += change
            }
          } else {
            totalChange += change
          }
          reason = reason || `消息中包含"${word}"`
          break
        }
      }
      if (totalChange !== 0) break
    }
    if (totalChange === 0) {
      const atMatch = content.match(new RegExp(`@[^\\s\\u3000]+`))
      if (atMatch) {
        totalChange = 1 + Math.floor(Math.random() * 3)
        reason = '被点名互动'
      }
    }
    if (totalChange === 0) return { favorability: 0, change: 0, reason: '' }
    const existing = this.getRelationship(db, senderId, receiverId)
    const currentFavor = existing ? existing.favorability : 0
    const newFavor = Math.max(-100, Math.min(100, currentFavor + totalChange))
    if (existing) {
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, senderId, receiverId)
    } else {
      this.setRelationship(db, senderId, receiverId, 'stranger', '')
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, senderId, receiverId)
    }
    return { favorability: newFavor, change: totalChange, reason }
  }

  decayInactive(db, characterId, activeCharacterIds) {
    const relationships = db.prepare('SELECT * FROM character_relationships WHERE from_id = ?').all(characterId)
    for (const rel of relationships) {
      if (!activeCharacterIds.includes(rel.to_id)) {
        db.prepare(`
          UPDATE character_relationships SET favorability = MAX(-100, favorability - 1), updated_at = datetime('now', 'localtime')
          WHERE from_id = ? AND to_id = ?
        `).run(characterId, rel.to_id)
      }
    }
  }
}
