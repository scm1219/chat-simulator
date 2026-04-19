/**
 * 消息 IPC 处理器
 */
import { ipcMain } from 'electron'
import fs from 'fs'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('Message')
import path from 'path'
import archiver from 'archiver'
import { app, dialog, BrowserWindow } from 'electron'
import { generateUUID } from '../../utils/uuid.js'
import { createHandler } from '../handler-wrapper.js'

export function setupMessageHandlers(dbManager) {
  // 获取群组的消息列表（按时间正序）
  ipcMain.handle('message:getByGroupId', createHandler(async (event, groupId) => {
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
  }))

  // 创建消息
  ipcMain.handle('message:create', createHandler(async (event, data) => {
    const { groupId, characterId, role, content } = data
    const id = generateUUID()

    const db = dbManager.getGroupDB(groupId)
    db.prepare(`
      INSERT INTO messages (id, group_id, character_id, role, content)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, groupId, characterId || null, role, content)

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(id)
    return { success: true, data: message }
  }, 'Message:create'))

  // 清空群组的所有消息
  ipcMain.handle('message:clearByGroupId', createHandler(async (event, groupId) => {
    const db = dbManager.getGroupDB(groupId)
    db.prepare('DELETE FROM messages WHERE group_id = ?').run(groupId)

    return { success: true }
  }, 'Message:clearByGroupId'))

  // 更新消息
  ipcMain.handle('message:update', createHandler(async (event, groupId, messageId, content) => {
    const db = dbManager.getGroupDB(groupId)
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)

    if (!message) {
      return { success: false, error: '消息不存在' }
    }

    // 更新消息内容
    db.prepare('UPDATE messages SET content = ? WHERE id = ?').run(content, messageId)

    const updatedMessage = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)
    return { success: true, data: updatedMessage }
  }, 'Message:update'))

  // 删除消息
  ipcMain.handle('message:delete', createHandler(async (event, groupId, messageId) => {
    const db = dbManager.getGroupDB(groupId)
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)

    if (!message) {
      return { success: false, error: '消息不存在' }
    }

    // 删除消息
    db.prepare('DELETE FROM messages WHERE id = ?').run(messageId)

    return { success: true }
  }, 'Message:delete'))

  // 删除指定消息及其之后的所有消息
  ipcMain.handle('message:deleteFrom', createHandler(async (event, groupId, messageId) => {
    const db = dbManager.getGroupDB(groupId)
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(messageId)

    if (!message) {
      return { success: false, error: '消息不存在' }
    }

    // 获取消息的时间戳
    const timestamp = message.timestamp

    // 删除该消息及之后的所有消息
    db.prepare('DELETE FROM messages WHERE group_id = ? AND timestamp >= ?').run(groupId, timestamp)

    return { success: true, data: { content: message.content, groupId } }
  }, 'Message:deleteFrom'))

  // 导出群组聊天记录为 ZIP（保留手动 try/catch，因含临时文件清理逻辑）
  ipcMain.handle('message:exportToZip', async (event, groupId, groupName) => {
    let jsonFilePath = null
    let zipFilePath = null

    try {
      // 弹出保存对话框
      const zipFileName = `${groupName}.zip`
      const result = await dialog.showSaveDialog(BrowserWindow.getFocusedWindow(), {
        title: '导出聊天记录',
        defaultPath: zipFileName,
        filters: [
          { name: 'ZIP 压缩文件', extensions: ['zip'] }
        ]
      })

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true }
      }

      const savePath = result.filePath

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
      jsonFilePath = path.join(tempDir, jsonFileName)

      // 写入 JSON 文件
      fs.writeFileSync(jsonFilePath, JSON.stringify(exportData, null, 2), 'utf-8')

      // 创建 ZIP 文件（先写到临时路径，完成后移动到目标路径）
      const tempZipPath = path.join(tempDir, `temp_${Date.now()}.zip`)
      zipFilePath = tempZipPath

      const output = fs.createWriteStream(tempZipPath)
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      await new Promise((resolve, reject) => {
        output.on('close', () => resolve())
        archive.on('error', (err) => reject(err))

        // 关键：将 archive 管道连接到输出流
        archive.pipe(output)
        archive.file(jsonFilePath, { name: jsonFileName })
        archive.finalize()
      })

      // 移动到用户选择的路径
      fs.renameSync(tempZipPath, savePath)
      zipFilePath = null // 已移走，无需清理

      const fileSize = fs.statSync(savePath).size

      return {
        success: true,
        data: {
          filename: path.basename(savePath),
          size: fileSize
        }
      }
    } catch (error) {
      // 清理临时文件
      try {
        if (jsonFilePath && fs.existsSync(jsonFilePath)) fs.unlinkSync(jsonFilePath)
        if (zipFilePath && fs.existsSync(zipFilePath)) fs.unlinkSync(zipFilePath)
      } catch (cleanupError) {
        log.error('清理临时文件失败:', cleanupError)
      }
      return { success: false, error: error.message }
    }
  })
}
