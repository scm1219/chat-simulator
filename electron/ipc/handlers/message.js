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
        SELECT
          m.*,
          c.name as characterName,
          c.is_user as characterIsUser
        FROM messages m
        LEFT JOIN characters c ON m.character_id = c.id
        WHERE m.group_id = ?
        ORDER BY m.timestamp ASC
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

  // 删除指定消息及其之后的所有消息
  ipcMain.handle('message:deleteFrom', async (event, messageId) => {
    try {
      // 首先获取消息以确定它属于哪个群组
      const groupIds = dbManager.getGroupDBFiles()
      let db = null
      let message = null
      let targetGroupId = null

      for (const groupId of groupIds) {
        db = dbManager.getGroupDB(groupId)
        message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
        if (message) {
          targetGroupId = groupId
          break
        }
      }

      if (!message) {
        return { success: false, error: '消息不存在' }
      }

      // 获取消息的时间戳
      const timestamp = message.timestamp

      // 删除该消息及之后的所有消息
      db.prepare('DELETE FROM messages WHERE group_id = ? AND timestamp >= ?').run(targetGroupId, timestamp)

      return { success: true, data: { content: message.content, groupId: targetGroupId } }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 导出群组聊天记录为 ZIP
  ipcMain.handle('message:exportToZip', async (event, groupId, groupName) => {
    try {
      const archiver = require('archiver')
      const fs = require('fs')
      const path = require('path')
      const { app } = require('electron')

      // 获取群组消息
      const db = dbManager.getGroupDB(groupId)
      const messages = db.prepare(`
        SELECT
          m.*,
          c.name as characterName,
          c.is_user as characterIsUser
        FROM messages m
        LEFT JOIN characters c ON m.character_id = c.id
        WHERE m.group_id = ?
        ORDER BY m.timestamp ASC
      `).all(groupId)

      // 获取群组角色信息
      const characters = db.prepare(`
        SELECT * FROM characters WHERE group_id = ?
      `).all(groupId)

      // 获取群组信息
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)

      // 准备导出数据
      const exportData = {
        group: {
          id: group.id,
          name: group.name,
          llm_provider: group.llm_provider,
          llm_model: group.llm_model,
          max_history: group.max_history,
          response_mode: group.response_mode,
          thinking_enabled: group.thinking_enabled,
          background: group.background,
          created_at: group.created_at,
          updated_at: group.updated_at
        },
        characters: characters.map(char => ({
          id: char.id,
          name: char.name,
          system_prompt: char.system_prompt,
          enabled: char.enabled,
          is_user: char.is_user,
          created_at: char.created_at
        })),
        messages: messages.map(msg => ({
          id: msg.id,
          character_id: msg.character_id,
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp
        })),
        exported_at: new Date().toISOString()
      }

      // 创建临时目录
      const tempDir = path.join(app.getPath('temp'), 'chat-simulator-exports')
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true })
      }

      // 创建 JSON 文件路径
      const jsonFileName = `${groupName}_聊天记录.json`
      const jsonFilePath = path.join(tempDir, jsonFileName)

      // 写入 JSON 文件
      fs.writeFileSync(jsonFilePath, JSON.stringify(exportData, null, 2), 'utf-8')

      // 创建 ZIP 文件路径
      const zipFileName = `${groupName}.zip`
      const zipFilePath = path.join(tempDir, zipFileName)

      // 创建 ZIP 文件
      const output = fs.createWriteStream(zipFilePath)
      const archive = archiver('zip', {
        zlib: { level: 9 } // 最高压缩级别
      })

      return new Promise((resolve, reject) => {
        output.on('close', () => {
          // 读取 ZIP 文件为 base64
          const zipBuffer = fs.readFileSync(zipFilePath)

          // 清理临时文件
          try {
            fs.unlinkSync(jsonFilePath)
            fs.unlinkSync(zipFilePath)
          } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError)
          }

          resolve({
            success: true,
            data: {
              filename: zipFileName,
              buffer: zipBuffer.toString('base64'),
              size: archive.pointer()
            }
          })
        })

        archive.on('error', (err) => {
          // 清理临时文件
          try {
            if (fs.existsSync(jsonFilePath)) fs.unlinkSync(jsonFilePath)
            if (fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath)
          } catch (cleanupError) {
            console.error('清理临时文件失败:', cleanupError)
          }
          reject(err)
        })

        // 将 JSON 文件添加到 ZIP
        archive.file(jsonFilePath, { name: jsonFileName })

        // 完成压缩
        archive.finalize()
      })
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
