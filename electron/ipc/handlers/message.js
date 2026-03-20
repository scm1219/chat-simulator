/**
 * 消息 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'

export function setupMessageHandlers(dbManager) {
  // 获取群组的消息列表（按时间正序）
  ipcMain.handle('message:getByGroupId', async (event, groupId) => {
    try {
      const db = dbManager.getGroupDB(groupId)
      const messages = db.prepare(`
        SELECT * FROM messages
        WHERE group_id = ?
        ORDER BY timestamp ASC
      `).all(groupId)

      return { success: true, data: messages }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 创建消息
  ipcMain.handle('message:create', async (event, data) => {
    try {
      const { groupId, characterId, role, content } = data
      const id = generateUUID()

      const db = dbManager.getGroupDB(groupId)
      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, groupId, characterId || null, role, content)

      const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
      return { success: true, data: message }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 清空群组的所有消息
  ipcMain.handle('message:clearByGroupId', async (event, groupId) => {
    try {
      const db = dbManager.getGroupDB(groupId)
      db.prepare('DELETE FROM messages WHERE group_id = ?').run(groupId)

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新消息
  ipcMain.handle('message:update', async (event, messageId, content) => {
    try {
      // 首先获取消息以确定它属于哪个群组
      const groupIds = dbManager.getGroupDBFiles()
      let db = null
      let message = null

      for (const groupId of groupIds) {
        db = dbManager.getGroupDB(groupId)
        message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
        if (message) break
      }

      if (!message) {
        return { success: false, error: '消息不存在' }
      }

      // 更新消息内容
      db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId)

      const updatedMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
      return { success: true, data: updatedMessage }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除消息
  ipcMain.handle('message:delete', async (event, messageId) => {
    try {
      // 首先获取消息以确定它属于哪个群组
      const groupIds = dbManager.getGroupDBFiles()
      let db = null
      let message = null

      for (const groupId of groupIds) {
        db = dbManager.getGroupDB(groupId)
        message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
        if (message) break
      }

      if (!message) {
        return { success: false, error: '消息不存在' }
      }

      // 删除消息
      db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
