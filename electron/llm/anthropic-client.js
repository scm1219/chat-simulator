/**
 * Anthropic API 兼容客户端
 * 支持 MiniMaxi 等使用 Anthropic 协议的供应商
 *
 * 协议差异（vs OpenAI）：
 * - 认证头：x-api-key（非 Authorization: Bearer）
 * - 端点：POST /v1/messages（非 /v1/chat/completions）
 * - 系统提示词：顶层 system 参数（非 messages 中的 system role）
 * - 消息内容：[{ type: 'text', text: '...' }] 块格式（非纯字符串）
 * - 流式事件：content_block_start/delta/stop + message_stop（非 data: [DONE]）
 * - 思考模式：{ type: 'enabled', budget_tokens: N }（Anthropic 原生格式）
 * - max_tokens：必填参数
 */
import { BaseLLMClient } from './base-client.js'

export class AnthropicClient extends BaseLLMClient {
  constructor(config) {
    const baseURL = config.baseURL || ''

    const headers = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01'
    }
    if (config.apiKey) {
      headers['x-api-key'] = config.apiKey
    }

    super({
      baseURL,
      timeout: config.timeout || 60000,
      proxy: config.proxy,
      bypassRules: config.bypassRules,
      headers
    })

    this.apiKey = config.apiKey
    this.model = config.model
    this.streamEnabled = config.streamEnabled !== undefined ? config.streamEnabled : true
  }

  _getChatEndpoint() {
    return '/v1/messages'
  }

  /**
   * 将 OpenAI 格式消息转换为 Anthropic 格式
   * - 提取 system 消息为顶层 system 参数
   * - 将 content 字符串转换为 [{ type: 'text', text }] 块格式
   */
  _convertMessages(messages) {
    let system = ''
    const converted = []

    for (const msg of messages) {
      if (msg.role === 'system') {
        system += (system ? '\n' : '') + (msg.content || '')
      } else {
        converted.push({
          role: msg.role,
          content: typeof msg.content === 'string'
            ? [{ type: 'text', text: msg.content }]
            : msg.content
        })
      }
    }

    return { system, messages: converted }
  }

  /**
   * 解析 Anthropic SSE 流式数据
   *
   * 事件类型：
   * - message_start：初始元数据（model、usage）
   * - content_block_start：新内容块（thinking / text）
   * - content_block_delta：内容增量（thinking_delta / text_delta）
   * - content_block_stop：内容块结束
   * - message_delta：最终 usage 更新
   * - message_stop：流结束
   */
  _parseStreamLine(line, state, onChunk) {
    // 记录 SSE 事件类型
    if (line.startsWith('event: ')) {
      state.currentEvent = line.slice(7).trim()
      return { done: false }
    }

    if (!line.startsWith('data: ')) return { done: false }

    const data = line.slice(6).trim()
    if (!data) return { done: false }

    try {
      const parsed = JSON.parse(data)

      switch (state.currentEvent) {
        case 'message_start':
          if (parsed.message?.model && !state.responseModel) {
            state.responseModel = parsed.message.model
          }
          if (parsed.message?.usage) {
            state.usage = {
              prompt_tokens: parsed.message.usage.input_tokens || 0,
              completion_tokens: parsed.message.usage.output_tokens || 0,
              total_tokens: (parsed.message.usage.input_tokens || 0) + (parsed.message.usage.output_tokens || 0)
            }
          }
          break

        case 'content_block_start':
          if (parsed.content_block?.type === 'thinking') {
            state.currentBlockType = 'thinking'
          } else if (parsed.content_block?.type === 'text') {
            state.currentBlockType = 'text'
          }
          break

        case 'content_block_delta':
          if (parsed.delta?.type === 'thinking_delta' && parsed.delta.thinking) {
            state.fullReasoning += parsed.delta.thinking
            onChunk({ type: 'reasoning', content: parsed.delta.thinking })
          } else if (parsed.delta?.type === 'text_delta' && parsed.delta.text) {
            state.fullContent += parsed.delta.text
            onChunk({ type: 'content', content: parsed.delta.text })
          }
          break

        case 'content_block_stop':
          state.currentBlockType = null
          break

        case 'message_delta':
          if (parsed.usage) {
            state.usage = {
              prompt_tokens: state.usage?.prompt_tokens || 0,
              completion_tokens: parsed.usage.output_tokens || 0,
              total_tokens: (state.usage?.prompt_tokens || 0) + (parsed.usage.output_tokens || 0)
            }
          }
          break

        case 'message_stop':
          return { done: true }
      }
    } catch (e) {
      // 忽略无法解析的行
    }

    return { done: false }
  }

  /**
   * 发送聊天请求
   */
  async chat(messages, options = {}) {
    const hasOnChunk = options.onChunk && typeof options.onChunk === 'function'
    const useStreaming = hasOnChunk || (this.streamEnabled && options.streaming !== false)
    const isStreaming = useStreaming && typeof options.onChunk === 'function'
    const signal = options.signal || null

    try {
      // 转换消息格式（OpenAI → Anthropic）
      const { system, messages: anthropicMessages } = this._convertMessages(messages)

      const requestData = {
        model: this.model,
        max_tokens: options.maxTokens || 2000,
        messages: anthropicMessages,
        stream: !!isStreaming
      }

      // 系统提示词（顶层参数）
      if (system) {
        requestData.system = system
      }

      // 温度
      if (options.temperature !== undefined) {
        requestData.temperature = options.temperature
      }

      // 思考模式（显式传参，避免 MiniMaxi 默认开启）
      requestData.thinking = options.thinkingEnabled
        ? { type: 'enabled', budget_tokens: 10000 }
        : { type: 'disabled' }

      if (isStreaming) {
        return await this.chatStream(requestData, options.onChunk, signal)
      }

      // 非流式请求
      const axiosOptions = {}
      if (signal) axiosOptions.signal = signal

      const response = await this.client.post('/v1/messages', requestData, axiosOptions)

      if (!response.data || !response.data.content) {
        return { success: false, error: 'API 返回格式错误：缺少 content 字段' }
      }

      // 从 content 块中提取文本和思考内容
      let textContent = ''
      let reasoningContent = ''

      for (const block of response.data.content) {
        if (block.type === 'text') {
          textContent += block.text || ''
        } else if (block.type === 'thinking') {
          reasoningContent += block.thinking || ''
        }
      }

      if (!textContent) {
        return { success: false, error: 'API 返回的内容为空' }
      }

      const usage = response.data.usage ? {
        prompt_tokens: response.data.usage.input_tokens,
        completion_tokens: response.data.usage.output_tokens,
        total_tokens: (response.data.usage.input_tokens || 0) + (response.data.usage.output_tokens || 0)
      } : undefined

      return {
        success: true,
        content: textContent,
        reasoningContent: reasoningContent || null,
        model: response.data.model || this.model,
        usage
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return { success: false, error: '请求已取消' }
      }
      // Anthropic 错误格式: { error: { type, message } }
      if (error.response?.data?.error?.message) {
        return { success: false, error: error.response.data.error.message }
      }
      return this.handleError(error)
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.client.post('/v1/messages', {
        model: this.model,
        max_tokens: 10,
        messages: [
          { role: 'user', content: [{ type: 'text', text: 'Hi' }] }
        ]
      })
      return {
        success: true,
        message: '连接成功',
        model: this.model
      }
    } catch (error) {
      return this.handleError(error)
    }
  }
}
