/**
 * LLM 客户端
 * 支持 OpenAI 协议兼容的 API
 */
import axios from 'axios'
import { getProviderConfig } from './providers/index.js'
import { buildAxiosProxyConfig, shouldBypassProxy } from './proxy.js'

export class LLMClient {
  constructor(config) {
    this.provider = config.provider || 'openai'
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL
    this.model = config.model
    this.timeout = config.timeout || 60000 // 默认 60 秒
    this.streamEnabled = config.streamEnabled !== undefined ? config.streamEnabled : true // 默认启用流式输出

    // 获取供应商默认配置
    const providerConfig = getProviderConfig(this.provider)
    if (providerConfig && !this.baseURL) {
      this.baseURL = providerConfig.baseURL
    }

    // 解析代理配置：优先使用 resolveProfileProxy 的结果，向后兼容旧的 proxy 格式
    const proxyConfig = config.proxy ?? undefined
    const bypassRules = config.bypassRules || ''

    // 配置 Axios
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: this.buildHeaders(),
      proxy: proxyConfig
    })

    // 代理绕过规则拦截器
    if (bypassRules && proxyConfig) {
      this.client.interceptors.request.use((request) => {
        const targetURL = `${request.baseURL || ''}${request.url || ''}`
        if (shouldBypassProxy(targetURL, bypassRules)) {
          request.proxy = false
        }
        return request
      })
    }

    // 添加请求拦截器用于调试
    this.client.interceptors.request.use(
      (request) => request,
      (error) => Promise.reject(error)
    )

    // 添加响应拦截器用于调试
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('[LLM Client] 请求失败:', error.message, error.response?.status)
        return Promise.reject(error)
      }
    )
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

  /**
   * 构建请求头
   */
  buildHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    }

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`
    }

    return headers
  }

  /**
   * 发送聊天请求
   * @param {Array} messages - 消息列表
   * @param {Object} options - 选项
   * @param {Function} options.onChunk - 流式输出回调函数
   */
  async chat(messages, options = {}) {
    // 确定是否使用流式输出：
    // 1. 如果 options 明确指定了 onChunk，则使用流式
    // 2. 否则使用配置中的 streamEnabled 设置
    const hasOnChunk = options.onChunk && typeof options.onChunk === 'function'
    const useStreaming = hasOnChunk || (this.streamEnabled && options.streaming !== false)
    const isStreaming = useStreaming && typeof options.onChunk === 'function'

    try {
      const requestData = {
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: isStreaming // 启用流式输出
      }

      // 结构化输出：强制返回合法 JSON（GLM-5、OpenAI 等供应商支持）
      if (options.responseFormat) {
        requestData.response_format = options.responseFormat
      }

      // 流式请求时请求 usage 数据
      if (isStreaming) {
        requestData.stream_options = { include_usage: true }
      }

      // 处理思考模式参数：同时传递三种格式，兼容所有供应商
      this.applyThinkingMode(requestData, options.thinkingEnabled)

      if (isStreaming) {
        // 流式请求
        return await this.chatStream(requestData, options.onChunk)
      } else {
        // 非流式请求
        const response = await this.client.post('/chat/completions', requestData)

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
      return this.handleError(error)
    }
  }

  /**
   * 流式聊天请求
   */
  async chatStream(requestData, onChunk) {
    try {
      const response = await this.client.post('/chat/completions', requestData, {
        responseType: 'stream'
      })

      let fullContent = ''
      let fullReasoningContent = ''
      let usage = null
      let responseModel = null

      const buildResult = () => ({
        success: true,
        content: fullContent,
        reasoningContent: fullReasoningContent || null,
        model: responseModel || this.model,
        usage: usage || undefined
      })

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim() !== '')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)

              if (data === '[DONE]') {
                resolve(buildResult())
                return
              }

              try {
                const parsed = JSON.parse(data)
                const delta = parsed.choices?.[0]?.delta

                const content = delta?.content
                const reasoningContent = delta?.reasoning_content

                if (reasoningContent) {
                  fullReasoningContent += reasoningContent
                  onChunk({ type: 'reasoning', content: reasoningContent })
                }

                if (content) {
                  fullContent += content
                  onChunk({ type: 'content', content: content })
                }

                // 提取 usage（通常在最后一个 chunk 中）
                if (parsed.usage) {
                  usage = parsed.usage
                }

                // 提取 model（从首个包含 model 的 chunk 中获取）
                if (parsed.model && !responseModel) {
                  responseModel = parsed.model
                }
              } catch (e) {
                console.warn('[LLM] 解析流式数据失败', e.message)
              }
            }
          }
        })

        response.data.on('end', () => {
          resolve(buildResult())
        })

        response.data.on('error', (error) => {
          reject(this.handleError(error))
        })
      })
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          { role: 'user', content: 'Hi' }
        ],
        max_tokens: 10
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
   * 获取可用模型列表（用于 Ollama）
   */
  async getModels() {
    try {
      const response = await this.client.get('/models')
      return {
        success: true,
        models: response.data.data.map(m => m.id)
      }
    } catch (error) {
      return this.handleError(error)
    }
  }

  /**
   * 错误处理
   */
  handleError(error) {
    if (error.response) {
      // 服务器返回错误
      const status = error.response.status
      const message = error.response.data?.error?.message || error.message

      let errorDetail = ''
      switch (status) {
        case 401:
          errorDetail = 'API Key 无效或已过期'
          break
        case 429:
          errorDetail = '请求过于频繁，请稍后再试'
          break
        case 500:
          errorDetail = '服务器内部错误'
          break
        default:
          errorDetail = message
      }

      return {
        success: false,
        error: `HTTP ${status}: ${errorDetail}`
      }
    } else if (error.request) {
      // 请求发送但无响应
      return {
        success: false,
        error: '网络连接失败，请检查网络设置或代理配置'
      }
    } else {
      // 其他错误
      return {
        success: false,
        error: error.message
      }
    }
  }
}

/**
 * 创建 LLM 客户端实例
 */
export function createLLMClient(config) {
  return new LLMClient(config)
}
