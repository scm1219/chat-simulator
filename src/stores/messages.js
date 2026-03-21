import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useGroupsStore } from './groups.js'
import { useCharactersStore } from './characters.js'

export const useMessagesStore = defineStore('messages', () => {
  // 状态
  const messages = ref([])
  const loading = ref(false)
  const sending = ref(false)
  const streamingMessages = ref(new Map()) // 存储流式消息的临时 ID 到内容的映射
  let messageListener = null
  let streamStartListener = null
  let streamChunkListener = null
  let streamEndListener = null
  let streamErrorListener = null

  // 方法
  async function loadMessages(groupId) {
    if (!groupId) {
      messages.value = []
      return
    }

    loading.value = true
    try {
      const result = await window.electronAPI.message.getByGroupId(groupId)
      if (result.success) {
        // 历史消息直接显示，不需要打字机效果
        messages.value = result.data
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(content) {
    const groupsStore = useGroupsStore()
    const charactersStore = useCharactersStore()
    const groupId = groupsStore.currentGroupId

    if (!groupId) {
      console.error('[Messages] No group selected')
      throw new Error('No group selected')
    }

    console.log('[Messages] 发送消息', { groupId, content })
    sending.value = true

    try {
      // 找到用户角色
      const userCharacter = charactersStore.characters.find(c => c.is_user === 1)
      const userCharacterId = userCharacter?.id || null
      const userCharacterName = userCharacter?.name || '用户'

      // 调用 LLM 生成回复（流式输出）
      // 注意：用户消息会由主进程通过 message:user:saved 事件发送回来
      const result = await window.electronAPI.llm.generate(groupId, content)
      console.log('[Messages] LLM 返回结果', result)

      if (!result.success) {
        console.error('[Messages] LLM 调用失败', result.error)
        throw new Error(result.error)
      }

      return result.data
    } catch (error) {
      console.error('[Messages] 发送消息异常', error)
      throw error
    } finally {
      sending.value = false
    }
  }

  async function sendMessageToCharacter(characterId, instruction) {
    const groupsStore = useGroupsStore()
    const charactersStore = useCharactersStore()
    const groupId = groupsStore.currentGroupId

    if (!groupId) {
      console.error('[Messages] No group selected')
      throw new Error('No group selected')
    }

    console.log('[Messages] 发送角色指令', { groupId, characterId, instruction })
    sending.value = true

    try {
      // 找到用户角色
      const userCharacter = charactersStore.characters.find(c => c.is_user === 1)
      const userCharacterId = userCharacter?.id || null
      const userCharacterName = userCharacter?.name || '用户'

      // 调用 LLM 生成回复（单角色指令）
      // 注意：用户消息会由主进程通过 message:user:saved 事件发送回来
      const result = await window.electronAPI.llm.generateCharacterCommand(groupId, characterId, instruction)
      console.log('[Messages] LLM 返回结果', result)

      if (!result.success) {
        console.error('[Messages] LLM 调用失败', result.error)
        throw new Error(result.error)
      }

      return result.data
    } catch (error) {
      console.error('[Messages] 发送角色指令异常', error)
      throw error
    } finally {
      sending.value = false
    }
  }

  function appendMessage(message) {
    messages.value.push(message)
  }

  function setupMessageListener(callback) {
    // 安全检查：确保 electronAPI 存在
    if (!window.electronAPI?.message) {
      console.warn('[Messages] electronAPI.message not available')
      return
    }

    if (messageListener) {
      window.electronAPI.message.onNewMessage(() => {})()
    }
    messageListener = window.electronAPI.message.onNewMessage(callback)
  }

  // 设置流式消息监听器
  function setupStreamListeners() {
    if (!window.electronAPI?.message) {
      console.warn('[Messages] electronAPI.message not available')
      return
    }

    // 监听用户消息保存事件（添加用户消息到前端）
    const userMessageSavedListener = window.electronAPI.message.onUserMessageSaved((data) => {
      console.log('[Messages] 用户消息已保存', data)
      // 检查是否已存在相同的消息（避免重复）
      const exists = messages.value.some(msg =>
        msg.id === data.id ||
        (msg.role === 'user' && msg.content === data.content && msg.timestamp === data.timestamp)
      )
      if (!exists) {
        messages.value.push(data)
        console.log('[Messages] 用户消息已添加到界面')
      }
    })

    // 监听流式开始
    streamStartListener = window.electronAPI.message.onStreamStart((data) => {
      console.log('[Messages] 流式消息开始', data)
      // 添加临时消息
      messages.value.push({
        ...data,
        isStreaming: true,
        streamContent: '', // 存储流式内容
        streamReasoningContent: '' // 存储流式思考内容
      })
    })

    // 监听流式内容片段
    streamChunkListener = window.electronAPI.message.onStreamChunk((data) => {
      console.log('[Messages] 收到流式内容片段', data.tempId, data.type, data.content?.length)
      // 更新临时消息的流式内容
      const message = messages.value.find(msg => msg.id === data.tempId || msg.tempId === data.tempId)
      if (message) {
        if (data.type === 'reasoning') {
          // 思考内容片段
          message.streamReasoningContent = (message.streamReasoningContent || '') + data.content
        } else if (data.type === 'content') {
          // 回答内容片段
          message.streamContent = (message.streamContent || '') + data.content
        } else {
          // 兼容旧格式（没有 type 字段）
          message.streamContent = (message.streamContent || '') + data.content
        }
      }
    })

    // 监听流式结束
    streamEndListener = window.electronAPI.message.onStreamEnd((data) => {
      console.log('[Messages] 流式消息结束', data)
      // 移除临时消息
      messages.value = messages.value.filter(msg => msg.id !== data.tempId && msg.tempId !== data.tempId)
      // 添加最终消息（包含思考内容）
      messages.value.push({
        id: data.finalId,
        group_id: data.groupId,
        character_id: data.characterId,
        characterName: data.characterName,
        role: data.role,
        content: data.content,
        reasoning_content: data.reasoningContent || null,
        timestamp: data.timestamp
      })
    })

    // 监听流式错误
    streamErrorListener = window.electronAPI.message.onStreamError((data) => {
      console.error('[Messages] 流式消息错误', data)
      // 移除临时消息
      messages.value = messages.value.filter(msg => msg.id !== data.tempId && msg.tempId !== data.tempId)
    })

    // 返回清理函数
    return () => {
      userMessageSavedListener?.()
      streamStartListener?.()
      streamChunkListener?.()
      streamEndListener?.()
      streamErrorListener?.()
    }
  }

  function setupMessageListener(callback) {
    // 安全检查：确保 electronAPI 存在
    if (!window.electronAPI?.message) {
      console.warn('[Messages] electronAPI.message not available')
      return
    }

    if (messageListener) {
      window.electronAPI.message.onNewMessage(() => {})()
    }
    messageListener = window.electronAPI.message.onNewMessage(callback)
  }

  async function clearMessages(groupId) {
    if (!groupId) {
      const groupsStore = useGroupsStore()
      groupId = groupsStore.currentGroupId
    }

    if (!groupId) {
      console.error('[Messages] No group selected')
      throw new Error('No group selected')
    }

    try {
      const result = await window.electronAPI.message.clearByGroupId(groupId)
      if (result.success) {
        messages.value = []
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('[Messages] Failed to clear messages:', error)
      throw error
    }
  }

  function clearLocalMessages() {
    messages.value = []
  }

  async function updateMessage(messageId, content) {
    try {
      const result = await window.electronAPI.message.update(messageId, content)
      if (result.success) {
        // 更新本地消息列表
        const index = messages.value.findIndex(msg => msg.id === messageId)
        if (index !== -1) {
          messages.value[index] = result.data
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('[Messages] Failed to update message:', error)
      throw error
    }
  }

  async function deleteMessage(messageId) {
    try {
      const result = await window.electronAPI.message.delete(messageId)
      if (result.success) {
        // 从本地消息列表中删除
        const index = messages.value.findIndex(msg => msg.id === messageId)
        if (index !== -1) {
          messages.value.splice(index, 1)
        }
      } else {
        throw new Error(result.error)
      }
    } catch (error) {
      console.error('[Messages] Failed to delete message:', error)
      throw error
    }
  }

  return {
    messages,
    loading,
    sending,
    loadMessages,
    sendMessage,
    sendMessageToCharacter,
    appendMessage,
    setupMessageListener,
    setupStreamListeners,
    clearMessages,
    clearLocalMessages,
    updateMessage,
    deleteMessage
  }
})
