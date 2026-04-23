/**
 * LLM 客户端
 * 支持 OpenAI 协议兼容的 API
 */
import { getProviderConfig } from './providers/index.js'
import { BaseLLMClient } from './base-client.js'

// OpenAI 协议特有的 HTTP 错误码映射
const OPENAI_STATUS_MAP = {
  401: 'API Key 无效或已过期',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误'
}

export class LLMClient extends BaseLLMClient {
  constructor(config) {
    // 计算基类所需参数（不能在 super() 前使用 this）
    const provider = config.provider || 'openai'
    const providerConfig = getProviderConfig(provider)
    const baseURL = config.baseURL || (providerConfig && providerConfig.baseURL)

    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    // 调用基类构造函数
    super({
      baseURL,
      timeout: config.timeout || 60000,
      proxy: config.proxy,
      bypassRules: config.bypassRules,
      headers
    })

    // 设置子类属性
    this._provider = provider
    this.apiKey = config.apiKey
    this.model = config.model
    this.streamEnabled = config.streamEnabled !== undefined ? config.streamEnabled : true
  }

  /**
   * 设置思考模式参数
   * 同时传递三种格式，兼容所有供应商（忽略不识别的字段）
   * - thinking: DeepSeek、智谱 GLM 等
   * - chat_template_kwargs: ModelScope（Qwen3.5 系列）
   * - enable_thinking: 阿里云百炼平台
   */
  applyThinkingMode(requestData, thinkingEnabled) {
    const enabled = thinkingEnabled === true
    requestData.thinking = { type: enabled ? 'enabled' : 'disabled' }
    requestData.chat_template_kwargs = { enable_thinking: enabled }
    requestData.enable_thinking = enabled
  }

  // ============ BaseLLMClient 抽象方法实现 ============

  _getChatEndpoint() {
    return '/chat/completions'
  }

  /**
   * 解析 SSE 格式的流式数据行
   * 格式：`data: {json}` 或 `data: [DONE]`
   */
  _parseStreamLine(line, state, onChunk) {
    if (!line.startsWith('data: ')) return { done: false }

    const data = line.slice(6)
    if (data === '[DONE]') return { done: true }

    try {
      const parsed = JSON.parse(data)
      const delta = parsed.choices?.[0]?.delta

      const content = delta?.content
      const reasoningContent = delta?.reasoning_content

      if (reasoningContent) {
        state.fullReasoning += reasoningContent
        onChunk({ type: 'reasoning', content: reasoningContent })
      }

      if (content) {
        state.fullContent += content
        onChunk({ type: 'content', content: content })
      }

      // 提取 usage（通常在最后一个 chunk 中）
      if (parsed.usage) {
        state.usage = parsed.usage
      }

      // 提取 model（从首个包含 model 的 chunk 中获取）
      if (parsed.model && !state.responseModel) {
        state.responseModel = parsed.model
      }
    } catch (e) {
      // 忽略无法解析的行
    }

    return { done: false }
  }

  // ============ 业务方法 ============

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息列表
   * @param {Object} options - 选项
   * @param {Function} options.onChunk - 流式输出回调函数
   * @param {AbortSignal} options.signal - 用于取消请求的 AbortSignal
   */
  async chat(messages, options = {}) {
    // 确定是否使用流式输出：
    // 1. 如果 options 明确指定了 onChunk，则使用流式
    // 2. 否则使用配置中的 streamEnabled 设置
    const hasOnChunk = options.onChunk && typeof options.onChunk === 'function'
    const useStreaming = hasOnChunk || (this.streamEnabled && options.streaming !== false)
    const isStreaming = useStreaming && typeof options.onChunk === 'function'
    const signal = options.signal || null

    try {
      const providerConfig = getProviderConfig(this._provider)
      const caps = providerConfig?.capabilities || {}

      const requestData = {
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        stream: isStreaming
      }

      // Token 上限参数：部分供应商使用 max_completion_tokens（如 MiniMaxi）
      if (caps.maxCompletionTokens) {
        requestData.max_completion_tokens = options.maxTokens || 2000
      } else {
        requestData.max_tokens = options.maxTokens || 2000
      }

      // 结构化输出（默认支持，除非供应商明确不支持）
      if (options.responseFormat && caps.responseFormat !== false) {
        requestData.response_format = options.responseFormat
      }

      // 流式请求时请求 usage 数据（默认支持，除非供应商明确不支持）
      if (isStreaming && caps.streamOptions !== false) {
        requestData.stream_options = { include_usage: true }
      }

      // 思考模式参数（默认支持，除非供应商明确不支持）
      if (caps.thinking !== false) {
        this.applyThinkingMode(requestData, options.thinkingEnabled)
      }

      if (isStreaming) {
        return await this.chatStream(requestData, options.onChunk, signal)
      } else {
        // 非流式请求
        const axiosOptions = {}
        if (signal) axiosOptions.signal = signal

        const response = await this.client.post('/chat/completions', requestData, axiosOptions)

        // 检查响应格式
        if (!response.data || !response.data.choices || response.data.choices.length === 0) {
          return {
            success: false,
            error: 'API 返回格式错误：缺少 choices 字段'
          }
        }

        const message = response.data.choices[0].message
        const content = message?.content
        const reasoningContent = message?.reasoning_content

        if (!content) {
          return {
            success: false,
            error: 'API 返回的内容为空'
          }
        }

        return {
          success: true,
          content: content,
          reasoningContent: reasoningContent,
          model: response.data.model || this.model,
          usage: response.data.usage || undefined
        }
      }
    } catch (error) {
      // 处理取消请求
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return { success: false, error: '请求已取消' }
      }
      return this.handleError(error, OPENAI_STATUS_MAP)
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const providerConfig = getProviderConfig(this._provider)
      const caps = providerConfig?.capabilities || {}
      const maxTokensKey = caps.maxCompletionTokens ? 'max_completion_tokens' : 'max_tokens'

      await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        [maxTokensKey]: 10
      })

      return {
        success: true,
        message: '连接成功',
        model: this.model
      }
    } catch (error) {
      return this.handleError(error, OPENAI_STATUS_MAP)
    }
  }

  /**
   * 获取可用模型列表
   */
  async getModels() {
    try {
      const response = await this.client.get('/models')
      return {
        success: true,
        models: response.data.data.map(m => m.id)
      }
    } catch (error) {
      return this.handleError(error, OPENAI_STATUS_MAP)
    }
  }

  /**
   * 错误处理（使用 OpenAI 状态码映射）
   */
  handleError(error, statusMap = OPENAI_STATUS_MAP) {
    return super.handleError(error, statusMap)
  }
}
