/**
 * LLM 客户端
 * 支持 OpenAI 协议兼容的 API
 */
import axios from 'axios'
import { getProviderConfig } from './providers/index.js'
import { buildAxiosProxyConfig } from './proxy.js'

export class LLMClient {
  constructor(config) {
    this.provider = config.provider || 'openai'
    this.apiKey = config.apiKey
    this.baseURL = config.baseURL
    this.model = config.model
    this.timeout = config.timeout || 60000 // 默认 60 秒

    // 获取供应商默认配置
    const providerConfig = getProviderConfig(this.provider)
    if (providerConfig && !this.baseURL) {
      this.baseURL = providerConfig.baseURL
    }

    // 配置 Axios
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: this.buildHeaders(),
      proxy: buildAxiosProxyConfig(config.proxy || {})
    })
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
    const isStreaming = options.onChunk && typeof options.onChunk === 'function'

    try {
      const requestData = {
        model: this.model,
        messages: messages,
        temperature: options.temperature || 0.7,
        max_tokens: options.maxTokens || 2000,
        stream: isStreaming // 启用流式输出
      }

      // 如果启用思考模式，添加 thinking 参数
      if (options.thinkingEnabled) {
        requestData.thinking = {
          type: 'enabled'
        }
      }

      if (isStreaming) {
        // 流式请求
        return await this.chatStream(requestData, options.onChunk)
      } else {
        // 非流式请求
        const response = await this.client.post('/chat/completions', requestData)

        return {
          success: true,
          content: response.data.choices[0].message.content,
          usage: response.data.usage
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

      return new Promise((resolve, reject) => {
        response.data.on('data', (chunk) => {
          const lines = chunk.toString().split('\n').filter(line => line.trim() !== '')

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6)

              if (data === '[DONE]') {
                // 流式结束
                resolve({
                  success: true,
                  content: fullContent
                })
                return
              }

              try {
                const parsed = JSON.parse(data)
                const content = parsed.choices?.[0]?.delta?.content

                if (content) {
                  fullContent += content
                  // 实时推送内容片段
                  onChunk(content)
                }
              } catch (e) {
                console.warn('[LLM] 解析流式数据失败', e.message)
              }
            }
          }
        })

        response.data.on('end', () => {
          if (fullContent) {
            resolve({
              success: true,
              content: fullContent
            })
          }
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
