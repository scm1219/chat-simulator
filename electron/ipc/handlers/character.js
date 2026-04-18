/**
 * 角色 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'
import { createHandler } from '../handler-wrapper.js'

/**
 * 跨群组数据库查找角色
 * @param {object} dbManager 数据库管理器
 * @param {string} characterId 角色 ID
 * @returns {{ db: object, character: object, groupId: string } | null}
 */
function findCharacterDB(dbManager, characterId) {
  const groupIds = dbManager.getGroupDBFiles()
  for (const groupId of groupIds) {
    const db = dbManager.getGroupDB(groupId)
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
    if (character) return { db, character, groupId }
  }
  return null
}

export function setupCharacterHandlers(dbManager, narrativeEngine = null) {
  // 创建角色
  ipcMain.handle('character:create', createHandler(async (event, data) => {
    const { groupId, name, systemPrompt } = data
    const id = generateUUID()

    const db = dbManager.getGroupDB(groupId)

    // 获取当前最大的 position 值（仅 AI 角色）
    const maxPositionResult = db.prepare(
      'SELECT MAX(position) as max_pos FROM characters WHERE group_id = ? AND is_user = 0'
    ).get(groupId)
    const nextPosition = (maxPositionResult.max_pos || 0) + 1

    db.prepare(`
      INSERT INTO characters (id, group_id, name, system_prompt, position)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, groupId, name, systemPrompt, nextPosition)

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
    return { success: true, data: character }
  }, 'Character:create'))

  // 获取群组的所有角色
  ipcMain.handle('character:getByGroupId', createHandler(async (event, groupId) => {
    const db = dbManager.getGroupDB(groupId)
    const characters = db.prepare('SELECT * FROM characters WHERE group_id = ? ORDER BY is_user DESC, position ASC, created_at ASC').all(groupId)
    return { success: true, data: characters }
  }))

  // 更新角色
  ipcMain.handle('character:update', createHandler(async (event, id, data) => {
    const found = findCharacterDB(dbManager, id)
    if (!found) return { success: false, error: '角色不存在' }

    const { db } = found
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
    if (data.thinkingEnabled !== undefined) {
      updates.push('thinking_enabled = ?')
      values.push(data.thinkingEnabled ? 1 : 0)
    }
    if (data.customLlmProfileId !== undefined) {
      updates.push('custom_llm_profile_id = ?')
      values.push(data.customLlmProfileId || null)
    }

    if (updates.length > 0) {
      values.push(id)
      db.prepare(`UPDATE characters SET ${updates.join(', ')} WHERE id = ?`).run(...values)
    }

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
    return { success: true, data: updated }
  }, 'Character:update'))

  // 删除角色
  ipcMain.handle('character:delete', createHandler(async (event, id) => {
    const found = findCharacterDB(dbManager, id)
    if (!found) return { success: false, error: '角色不存在' }

    const { db, character } = found
    // 检查是否为用户角色
    if (character.is_user === 1) {
      return { success: false, error: '用户角色不可删除' }
    }

    const result = db.prepare('DELETE FROM characters WHERE id = ?').run(id)

    // 清理角色相关的叙事数据（情绪记录 + 双向关系记录）
    if (result.changes > 0 && narrativeEngine) {
      try {
        narrativeEngine.removeCharacter(db, id)
      } catch (err) {
        console.error('[Character:delete] 清理叙事数据失败:', err.message)
      }
    }

    if (result.changes > 0) {
      return { success: true }
    }

    return { success: false, error: '角色不存在' }
  }, 'Character:delete'))

  // 切换角色启用状态
  ipcMain.handle('character:toggle', createHandler(async (event, id, enabled) => {
    const found = findCharacterDB(dbManager, id)
    if (!found) return { success: false, error: '角色不存在' }

    const { db } = found
    const result = db.prepare('UPDATE characters SET enabled = ? WHERE id = ?').run(enabled ? 1 : 0, id)
    if (result.changes > 0) {
      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(id)
      return { success: true, data: character }
    }

    return { success: false, error: '角色不存在' }
  }, 'Character:toggle'))

  // 调整角色顺序
  ipcMain.handle('character:reorder', createHandler(async (event, id, direction) => {
    const found = findCharacterDB(dbManager, id)
    if (!found) return { success: false, error: '角色不存在' }

    const { db, character, groupId } = found
    // 用户角色不可调整顺序
    if (character.is_user === 1) {
      return { success: false, error: '用户角色不可调整顺序' }
    }

    // 获取所有非用户角色并按 position 排序
    const allCharacters = db.prepare(
      'SELECT * FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY position ASC, created_at ASC'
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

    // 创建新数组，交换位置
    const reorderedCharacters = [...allCharacters]
    const [removed] = reorderedCharacters.splice(currentIndex, 1)
    reorderedCharacters.splice(newIndex, 0, removed)

    // 更新所有角色的 position 值（基于新数组的索引）
    const updateStmt = db.prepare('UPDATE characters SET position = ? WHERE id = ?')
    reorderedCharacters.forEach((char, index) => {
      updateStmt.run(index, char.id)
    })

    // 返回更新后的角色列表
    const updatedCharacters = db.prepare(
      'SELECT * FROM characters WHERE group_id = ? ORDER BY is_user DESC, position ASC, created_at ASC'
    ).all(groupId)

    return { success: true, data: updatedCharacters }
  }, 'Character:reorder'))
}
