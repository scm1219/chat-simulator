/**
 * Ollama 原生 API 客户端
 * 使用 Ollama 原生 API 格式（/api/chat）而非 OpenAI 兼容格式
 */
import { BaseLLMClient } from './base-client.js'

// Ollama 特有的 HTTP 错误码映射
const OLLAMA_STATUS_MAP = {
  404: '模型不存在或 API 端点错误',
  500: 'Ollama 服务内部错误'
}

const OLLAMA_NETWORK_ERROR = '无法连接到 Ollama 服务，请确保 Ollama 正在运行'

export class OllamaNativeClient extends BaseLLMClient {
  constructor(config) {
    // 调用基类构造函数（不能在 super() 前使用 this）
    super({
      baseURL: config.baseURL || 'http://localhost:11434',
      timeout: config.timeout || 120000,
      proxy: config.proxy,
      bypassRules: config.bypassRules,
      headers: { 'Content-Type': 'application/json' }
    })

    // 设置子类属性
    this.model = config.model
    this.streamEnabled = config.streamEnabled !== undefined ? config.streamEnabled : true
  }

  // ============ BaseLLMClient 抽象方法实现 ============

  _getChatEndpoint() {
    return '/api/chat'
  }

  /**
   * 解析 NDJSON 格式的流式数据行
   * 格式：`{json}`，通过 `done` 字段判断结束
   */
  _parseStreamLine(line, state, onChunk) {
    try {
      const parsed = JSON.parse(line)

      // 收集 model（从首个包含 model 的 chunk 中获取）
      if (parsed.model && !state.responseModel) {
        state.responseModel = parsed.model
      }

      // Ollama 原生格式
      const message = parsed.message
      if (message) {
        const thinking = message.thinking
        const content = message.content

        if (thinking) {
          state.fullReasoning += thinking
          onChunk({ type: 'reasoning', content: thinking })
        }

        if (content) {
          state.fullContent += content
          onChunk({ type: 'content', content: content })
        }
      }

      // 检查是否完成
      if (parsed.done) {
        return { done: true }
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
   */
  async chat(messages, options = {}) {
    // 简化流式判断：有 onChunk 回调则使用流式
    const isStreaming = typeof options.onChunk === 'function'

    try {
      const requestData = {
        model: this.model,
        messages: messages,
        stream: isStreaming
      }

      // 处理思考模式参数：始终传递 think 参数（true 或 false）
      requestData.think = options.thinkingEnabled === true

      if (isStreaming) {
        return await this.chatStream(requestData, options.onChunk)
      }

      // 非流式请求
      const response = await this.client.post('/api/chat', requestData)

      // 检查响应格式
      if (!response.data || !response.data.message) {
        return {
          success: false,
          error: 'API 返回格式错误：缺少 message 字段'
        }
      }

      const message = response.data.message
      const content = message?.content
      const thinking = message?.thinking

      if (!content) {
        return {
          success: false,
          error: 'API 返回的内容为空'
        }
      }

      return {
        success: true,
        content: content,
        reasoningContent: thinking || null,
        model: response.data.model || this.model,
        usage: {
          prompt_tokens: response.data.prompt_eval_count || 0,
          completion_tokens: response.data.eval_count || 0,
          total_tokens: (response.data.prompt_eval_count || 0) + (response.data.eval_count || 0)
        }
      }
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      await this.client.post('/api/chat', {
        model: this.model,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        stream: false
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

  /**
   * 获取可用模型列表
   * Ollama 原生 API: GET /api/tags
   */
  async getModels() {
    try {
      const response = await this.client.get('/api/tags')

      if (response.data && response.data.models) {
        return {
          success: true,
          models: response.data.models.map(m => m.name)
        }
      }

      return {
        success: true,
        models: []
      }
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * 错误处理（使用 Ollama 状态码映射）
   */
  handleError(error) {
    return super.handleError(error, OLLAMA_STATUS_MAP, OLLAMA_NETWORK_ERROR)
  }
}
