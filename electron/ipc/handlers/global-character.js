/**
 * 全局角色 IPC 处理器
 */
import { ipcMain } from 'electron'
import { createHandler } from '../handler-wrapper.js'
import { createLogger } from '../../utils/logger.js'
import { callLLMForJSON } from './llm.js'

const log = createLogger('GlobalChar')

/**
 * 重新生成角色设定的风格提示词
 */
const STYLE_PROMPTS = {
  daily: '用日常口语化的风格重新写这个人设。像跟朋友介绍这个人一样，写具体的习惯、口头禅、小毛病，不要用概括性描述。用"你是xxx"开头。',
  professional: '用专业正式的风格写这个人设。保留角色核心身份，用精炼准确的语言描述，适合职场或正式场景。',
  literary: '用文学性描写的方式写这个人设。注重意象和氛围营造，语言有质感和深度，像小说人物出场。',
  humorous: '用轻松幽默的风格写这个人设。突出角色有趣的一面，可以加自嘲和搞笑的小细节，让人会心一笑。',
  chuunibyou: '用中二热血的风格写这个人设。加入宿命感、觉醒、隐藏力量等元素，台词感十足，燃到爆炸。',
  artsy: '用小清新文艺的风格写这个人设。语言像散文诗，注重氛围和情绪，有诗意但不过度矫情。',
  dramatic: '用戏剧化的风格写这个人设。强调角色内心的冲突和张力，性格鲜明，像舞台剧角色。',
  concise: '用极简的风格写这个人设，控制在50-100字。一句话抓住角色最核心的特点，不留废话。',
  detailed: '用详尽细腻的风格写这个人设，300-500字。全面描写角色的方方面面，包括细微的习惯和深层动机。'
}

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
        log.error(`同步角色到群组 ${groupId} 失败:`, err)
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
    const tag = globalCharManager.getTagById(id)
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

  // 重新生成角色设定
  ipcMain.handle('globalCharacter:regeneratePrompt', createHandler(async (event, characterId, style = 'daily', profileId = '', originalPrompt = '') => {
    const character = globalCharManager.getById(characterId)
    if (!character) {
      return { success: false, error: '角色不存在' }
    }

    const sourcePrompt = originalPrompt || character.system_prompt

    const styleGuide = STYLE_PROMPTS[style] || STYLE_PROMPTS.daily

    const systemPrompt = `你是一个角色设定改写专家。根据角色原有的信息，用新的风格重新撰写人物设定。
要求：
- 用"你是xxx"开头
- 保留角色的核心身份和关键特征（姓名、性别、年龄等不变）
- 不要用"设定"、"背景"、"性格"这类分类标题，就是一段自然的描述
- 不要写"你是一个xxx的角色"、"请扮演xxx"这类元叙事
${styleGuide}

请严格按照以下 JSON 格式返回，不要添加任何其他文字：
{
  "systemPrompt": "重新撰写的人物设定"
}`

    const userPrompt = `请用新的风格重新改写以下角色的设定：

角色名称：${character.name}
性别：${character.gender || '未设置'}
年龄：${character.age || '未设置'}
当前设定：${sourcePrompt}`

    const result = await callLLMForJSON({
      profileId: profileId || undefined,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.8,
      maxTokens: 1500
    })

    if (!result.success) {
      return { success: false, error: result.error }
    }

    const newPrompt = result.data.systemPrompt
    if (!newPrompt || !newPrompt.trim()) {
      return { success: false, error: '生成结果为空，请重试' }
    }

    return { success: true, data: { systemPrompt: newPrompt.trim() } }
  }, 'GlobalCharacter:regeneratePrompt'))
}
