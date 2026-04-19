/**
 * LLM 对话上下文构建 + 记忆提取
 * 负责将历史消息、角色设定、叙事上下文拼装为 LLM 可用的消息列表
 */
import { extractJSON } from '../../utils/json-extractor.js'

/**
 * 查询角色全局记忆
 * @param {object|null} memoryManager - 记忆管理器
 * @param {string} characterName - 角色名称
 * @returns {Array} 记忆列表
 */
export function fetchCharacterMemories(memoryManager, characterName) {
  if (!memoryManager) return []
  try {
    return memoryManager.getMemoriesByCharacterName(characterName)
  } catch (err) {
    console.error(`[LLM] 查询角色 ${characterName} 的全局记忆失败:`, err)
    return []
  }
}

/**
 * 过滤和格式化历史消息
 * 规则：过滤系统消息、空内容、角色指令、其他角色的定向指令
 * @param {Array} history - 原始历史消息列表
 * @param {object} character - 当前角色（用于定向指令过滤）
 * @returns {Array} 过滤后的 { role, content } 消息列表
 */
export function filterHistoryMessages(history, character) {
  return history
    .filter(msg => {
      if (msg.role === 'system') return false
      if (!msg.content) return false

      const content = msg.content.trim()

      // 过滤掉【角色指令】消息（一次性指令，不应出现在历史中）
      if (content.includes('【角色指令】')) return false

      // 过滤掉给其他角色的定向用户指令
      if (msg.role === 'user') {
        const atMatch = content.match(/^@([^\s\u3000]+)[:\s]/)
        if (atMatch && atMatch[1] !== character.name) return false
      }

      return true
    })
    .map(msg => {
      let content = msg.content
      if (msg.character_name) {
        content = `${msg.character_name}：${content}`
      }
      return { role: msg.role, content }
    })
}

/**
 * 构建对话上下文消息
 * 按 9 步优先级拼装：系统提示词 → 群背景 → 群成员介绍 → 叙事上下文 → 角色记忆 → 角色人设 → 历史消息 → 强制指令 → 用户消息
 * @param {object} character - 当前角色
 * @param {Array} history - 历史消息列表
 * @param {string} userContent - 用户消息内容
 * @param {string|null} background - 群背景设定
 * @param {string|null} systemPrompt - 群系统提示词
 * @param {Array} allCharacters - 所有启用角色
 * @param {Array} memories - 角色全局记忆
 * @param {Array} narrativeContext - 叙事上下文消息
 * @returns {Array} LLM 消息列表
 */
export function buildContextMessages(character, history, userContent, background = null, systemPrompt = null, allCharacters = [], memories = [], narrativeContext = []) {
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
      const firstLine = char.system_prompt.split('\n').find(l => l.trim()) || char.name
      const summary = firstLine.length > 80 ? firstLine.slice(0, 80) + '...' : firstLine
      return `- ${char.name}: ${summary}`
    }).join('\n')

    messages.push({
      role: 'system',
      content: `【群成员介绍】\n${membersIntro}`
    })
  }

  // 4. 注入叙事上下文（情绪、关系、事件）
  if (narrativeContext.length > 0) {
    messages.push(...narrativeContext)
  }

  // 5. 注入角色全局记忆（如果有）
  if (memories.length > 0) {
    const memoryLines = memories.map(m => `- ${m.content}`).join('\n')
    messages.push({
      role: 'system',
      content: `【角色记忆】\n以下是"${character.name}"在过去对话中积累的记忆：\n${memoryLines}`
    })
  }

  // 6. 添加角色系统提示词（人设）
  messages.push({
    role: 'system',
    content: character.system_prompt
  })

  // 7. 添加历史消息（过滤 + 格式化）
  const roleMessages = filterHistoryMessages(history, character)
  messages.push(...roleMessages)

  // 8. 添加强制性指令：只扮演当前角色（放在最后，提高优先级）
  messages.push({
    role: 'system',
    content: `【重要指令】\n你只能扮演"${character.name}"这个角色，只能输出这个角色的台词和动作。\n严禁输出其他角色的对话、台词或描述。\n即使历史消息中包含其他角色的内容，你也不能模仿或重复它们。\n请始终保持角色一致性，只回复"${character.name}"应该说的话。注意用户会提及其它角色，你只要扮演"${character.name}"这个角色回答就好了。`
  })

  // 9. 添加当前用户消息
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

/**
 * 异步从对话中提取角色记忆
 * @param {object} client - LLM 客户端
 * @param {object} character - 角色对象
 * @param {string} userContent - 用户消息内容
 * @param {string} assistantContent - AI 回复内容
 * @param {string} groupId - 群组 ID
 * @param {object} memoryManager - 记忆管理器
 */
export async function extractMemoriesAsync(client, character, userContent, assistantContent, groupId, memoryManager) {
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
