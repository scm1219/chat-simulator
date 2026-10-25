/**
 * 决策模型客户端（System One 协议）
 * 百炼 decision-model-preview：POST {baseURL}/systemone
 * 一次前向返回分类/是非/评分判定及概率分布，不生成文本、不支持流式
 */
import { BaseLLMClient } from './base-client.js'
import { validateDecisionRequest, parseDecisionResponse } from './decision-protocol.js'

// System One 协议特有错误码文案（与 OpenAI 状态码映射保持一致语义）
const DECISION_STATUS_MAP = {
  401: 'API Key 无效或已过期',
  429: '请求过于频繁，请稍后再试',
  500: '服务器内部错误'
}

export class DecisionClient extends BaseLLMClient {
  constructor(config) {
    // 计算基类所需参数（不能在 super() 前使用 this）
    const headers = { 'Content-Type': 'application/json' }
    if (config.apiKey) {
      headers['Authorization'] = `Bearer ${config.apiKey}`
    }

    super({
      baseURL: config.baseURL,
      timeout: config.timeout || 60000,
      proxy: config.proxy,
      bypassRules: config.bypassRules,
      headers
    })

    this._provider = config.provider || 'bailian-decision'
    this.model = config.model
  }

  /**
   * 发送决策请求
   * @param {*} state - 业务状态（string/object/array，服务端自动序列化）
   * @param {object} questions - 问题集（结构规则见 decision-protocol.js）
   * @param {object} [options]
   * @param {AbortSignal} [options.signal] - 用于取消请求的 AbortSignal
   * @returns {Promise<{ success: boolean, answers?: object, usage?: object, latencyMs?: number, model?: string, requestId?: string, error?: string, aborted?: boolean }>}
   */
  async decide(state, questions, options = {}) {
    // 本地预校验：结构非法时直接返回，不发请求
    const check = validateDecisionRequest(state, questions)
    if (!check.valid) {
      return { success: false, error: check.error }
    }

    try {
      const axiosOptions = {}
      if (options.signal) axiosOptions.signal = options.signal

      const response = await this.client.post('/systemone', {
        model: this.model,
        state,
        questions
      }, axiosOptions)

      const parsed = parseDecisionResponse(response.data)
      if (!parsed.valid) {
        return { success: false, error: parsed.error }
      }

      return {
        success: true,
        answers: parsed.answers,
        usage: parsed.usage,
        latencyMs: parsed.latencyMs,
        model: parsed.model || this.model,
        requestId: parsed.requestId
      }
    } catch (error) {
      if (error.name === 'AbortError' || error.code === 'ERR_CANCELED') {
        return { success: false, aborted: true, error: '请求已取消' }
      }
      return this.handleError(error, DECISION_STATUS_MAP)
    }
  }

  /**
   * 测试连接（最小 noul 问题探活）
   */
  async testConnection() {
    const result = await this.decide('ping', {
      ping: { type: 'noul', instructions: '连接测试' }
    })

    if (result.success) {
      return {
        success: true,
        message: '连接成功',
        model: this.model
      }
    }
    return result
  }
}
