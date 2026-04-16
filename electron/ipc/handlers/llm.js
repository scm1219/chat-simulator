/**
 * LLM IPC 处理器
 */
import { ipcMain } from 'electron'
import { LLMClient } from '../../llm/client.js'
import { OllamaNativeClient } from '../../llm/ollama-client.js'
import { getAllProviders, getProviderConfig } from '../../llm/providers/index.js'
import { resolveProfileProxy } from '../../llm/proxy.js'
import { getGlobalLLMConfig, getGachaConfig, getQuickGroupConfig } from '../../config/manager.js'
import { getLLMProfiles } from '../../config/llm-profiles.js'
import { extractJSON } from '../../utils/json-extractor.js'
import { generateUUID } from '../../utils/uuid.js'

/**
 * 解析 Profile 代理配置为客户端可用的 proxy + bypassRules
 * @param {object|null} profile - LLM Profile 对象（含 proxy 字段）
 * @param {string} baseURL - API 基础 URL（用于系统代理检测）
 * @returns {{ proxy: object|false|undefined, bypassRules: string }}
 */
function resolveClientProxy(profile, baseURL) {
  const proxyConfig = profile?.proxy || null
  return resolveProfileProxy(proxyConfig, baseURL || '')
}

/**
 * 为角色创建 LLM 客户端
 * 如果角色有独立 LLM Profile 配置，使用角色级配置；否则回退到群组配置
 * @param {object} character - 角色对象（含 custom_llm_profile_id）
 * @param {object} group - 群组对象
 * @param {Array} llmProfiles - 所有 LLM Profile 列表
 * @param {string} apiKey - API Key
 * @returns {{ client: LLMClient|OllamaNativeClient, profileId: string|null }}
 */
function createClientForCharacter(character, group, llmProfiles, apiKey) {
  // 角色有独立 LLM Profile，使用角色级配置
  if (character.custom_llm_profile_id) {
    const profile = llmProfiles.find(p => p.id === character.custom_llm_profile_id)
    if (profile) {
      console.log(`[LLM] 角色 ${character.name} 使用独立 LLM 配置: ${profile.name} (${profile.provider}/${profile.model})`)
      const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(profile, profile.baseURL)
      const client = createLLMClient({
        provider: profile.provider,
        apiKey: profile.apiKey || apiKey,
        baseURL: profile.baseURL,
        model: profile.model,
        proxy: resolvedProxy,
        bypassRules,
        streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
        useNativeApi: profile.useNativeApi === true
      })
      return { client, profileId: profile.id }
    } else {
      console.warn(`[LLM] 角色 ${character.name} 的独立 LLM Profile ${character.custom_llm_profile_id} 未找到，回退到群组配置`)
    }
  }

  // 使用群组默认配置
  const currentProfile = llmProfiles.find(p =>
    p.provider === group.llm_provider && p.model === group.llm_model
  )
  const streamEnabled = currentProfile?.streamEnabled !== undefined
    ? currentProfile.streamEnabled
    : true
  const useNativeApi = currentProfile?.useNativeApi === true
  const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(
    currentProfile || null,
    group.llm_base_url
  )

  const client = createLLMClient({
    provider: group.llm_provider,
    apiKey: apiKey,
    baseURL: group.llm_base_url,
    model: group.llm_model,
    proxy: resolvedProxy,
    bypassRules,
    streamEnabled,
    useNativeApi
  })

  return { client, profileId: null }
}

/**
 * 创建 LLM 客户端（根据配置自动选择 OpenAI 兼容或原生客户端）
 */
function createLLMClient(config) {
  const { provider, useNativeApi, baseURL, proxy, bypassRules, ...rest } = config

  // 如果是 Ollama 且启用原生 API，使用原生客户端
  if (provider === 'ollama' && useNativeApi) {
    const providerConfig = getProviderConfig('ollama')
    console.log('[LLM] 使用 Ollama 原生 API 客户端')
    return new OllamaNativeClient({
      ...rest,
      baseURL: baseURL || providerConfig.nativeBaseURL || 'http://localhost:11434',
      proxy,
      bypassRules
    })
  }

  // 其他情况使用 OpenAI 兼容客户端
  console.log('[LLM] 使用 OpenAI 兼容 API 客户端')
  return new LLMClient({ provider, useNativeApi, baseURL, proxy, bypassRules, ...rest })
}

export function setupLLMHandlers(dbManager, memoryManager = null, narrativeEngine = null) {
  // 获取所有 LLM 供应商
  ipcMain.handle('llm:getProviders', async () => {
    try {
      return { success: true, data: getAllProviders() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 测试 LLM 连接
  ipcMain.handle('llm:testConnection', async (event, config) => {
    try {
      const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(config, config.baseURL)
      const client = createLLMClient({
        ...config,
        proxy: resolvedProxy,
        bypassRules
      })

      const result = await client.testConnection()
      return result
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 生成 AI 回复（多角色对话）
  ipcMain.handle('llm:generate', async (event, groupId, userContent) => {
    console.log('[LLM] 开始生成回复', { groupId, userContent })

    try {
      const db = dbManager.getGroupDB(groupId)
      console.log('[LLM] 数据库连接成功')

      // 1. 保存用户消息
      const userMsgId = generateUUID()

      // 获取用户角色信息
      const userCharacter = db.prepare(`
        SELECT * FROM characters WHERE group_id = ? AND is_user = 1
      `).get(groupId)

      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content)
        VALUES (?, ?, ?, ?, ?)
      `).run(userMsgId, groupId, userCharacter?.id || null, 'user', userContent)
      console.log('[LLM] 用户消息已保存', { userMsgId })

      // 通知前端：用户消息已保存（包含真实 ID）
      event.sender.send('message:user:saved', {
        tempId: 'user_' + Date.now(),  // 前端可能使用的临时 ID
        id: userMsgId,
        group_id: groupId,
        character_id: userCharacter?.id || null,
        characterName: userCharacter?.name || '用户',
        role: 'user',
        content: userContent,
        timestamp: new Date().toISOString()
      })

      // 2. 获取群组配置
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
      if (!group) {
        console.error('[LLM] 群组不存在', { groupId })
        return { success: false, error: '群组不存在' }
      }
      console.log('[LLM] 群组配置', {
        name: group.name,
        provider: group.llm_provider,
        model: group.llm_model,
        useGlobalKey: group.use_global_api_key
      })

      // 3. 获取启用的角色（排除用户角色）
      const characters = db.prepare(`
        SELECT * FROM characters WHERE group_id = ? AND enabled = 1 AND is_user = 0
      `).all(groupId)

      if (characters.length === 0) {
        console.error('[LLM] 没有启用的角色')
        return { success: false, error: '没有启用的角色' }
      }
      console.log('[LLM] 启用的角色', characters.map(c => c.name))

      // 3.1 获取所有角色（包含用户角色，用于群成员介绍）
      const allCharacters = db.prepare(`
        SELECT * FROM characters WHERE group_id = ? AND enabled = 1
      `).all(groupId)
      console.log('[LLM] 群成员介绍包含角色', allCharacters.map(c => c.name))

      // 4. 获取历史消息（根据 max_history 限制，系统自动加 10 轮）
      const maxMessages = ((group.max_history || 20) + 10) * 2 + 1 // +1 是刚才添加的用户消息

      // 先检查数据库中 assistant 消息的 character_id 情况
      const assistantMessagesCheck = db.prepare(`
        SELECT
          m.id,
          m.character_id,
          c.name as character_name
        FROM messages m
        LEFT JOIN characters c ON m.character_id = c.id
        WHERE m.group_id = ? AND m.role = 'assistant'
        ORDER BY m.timestamp DESC
        LIMIT 5
      `).all(groupId)

      console.log('[LLM] 数据库中最近的 assistant 消息检查:', assistantMessagesCheck.map(m => ({
        id: m.id,
        character_id: m.character_id,
        character_name: m.character_name
      })))

      const history = db.prepare(`
        SELECT
          m.*,
          c.name as character_name,
          c.is_user as character_is_user
        FROM messages m
        LEFT JOIN characters c ON m.character_id = c.id
        WHERE m.group_id = ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `).all(groupId, maxMessages).reverse()
      console.log('[LLM] 历史消息数量', history.length)

      // 5. 获取 API Key（优先使用群组独立 Key）
      const globalLLMConfig = getGlobalLLMConfig()
      const apiKey = group.use_global_api_key
        ? globalLLMConfig.apiKey
        : (group.llm_api_key || globalLLMConfig.apiKey)

      // 检查当前供应商是否需要 API Key
      const providerConfig = getProviderConfig(group.llm_provider)
      const needApiKey = providerConfig?.needApiKey !== false

      if (needApiKey && !apiKey) {
        console.error('[LLM] API Key 未配置')
        return { success: false, error: '请先配置 API Key' }
      }
      console.log('[LLM] API Key 配置检查', { hasKey: !!apiKey, needApiKey, provider: group.llm_provider })

      // 6. 获取 LLM 配置文件列表
      const llmProfiles = getLLMProfiles()

      // 7. 根据回复模式调用 LLM
      const responseMode = group.response_mode || 'sequential'
      const thinkingEnabled = group.thinking_enabled === 1
      const randomOrder = group.random_order === 1
      console.log('[LLM] 回复模式', responseMode, '思考模式', thinkingEnabled, '随机发言', randomOrder)
      const responses = []

      if (responseMode === 'parallel') {
        // 并行模式：同时调用所有角色（每个角色独立创建客户端）
        const promises = characters.map(character => {
          const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)
          // 构建叙事上下文
          const narrativeContext = narrativeEngine
            ? narrativeEngine.preGenerate(db, character.id, groupId, userContent, userCharacter?.id, allCharacters)
            : []
          return generateCharacterResponse(client, character, history, userContent, event, groupId, db, thinkingEnabled, group.background, group.system_prompt, allCharacters, memoryManager, group.auto_memory_extract === 1, narrativeContext)
        })
        const results = await Promise.all(promises)
        responses.push(...results)
      } else {
        // 顺序模式：依次调用每个角色
        // 随机发言模式：打乱角色顺序
        if (randomOrder) {
          for (let i = characters.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [characters[i], characters[j]] = [characters[j], characters[i]]
          }
          console.log('[LLM] 随机发言顺序:', characters.map(c => c.name))
        }
        for (const character of characters) {
          const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)
          // 构建叙事上下文
          const narrativeContext = narrativeEngine
            ? narrativeEngine.preGenerate(db, character.id, groupId, userContent, userCharacter?.id, allCharacters)
            : []
          const response = await generateCharacterResponse(client, character, history, userContent, event, groupId, db, thinkingEnabled, group.background, group.system_prompt, allCharacters, memoryManager, group.auto_memory_extract === 1, narrativeContext)
          responses.push(response)

          // 将上一个角色的回复添加到历史上下文
          if (response.success) {
            history.push({
              role: 'assistant',
              content: response.content,
              character_id: response.characterId,
              character_name: response.characterName,
              character_is_user: 0
            })
            console.log(`[LLM] 添加 ${response.characterName} 的回复到历史上下文，character_id: ${response.characterId}`)
          }
        }
      }

      console.log('[LLM] 所有角色回复生成完成', {
        total: responses.length,
        success: responses.filter(r => r.success).length,
        failed: responses.filter(r => !r.success).length
      })

      // 所有角色回复完成后，生成余波
      let aftermathMessages = []
      if (narrativeEngine) {
        try {
          aftermathMessages = await narrativeEngine.generateAftermath(
            db, groupId, userContent, responses, allCharacters,
            createClientForCharacter, group, llmProfiles, apiKey
          )
          for (const msg of aftermathMessages) {
            event.sender.send('narrative:aftermath', msg)
          }
        } catch (err) {
          console.error('[Narrative] 余波编排失败:', err.message)
        }
      }

      return { success: true, data: responses }
    } catch (error) {
      console.error('[LLM] 生成回复失败', error)
      return { success: false, error: error.message }
    }
  })

  // 生成单角色指令回复
  ipcMain.handle('llm:generateCharacterCommand', async (event, groupId, characterId, instruction) => {
    console.log('[LLM] 开始生成单角色指令回复', { groupId, characterId, instruction })

    try {
      const db = dbManager.getGroupDB(groupId)

      // 1. 保存用户指令消息
      const userMsgId = generateUUID()

      // 获取用户角色信息
      const userCharacter = db.prepare(`
        SELECT * FROM characters WHERE group_id = ? AND is_user = 1
      `).get(groupId)

      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content)
        VALUES (?, ?, ?, ?, ?)
      `).run(userMsgId, groupId, userCharacter?.id || null, 'user', instruction)
      console.log('[LLM] 用户指令消息已保存', { userMsgId })

      // 通知前端：用户消息已保存（包含真实 ID）
      event.sender.send('message:user:saved', {
        tempId: 'user_' + Date.now(),  // 前端可能使用的临时 ID
        id: userMsgId,
        group_id: groupId,
        character_id: userCharacter?.id || null,
        characterName: userCharacter?.name || '用户',
        role: 'user',
        content: instruction,
        timestamp: new Date().toISOString()
      })

      // 2. 获取群组配置
      const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
      if (!group) {
        console.error('[LLM] 群组不存在', { groupId })
        return { success: false, error: '群组不存在' }
      }

      // 3. 获取指定角色
      const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
      if (!character) {
        console.error('[LLM] 角色不存在', { characterId })
        return { success: false, error: '角色不存在' }
      }

      console.log('[LLM] 目标角色', { name: character.name })

      // 4. 获取所有角色（用于成员介绍）
      const allCharacters = db.prepare(`
        SELECT * FROM characters WHERE group_id = ? AND enabled = 1
      `).all(groupId)

      // 5. 获取历史消息（系统自动加 10 轮）
      const maxMessages = ((group.max_history || 20) + 10) * 2 + 1
      const history = db.prepare(`
        SELECT
          m.*,
          c.name as character_name,
          c.is_user as character_is_user
        FROM messages m
        LEFT JOIN characters c ON m.character_id = c.id
        WHERE m.group_id = ?
        ORDER BY m.timestamp DESC
        LIMIT ?
      `).all(groupId, maxMessages).reverse()

      // 6. 获取 API Key
      const globalLLMConfig = getGlobalLLMConfig()
      const apiKey = group.use_global_api_key
        ? globalLLMConfig.apiKey
        : (group.llm_api_key || globalLLMConfig.apiKey)

      // 检查当前供应商是否需要 API Key
      const providerConfig = getProviderConfig(group.llm_provider)
      const needApiKey = providerConfig?.needApiKey !== false

      if (needApiKey && !apiKey) {
        console.error('[LLM] API Key 未配置')
        return { success: false, error: '请先配置 API Key' }
      }

      // 7. 获取 LLM 配置文件列表并创建客户端
      const llmProfiles = getLLMProfiles()
      const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)

      // 8. 生成单角色回复
      const thinkingEnabled = group.thinking_enabled === 1
      const response = await generateCharacterResponse(
        client,
        character,
        history,
        instruction, // 使用指令作为用户内容
        event,
        groupId,
        db,
        thinkingEnabled,
        group.background,
        group.system_prompt,
        allCharacters,
        memoryManager,
        group.auto_memory_extract === 1
      )

      console.log('[LLM] 单角色指令回复生成完成')

      return { success: true, data: [response] }
    } catch (error) {
      console.error('[LLM] 生成单角色指令回复失败', error)
      return { success: false, error: error.message }
    }
  })

  // 生成角色信息（角色抽卡）
  ipcMain.handle('llm:generateCharacter', async (event, hint = '') => {
    console.log('[LLM] 开始生成角色信息', { hint })

    try {
      // 1. 获取 LLM 配置文件列表
      const llmProfiles = getLLMProfiles()

      if (llmProfiles.length === 0) {
        return { success: false, error: '请先在 LLM 配置管理中添加配置' }
      }

      // 2. 使用第一个配置文件
      const profile = llmProfiles[0]
      console.log('[LLM] 使用配置', { profile: profile.name, provider: profile.provider, model: profile.model })

      // 3. 创建 LLM 客户端
      const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(profile, profile.baseURL)
      const client = createLLMClient({
        provider: profile.provider,
        apiKey: profile.apiKey,
        baseURL: profile.baseURL,
        model: profile.model,
        proxy: resolvedProxy,
        bypassRules,
        streamEnabled: false, // 抽卡功能强制禁用流式输出，确保获取完整 JSON
        useNativeApi: profile.useNativeApi === true
      })

      // 4. 构建生成角色的提示词（使用可配置提示词）
      const gachaConfig = getGachaConfig()
      const systemPrompt = gachaConfig.systemPrompt
      const userPrompt = hint
        ? gachaConfig.userPromptTemplate.replace('{hint}', hint)
        : gachaConfig.defaultUserPrompt

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]

      // 5. 调用 LLM（禁用思考模式，启用 JSON 结构化输出）
      const result = await client.chat(messages, {
        temperature: 0.9, // 提高创造性
        maxTokens: 1000,
        thinkingEnabled: false, // 明确禁用思考模式
        responseFormat: { type: 'json_object' } // 结构化输出，强制返回合法 JSON
      })

      console.log('[LLM] LLM 响应', {
        success: result.success,
        hasContent: !!result.content,
        contentLength: result.content?.length,
        error: result.error
      })

      if (!result.success) {
        console.error('[LLM] 生成角色信息失败', result.error)
        return { success: false, error: result.error }
      }

      if (!result.content || result.content.trim().length === 0) {
        console.error('[LLM] LLM 返回了空响应')
        return { success: false, error: 'LLM 返回了空响应，请重试或更换模型' }
      }

      // 6. 解析 JSON 响应
      console.log('[LLM] 原始响应内容（前 200 字符）:', result.content.substring(0, 200))

      const jsonResult = extractJSON(result.content)
      if (!jsonResult.success) {
        console.error('[LLM] 解析 JSON 失败', jsonResult.error)
        console.error('[LLM] 原始响应', result.content)
        return { success: false, error: 'LLM 返回的格式不正确，请重试' }
      }
      const characterData = jsonResult.data

      // 7. 验证数据
      if (!characterData.name || !characterData.systemPrompt) {
        return { success: false, error: '角色信息不完整，请重试' }
      }

      console.log('[LLM] 角色信息生成成功', characterData)

      return { success: true, data: characterData }
    } catch (error) {
      console.error('[LLM] 生成角色信息失败', error)
      return { success: false, error: error.message }
    }
  })

  // 快速建群：根据描述生成群组信息
  ipcMain.handle('llm:generateGroup', async (event, description = '', profileId = '') => {
    console.log('[LLM] 开始生成群组信息', { description, profileId })

    try {
      // 1. 获取 LLM 配置文件列表
      const llmProfiles = getLLMProfiles()

      if (llmProfiles.length === 0) {
        return { success: false, error: '请先在 LLM 配置管理中添加配置' }
      }

      // 2. 使用指定或第一个配置文件
      const profile = profileId
        ? llmProfiles.find(p => p.id === profileId) || llmProfiles[0]
        : llmProfiles[0]
      console.log('[LLM] 使用配置', { profile: profile.name, provider: profile.provider, model: profile.model })

      // 3. 创建 LLM 客户端
      const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(profile, profile.baseURL)
      const client = createLLMClient({
        provider: profile.provider,
        apiKey: profile.apiKey,
        baseURL: profile.baseURL,
        model: profile.model,
        proxy: resolvedProxy,
        bypassRules,
        streamEnabled: false,
        useNativeApi: profile.useNativeApi === true
      })

      // 4. 构建提示词
      const quickGroupConfig = getQuickGroupConfig()
      const systemPrompt = quickGroupConfig.systemPrompt
      const userPrompt = description
        ? quickGroupConfig.userPromptTemplate.replace('{description}', description)
        : quickGroupConfig.defaultUserPrompt

      const messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ]

      // 5. 调用 LLM（启用 JSON 结构化输出）
      const result = await client.chat(messages, {
        temperature: 0.9,
        maxTokens: 3000,
        thinkingEnabled: false,
        responseFormat: { type: 'json_object' } // 结构化输出，强制返回合法 JSON
      })

      if (!result.success) {
        console.error('[LLM] 生成群组信息失败', result.error)
        return { success: false, error: result.error }
      }

      if (!result.content || result.content.trim().length === 0) {
        return { success: false, error: 'LLM 返回了空响应，请重试或更换模型' }
      }

      // 6. 解析 JSON 响应
      console.log('[LLM] 群组信息原始响应（前 200 字符）:', result.content.substring(0, 200))

      const groupJsonResult = extractJSON(result.content)
      if (!groupJsonResult.success) {
        console.error('[LLM] 解析群组 JSON 失败', groupJsonResult.error)
        console.error('[LLM] 原始响应', result.content)
        return { success: false, error: 'LLM 返回的格式不正确，请重试' }
      }
      const groupData = groupJsonResult.data

      // 7. 验证数据
      if (!groupData.name || !Array.isArray(groupData.characters) || groupData.characters.length === 0) {
        return { success: false, error: '群组信息不完整（缺少群名称或角色），请重试' }
      }

      for (const char of groupData.characters) {
        if (!char.name || !char.systemPrompt) {
          return { success: false, error: `角色"${char.name || '未命名'}"信息不完整，请重试` }
        }
      }

      console.log('[LLM] 群组信息生成成功', {
        name: groupData.name,
        characterCount: groupData.characters.length,
        hasBackground: !!groupData.background
      })

      return { success: true, data: groupData }
    } catch (error) {
      console.error('[LLM] 生成群组信息失败', error)
      return { success: false, error: error.message }
    }
  })
}

/**
 * 为单个角色生成回复（支持流式输出）
 */
async function generateCharacterResponse(client, character, history, userContent, event, groupId, db, thinkingEnabled = false, background = null, systemPrompt = null, allCharacters = [], memoryManager = null, autoMemoryExtract = false, narrativeContext = []) {
  try {
    console.log(`[LLM] 开始为角色 ${character.name} 生成回复`)

    // 优先使用角色的思考模式设置，如果没有则使用群组的设置
    const characterThinkingEnabled = character.thinking_enabled === 1 || thinkingEnabled

    // 查询角色全局记忆
    let memories = []
    if (memoryManager) {
      try {
        memories = memoryManager.getMemoriesByCharacterName(character.name)
      } catch (err) {
        console.error(`[LLM] 查询角色 ${character.name} 的全局记忆失败:`, err)
      }
    }

    // 构建消息上下文
    const messages = buildContextMessages(character, history, userContent, background, systemPrompt, allCharacters, memories, narrativeContext)
    console.log(`[LLM] ${character.name} - 消息上下文构建完成`, {
      messageCount: messages.length,
      hasBackground: !!background,
      hasSystemPrompt: !!systemPrompt,
      thinkingEnabled: characterThinkingEnabled
    })

    // 创建临时消息 ID
    const tempMessageId = 'temp_' + Date.now() + '_' + character.id

    // 通知渲染进程：开始生成
    event.sender.send('message:stream:start', {
      tempId: tempMessageId,
      groupId: groupId,
      characterId: character.id,
      characterName: character.name,
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString()
    })

    // 调用 LLM（使用流式输出）
    const result = await client.chat(messages, {
      thinkingEnabled: characterThinkingEnabled,
      onChunk: (chunk) => {
        // chunk 格式: { type: 'reasoning' | 'content', content: string }
        if (chunk.type === 'reasoning') {
          // 推送思考过程片段
          event.sender.send('message:stream:chunk', {
            tempId: tempMessageId,
            type: 'reasoning',
            content: chunk.content
          })
        } else if (chunk.type === 'content') {
          // 推送回答内容片段
          event.sender.send('message:stream:chunk', {
            tempId: tempMessageId,
            type: 'content',
            content: chunk.content
          })
        }
      }
    })

    if (result.success) {
      console.log(`[LLM] ${character.name} - 回复生成成功`, {
        contentLength: result.content?.length,
        hasReasoningContent: !!result.reasoningContent,
        usage: result.usage
      })

      // 保存完整回复到数据库（包含思考内容、token 用量和模型信息）
      const assistantMsgId = generateUUID()
      const promptTokens = result.usage?.prompt_tokens ?? null
      const completionTokens = result.usage?.completion_tokens ?? null
      const responseModel = result.model || null
      console.log(`[LLM] ${character.name} - 保存消息到数据库`, {
        messageId: assistantMsgId,
        characterId: character.id,
        characterName: character.name,
        promptTokens,
        completionTokens,
        model: responseModel
      })
      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content, reasoning_content, prompt_tokens, completion_tokens, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(assistantMsgId, groupId, character.id, 'assistant', result.content, result.reasoningContent || null, promptTokens, completionTokens, responseModel)

      // 验证保存是否成功
      const savedMsg = db.prepare('SELECT * FROM messages WHERE id = ?').get(assistantMsgId)
      console.log(`[LLM] ${character.name} - 验证保存的消息`, {
        id: savedMsg?.id,
        character_id: savedMsg?.character_id,
        role: savedMsg?.role
      })

      // 通知渲染进程：流式结束，发送完整消息
      event.sender.send('message:stream:end', {
        tempId: tempMessageId,
        finalId: assistantMsgId,
        groupId: groupId,
        characterId: character.id,
        characterName: character.name,
        role: 'assistant',
        content: result.content,
        reasoningContent: result.reasoningContent || null,
        promptTokens: promptTokens,
        completionTokens: completionTokens,
        model: responseModel,
        timestamp: new Date().toISOString()
      })

      // 自动提取记忆（异步，不阻塞主流程）
      if (memoryManager && autoMemoryExtract) {
        extractMemoriesAsync(client, character, userContent, result.content, groupId, memoryManager)
          .catch(err => console.error(`[LLM] 自动提取角色 ${character.name} 记忆失败:`, err))
      }

      return {
        success: true,
        characterId: character.id,
        characterName: character.name,
        content: result.content,
        reasoningContent: result.reasoningContent || null,
        usage: result.usage || null
      }
    } else {
      console.error(`[LLM] ${character.name} - 回复生成失败`, result.error)

      // 通知渲染进程：生成失败
      event.sender.send('message:stream:error', {
        tempId: tempMessageId,
        error: result.error
      })

      return {
        success: false,
        characterId: character.id,
        characterName: character.name,
        error: result.error
      }
    }
  } catch (error) {
    console.error(`[LLM] ${character.name} - 生成过程异常`, error)
    return {
      success: false,
      characterId: character.id,
      characterName: character.name,
      error: error.message
    }
  }
}

/**
 * 异步从对话中提取角色记忆
 */
async function extractMemoriesAsync(client, character, userContent, assistantContent, groupId, memoryManager) {
  try {
    // 获取已有的自动记忆（用于去重）
    const existingMemories = memoryManager.getAutoMemoryContents(character.name)
    // 构建提取提示词
    const existingMemoryText = existingMemories.length > 0
      ? `\n\n已有的记忆（不需要重复提取）：` + existingMemories.map(m => `- ${m}`).join('\n')
      : ''

    const extractMessages = [
      {
        role: 'system',
        content: `你是一个记忆提取助手。从以下对话中提取角色"${character.name}"的关键信息，包括：
- 喜好/厌恶
- 重要经历/事件
- 人际关系
- 性格特征
只提取明确表达的事实，不要推测。如果没有新信息，返回空数组。
返回 JSON 格式：{"memories": ["记忆1", "记忆2"]}${existingMemoryText}`
      },
      {
        role: 'user',
        content: `用户: ${userContent}\n\n${character.name}: ${assistantContent}`
      }
    ]

    const extractResult = await client.chat(extractMessages, {
      thinkingEnabled: false,
      maxTokens: 500,
      responseFormat: { type: 'json_object' } // 结构化输出，强制返回合法 JSON
    })

    if (!extractResult.success || !extractResult.content) return

    // 解析 JSON
    const memJsonResult = extractJSON(extractResult.content)
    if (!memJsonResult.success) return

    const parsed = memJsonResult.data
    const memories = parsed.memories || []

    if (!Array.isArray(memories) || memories.length === 0) return

    // 写入记忆
    for (const memory of memories) {
      if (typeof memory === 'string' && memory.trim()) {
        memoryManager.addMemory({
          characterName: character.name,
          content: memory.trim(),
          source: 'auto',
          groupId: groupId
        })
      }
    }
    console.log(`[LLM] 自动提取角色 ${character.name} 的记忆 ${memories.length} 条`)
  } catch (err) {
    console.error(`[LLM] 自动提取记忆异常:`, err.message)
  }
}

/**
 * 构建对话上下文消息
 */
function buildContextMessages(character, history, userContent, background = null, systemPrompt = null, allCharacters = [], memories = [], narrativeContext = []) {
  const messages = []

  // 1. 添加系统提示词（最高优先级，如果存在）
  if (systemPrompt && systemPrompt.trim()) {
    messages.push({
      role: 'system',
      content: systemPrompt.trim()
    })
  }

  // 2. 添加群背景设定
  if (background && background.trim()) {
    messages.push({
      role: 'system',
      content: `【群背景设定】\n${background.trim()}`
    })
  }

  // 3. 添加群成员介绍
  if (allCharacters.length > 0) {
    const membersIntro = allCharacters.map(char => {
      return `- ${char.name}: ${char.system_prompt.split('\n')[0]}`
    }).join('\n')

    messages.push({
      role: 'system',
      content: `【群成员介绍】\n${membersIntro}`
    })
  }

  // 3.5 注入叙事上下文（情绪、关系、事件）
  if (narrativeContext.length > 0) {
    messages.push(...narrativeContext)
  }

  // 4.5 注入角色全局记忆（如果有）
  if (memories.length > 0) {
    const memoryLines = memories.map(m => `- ${m.content}`).join('\n')
    messages.push({
      role: 'system',
      content: `【角色记忆】\n以下是"${character.name}"在过去对话中积累的记忆：\n${memoryLines}`
    })
  }

  // 5. 添加角色系统提示词（人设）
  messages.push({
    role: 'system',
    content: character.system_prompt
  })

  // 6. 添加历史消息（格式化角色名称，并过滤定向指令和角色指令）
  console.log('[LLM] 历史消息原始数据（前3条）:', history.slice(0, 3).map(msg => ({
    role: msg.role,
    content: msg.content?.substring(0, 50),
    character_id: msg.character_id,
    character_name: msg.character_name,
    character_is_user: msg.character_is_user
  })))

  const roleMessages = history
    .filter(msg => {
      // 过滤掉系统消息
      if (msg.role === 'system') return false

      // 检查消息内容是否存在
      if (!msg.content) return false

      const content = msg.content.trim()

      // 过滤掉【角色指令】消息（这些是一次性指令，不应该出现在历史中）
      if (content.includes('【角色指令】')) {
        console.log(`[LLM] 过滤掉角色指令消息:`, content.substring(0, 100))
        return false
      }

      // 过滤掉给其他角色的定向用户指令
      // 判断标准：user 消息中包含 @角色名 格式，且不是给当前角色的
      if (msg.role === 'user') {
        // 检测 @角色名 格式
        const atMatch = content.match(/^@([^\s\u3000]+)[:\s]/)
        if (atMatch) {
          const targetCharacterName = atMatch[1]

          // 如果这条指令不是给当前角色的，过滤掉
          if (targetCharacterName !== character.name) {
            console.log(`[LLM] 过滤掉给角色"${targetCharacterName}"的定向指令:`, content)
            return false
          }
        }
      }

      return true
    })
    .map(msg => {
      // 构建消息内容
      let content = msg.content

      // 如果是 assistant 消息且有角色名称，添加角色名前缀
      if (msg.role === 'assistant' && msg.character_name) {
        content = `${msg.character_name}：${content}`
      }
      // 如果是 user 消息且有角色名称（用户角色），也添加角色名前缀
      else if (msg.role === 'user' && msg.character_name) {
        content = `${msg.character_name}：${content}`
      }

      const result = {
        role: msg.role,
        content: content
      }

      // 调试：输出 assistant 消息的格式化结果
      if (msg.role === 'assistant') {
        console.log('[LLM] assistant 消息格式化:', {
          hasCharacterName: !!msg.character_name,
          characterName: msg.character_name,
          originalContent: msg.content?.substring(0, 50),
          formattedContent: content.substring(0, 80)
        })
      }

      return result
    })

  messages.push(...roleMessages)

  // 7. 添加强制性指令：只扮演当前角色（放在最后，提高优先级）
  messages.push({
    role: 'system',
    content: `【重要指令】\n你只能扮演"${character.name}"这个角色，只能输出这个角色的台词和动作。\n严禁输出其他角色的对话、台词或描述。\n即使历史消息中包含其他角色的内容，你也不能模仿或重复它们。\n请始终保持角色一致性，只回复"${character.name}"应该说的话。注意用户会提及其它角色，你只要扮演"${character.name}"这个角色回答就好了。`
  })

  // 8. 添加当前用户消息
  const lastMessage = roleMessages[roleMessages.length - 1]
  if (!lastMessage || lastMessage.role !== 'user') {
    // 只有最后一条不是用户消息时，才添加
    messages.push({
      role: 'user',
      content: userContent
    })
  }

  return messages
}
