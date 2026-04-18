/**
 * 群组 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'

export function setupGroupHandlers(dbManager) {
  // 创建群组
  ipcMain.handle('group:create', async (event, data) => {
    try {
      // 转换数据类型，确保兼容 SQLite3
      const id = generateUUID()

      // 确保所有值都是 SQLite3 支持的类型
      const values = {
        id: id,
        name: String(data.name || ''),
        llm_provider: String(data.llmProvider || 'openai'),
        llm_model: String(data.llmModel || 'gpt-3.5-turbo'),
        llm_api_key: data.llmApiKey ? String(data.llmApiKey) : null,
        llm_base_url: data.llmBaseUrl ? String(data.llmBaseUrl) : null,
        max_history: parseInt(data.maxHistory) || 20,
        response_mode: String(data.responseMode || 'sequential'),
        use_global_api_key: (data.useGlobalApiKey !== undefined ? (data.useGlobalApiKey ? 1 : 0) : 1),
        thinking_enabled: (data.thinkingEnabled !== undefined ? (data.thinkingEnabled ? 1 : 0) : 0),
        random_order: (data.randomOrder !== undefined ? (data.randomOrder ? 1 : 0) : 0),
        background: data.background ? String(data.background) : null,
        system_prompt: data.systemPrompt ? String(data.systemPrompt) : null
      }

      const db = dbManager.getGroupDB(id)
      db.prepare(`
        INSERT INTO groups (id, name, llm_provider, llm_model, llm_api_key, llm_base_url, max_history, response_mode, use_global_api_key, thinking_enabled, random_order, background, system_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        values.id,
        values.name,
        values.llm_provider,
        values.llm_model,
        values.llm_api_key,
        values.llm_base_url,
        values.max_history,
        values.response_mode,
        values.use_global_api_key,
        values.thinking_enabled,
        values.random_order,
        values.background,
        values.system_prompt
      )

      // 自动创建默认用户角色
      const userCharacterId = generateUUID()
      db.prepare(`
        INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userCharacterId, id, '用户', '你是用户，正在参与群聊对话。', 1, 1)

      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
      return { success: true, data: group }
    } catch (error) {
      console.error('[Group] 创建群组失败', error)
      return { success: false, error: error.message }
    }
  })

  // 获取所有群组（按最近消息时间倒序）
  ipcMain.handle('group:getAll', async () => {
    try {
      const groupIds = dbManager.getGroupDBFiles()
      const groups = []

      for (const id of groupIds) {
        try {
          const db = dbManager.getGroupDB(id)
          const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
          if (group) {
            // 查询该群最近一条消息的时间
            const lastMsg = db.prepare(
              'SELECT timestamp FROM messages WHERE group_id = ? ORDER BY timestamp DESC LIMIT 1'
            ).get(id)
            group.last_message_time = lastMsg ? lastMsg.timestamp : null
            groups.push(group)
          }
        } catch (error) {
          console.error(`Failed to load group ${id}:`, error)
        }
      }

      // 按最近消息时间倒序排列，无消息的排到最后
      groups.sort((a, b) => {
        if (!a.last_message_time && !b.last_message_time) return 0
        if (!a.last_message_time) return 1
        if (!b.last_message_time) return -1
        return b.last_message_time.localeCompare(a.last_message_time)
      })

      return { success: true, data: groups }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取单个群组
  ipcMain.handle('group:getById', async (event, id) => {
    try {
      const db = dbManager.getGroupDB(id)
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)

      if (!group) {
        return { success: false, error: '群组不存在' }
      }

      return { success: true, data: group }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 更新群组
  ipcMain.handle('group:update', async (event, id, data) => {
    try {
      const db = dbManager.getGroupDB(id)

      // 构建更新字段
      const updates = []
      const values = []

      if (data.name !== undefined) {
        updates.push('name = ?')
        values.push(data.name)
      }
      if (data.llmProvider !== undefined) {
        updates.push('llm_provider = ?')
        values.push(data.llmProvider)
      }
      if (data.llmModel !== undefined) {
        updates.push('llm_model = ?')
        values.push(data.llmModel)
      }
      if (data.llmApiKey !== undefined) {
        updates.push('llm_api_key = ?')
        values.push(data.llmApiKey)
      }
      if (data.llmBaseUrl !== undefined) {
        updates.push('llm_base_url = ?')
        values.push(data.llmBaseUrl)
      }
      if (data.maxHistory !== undefined) {
        updates.push('max_history = ?')
        values.push(data.maxHistory)
      }
      if (data.responseMode !== undefined) {
        updates.push('response_mode = ?')
        values.push(data.responseMode)
      }
      if (data.useGlobalApiKey !== undefined) {
        updates.push('use_global_api_key = ?')
        values.push(data.useGlobalApiKey ? 1 : 0)
      }
      if (data.thinkingEnabled !== undefined) {
        updates.push('thinking_enabled = ?')
        values.push(data.thinkingEnabled ? 1 : 0)
      }
      if (data.randomOrder !== undefined) {
        updates.push('random_order = ?')
        values.push(data.randomOrder ? 1 : 0)
      }
      if (data.background !== undefined) {
        updates.push('background = ?')
        values.push(data.background)
      }
      if (data.systemPrompt !== undefined) {
        updates.push('system_prompt = ?')
        values.push(data.systemPrompt)
      }
      if (data.autoMemoryExtract !== undefined) {
        updates.push('auto_memory_extract = ?')
        values.push(data.autoMemoryExtract ? 1 : 0)
      }
      if (data.narrativeEnabled !== undefined) {
        updates.push('narrative_enabled = ?')
        values.push(data.narrativeEnabled ? 1 : 0)
      }
      if (data.aftermathEnabled !== undefined) {
        updates.push('aftermath_enabled = ?')
        values.push(data.aftermathEnabled ? 1 : 0)
      }
      if (data.eventSceneType !== undefined) {
        updates.push('event_scene_type = ?')
        values.push(data.eventSceneType)
      }

      if (updates.length === 0) {
        return { success: false, error: '没有要更新的字段' }
      }

      values.push(id)
      db.prepare(`UPDATE groups SET ${updates.join(', ')} WHERE id = ?`).run(...values)

      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
      return { success: true, data: group }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除群组
  ipcMain.handle('group:delete', async (event, id) => {
    try {
      // 关闭数据库连接
      dbManager.closeGroupDB(id)

      // 删除数据库文件
      dbManager.deleteGroupDB(id)

      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 复制群组
  ipcMain.handle('group:duplicate', async (event, sourceId) => {
    try {
      // 获取源群组数据
      const sourceDb = dbManager.getGroupDB(sourceId)
      const sourceGroup = sourceDb.prepare('SELECT * FROM groups WHERE id = ?').get(sourceId)

      if (!sourceGroup) {
        return { success: false, error: '源群组不存在' }
      }

      // 获取源群组的所有角色
      const sourceCharacters = sourceDb.prepare('SELECT * FROM characters WHERE group_id = ?').all(sourceId)

      // 创建新群组
      const newId = generateUUID()
      const newDb = dbManager.getGroupDB(newId)

      // 复制群组信息（添加"副本"后缀）
      const duplicateName = sourceGroup.name.endsWith('(副本)')
        ? sourceGroup.name
        : `${sourceGroup.name}(副本)`

      newDb.prepare(`
        INSERT INTO groups (id, name, llm_provider, llm_model, llm_api_key, llm_base_url, max_history, response_mode, use_global_api_key, thinking_enabled, random_order, background, system_prompt)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        duplicateName,
        sourceGroup.llm_provider,
        sourceGroup.llm_model,
        sourceGroup.llm_api_key,
        sourceGroup.llm_base_url,
        sourceGroup.max_history,
        sourceGroup.response_mode,
        sourceGroup.use_global_api_key,
        sourceGroup.thinking_enabled,
        sourceGroup.random_order,
        sourceGroup.background,
        sourceGroup.system_prompt
      )

      // 复制所有角色（含完整字段），并建立旧ID到新ID的映射
      const characterIdMap = {} // 旧角色ID -> 新角色ID
      for (const character of sourceCharacters) {
        const newCharacterId = generateUUID()
        characterIdMap[character.id] = newCharacterId

        newDb.prepare(`
          INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user, position, thinking_enabled, custom_llm_profile_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newCharacterId,
          newId,
          character.name,
          character.system_prompt,
          character.enabled,
          character.is_user || 0,
          character.position || 0,
          character.thinking_enabled || 0,
          character.custom_llm_profile_id || null
        )
      }

      // 复制所有消息（含完整字段）
      const sourceMessages = sourceDb.prepare('SELECT * FROM messages WHERE group_id = ? ORDER BY timestamp').all(sourceId)
      for (const message of sourceMessages) {
        const newMessageId = generateUUID()
        // 将消息中的旧角色ID映射到新的角色ID
        const newCharacterId = message.character_id ? characterIdMap[message.character_id] : null

        newDb.prepare(`
          INSERT INTO messages (id, group_id, character_id, role, content, reasoning_content, prompt_tokens, completion_tokens, model, is_aftermath, message_type, event_impact, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          newMessageId,
          newId,
          newCharacterId,
          message.role,
          message.content,
          message.reasoning_content || null,
          message.prompt_tokens || null,
          message.completion_tokens || null,
          message.model || null,
          message.is_aftermath || 0,
          message.message_type || 'normal',
          message.event_impact || null,
          message.timestamp
        )
      }

      const newGroup = newDb.prepare('SELECT * FROM groups WHERE id = ?').get(newId)
      return { success: true, data: newGroup }
    } catch (error) {
      console.error('[Group] 复制群组失败', error)
      return { success: false, error: error.message }
    }
  })
}
