/**
 * 角色关系管理器
 * 双向动态关系 + 好感度系统
 */

import { RELATIONSHIP_TYPES, FAVORABILITY_LEVELS, INTERACTION_PATTERNS, getFavorabilityLevel } from './constants.js'

export class RelationshipManager {
  constructor() {
    this.types = { ...RELATIONSHIP_TYPES }
  }

  getRelationshipTypes() {
    return this.types
  }

  getFavorabilityLevel(favorability) {
    return getFavorabilityLevel(favorability)
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

  /**
   * 根据消息内容更新好感度（支持双向更新、@角色名解析、多模式匹配）
   * @param {Database} db 群组数据库
   * @param {string} senderId 发送者角色 ID
   * @param {string} receiverId 接收者角色 ID
   * @param {string} content 消息内容
   * @param {Object|null} receiverEmotion 接收者当前情绪
   * @param {Map<string, string>|null} characterNameMap 角色名→ID映射（用于@解析）
   * @returns {{ favorability: number, change: number, reason: string, reverseChange: number }}
   */
  updateFavorability(db, senderId, receiverId, content, receiverEmotion = null, characterNameMap = null) {
    let totalChange = 0
    let reasons = []

    // 匹配所有互动模式（不再 break，累计多种匹配）
    for (const pattern of INTERACTION_PATTERNS) {
      for (const word of pattern.words) {
        if (content.includes(word)) {
          let [minChange, maxChange] = pattern.range
          const change = minChange + Math.floor(Math.random() * (maxChange - minChange + 1))
          let adjustedChange = change

          if (receiverEmotion) {
            if (pattern.type === 'praise' && receiverEmotion.emotion === '愤怒') {
              reasons.push(`${receiverEmotion.emotion}状态下被夸赞，效果减半`)
              adjustedChange = Math.floor(change * 0.5)
            } else if (pattern.type === 'criticize' && receiverEmotion.emotion === '开心') {
              reasons.push(`${receiverEmotion.emotion}状态下被批评，效果加倍`)
              adjustedChange = change * 2
            }
          }

          totalChange += adjustedChange
          reasons.push(`消息中包含"${word}"`)
          break // 同一模式内只匹配一次
        }
      }
    }

    // @角色名提及：解析具体角色名，只影响被@的角色
    if (totalChange === 0 && characterNameMap) {
      const atPattern = /@([^\s\u3000]+)/g
      let match
      while ((match = atPattern.exec(content)) !== null) {
        const mentionedName = match[1]
        const mentionedId = characterNameMap.get(mentionedName)
        if (mentionedId === receiverId) {
          totalChange = 1 + Math.floor(Math.random() * 3)
          reasons.push(`被@提及(${mentionedName})`)
          break
        }
      }
    }

    if (totalChange === 0) return { favorability: 0, change: 0, reason: '', reverseChange: 0 }

    // 正向更新：sender → receiver
    const existing = this.getRelationship(db, senderId, receiverId)
    const currentFavor = existing ? existing.favorability : 0
    const newFavor = Math.max(-100, Math.min(100, currentFavor + totalChange))
    this._updateFavorabilityValue(db, senderId, receiverId, existing, newFavor)

    // 反向更新：receiver → sender（被动感受，幅度减半）
    let reverseChange = 0
    if (totalChange !== 0) {
      const reverseExisting = this.getRelationship(db, receiverId, senderId)
      const reverseCurrentFavor = reverseExisting ? reverseExisting.favorability : 0
      reverseChange = Math.floor(totalChange * 0.5)
      if (reverseChange !== 0) {
        const reverseNewFavor = Math.max(-100, Math.min(100, reverseCurrentFavor + reverseChange))
        this._updateFavorabilityValue(db, receiverId, senderId, reverseExisting, reverseNewFavor)
      }
    }

    return {
      favorability: newFavor,
      change: totalChange,
      reason: reasons.join('；'),
      reverseChange
    }
  }

  /**
   * 更新或创建好感度值
   */
  _updateFavorabilityValue(db, fromId, toId, existing, newFavor) {
    if (existing) {
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, fromId, toId)
    } else {
      this.setRelationship(db, fromId, toId, 'stranger', '')
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, fromId, toId)
    }
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
