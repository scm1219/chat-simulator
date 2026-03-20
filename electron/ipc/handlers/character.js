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
      const characters = db.prepare('SELECT * FROM characters WHERE group_id = ? ORDER BY is_user DESC, position ASC').all(groupId)
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

  // 调整角色顺序
  ipcMain.handle('character:reorder', async (event, id, direction) => {
    try {
      const groupIds = dbManager.getGroupDBFiles()

      for (const groupId of groupIds) {
        const db = dbManager.getGroupDB(groupId)
        const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)

        if (character) {
          // 用户角色不可调整顺序
          if (character.is_user === 1) {
            return { success: false, error: '用户角色不可调整顺序' }
          }

          // 获取所有非用户角色并按 position 排序
          const allCharacters = db.prepare(
            'SELECT * FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY position ASC'
          ).all(groupId)

          // 找到当前角色的索引
          const currentIndex = allCharacters.findIndex(c => c.id === id)

          if (currentIndex === -1) {
            return { success: false, error: '角色不存在' }
          }

          // 计算新的索引
          let newIndex
          if (direction === 'up') {
            newIndex = Math.max(0, currentIndex - 1)
          } else if (direction === 'down') {
            newIndex = Math.min(allCharacters.length - 1, currentIndex + 1)
          } else {
            return { success: false, error: '无效的移动方向' }
          }

          // 如果位置没有变化，直接返回
          if (newIndex === currentIndex) {
            return { success: true, data: character }
          }

          // 交换位置
          const targetCharacter = allCharacters[newIndex]
          const currentPosition = character.position
          const targetPosition = targetCharacter.position

          // 交换 position 值
          db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(targetPosition, id)
          db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(currentPosition, targetCharacter.id)

          // 返回更新后的角色列表
          const updatedCharacters = db.prepare(
            'SELECT * FROM characters WHERE group_id = ? ORDER BY is_user DESC, position ASC'
          ).all(groupId)

          return { success: true, data: updatedCharacters }
        }
      }

      return { success: false, error: '角色不存在' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
