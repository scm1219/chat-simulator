/**
 * Ollama 原生 API 客户端
 * 使用 Ollama 原生 API 格式（/api/chat）而非 OpenAI 兼容格式
 */
import axios from 'axios'
import { buildAxiosProxyConfig, shouldBypassProxy } from './proxy.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Ollama')

export class OllamaNativeClient {
  constructor(config) {
    this.baseURL = config.baseURL || 'http://localhost:11434'
    this.model = config.model
    this.timeout = config.timeout || 120000 // Ollama 本地模型可能较慢，默认 2 分钟
    this.streamEnabled = config.streamEnabled !== undefined ? config.streamEnabled : true

    // 解析代理配置：直接使用已解析的代理配置
    const proxyConfig = config.proxy ?? undefined
    const bypassRules = config.bypassRules || ''

    // 配置 Axios
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      },
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
        log.error('请求失败:', error.message, error.response?.status)
        return Promise.reject(error)
      }
    )
  }

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
   * 流式聊天请求
   * Ollama 原生流式输出格式为 NDJSON（每行一个 JSON 对象）
   */
  async chatStream(requestData, onChunk) {
    try {
      const response = await this.client.post('/api/chat', requestData, {
        responseType: 'stream'
      })

      let fullContent = ''
      let fullThinking = ''
      let responseModel = null

      return new Promise((resolve, reject) => {
        let buffer = ''

        response.data.on('data', (chunk) => {
          buffer += chunk.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // 保留不完整的行

          for (const line of lines) {
            if (line.trim() === '') continue

            try {
              const parsed = JSON.parse(line)

              // 收集 model（从首个包含 model 的 chunk 中获取）
              if (parsed.model && !responseModel) {
                responseModel = parsed.model
              }

              // Ollama 原生格式
              const message = parsed.message
              if (message) {
                const thinking = message.thinking
                const content = message.content

                if (thinking) {
                  fullThinking += thinking
                  onChunk({ type: 'reasoning', content: thinking })
                }

                if (content) {
                  fullContent += content
                  onChunk({ type: 'content', content: content })
                }
              }

              // 检查是否完成
              if (parsed.done) {
                resolve({
                  success: true,
                  content: fullContent,
                  reasoningContent: fullThinking || null,
                  model: responseModel || this.model
                })
                return
              }
            } catch (e) {
              log.warn('解析流式数据失败', e.message, 'Line:', line.substring(0, 100))
            }
          }
        })

        response.data.on('end', () => {
          // 处理缓冲区中剩余的数据
          if (buffer.trim()) {
            try {
              const parsed = JSON.parse(buffer)
              if (parsed.done) {
                resolve({
                  success: true,
                  content: fullContent,
                  reasoningContent: fullThinking || null,
                  model: responseModel || this.model
                })
                return
              }
            } catch (e) {
              log.warn('解析最后数据失败', e.message)
            }
          }

          resolve({
            success: true,
            content: fullContent,
            reasoningContent: fullThinking || null,
            model: responseModel || this.model
          })
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
      const response = await this.client.post('/api/chat', {
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
   * 错误处理
   */
  handleError(error) {
    if (error.response) {
      const status = error.response.status
      const message = error.response.data?.error || error.message

      let errorDetail = ''
      switch (status) {
        case 404:
          errorDetail = '模型不存在或 API 端点错误'
          break
        case 500:
          errorDetail = 'Ollama 服务内部错误'
          break
        default:
          errorDetail = message
      }

      return {
        success: false,
        error: `HTTP ${status}: ${errorDetail}`
      }
    } else if (error.request) {
      return {
        success: false,
        error: '无法连接到 Ollama 服务，请确保 Ollama 正在运行'
      }
    } else {
      return {
        success: false,
        error: error.message
      }
    }
  }
}
