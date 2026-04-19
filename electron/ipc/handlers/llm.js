/**
 * LLM IPC 处理器
 * 负责 IPC 注册 + 高层对话编排
 */
import { ipcMain } from 'electron'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('LLM')
import { getAllProviders, getProviderConfig } from '../../llm/providers/index.js'
import { getGlobalLLMConfig, getGachaConfig, getQuickGroupConfig } from '../../config/manager.js'
import { getLLMProfiles } from '../../config/llm-profiles.js'
import { extractJSON } from '../../utils/json-extractor.js'
import { createHandler } from '../handler-wrapper.js'
import { resolveClientProxy, createLLMClient, createClientForCharacter, resolveApiKey } from './llm-client-factory.js'
import { saveUserMessage, generateCharacterResponse } from './llm-response-handler.js'

/**
 * 通用 LLM JSON 调用：获取 Profile → 创建 Client → 调用 LLM（JSON 模式）→ 解析 JSON
 * 用于角色抽卡、快速建群等需要 LLM 返回 JSON 的场景
 * @param {object} options
 * @param {string} [options.profileId] - 指定 Profile ID，不指定则使用第一个
 * @param {Array} options.messages - LLM 消息列表
 * @param {number} [options.temperature=0.9] - 温度
 * @param {number} [options.maxTokens=1000] - 最大 token
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
async function callLLMForJSON({ profileId, messages, temperature = 0.9, maxTokens = 1000 }) {
  const llmProfiles = getLLMProfiles()
  if (llmProfiles.length === 0) {
    return { success: false, error: '请先在 LLM 配置管理中添加配置' }
  }

  const profile = profileId
    ? llmProfiles.find(p => p.id === profileId) || llmProfiles[0]
    : llmProfiles[0]

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

  const result = await client.chat(messages, {
    temperature,
    maxTokens,
    thinkingEnabled: false,
    responseFormat: { type: 'json_object' }
  })

  if (!result.success) {
    return { success: false, error: result.error }
  }

  if (!result.content || result.content.trim().length === 0) {
    return { success: false, error: 'LLM 返回了空响应，请重试或更换模型' }
  }

  const jsonResult = extractJSON(result.content)
  if (!jsonResult.success) {
    log.error('JSON 解析失败:', jsonResult.error)
    return { success: false, error: 'LLM 返回的格式不正确，请重试' }
  }

  return { success: true, data: jsonResult.data }
}

/**
 * 准备对话生成上下文（提取 llm:generate 和 llm:generateCharacterCommand 的公共逻辑）
 * @param {object} dbManager - 数据库管理器
 * @param {string} groupId - 群组 ID
 * @returns {Promise<{ db, group, userCharacter, allCharacters, characters, history, apiKey, llmProfiles }>}
 */
function prepareGenerationContext(dbManager, groupId) {
  const db = dbManager.getGroupDB(groupId)
  const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
  if (!group) {
    throw new Error('群组不存在')
  }

  const userCharacter = db.prepare(`
    SELECT * FROM characters WHERE group_id = ? AND is_user = 1
  `).get(groupId)

  const allCharacters = db.prepare(`
    SELECT * FROM characters WHERE group_id = ? AND enabled = 1
  `).all(groupId)

  const characters = allCharacters.filter(c => !c.is_user)

  // 获取历史消息（系统自动加 10 轮）
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

  const globalLLMConfig = getGlobalLLMConfig()
  const apiKey = resolveApiKey(group, globalLLMConfig)

  // 检查当前供应商是否需要 API Key
  const providerConfig = getProviderConfig(group.llm_provider)
  const needApiKey = providerConfig?.needApiKey !== false
  if (needApiKey && !apiKey) {
    throw new Error('请先配置 API Key')
  }

  const llmProfiles = getLLMProfiles()

  return { db, group, userCharacter, allCharacters, characters, history, apiKey, llmProfiles }
}

export function setupLLMHandlers(dbManager, memoryManager = null, narrativeEngine = null) {
  // 获取所有 LLM 供应商
  ipcMain.handle('llm:getProviders', createHandler(async () => {
    return { success: true, data: getAllProviders() }
  }))

  // 测试 LLM 连接
  ipcMain.handle('llm:testConnection', createHandler(async (event, config) => {
    const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(config, config.baseURL)
    const client = createLLMClient({
      ...config,
      proxy: resolvedProxy,
      bypassRules
    })

    const result = await client.testConnection()
    return result
  }, 'LLM:testConnection'))

  // 生成 AI 回复（多角色对话）
  ipcMain.handle('llm:generate', createHandler(async (event, groupId, userContent, options = {}) => {
    const messageType = options.messageType || 'normal'
    const eventImpact = options.eventImpact || null

    // 准备上下文（含群组验证和 API Key 检查）
    const ctx = prepareGenerationContext(dbManager, groupId)
    const { db, group, userCharacter, allCharacters, characters, history, apiKey, llmProfiles } = ctx

    if (characters.length === 0) {
      return { success: false, error: '没有启用的角色' }
    }

    // 保存用户消息
    saveUserMessage(db, groupId, userContent, userCharacter, event, messageType, eventImpact)

    // 根据回复模式调用 LLM
    const responseMode = group.response_mode || 'sequential'
    const thinkingEnabled = group.thinking_enabled === 1
    const randomOrder = group.random_order === 1
    const responses = []

    // 叙事引擎共享的 LLM 客户端上下文（避免重复传递 4 个参数）
    const narrativeClientCtx = { createClientForCharacter, group, llmProfiles, apiKey }

    if (responseMode === 'parallel') {
      // 并行模式：同时调用所有角色
      const promises = characters.map(character => {
        const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)
        const narrativeEnabled = group.narrative_enabled === 1
        const narrativeContext = (narrativeEngine && narrativeEnabled)
          ? narrativeEngine.preGenerate(db, character.id, groupId, userContent, userCharacter?.id, allCharacters)
          : []
        return generateCharacterResponse(client, character, history, userContent, event, groupId, db, {
          thinkingEnabled, background: group.background, systemPrompt: group.system_prompt,
          allCharacters, memoryManager, autoMemoryExtract: group.auto_memory_extract === 1, narrativeContext
        })
      })
      const results = await Promise.all(promises)
      responses.push(...results)

      // 叙事后处理：好感度更新 + LLM 情绪推断
      if (narrativeEngine && group.narrative_enabled === 1) {
        for (const resp of responses) {
          if (!resp.success) continue
          try {
            await narrativeEngine.postCharacterResponse(
              db, resp.characterId, groupId, userContent, resp.content,
              allCharacters, narrativeClientCtx
            )
          } catch (err) {
            log.error(`postCharacterResponse 失败 (${resp.characterName}):`, err.message)          }
        }
      }
    } else {
      // 顺序模式：依次调用每个角色
      // 随机发言模式：打乱角色顺序（操作副本，不修改原数组）
      const orderedCharacters = randomOrder ? [...characters] : characters
      if (randomOrder) {
        for (let i = orderedCharacters.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [orderedCharacters[i], orderedCharacters[j]] = [orderedCharacters[j], orderedCharacters[i]]
        }
      }

      for (const character of orderedCharacters) {
        const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)
        const narrativeContext = (narrativeEngine && group.narrative_enabled === 1)
          ? narrativeEngine.preGenerate(db, character.id, groupId, userContent, userCharacter?.id, allCharacters)
          : []
        const response = await generateCharacterResponse(client, character, history, userContent, event, groupId, db, {
          thinkingEnabled, background: group.background, systemPrompt: group.system_prompt,
          allCharacters, memoryManager, autoMemoryExtract: group.auto_memory_extract === 1, narrativeContext
        })
        responses.push(response)

        // 叙事后处理：好感度更新 + LLM 情绪推断
        if (narrativeEngine && group.narrative_enabled === 1 && response.success) {
          try {
            await narrativeEngine.postCharacterResponse(
              db, character.id, groupId, userContent, response.content,
              allCharacters, narrativeClientCtx
            )
          } catch (err) {
            log.error(`postCharacterResponse 失败 (${character.name}):`, err.message)
          }
        }

        // 将上一个角色的回复添加到历史上下文
        if (response.success) {
          history.push({
            role: 'assistant',
            content: response.content,
            character_id: response.characterId,
            character_name: response.characterName,
            character_is_user: 0
          })
        }
      }
    }

    // 所有角色回复完成后，生成余波
    if (narrativeEngine) {
      try {
        const aftermathMessages = await narrativeEngine.generateAftermath(
          db, groupId, userContent, responses, allCharacters, narrativeClientCtx
        )
        for (const msg of aftermathMessages) {
          event.sender.send('narrative:aftermath', msg)
        }
      } catch (err) {
        log.error('余波编排失败:', err.message)
      }
    }

    return { success: true, data: responses }
  }, 'LLM:generate'))

  // 生成单角色指令回复
  ipcMain.handle('llm:generateCharacterCommand', createHandler(async (event, groupId, characterId, instruction) => {
    // 准备上下文
    const ctx = prepareGenerationContext(dbManager, groupId)
    const { db, group, userCharacter, allCharacters, history, apiKey, llmProfiles } = ctx

    // 保存用户指令消息
    saveUserMessage(db, groupId, instruction, userCharacter, event)

    // 获取指定角色
    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(characterId)
    if (!character) {
      return { success: false, error: '角色不存在' }
    }

    // 创建客户端并生成回复
    const { client } = createClientForCharacter(character, group, llmProfiles, apiKey)
    const thinkingEnabled = group.thinking_enabled === 1
    const response = await generateCharacterResponse(
      client, character, history, instruction, event, groupId, db, {
        thinkingEnabled, background: group.background, systemPrompt: group.system_prompt,
        allCharacters, memoryManager, autoMemoryExtract: group.auto_memory_extract === 1
      }
    )

    return { success: true, data: [response] }
  }, 'LLM:generateCharacterCommand'))

  // 生成角色信息（角色抽卡）
  ipcMain.handle('llm:generateCharacter', createHandler(async (event, hint = '') => {
    const gachaConfig = getGachaConfig()
    const systemPrompt = gachaConfig.systemPrompt
    const userPrompt = hint
      ? gachaConfig.userPromptTemplate.replace('{hint}', hint)
      : gachaConfig.defaultUserPrompt

    const jsonResult = await callLLMForJSON({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokens: 1000
    })

    if (!jsonResult.success) {
      return { success: false, error: jsonResult.error }
    }

    const characterData = jsonResult.data

    // 验证数据
    if (!characterData.name || !characterData.systemPrompt) {
      return { success: false, error: '角色信息不完整，请重试' }
    }

    return { success: true, data: characterData }
  }, 'LLM:generateCharacter'))

  // 快速建群：根据描述生成群组信息
  ipcMain.handle('llm:generateGroup', createHandler(async (event, description = '', profileId = '') => {
    const quickGroupConfig = getQuickGroupConfig()
    const systemPrompt = quickGroupConfig.systemPrompt
    const userPrompt = description
      ? quickGroupConfig.userPromptTemplate.replace('{description}', description)
      : quickGroupConfig.defaultUserPrompt

    const jsonResult = await callLLMForJSON({
      profileId: profileId || undefined,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokens: 3000
    })

    if (!jsonResult.success) {
      return { success: false, error: jsonResult.error }
    }

    const groupData = jsonResult.data

    // 验证数据
    if (!groupData.name || !Array.isArray(groupData.characters) || groupData.characters.length === 0) {
      return { success: false, error: '群组信息不完整（缺少群名称或角色），请重试' }
    }

    for (const char of groupData.characters) {
      if (!char.name || !char.systemPrompt) {
        return { success: false, error: `角色"${char.name || '未命名'}"信息不完整，请重试` }
      }
    }

    return { success: true, data: groupData }
  }, 'LLM:generateGroup'))
}
