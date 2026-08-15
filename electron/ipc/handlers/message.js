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
import { nowTimestampMs } from '../../utils/timestamp.js'
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
      INSERT INTO messages (id, group_id, character_id, role, content, timestamp)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, groupId, characterId || null, role, content, nowTimestampMs())

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
    // 按 id 定位目标消息，取其 timestamp 与 rowid 作为复合删除条件
    const target = db.prepare(
      'SELECT timestamp, rowid AS rid FROM messages WHERE group_id = ? AND id = ?'
    ).get(groupId, messageId)

    if (!target) {
      return { success: false, error: '消息不存在' }
    }

    const content = db.prepare('SELECT content FROM messages WHERE id = ?').get(messageId)?.content

    // 复合条件：严格晚于目标时间戳，或同时间戳但 rowid 不小于目标（同秒/同毫秒内不误删相邻消息）
    db.prepare(`
      DELETE FROM messages
      WHERE group_id = ? AND (timestamp > ? OR (timestamp = ? AND rowid >= ?))
    `).run(groupId, target.timestamp, target.timestamp, target.rid)

    return { success: true, data: { content, groupId } }
  }, 'Message:deleteFrom'))

  // 导出群组聊天记录为 ZIP（异步文件 I/O，避免阻塞主线程）
  ipcMain.handle('message:exportToZip', createHandler(async (event, groupId, groupName) => {
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

      // 创建临时目录（异步）
      const tempDir = path.join(app.getPath('temp'), 'chat-simulator-exports')
      await fs.promises.mkdir(tempDir, { recursive: true })

      // 创建 JSON 文件路径
      const jsonFileName = `${groupName}_聊天记录.json`
      jsonFilePath = path.join(tempDir, jsonFileName)

      // 写入 JSON 文件（异步）
      await fs.promises.writeFile(jsonFilePath, JSON.stringify(exportData, null, 2), 'utf-8')

      // 创建 ZIP 文件（先写到临时路径，完成后移动到目标路径）
      const tempZipPath = path.join(tempDir, `temp_${Date.now()}.zip`)
      zipFilePath = tempZipPath

      const output = fs.createWriteStream(tempZipPath)
      const archive = archiver('zip', {
        zlib: { level: 9 }
      })

      // 等待压缩完成：以 output 的 'close' 为准（所有数据已落盘），
      // 同时监听 output 与 archive 的 'error'，并接住 finalize() 返回的 Promise，
      // 避免磁盘满/权限错误时永久挂起或产生未处理的 Promise 拒绝
      await new Promise((resolve, reject) => {
        output.on('close', resolve)
        output.on('error', reject)
        archive.on('error', reject)

        // 关键：将 archive 管道连接到输出流
        archive.pipe(output)
        archive.file(jsonFilePath, { name: jsonFileName })
        archive.finalize().catch(reject)
      })

      // 复制到用户选择的路径（跨盘时 rename 会抛 EXDEV，改用 copyFile + unlink）
      await fs.promises.copyFile(tempZipPath, savePath)
      await fs.promises.unlink(tempZipPath).catch(() => {})
      zipFilePath = null // 已复制并清理，无需在错误路径再清理

      const stat = await fs.promises.stat(savePath)

      return {
        success: true,
        data: {
          filename: path.basename(savePath),
          size: stat.size
        }
      }
    } catch (error) {
      // 清理临时文件（异步，不阻塞错误返回）
      try {
        if (jsonFilePath) await fs.promises.unlink(jsonFilePath).catch(() => {})
        if (zipFilePath) await fs.promises.unlink(zipFilePath).catch(() => {})
      } catch (cleanupError) {
        log.error('清理临时文件失败:', cleanupError)
      }
      // 重新抛出，交由 createHandler 统一记录日志并返回安全错误信息（过滤本机路径）
      throw error
    }
  }, 'Message:exportToZip'))
}
