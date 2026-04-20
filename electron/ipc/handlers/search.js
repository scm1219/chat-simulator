/**
 * 全局搜索 IPC 处理器
 * 支持跨群组搜索消息内容和角色名称
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('Search')
import { createHandler } from '../handler-wrapper.js'

/**
 * 截取关键词上下文文本
 * @param {string} content - 完整内容
 * @param {string} keyword - 搜索关键词
 * @param {number} contextLen - 上下文长度（前后各取多少字符）
 * @returns {string} 截断后的文本
 */
function extractContext(content, keyword, contextLen = 30) {
  if (!content || !keyword) return ''
  const lowerContent = content.toLowerCase()
  const lowerKeyword = keyword.toLowerCase()
  const idx = lowerContent.indexOf(lowerKeyword)
  if (idx === -1) return content.slice(0, contextLen * 2)

  const start = Math.max(0, idx - contextLen)
  const end = Math.min(content.length, idx + keyword.length + contextLen)
  let snippet = ''
  if (start > 0) snippet += '...'
  snippet += content.slice(start, end)
  if (end < content.length) snippet += '...'
  return snippet
}

/**
 * 对单个群组数据库执行搜索
 * @param {Database} db - better-sqlite3 数据库实例
 * @param {string} groupId - 群组 ID
 * @param {string} groupName - 群组名称
 * @param {string} keyword - 搜索关键词
 * @param {number} maxResults - 每个群组的最大消息结果数
 */
function searchGroupDB(db, groupId, groupName, keyword, maxResults = 10) {
  const results = []
  const likePattern = `%${keyword}%`

  // 搜索消息内容
  try {
    const messages = db.prepare(`
      SELECT m.id, m.content, m.character_id, m.timestamp, c.name as characterName
      FROM messages m
      LEFT JOIN characters c ON m.character_id = c.id
      WHERE m.content LIKE ?
      ORDER BY m.timestamp DESC
      LIMIT ?
    `).all(likePattern, maxResults)

    for (const msg of messages) {
      results.push({
        groupId,
        groupName,
        type: 'message',
        messageId: msg.id,
        content: msg.content,
        snippet: extractContext(msg.content, keyword),
        characterName: msg.characterName || null,
        timestamp: msg.timestamp
      })
    }
  } catch (err) {
    log.error(`搜索群组 ${groupId} 消息失败:`, err.message)
  }

  // 搜索角色名称
  try {
    const characters = db.prepare(`
      SELECT id, name FROM characters WHERE name LIKE ?
    `).all(likePattern)

    for (const char of characters) {
      results.push({
        groupId,
        groupName,
        type: 'character',
        characterId: char.id,
        characterName: char.name
      })
    }
  } catch (err) {
    log.error(`搜索群组 ${groupId} 角色失败:`, err.message)
  }

  return results
}

/**
 * 异步搜索单个群组（通过 setImmediate 让出事件循环，防止 UI 冻结）
 */
function searchGroupDBAsync(db, groupId, groupName, keyword, maxResults = 10) {
  return new Promise((resolve) => {
    setImmediate(() => {
      resolve(searchGroupDB(db, groupId, groupName, keyword, maxResults))
    })
  })
}

export function setupSearchHandlers(dbManager) {
  // 全局搜索
  ipcMain.handle('search:global', createHandler(async (event, keyword) => {
    if (!keyword || !keyword.trim()) {
      return { success: true, data: [] }
    }

    const trimmedKeyword = keyword.trim()
    const groupIds = dbManager.getGroupDBFiles()
    const allResults = []
    const MAX_TOTAL = 50

    for (const groupId of groupIds) {
      if (allResults.length >= MAX_TOTAL) break

      const db = dbManager.getGroupDB(groupId)
      // 获取群组名称
      let groupName = groupId
      try {
        const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(groupId)
        if (group) groupName = group.name
      } catch (_) {
        // 忽略，使用 ID 作为名称
      }

      const remaining = MAX_TOTAL - allResults.length
      const results = await searchGroupDBAsync(db, groupId, groupName, trimmedKeyword, Math.min(10, remaining))
      allResults.push(...results)
    }

    // 消息结果按时间倒序，角色结果排在最后
    allResults.sort((a, b) => {
      if (a.type === 'character' && b.type !== 'character') return 1
      if (a.type !== 'character' && b.type === 'character') return -1
      if (a.timestamp && b.timestamp) {
        return new Date(b.timestamp) - new Date(a.timestamp)
      }
      return 0
    })

    return { success: true, data: allResults.slice(0, MAX_TOTAL) }
  }, 'Search:global'))
}
