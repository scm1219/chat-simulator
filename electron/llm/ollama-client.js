/**
 * Ollama 原生 API 客户端
 * 使用 Ollama 原生 API 格式（/api/chat）而非 OpenAI 兼容格式
 */
import { BaseLLMClient } from './base-client.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('LLM')

// Ollama 特有的 HTTP 错误码映射
const OLLAMA_STATUS_MAP = {
  404: '模型不存在或 API 端点错误',
  500: 'Ollama 服务内部错误'
}

const OLLAMA_NETWORK_ERROR = '无法连接到 Ollama 服务，请确保 Ollama 正在运行'

/**
 * 规范化消息列表：合并所有 system 消息并置顶
 * 许多本地模型的 Jinja 模板要求 system 消息只能出现在开头（且通常仅允许一条），
 * 否则报 400（"System message must be at the beginning"）
 * @param {Array} messages - 原始消息列表
 * @returns {Array} 规范化后的消息列表（system 合并为一条置顶）
 */
function normalizeSystemMessages(messages) {
  const systemParts = []
  const rest = []
  for (const msg of messages) {
    if (msg.role === 'system' && msg.content) {
      systemParts.push(msg.content)
    } else {
      rest.push(msg)
    }
  }
  if (systemParts.length === 0) return rest.length === messages.length ? messages : rest
  return [{ role: 'system', content: systemParts.join('\n\n') }, ...rest]
}

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

      // 检查是否完成（done 帧携带最终用量，须在返回前提取）
      if (parsed.done) {
        if (typeof parsed.prompt_eval_count === 'number' || typeof parsed.eval_count === 'number') {
          state.usage = {
            prompt_tokens: parsed.prompt_eval_count ?? 0,
            completion_tokens: parsed.eval_count ?? 0
          }
        }
        return { done: true }
      }
    } catch {
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
    // 简化流式判断：有 onChunk 回调则使用流式
    const isStreaming = typeof options.onChunk === 'function'

    try {
      const requestData = {
        model: this.model,
        messages: normalizeSystemMessages(messages),
        stream: isStreaming
      }

      // 思考模式参数：显式传递 think（true/false）。
      // 思考模型缺省 think 时默认开启思考，必须显式传 false 才能关闭；
      // 旧版 Ollama 不认识该字段会返回 400，此时降级为不带 think 重试
      if (this.thinkSupported !== false) {
        requestData.think = options.thinkingEnabled === true
      }

      const send = async (data) => {
        if (isStreaming) {
          return await this.chatStream(data, options.onChunk, options.signal)
        }
        return await this.chatNonStream(data, options.signal)
      }

      let result = await send(requestData)

      // 带 think 参数报 400 且错误信息提及 think：旧版 Ollama 不支持，去掉 think 后降级重试
      const isThinkRejected = result.error?.startsWith('HTTP 400') && /think/i.test(result.error || '')
      if (!result.success && isThinkRejected && 'think' in requestData) {
        this.thinkSupported = false
        log.warn(`Ollama 服务不支持 think 参数，已降级重试（模型: ${this.model}）`)
        delete requestData.think
        result = await send(requestData)
      } else if (result.success) {
        this.thinkSupported = true
      }

      return result
    } catch (error) {
      // 处理取消请求
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED' || options.signal?.aborted) {
        return { success: false, aborted: true, error: '已取消' }
      }
      return this.handleError(error)
    }
  }

  /**
   * 非流式请求
   */
  async chatNonStream(requestData, signal) {
    const axiosOptions = signal ? { signal } : {}
    const response = await this.client.post('/api/chat', requestData, axiosOptions)

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
   * 错误处理（使用 Ollama 状态码映射）
   */
  handleError(error) {
    return super.handleError(error, OLLAMA_STATUS_MAP, OLLAMA_NETWORK_ERROR)
  }
}
