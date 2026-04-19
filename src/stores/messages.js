import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useGroupsStore } from './groups.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Messages')

export const useMessagesStore = defineStore('messages', () => {
  // 状态
  const messages = ref([])
  const loading = ref(false)
  const sending = ref(false)
  const streamingMessages = ref(new Map()) // 存储流式消息的临时 ID 到内容的映射
  const highlightMessageId = ref(null) // 搜索高亮的消息 ID
  let messageListener = null
  let streamStartListener = null
  let streamChunkListener = null
  let streamEndListener = null
  let streamErrorListener = null
  let _cleanupStreamListeners = null // 流式监听器清理函数

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
      log.error('加载消息失败:', error)
    } finally {
      loading.value = false
    }
  }

  async function sendMessage(content, options = {}) {
    const groupsStore = useGroupsStore()
    const groupId = groupsStore.currentGroupId

    if (!groupId) {
      log.error('未选择群组')
      throw new Error('No group selected')
    }

    sending.value = true

    try {
      // 调用 LLM 生成回复（流式输出）
      // 注意：用户消息会由主进程通过 message:user:saved 事件发送回来
      const result = await window.electronAPI.llm.generate(groupId, content, options)

      if (!result.success) {
        log.error('LLM 调用失败', result.error)
        throw new Error(result.error)
      }

      return result.data
    } catch (error) {
      log.error('发送消息异常', error)
      throw error
    } finally {
      sending.value = false
    }
  }

  async function sendMessageToCharacter(characterId, instruction) {
    const groupsStore = useGroupsStore()
    const groupId = groupsStore.currentGroupId

    if (!groupId) {
      log.error('未选择群组')
      throw new Error('No group selected')
    }

    sending.value = true

    try {
      // 调用 LLM 生成回复（单角色指令）
      // 注意：用户消息会由主进程通过 message:user:saved 事件发送回来
      const result = await window.electronAPI.llm.generateCharacterCommand(groupId, characterId, instruction)

      if (!result.success) {
        log.error('LLM 调用失败', result.error)
        throw new Error(result.error)
      }

      return result.data
    } catch (error) {
      log.error('发送角色指令异常', error)
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
      log.warn('electronAPI.message 不可用')
      return
    }

    if (messageListener) {
      window.electronAPI.message.onNewMessage(() => {})()
    }
    messageListener = window.electronAPI.message.onNewMessage(callback)
  }

  // 清理流式监听器（供组件 onUnmounted 调用）
  function cleanupStreamListeners() {
    if (_cleanupStreamListeners) {
      _cleanupStreamListeners()
      _cleanupStreamListeners = null
    }
  }

  // 设置流式消息监听器
  function setupStreamListeners() {
    if (!window.electronAPI?.message) {
      log.warn('electronAPI.message 不可用')
      return
    }

    // 清理上一次注册的监听器，防止重复注册
    if (_cleanupStreamListeners) {
      _cleanupStreamListeners()
      _cleanupStreamListeners = null
    }

    // 监听用户消息保存事件（添加用户消息到前端）
    const userMessageSavedListener = window.electronAPI.message.onUserMessageSaved((data) => {
      // 检查是否已存在相同的消息（避免重复）
      const exists = messages.value.some(msg =>
        msg.id === data.id ||
        (msg.role === 'user' && msg.content === data.content && msg.timestamp === data.timestamp)
      )
      if (!exists) {
        messages.value.push(data)
      }
    })

    // 监听流式开始
    streamStartListener = window.electronAPI.message.onStreamStart((data) => {
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
        prompt_tokens: data.promptTokens ?? null,
        completion_tokens: data.completionTokens ?? null,
        model: data.model || null,
        timestamp: data.timestamp
      })
    })

    // 监听流式错误
    streamErrorListener = window.electronAPI.message.onStreamError((data) => {
      log.error('流式消息错误', data)
      // 移除临时消息
      messages.value = messages.value.filter(msg => msg.id !== data.tempId && msg.tempId !== data.tempId)
    })

    // 保存清理函数，供下次调用或组件卸载时使用
    _cleanupStreamListeners = () => {
      userMessageSavedListener?.()
      streamStartListener?.()
      streamChunkListener?.()
      streamEndListener?.()
      streamErrorListener?.()
    }

    return _cleanupStreamListeners
  }

  async function clearMessages(groupId) {
    if (!groupId) {
      const groupsStore = useGroupsStore()
      groupId = groupsStore.currentGroupId
    }

    if (!groupId) {
      log.error('未选择群组')
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
      log.error('清空消息失败:', error)
      throw error
    }
  }

  function clearLocalMessages() {
    messages.value = []
  }

  async function updateMessage(messageId, content) {
    const groupsStore = useGroupsStore()
    const groupId = groupsStore.currentGroupId
    try {
      const result = await window.electronAPI.message.update(groupId, messageId, content)
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
      log.error('更新消息失败:', error)
      throw error
    }
  }

  async function deleteMessage(messageId) {
    const groupsStore = useGroupsStore()
    const groupId = groupsStore.currentGroupId
    try {
      const result = await window.electronAPI.message.delete(groupId, messageId)
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
      log.error('删除消息失败:', error)
      throw error
    }
  }

  async function resendMessage(messageId) {
    const groupsStore = useGroupsStore()
    const groupId = groupsStore.currentGroupId
    try {
      // 删除该消息及之后的所有消息
      const result = await window.electronAPI.message.deleteFrom(groupId, messageId)
      if (!result.success) {
        throw new Error(result.error)
      }

      // 重新加载消息列表
      await loadMessages(groupId)

      // 重新发送消息
      await sendMessage(result.data.content)

      return { success: true }
    } catch (error) {
      log.error('重发消息失败:', error)
      throw error
    }
  }

  // 设置搜索高亮消息 ID
  function setHighlightMessage(messageId) {
    highlightMessageId.value = messageId
  }

  // 清除高亮
  function clearHighlight() {
    highlightMessageId.value = null
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
    cleanupStreamListeners,
    clearMessages,
    clearLocalMessages,
    updateMessage,
    deleteMessage,
    resendMessage,
    highlightMessageId,
    setHighlightMessage,
    clearHighlight
  }
})
