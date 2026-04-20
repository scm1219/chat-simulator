/**
 * LLM 客户端基类
 * 提取 OpenAI 兼容客户端和 Ollama 原生客户端的公共逻辑：
 * - Axios 实例创建（含代理拦截器）
 * - 流式响应处理框架
 * - 统一错误处理
 * - 连接测试
 */
import axios from 'axios'
import { shouldBypassProxy } from './proxy.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('LLM')

export class BaseLLMClient {
  /**
   * @param {object} config
   * @param {string} config.baseURL - API 基础 URL
   * @param {string} config.model - 模型名称
   * @param {number} [config.timeout=60000] - 请求超时（毫秒）
   * @param {object} [config.proxy] - 代理配置（axios 格式）
   * @param {string} [config.bypassRules] - 代理绕过规则
   * @param {object} [config.headers] - 自定义请求头
   */
  constructor(config) {
    this.baseURL = config.baseURL
    this.model = config.model
    this.timeout = config.timeout || 60000

    // 创建 Axios 实例
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: config.headers || { 'Content-Type': 'application/json' },
      proxy: config.proxy ?? undefined
    })

    // 代理绕过规则拦截器
    const bypassRules = config.bypassRules || ''
    const proxyConfig = config.proxy
    if (bypassRules && proxyConfig) {
      this.client.interceptors.request.use((request) => {
        const targetURL = `${request.baseURL || ''}${request.url || ''}`
        if (shouldBypassProxy(targetURL, bypassRules)) {
          request.proxy = false
        }
        return request
      })
    }

    // 响应错误拦截器
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        log.error('请求失败:', error.message, error.response?.status)
        return Promise.reject(error)
      }
    )
  }

  // ============ 子类必须实现的抽象方法 ============

  /**
   * 获取聊天 API 端点
   * @returns {string}
   */
  _getChatEndpoint() {
    throw new Error('子类必须实现 _getChatEndpoint()')
  }

  /**
   * 解析流式数据行
   * @param {string} line - 一行流式数据（已去除空行）
   * @param {object} state - 累积状态 { fullContent, fullReasoning, responseModel, usage }
   * @param {Function} onChunk - 流式片段回调
   * @returns {{ done: boolean }} done=true 表示流结束
   */
  _parseStreamLine(line, state, onChunk) {
    throw new Error('子类必须实现 _parseStreamLine()')
  }

  // ============ 公共流式处理框架 ============

  /**
   * 流式聊天请求（公共框架）
   * 子类通过 _parseStreamLine() 钩子处理协议差异
   * @param {object} requestData - 请求数据
   * @param {Function} onChunk - 流式片段回调
   * @param {AbortSignal} [signal] - 取消信号
   */
  async chatStream(requestData, onChunk, signal) {
    try {
      const axiosOptions = { responseType: 'stream' }
      if (signal) axiosOptions.signal = signal

      const response = await this.client.post(this._getChatEndpoint(), requestData, axiosOptions)

      const state = {
        fullContent: '',
        fullReasoning: '',
        responseModel: null,
        usage: null
      }

      const buildResult = () => ({
        success: true,
        content: state.fullContent,
        reasoningContent: state.fullReasoning || null,
        model: state.responseModel || this.model,
        usage: state.usage || undefined
      })

      return new Promise((resolve, reject) => {
        // 处理已取消的信号
        if (signal && signal.aborted) {
          response.data.destroy()
          resolve({ success: false, error: '请求已取消' })
          return
        }

        let lineBuffer = ''

        response.data.on('data', (chunk) => {
          lineBuffer += chunk.toString()
          const lines = lineBuffer.split('\n')
          lineBuffer = lines.pop() || ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed === '') continue

            const result = this._parseStreamLine(trimmed, state, onChunk)
            if (result && result.done) {
              resolve(buildResult())
              return
            }
          }
        })

        response.data.on('end', () => {
          // 处理缓冲区中可能残留的数据
          if (lineBuffer.trim()) {
            this._parseStreamLine(lineBuffer.trim(), state, onChunk)
          }
          resolve(buildResult())
        })

        response.data.on('error', (error) => {
          reject(this.handleError(error))
        })

        // 监听取消信号
        if (signal) {
          signal.addEventListener('abort', () => {
            response.data.destroy()
            resolve({ success: false, error: '请求已取消' })
          }, { once: true })
        }
      })
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return { success: false, error: '请求已取消' }
      }
      return this.handleError(error)
    }
  }

  // ============ 公共错误处理 ============

  /**
   * 通用错误处理
   * @param {Error} error - 错误对象
   * @param {object} [statusMap] - HTTP 状态码到错误信息的映射
   * @param {string} [networkError='网络连接失败，请检查网络设置或代理配置'] - 网络错误信息
   * @returns {{ success: false, error: string }}
   */
  handleError(error, statusMap = {}, networkError = '网络连接失败，请检查网络设置或代理配置') {
    if (error.response) {
      const status = error.response.status
      const message = error.response.data?.error?.message || error.response.data?.error || error.message
      const errorDetail = statusMap[status] || message

      return {
        success: false,
        error: `HTTP ${status}: ${errorDetail}`
      }
    } else if (error.request) {
      return {
        success: false,
        error: networkError
      }
    } else {
      return {
        success: false,
        error: error.message
      }
    }
  }
}
