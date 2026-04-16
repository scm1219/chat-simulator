/**
 * 事件触发系统
 * 预设事件池 + 推荐算法 + 对话平淡检测
 */

import { generateUUID } from '../utils/uuid.js'

const DEFAULT_EVENT_POOL = {
  office: [
    { key: 'meeting_called', content: '老板突然通知全员开会', impact: '紧张' },
    { key: 'fire_alarm', content: '消防警报突然响了', impact: '惊慌' },
    { key: 'new_colleague', content: '部门来了一个新同事', impact: '好奇' },
    { key: 'power_outage', content: '办公室突然停电了', impact: '惊讶' },
    { key: 'deadline_reminder', content: '收到提醒：项目截止日期就在明天', impact: '焦虑' }
  ],
  home: [
    { key: 'door_knock', content: '有人敲门', impact: '好奇' },
    { key: 'package_arrived', content: '快递到了一个神秘包裹', impact: '好奇' },
    { key: 'pet_mischief', content: '宠物把东西打翻了', impact: '无奈' },
    { key: 'phone_rings', content: '一个陌生号码打来电话', impact: '紧张' }
  ],
  school: [
    { key: 'exam_announced', content: '老师宣布明天突击考试', impact: '恐慌' },
    { key: 'transfer_student', content: '班上来了一个转学生', impact: '好奇' },
    { key: 'confiscated', content: '手机被老师没收了', impact: '沮丧' }
  ],
  general: [
    { key: 'breaking_news', content: '手机弹窗推送了一条重大新闻', impact: '惊讶' },
    { key: 'heated_argument', content: '两个人突然吵了起来', impact: '紧张' },
    { key: 'sudden_silence', content: '所有人突然安静了下来', impact: '尴尬' },
    { key: 'rain_start', content: '窗外突然下起了大雨', impact: '平静' }
  ]
}

export class EventTrigger {
  constructor() {
    this.eventPool = { ...DEFAULT_EVENT_POOL }
  }

  getEventPool(sceneType = 'general') {
    const sceneEvents = this.eventPool[sceneType] || []
    const generalEvents = this.eventPool.general || []
    const allKeys = new Set([...sceneEvents.map(e => e.key), ...generalEvents.map(e => e.key)])
    const allEvents = {}
    for (const key of allKeys) {
      const found = sceneEvents.find(e => e.key === key) || generalEvents.find(e => e.key === key)
      if (found) allEvents[key] = found
    }
    return Object.values(allEvents)
  }

  getAvailableScenes() {
    return Object.keys(this.eventPool)
  }

  triggerEvent(db, groupId, eventKey, content, impact, triggeredBy = 'user') {
    const id = generateUUID()
    db.prepare(`
      INSERT INTO narrative_events (id, group_id, event_key, content, impact, event_type, triggered_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'user_triggered', ?, datetime('now', 'localtime'))
    `).run(id, groupId, eventKey, content, impact, triggeredBy)
    return { id, eventKey, content, impact, eventType: 'user_triggered', triggeredBy }
  }

  getEventSuggestions(db, groupId, sceneType, count = 3) {
    const allEvents = this.getEventPool(sceneType)
    const recentEvents = db.prepare(`
      SELECT event_key FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(groupId)
    const recentKeys = new Set(recentEvents.map(e => e.event_key))
    const available = allEvents.filter(e => !recentKeys.has(e.key))
    const shuffled = available.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  checkStaleness(db, groupId) {
    const recentMessages = db.prepare(`
      SELECT content FROM messages
      WHERE group_id = ? AND role IN ('user', 'assistant')
      ORDER BY timestamp DESC LIMIT 10
    `).all(groupId)
    if (recentMessages.length < 5) return { stale: false, reason: null }
    const avgLength = recentMessages.slice(0, 5).reduce((sum, m) => sum + (m.content?.length || 0), 0) / 5
    if (avgLength < 20) {
      return { stale: true, reason: '对话内容较短，可能趋于平淡' }
    }
    const hasAtInteraction = recentMessages.slice(0, 5).some(m => /@[^\s\u3000]+/.test(m.content || ''))
    if (!hasAtInteraction) {
      return { stale: true, reason: '近期没有角色间互动' }
    }
    return { stale: false, reason: null }
  }

  getRecentEvents(db, groupId, limit = 10) {
    return db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(groupId, limit)
  }
}
