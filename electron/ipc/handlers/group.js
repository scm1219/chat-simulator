/**
 * 群组 IPC 处理器
 */
import { ipcMain } from 'electron'
import { generateUUID } from '../../utils/uuid.js'
import { createLogger } from '../../utils/logger.js'
import { encryptSecret, decryptSecret } from '../../utils/secure-storage.js'

const log = createLogger('Group')
import { createHandler, buildDynamicUpdate } from '../handler-wrapper.js'

// 群组 INSERT 列名和默认值常量（新增字段只需修改此处）
const GROUP_COLUMNS = [
  'id', 'name', 'llm_provider', 'llm_model', 'llm_api_key', 'llm_base_url',
  'max_history', 'response_mode', 'use_global_api_key', 'thinking_enabled',
  'random_order', 'background', 'system_prompt',
  'auto_memory_extract', 'narrative_enabled', 'aftermath_enabled', 'event_scene_type'
]
const GROUP_INSERT_SQL = `
  INSERT INTO groups (${GROUP_COLUMNS.join(', ')})
  VALUES (${GROUP_COLUMNS.map(() => '?').join(', ')})
`

/**
 * 布尔列取值归一为 0/1
 * 优先 camelCase（渲染进程），其次 snake_case（复制群组时透传的数据库行），均缺省用 fallback
 */
function boolFrom(data, camelKey, snakeKey, fallback) {
  if (data[camelKey] !== undefined) return data[camelKey] ? 1 : 0
  if (data[snakeKey] !== undefined) return data[snakeKey] ? 1 : 0
  return fallback
}

/**
 * 将前端 camelCase 字段映射为数据库 snake_case 字段
 * @param {object} data - 前端数据
 * @param {string} [id] - 可选 ID（不传时从 data.id 取）
 * @param {object} [opts] - 选项
 * @param {boolean} [opts.encryptApiKey=true] - 是否加密 llm_api_key
 *   （渲染进程明文输入传 true；group:duplicate 回写存储旧密文时传 false，防止双重加密）
 * @returns {Array} 按 GROUP_COLUMNS 顺序排列的值数组
 */
function mapGroupValues(data, id, { encryptApiKey = true } = {}) {
  const groupId = id || data.id
  const rawApiKey = (data.llmApiKey || data.llm_api_key) ? String(data.llmApiKey || data.llm_api_key) : null

  // max_history 边界：0 合法（不携带历史）；负数、NaN、非数值回退 20
  const rawMaxHistory = data.maxHistory ?? data.max_history
  let maxHistory = 20
  if (rawMaxHistory !== undefined && rawMaxHistory !== null) {
    const parsed = parseInt(rawMaxHistory, 10)
    if (Number.isFinite(parsed) && parsed >= 0) maxHistory = parsed // 0 合法；负数/NaN 维持默认 20
  }

  const eventSceneType = (data.eventSceneType || data.event_scene_type)
    ? String(data.eventSceneType || data.event_scene_type)
    : 'general'

  return [
    groupId,
    String(data.name || ''),
    String(data.llmProvider || data.llm_provider || 'openai'),
    String(data.llmModel || data.llm_model || 'gpt-3.5-turbo'),
    encryptApiKey ? encryptSecret(rawApiKey) : rawApiKey,
    (data.llmBaseUrl || data.llm_base_url) ? String(data.llmBaseUrl || data.llm_base_url) : null,
    maxHistory,
    String(data.responseMode || data.response_mode || 'sequential'),
    boolFrom(data, 'useGlobalApiKey', 'use_global_api_key', 1),
    boolFrom(data, 'thinkingEnabled', 'thinking_enabled', 0),
    boolFrom(data, 'randomOrder', 'random_order', 0),
    (data.background) ? String(data.background) : null,
    (data.systemPrompt || data.system_prompt) ? String(data.systemPrompt || data.system_prompt) : null,
    boolFrom(data, 'autoMemoryExtract', 'auto_memory_extract', 0),
    boolFrom(data, 'narrativeEnabled', 'narrative_enabled', 1),
    boolFrom(data, 'aftermathEnabled', 'aftermath_enabled', 1),
    eventSceneType
  ]
}

/**
 * 解密群组行的 llm_api_key（返回渲染进程前调用）
 * 前端 ChatWindow 需用明文 apiKey 与 LLM Profile 做相等匹配（定位当前配置/切换模型）
 */
function decryptGroupRow(group) {
  if (!group || group.llm_api_key == null) return group
  return { ...group, llm_api_key: decryptSecret(group.llm_api_key) }
}

export function setupGroupHandlers(dbManager) {
  // 创建群组
  ipcMain.handle('group:create', createHandler(async (event, data) => {
    const id = generateUUID()
    const values = mapGroupValues(data, id)

    const db = dbManager.getGroupDB(id)
    db.prepare(GROUP_INSERT_SQL).run(...values)

    // 自动创建默认用户角色
    const userCharacterId = generateUUID()
    db.prepare(`
      INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userCharacterId, id, '用户', '你是用户，正在参与群聊对话。', 1, 1)

    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
    return { success: true, data: decryptGroupRow(group) }
  }, 'Group:create'))

  // 获取所有群组（按最近消息时间倒序）
  ipcMain.handle('group:getAll', createHandler(async () => {
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
          groups.push(decryptGroupRow(group))
        }
      } catch (error) {
        log.error(`加载群组 ${id} 失败:`, error)
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
  }, 'Group:getAll'))

  // 获取单个群组
  ipcMain.handle('group:getById', createHandler(async (event, id) => {
    const db = dbManager.getGroupDB(id)
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)

    if (!group) {
      return { success: false, error: '群组不存在' }
    }

    return { success: true, data: decryptGroupRow(group) }
  }, 'Group:getById'))

  // 更新群组
  ipcMain.handle('group:update', createHandler(async (event, id, data) => {
    const db = dbManager.getGroupDB(id)

    const boolTransform = (val) => val ? 1 : 0
    const updated = buildDynamicUpdate(db, 'groups', data, [
      ['name', 'name'],
      ['llmProvider', 'llm_provider'],
      ['llmModel', 'llm_model'],
      ['llmApiKey', 'llm_api_key', (val) => encryptSecret(val)],
      ['llmBaseUrl', 'llm_base_url'],
      ['maxHistory', 'max_history'],
      ['responseMode', 'response_mode'],
      ['useGlobalApiKey', 'use_global_api_key', boolTransform],
      ['thinkingEnabled', 'thinking_enabled', boolTransform],
      ['randomOrder', 'random_order', boolTransform],
      ['background', 'background'],
      ['systemPrompt', 'system_prompt'],
      ['autoMemoryExtract', 'auto_memory_extract', boolTransform],
      ['narrativeEnabled', 'narrative_enabled', boolTransform],
      ['aftermathEnabled', 'aftermath_enabled', boolTransform],
      ['eventSceneType', 'event_scene_type']
    ], id)

    if (!updated) {
      return { success: false, error: '没有要更新的字段' }
    }

    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(id)
    return { success: true, data: decryptGroupRow(group) }
  }, 'Group:update'))

  // 删除群组
  ipcMain.handle('group:delete', createHandler(async (event, id) => {
    // 关闭数据库连接
    dbManager.closeGroupDB(id)

    // 删除数据库文件
    dbManager.deleteGroupDB(id)

    return { success: true }
  }, 'Group:delete'))

  // 复制群组
  ipcMain.handle('group:duplicate', createHandler(async (event, sourceId) => {
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

    // 使用统一的列名常量，snake_case 直接传入 mapGroupValues
    // 源群组的 llm_api_key 已是存储密文，直接透传（不再次加密）
    const groupValues = mapGroupValues({
      ...sourceGroup,
      name: duplicateName
    }, newId, { encryptApiKey: false })
    newDb.prepare(GROUP_INSERT_SQL).run(...groupValues)

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
    return { success: true, data: decryptGroupRow(newGroup) }
  }, 'Group:duplicate'))
}
