/**
 * 叙事系统 IPC 处理器
 */
import { ipcMain } from 'electron'
import { SCENE_LABELS, EMOTION_KEYWORDS } from '../../narrative/constants.js'
import { createHandler } from '../handler-wrapper.js'

export function setupNarrativeHandlers(narrativeEngine) {
  ipcMain.handle('narrative:getEmotions', createHandler(async (event, groupId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const emotions = narrativeEngine.emotion.getAllEmotions(db)
    return { success: true, data: emotions }
  }))

  ipcMain.handle('narrative:getEmotion', createHandler(async (event, groupId, characterId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const emotion = narrativeEngine.emotion.getEmotion(db, characterId)
    return { success: true, data: emotion }
  }))

  ipcMain.handle('narrative:setEmotion', createHandler(async (event, groupId, characterId, emotion, intensity) => {
    const db = narrativeEngine._getGroupDB(groupId)
    narrativeEngine.emotion.setEmotion(db, characterId, emotion, intensity)
    return { success: true }
  }))

  ipcMain.handle('narrative:getRelationships', createHandler(async (event, groupId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const relationships = narrativeEngine.relationship.getAllRelationships(db)
    return { success: true, data: relationships }
  }))

  ipcMain.handle('narrative:getRelationship', createHandler(async (event, groupId, fromId, toId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const rel = narrativeEngine.relationship.getRelationship(db, fromId, toId)
    return { success: true, data: rel }
  }))

  ipcMain.handle('narrative:setRelationship', createHandler(async (event, groupId, fromId, toId, type, description) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const rel = narrativeEngine.relationship.setRelationship(db, fromId, toId, type, description)
    return { success: true, data: rel }
  }))

  ipcMain.handle('narrative:removeRelationship', createHandler(async (event, groupId, fromId, toId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    narrativeEngine.relationship.removeRelationship(db, fromId, toId)
    return { success: true }
  }))

  ipcMain.handle('narrative:getRelationshipTypes', createHandler(async () => {
    return { success: true, data: narrativeEngine.relationship.getRelationshipTypes() }
  }))

  ipcMain.handle('narrative:getSceneLabels', async () => {
    return { success: true, data: SCENE_LABELS }
  })

  ipcMain.handle('narrative:getEmotionList', async () => {
    return { success: true, data: Object.keys(EMOTION_KEYWORDS) }
  })

  ipcMain.handle('narrative:getEventPool', createHandler(async (event, sceneType) => {
    const events = narrativeEngine.eventTrigger.getEventPool(sceneType || 'general')
    return { success: true, data: events }
  }))

  ipcMain.handle('narrative:triggerEvent', createHandler(async (event, groupId, eventKey, content, impact) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const result = narrativeEngine.triggerEvent(db, groupId, eventKey, content, impact)
    return { success: true, data: result }
  }))

  ipcMain.handle('narrative:getRecentEvents', createHandler(async (event, groupId, limit) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const events = narrativeEngine.eventTrigger.getRecentEvents(db, groupId, limit || 10)
    // 为每个事件附加场景标签
    for (const evt of events) {
      evt.scene_label = narrativeEngine.eventTrigger.getEventSceneLabel(evt.event_key)
    }
    return { success: true, data: events }
  }))

  ipcMain.handle('narrative:getEventSuggestions', createHandler(async (event, groupId, sceneType, count) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const suggestions = narrativeEngine.getEventSuggestions(db, groupId, sceneType, count || 3)
    return { success: true, data: suggestions }
  }))

  ipcMain.handle('narrative:checkStaleness', createHandler(async (event, groupId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    const result = narrativeEngine.checkStaleness(db, groupId)
    return { success: true, data: result }
  }))

  ipcMain.handle('narrative:deleteEvent', createHandler(async (event, groupId, eventId) => {
    const db = narrativeEngine._getGroupDB(groupId)
    // 获取事件信息，用于匹配对应的聊天消息
    const evt = db.prepare('SELECT * FROM narrative_events WHERE id = ?').get(eventId)
    if (!evt) {
      return { success: false, error: '事件不存在' }
    }
    // 删除事件记录
    narrativeEngine.deleteEvent(db, eventId)
    // 删除聊天中对应的用户消息及后续所有消息
    const msg = db.prepare(
      "SELECT * FROM messages WHERE group_id = ? AND role = 'user' AND content = ? ORDER BY timestamp DESC LIMIT 1"
    ).get(groupId, evt.content)
    if (msg) {
      db.prepare('DELETE FROM messages WHERE group_id = ? AND timestamp >= ?').run(groupId, msg.timestamp)
    }
    return { success: true, deletedMessages: !!msg }
  }))
}
