/**
 * LLM 单角色回复处理
 * 负责单角色的流式回复生成、数据库保存和用户消息保存
 */
import { generateUUID } from '../../utils/uuid.js'
import { createLogger } from '../../utils/logger.js'

const log = createLogger('LLM')
import { buildContextMessages, fetchCharacterMemories, extractMemoriesAsync } from './llm-context-builder.js'

/**
 * 保存用户消息到数据库并通知前端
 * @param {object} db - 数据库连接
 * @param {string} groupId - 群组 ID
 * @param {string} content - 用户消息内容
 * @param {object|null} userCharacter - 用户角色对象
 * @param {object} event - IPC 事件对象
 * @param {string} messageType - 消息类型（normal/event）
 * @param {string|null} eventImpact - 事件影响
 * @returns {string} 消息 ID
 */
export function saveUserMessage(db, groupId, content, userCharacter, event, messageType = 'normal', eventImpact = null) {
  const userMsgId = generateUUID()

  db.prepare(`
    INSERT INTO messages (id, group_id, character_id, role, content, message_type, event_impact)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(userMsgId, groupId, userCharacter?.id || null, 'user', content, messageType, eventImpact)

  // 通知前端：用户消息已保存（包含真实 ID）
  event.sender.send('message:user:saved', {
    tempId: 'user_' + Date.now(),
    id: userMsgId,
    group_id: groupId,
    character_id: userCharacter?.id || null,
    characterName: userCharacter?.name || '用户',
    role: 'user',
    content: content,
    message_type: messageType,
    event_impact: eventImpact,
    timestamp: new Date().toISOString()
  })

  return userMsgId
}

/**
 * 为单个角色生成回复（支持流式输出）
 * @param {object} client - LLM 客户端
 * @param {object} character - 角色对象
 * @param {Array} history - 历史消息列表
 * @param {string} userContent - 用户消息内容
 * @param {object} event - IPC 事件对象
 * @param {string} groupId - 群组 ID
 * @param {object} db - 数据库连接
 * @param {object} options - 选项
 * @param {boolean} [options.thinkingEnabled=false] - 是否启用思考模式
 * @param {string|null} [options.background=null] - 群背景设定
 * @param {string|null} [options.systemPrompt=null] - 群系统提示词
 * @param {Array} [options.allCharacters=[]] - 所有启用角色
 * @param {object|null} [options.memoryManager=null] - 记忆管理器
 * @param {boolean} [options.autoMemoryExtract=false] - 是否自动提取记忆
 * @param {Array} [options.narrativeContext=[]] - 叙事上下文
 * @returns {Promise<object>} 生成结果
 */
export async function generateCharacterResponse(client, character, history, userContent, event, groupId, db, options = {}) {
  const {
    thinkingEnabled = false,
    background = null,
    systemPrompt = null,
    allCharacters = [],
    memoryManager = null,
    autoMemoryExtract = false,
    narrativeContext = []
  } = options

  try {
    // 优先使用角色的思考模式设置，如果没有则使用群组的设置
    const characterThinkingEnabled = character.thinking_enabled === 1 || thinkingEnabled

    // 查询角色全局记忆
    const memories = fetchCharacterMemories(memoryManager, character.name)

    // 构建消息上下文
    const messages = buildContextMessages(character, history, userContent, background, systemPrompt, allCharacters, memories, narrativeContext)

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
      // 保存完整回复到数据库（包含思考内容、token 用量和模型信息）
      const assistantMsgId = generateUUID()
      const promptTokens = result.usage?.prompt_tokens ?? null
      const completionTokens = result.usage?.completion_tokens ?? null
      const responseModel = result.model || null
      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content, reasoning_content, prompt_tokens, completion_tokens, model)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(assistantMsgId, groupId, character.id, 'assistant', result.content, result.reasoningContent || null, promptTokens, completionTokens, responseModel)

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
          .catch(err => log.error(`自动提取角色 ${character.name} 记忆失败:`, err))
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
      log.error(`${character.name} - 回复生成失败`, result.error)

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
    log.error(`${character.name} - 生成过程异常`, error)
    return {
      success: false,
      characterId: character.id,
      characterName: character.name,
      error: error.message
    }
  }
}
