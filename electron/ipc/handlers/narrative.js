/**
 * 叙事系统 IPC 处理器
 */
import { ipcMain } from 'electron'
import { SCENE_LABELS, SCENE_OPTIONS, EMOTION_KEYWORDS } from '../../narrative/constants.js'

export function setupNarrativeHandlers(narrativeEngine) {
  ipcMain.handle('narrative:getEmotions', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const emotions = narrativeEngine.emotion.getAllEmotions(db)
      return { success: true, data: emotions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getEmotion', async (event, groupId, characterId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const emotion = narrativeEngine.emotion.getEmotion(db, characterId)
      return { success: true, data: emotion }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:setEmotion', async (event, groupId, characterId, emotion, intensity) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      narrativeEngine.emotion.setEmotion(db, characterId, emotion, intensity)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getRelationships', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const relationships = narrativeEngine.relationship.getAllRelationships(db)
      return { success: true, data: relationships }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getRelationship', async (event, groupId, fromId, toId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const rel = narrativeEngine.relationship.getRelationship(db, fromId, toId)
      return { success: true, data: rel }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:setRelationship', async (event, groupId, fromId, toId, type, description) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const rel = narrativeEngine.relationship.setRelationship(db, fromId, toId, type, description)
      return { success: true, data: rel }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:removeRelationship', async (event, groupId, fromId, toId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      narrativeEngine.relationship.removeRelationship(db, fromId, toId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getRelationshipTypes', async () => {
    try {
      return { success: true, data: narrativeEngine.relationship.getRelationshipTypes() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getSceneLabels', async () => {
    return { success: true, data: SCENE_LABELS }
  })

  ipcMain.handle('narrative:getEmotionList', async () => {
    return { success: true, data: Object.keys(EMOTION_KEYWORDS) }
  })

  ipcMain.handle('narrative:getEventPool', async (event, sceneType) => {
    try {
      const events = narrativeEngine.eventTrigger.getEventPool(sceneType || 'general')
      return { success: true, data: events }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:triggerEvent', async (event, groupId, eventKey, content, impact) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const result = narrativeEngine.triggerEvent(db, groupId, eventKey, content, impact)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getRecentEvents', async (event, groupId, limit) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const events = narrativeEngine.eventTrigger.getRecentEvents(db, groupId, limit || 10)
      // 为每个事件附加场景标签
      for (const evt of events) {
        evt.scene_label = narrativeEngine.eventTrigger.getEventSceneLabel(evt.event_key)
      }
      return { success: true, data: events }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:getEventSuggestions', async (event, groupId, sceneType, count) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const suggestions = narrativeEngine.getEventSuggestions(db, groupId, sceneType, count || 3)
      return { success: true, data: suggestions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:checkStaleness', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const result = narrativeEngine.checkStaleness(db, groupId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('narrative:deleteEvent', async (event, groupId, eventId) => {
    try {
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
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
