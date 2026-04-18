/**
 * 全局角色 IPC 处理器
 */
import { ipcMain } from 'electron'
import { createHandler } from '../handler-wrapper.js'

export function setupGlobalCharacterHandlers(dbManager, globalCharManager) {
  // 获取所有全局角色
  ipcMain.handle('globalCharacter:getAll', createHandler(async () => {
    const characters = globalCharManager.getAll()
    return { success: true, data: characters }
  }))

  // 根据 ID 获取全局角色
  ipcMain.handle('globalCharacter:getById', createHandler(async (event, id) => {
    const character = globalCharManager.getById(id)
    if (!character) {
      return { success: false, error: '角色不存在' }
    }
    return { success: true, data: character }
  }))

  // 创建全局角色
  ipcMain.handle('globalCharacter:create', createHandler(async (event, data) => {
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

    // 设置角色标签
    if (data.tagIds && data.tagIds.length > 0) {
      globalCharManager.setCharacterTags(character.id, data.tagIds)
    }

    // 返回带标签的角色
    character.tags = globalCharManager.getCharacterTags(character.id)
    return { success: true, data: character }
  }, 'GlobalCharacter:create'))

  // 更新全局角色
  ipcMain.handle('globalCharacter:update', createHandler(async (event, id, data) => {
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

    // 更新角色标签
    if (data.tagIds !== undefined) {
      globalCharManager.setCharacterTags(id, data.tagIds)
    }

    // 返回带标签的角色
    character.tags = globalCharManager.getCharacterTags(id)
    return { success: true, data: character }
  }, 'GlobalCharacter:update'))

  // 删除全局角色
  ipcMain.handle('globalCharacter:delete', createHandler(async (event, id) => {
    const existing = globalCharManager.getById(id)
    if (!existing) {
      return { success: false, error: '角色不存在' }
    }

    globalCharManager.delete(id)
    return { success: true }
  }, 'GlobalCharacter:delete'))

  // 搜索全局角色
  ipcMain.handle('globalCharacter:search', createHandler(async (event, keyword) => {
    const characters = globalCharManager.search(keyword)
    return { success: true, data: characters }
  }))

  // 导入到群组
  ipcMain.handle('globalCharacter:importToGroup', createHandler(async (event, characterId, groupId) => {
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

    // 使用角色库原始 ID，便于追溯来源和同步
    const newCharId = characterId

    // 获取当前最大的 position 值（仅 AI 角色），新角色添加到尾部
    const maxPositionResult = db.prepare(
      'SELECT MAX(position) as max_pos FROM characters WHERE group_id = ? AND is_user = 0'
    ).get(groupId)
    const nextPosition = (maxPositionResult.max_pos || 0) + 1

    db.prepare(`
      INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user, position)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      newCharId,
      groupId,
      globalCharacter.name,
      globalCharacter.system_prompt,
      1, // 默认启用
      0, // 非 AI 角色
      nextPosition
    )

    const newCharacter = db.prepare('SELECT * FROM characters WHERE id = ?').get(newCharId)
    return { success: true, data: newCharacter }
  }, 'GlobalCharacter:importToGroup'))

  // 从角色库同步角色设定到群组
  ipcMain.handle('globalCharacter:syncToGroup', createHandler(async (event, characterId, groupId) => {
    // 获取全局角色最新数据
    const globalCharacter = globalCharManager.getById(characterId)
    if (!globalCharacter) {
      return { success: false, error: '角色库中不存在该角色' }
    }

    // 获取群组数据库
    const db = dbManager.getGroupDB(groupId)

    // 查找群组中对应 ID 的角色
    const groupChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
    if (!groupChar) {
      return { success: false, error: '群组中不存在该角色' }
    }

    // 更新群组角色的 name 和 system_prompt
    db.prepare(`
      UPDATE characters SET name = ?, system_prompt = ? WHERE id = ?
    `).run(globalCharacter.name, globalCharacter.system_prompt, characterId)

    const updated = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
    return { success: true, data: updated }
  }, 'GlobalCharacter:syncToGroup'))

  // 同步角色设定到所有关联群组
  ipcMain.handle('globalCharacter:syncToAllGroups', createHandler(async (event, characterId) => {
    const globalCharacter = globalCharManager.getById(characterId)
    if (!globalCharacter) {
      return { success: false, error: '角色库中不存在该角色' }
    }

    const groupIds = dbManager.getGroupDBFiles()
    const syncedGroups = []

    for (const groupId of groupIds) {
      try {
        const db = dbManager.getGroupDB(groupId)
        const groupChar = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
        if (groupChar) {
          db.prepare(`
            UPDATE characters SET name = ?, system_prompt = ? WHERE id = ?
          `).run(globalCharacter.name, globalCharacter.system_prompt, characterId)
          syncedGroups.push({ groupId, groupName: null })
        }
      } catch (err) {
        console.error(`同步角色到群组 ${groupId} 失败:`, err)
      }
    }

    // 获取群组名称
    for (const item of syncedGroups) {
      try {
        const db = dbManager.getGroupDB(item.groupId)
        const group = db.prepare('SELECT name FROM groups WHERE id = ?').get(item.groupId)
        item.groupName = group ? group.name : item.groupId
      } catch {
        item.groupName = item.groupId
      }
    }

    return { success: true, data: { count: syncedGroups.length, groups: syncedGroups } }
  }, 'GlobalCharacter:syncToAllGroups'))

  // 检查角色是否存在于角色库
  ipcMain.handle('globalCharacter:existsInLibrary', createHandler(async (event, characterId) => {
    const character = globalCharManager.getById(characterId)
    return { success: true, data: !!character }
  }))

  // ============ 标签管理 ============

  // 获取所有标签
  ipcMain.handle('globalCharacter:getAllTags', createHandler(async () => {
    const tags = globalCharManager.getAllTags()
    return { success: true, data: tags }
  }))

  // 创建标签
  ipcMain.handle('globalCharacter:createTag', createHandler(async (event, data) => {
    if (!data.name || !data.name.trim()) {
      return { success: false, error: '标签名称不能为空' }
    }

    // 检查标签名是否已存在
    const existing = globalCharManager.getAllTags().find(
      t => t.name.toLowerCase() === data.name.trim().toLowerCase()
    )
    if (existing) {
      return { success: false, error: '标签名称已存在' }
    }

    const tag = globalCharManager.createTag({
      name: data.name.trim(),
      color: data.color || '#07c160'
    })
    return { success: true, data: tag }
  }, 'GlobalCharacter:createTag'))

  // 更新标签
  ipcMain.handle('globalCharacter:updateTag', createHandler(async (event, id, data) => {
    const tag = globalCharManager.db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
    if (!tag) {
      return { success: false, error: '标签不存在' }
    }

    // 检查新名称是否与其他标签冲突
    if (data.name !== undefined) {
      const existing = globalCharManager.getAllTags().find(
        t => t.id !== id && t.name.toLowerCase() === data.name.trim().toLowerCase()
      )
      if (existing) {
        return { success: false, error: '标签名称已存在' }
      }
    }

    const updatedTag = globalCharManager.updateTag(id, data)
    return { success: true, data: updatedTag }
  }, 'GlobalCharacter:updateTag'))

  // 删除标签
  ipcMain.handle('globalCharacter:deleteTag', createHandler(async (event, id) => {
    const result = globalCharManager.deleteTag(id)
    return result
  }))

  // 获取角色的标签
  ipcMain.handle('globalCharacter:getCharacterTags', createHandler(async (event, characterId) => {
    const tags = globalCharManager.getCharacterTags(characterId)
    return { success: true, data: tags }
  }))

  // 设置角色的标签
  ipcMain.handle('globalCharacter:setCharacterTags', createHandler(async (event, characterId, tagIds) => {
    globalCharManager.setCharacterTags(characterId, tagIds)
    return { success: true }
  }))

  // 根据标签筛选角色
  ipcMain.handle('globalCharacter:getByTags', createHandler(async (event, tagIds) => {
    const characters = globalCharManager.getCharactersByTags(tagIds)
    return { success: true, data: characters }
  }))

  // 获取所有角色（含标签）
  ipcMain.handle('globalCharacter:getAllWithTags', createHandler(async () => {
    const characters = globalCharManager.getAllWithTags()
    return { success: true, data: characters }
  }))

  // 搜索角色（支持标签筛选）
  ipcMain.handle('globalCharacter:searchWithTags', createHandler(async (event, keyword, tagIds) => {
    const characters = globalCharManager.searchWithTags(keyword, tagIds)
    return { success: true, data: characters }
  }))
}
