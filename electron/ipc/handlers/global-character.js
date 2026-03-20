/**
 * 全局角色 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'

export function setupGlobalCharacterHandlers(dbManager, globalCharManager) {
  // 获取所有全局角色
  ipcMain.handle('globalCharacter:getAll', async () => {
    try {
      const characters = globalCharManager.getAll()
      return { success: true, data: characters }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 根据 ID 获取全局角色
  ipcMain.handle('globalCharacter:getById', async (event, id) => {
    try {
      const character = globalCharManager.getById(id)
      if (!character) {
        return { success: false, error: '角色不存在' }
      }
      return { success: true, data: character }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 创建全局角色
  ipcMain.handle('globalCharacter:create', async (event, data) => {
    try {
      if (!data.name || !data.name.trim()) {
        return { success: false, error: '角色名称不能为空' }
      }
      if (!data.systemPrompt || !data.systemPrompt.trim()) {
        return { success: false, error: '人物设定不能为空' }
      }

      const character = globalCharManager.create({
        name: data.name.trim(),
        gender: data.gender || null,
        age: data.age || null,
        systemPrompt: data.systemPrompt.trim()
      })

      return { success: true, data: character }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新全局角色
  ipcMain.handle('globalCharacter:update', async (event, id, data) => {
    try {
      const existing = globalCharManager.getById(id)
      if (!existing) {
        return { success: false, error: '角色不存在' }
      }

      if (data.name !== undefined && !data.name.trim()) {
        return { success: false, error: '角色名称不能为空' }
      }
      if (data.systemPrompt !== undefined && !data.systemPrompt.trim()) {
        return { success: false, error: '人物设定不能为空' }
      }

      const character = globalCharManager.update(id, data)
      return { success: true, data: character }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除全局角色
  ipcMain.handle('globalCharacter:delete', async (event, id) => {
    try {
      const existing = globalCharManager.getById(id)
      if (!existing) {
        return { success: false, error: '角色不存在' }
      }

      const success = globalCharManager.delete(id)
      return { success }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 搜索全局角色
  ipcMain.handle('globalCharacter:search', async (event, keyword) => {
    try {
      const characters = globalCharManager.search(keyword)
      return { success: true, data: characters }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 导入到群组
  ipcMain.handle('globalCharacter:importToGroup', async (event, characterId, groupId) => {
    try {
      // 获取全局角色
      const globalCharacter = globalCharManager.getById(characterId)
      if (!globalCharacter) {
        return { success: false, error: '角色不存在' }
      }

      // 检查群组是否存在
      const db = dbManager.getGroupDB(groupId)
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
      if (!group) {
        return { success: false, error: '群组不存在' }
      }

      // 检查是否已存在同名角色
      const existingChar = db.prepare(`
        SELECT * FROM characters
        WHERE group_id = ? AND name = ?
      `).get(groupId, globalCharacter.name)

      if (existingChar) {
        return {
          success: false,
          error: `群组中已存在名为"${globalCharacter.name}"的角色`
        }
      }

      // 创建新角色
      const newCharId = generateUUID()
      db.prepare(`
        INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        newCharId,
        groupId,
        globalCharacter.name,
        globalCharacter.system_prompt,
        1, // 默认启用
        0  // 非 AI 角色
      )

      const newCharacter = db.prepare('SELECT * FROM characters WHERE id = ?').get(newCharId)
      return { success: true, data: newCharacter }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
