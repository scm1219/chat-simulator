/**
 * 角色 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'

export function setupCharacterHandlers(dbManager) {
  // 创建角色
  ipcMain.handle('character:create', async (event, data) => {
    try {
      const { groupId, name, systemPrompt } = data
      const id = generateUUID()

      const db = dbManager.getGroupDB(groupId)
      db.prepare(`
        INSERT INTO characters (id, group_id, name, system_prompt)
        VALUES (?, ?, ?, ?)
      `).run(id, groupId, name, systemPrompt)

      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
      return { success: true, data: character }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取群组的所有角色
  ipcMain.handle('character:getByGroupId', async (event, groupId) => {
    try {
      const db = dbManager.getGroupDB(groupId)
      const characters = db.prepare('SELECT * FROM characters WHERE group_id = ? ORDER BY is_user DESC').all(groupId)
      return { success: true, data: characters }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新角色
  ipcMain.handle('character:update', async (event, id, data) => {
    try {
      // 需要先获取 groupId
      const groupIds = dbManager.getGroupDBFiles()

      for (const groupId of groupIds) {
        const db = dbManager.getGroupDB(groupId)
        const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)

        if (character) {
          const updates = []
          const values = []

          if (data.name !== undefined) {
            updates.push('name = ?')
            values.push(data.name)
          }
          if (data.systemPrompt !== undefined) {
            updates.push('system_prompt = ?')
            values.push(data.systemPrompt)
          }

          if (updates.length > 0) {
            values.push(id)
            db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values)
          }

          const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
          return { success: true, data: updated }
        }
      }

      return { success: false, error: '角色不存在' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除角色
  ipcMain.handle('character:delete', async (event, id) => {
    try {
      const groupIds = dbManager.getGroupDBFiles()

      for (const groupId of groupIds) {
        const db = dbManager.getGroupDB(groupId)
        const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)

        if (character) {
          // 检查是否为用户角色
          if (character.is_user === 1) {
            return { success: false, error: '用户角色不可删除' }
          }

          const result = db.prepare('DELETE FROM characters WHERE id = ?').run(id)

          if (result.changes > 0) {
            return { success: true }
          }
        }
      }

      return { success: false, error: '角色不存在' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 切换角色启用状态
  ipcMain.handle('character:toggle', async (event, id, enabled) => {
    try {
      const groupIds = dbManager.getGroupDBFiles()

      for (const groupId of groupIds) {
        const db = dbManager.getGroupDB(groupId)
        const result = db.prepare('UPDATE characters SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)

        if (result.changes > 0) {
          const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
          return { success: true, data: character }
        }
      }

      return { success: false, error: '角色不存在' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
