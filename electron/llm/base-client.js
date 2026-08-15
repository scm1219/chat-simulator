/**
 * LLM 客户端基类
 * 提取 OpenAI 兼容客户端和 Ollama 原生客户端的公共逻辑：
 * - Axios 实例创建（含代理拦截器）
 * - 流式响应处理框架
 * - 统一错误处理
 * - 连接测试
 */
import axios from 'axios'
import http from 'node:http'
import https from 'node:https'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { shouldBypassProxy } from './proxy.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('LLM')

/**
 * 构建 SOCKS 代理 URL（含认证信息）
 * @param {object} proxy - resolveProfileProxy 返回的代理配置 { host, port, auth? }
 * @returns {string} socks5://[user:pass@]host:port
 */
function buildSocksProxyUrl(proxy) {
  const credential = proxy.auth
    ? `${encodeURIComponent(proxy.auth.username)}:${encodeURIComponent(proxy.auth.password)}@`
    : ''
  return `socks5://${credential}${proxy.host}:${proxy.port}`
}

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

    // SOCKS5 代理：axios 仅支持 http/https 协议代理，socks5 需经
    // socks-proxy-agent 以 httpAgent/httpsAgent 方式注入并禁用 axios 内置代理
    const proxyConfig = config.proxy
    const socksAgent =
      proxyConfig && proxyConfig.protocol === 'socks5'
        ? new SocksProxyAgent(buildSocksProxyUrl(proxyConfig))
        : null

    // 创建 Axios 实例（http/https 代理路径保持原有 proxy 字段注入不变）
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: config.headers || { 'Content-Type': 'application/json' },
      proxy: socksAgent ? false : (proxyConfig ?? undefined),
      ...(socksAgent ? { httpAgent: socksAgent, httpsAgent: socksAgent } : {})
    })

    // 代理绕过规则拦截器
    const bypassRules = config.bypassRules || ''
    if (bypassRules && proxyConfig) {
      // SOCKS agent 挂在实例级 agent 上，绕过时需替换为直连 agent
      const directHttpAgent = socksAgent ? new http.Agent() : null
      const directHttpsAgent = socksAgent ? new https.Agent() : null
      this.client.interceptors.request.use((request) => {
        const targetURL = `${request.baseURL || ''}${request.url || ''}`
        if (shouldBypassProxy(targetURL, bypassRules)) {
          request.proxy = false
          if (socksAgent) {
            request.httpAgent = directHttpAgent
            request.httpsAgent = directHttpsAgent
          }
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
  _parseStreamLine(_line, _state, _onChunk) {
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
          resolve({ success: false, aborted: true, error: '请求已取消' })
          return
        }

        // settle 状态：覆盖 data/end/error/abort 四类事件，
        // settled 后 data 直接丢弃、end 不再 resolve、error 不再 reject
        let settled = false
        let onAbort = null

        // 请求结束后移除 abort 监听器，避免信号持有流引用导致泄漏
        const cleanup = () => {
          if (signal && onAbort) {
            signal.removeEventListener('abort', onAbort)
            onAbort = null
          }
        }

        let lineBuffer = ''

        response.data.on('data', (chunk) => {
          if (settled) return
          try {
            lineBuffer += chunk.toString()
            const lines = lineBuffer.split('\n')
            lineBuffer = lines.pop() || ''

            for (const line of lines) {
              const trimmed = line.trim()
              if (trimmed === '') continue

              const result = this._parseStreamLine(trimmed, state, onChunk)
              if (result && result.done) {
                // 收到协议结束符：立即 settle 并销毁流，丢弃后续 data 事件
                settled = true
                cleanup()
                response.data.destroy()
                resolve(buildResult())
                return
              }
            }
          } catch (error) {
            // 回调抛异常时也必须 settle，否则外层 Promise 永久悬挂
            settled = true
            cleanup()
            response.data.destroy()
            reject(this.handleError(error))
          }
        })

        response.data.on('end', () => {
          if (settled) return
          settled = true
          cleanup()
          try {
            // 处理缓冲区中可能残留的数据
            if (lineBuffer.trim()) {
              this._parseStreamLine(lineBuffer.trim(), state, onChunk)
            }
          } catch (error) {
            reject(this.handleError(error))
            return
          }
          resolve(buildResult())
        })

        response.data.on('error', (error) => {
          if (settled) return
          settled = true
          cleanup()
          reject(this.handleError(error))
        })

        // 监听取消信号
        if (signal) {
          onAbort = () => {
            if (settled) return
            settled = true
            response.data.destroy()
            resolve({ success: false, aborted: true, error: '请求已取消' })
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
      })
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return { success: false, aborted: true, error: '请求已取消' }
      }
      // 流式请求非 2xx 时 error.response.data 是未消费的 Stream，
      // 先读取并解析错误体（同时释放 socket），再走同步 handleError 组装
      await BaseLLMClient.consumeErrorStream(error)
      return this.handleError(error)
    }
  }

  // ============ 公共错误处理 ============

  /**
   * 读取并解析流式错误响应体（error.response.data 为未消费的 Stream）
   * 解析成功后将 error.response.data 替换为已解析对象，使同步 handleError
   * 能提取服务器错误信息；读取失败时保持原样（socket 已尽力释放）
   * @param {Error} error - axios 抛出的错误对象
   * @returns {Promise<Error>} 原 error 对象（便于链式使用）
   */
  static async consumeErrorStream(error) {
    const stream = error?.response?.data
    if (!stream || typeof stream.on !== 'function') {
      return error
    }
    try {
      const body = await new Promise((resolve) => {
        let text = ''
        stream.setEncoding('utf8')
        stream.on('data', (chunk) => { text += chunk })
        stream.on('end', () => resolve(text))
        stream.on('error', () => resolve(''))
      })
      try {
        const parsed = JSON.parse(body)
        if (parsed?.error?.message || parsed?.error || parsed?.message) {
          error.response.data = parsed
        }
      } catch { /* 非 JSON 错误体，保持原 error */ }
    } catch { /* 忽略读取失败 */ }
    return error
  }

  /**
   * 通用错误处理（保持同步：子类多处同步调用，流式错误体
   * 由 chatStream 的 catch 先经 consumeErrorStream 消费后再进入此处）
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
