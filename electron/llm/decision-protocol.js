/**
 * 决策模型（System One 协议）纯函数模块
 * 请求校验、响应解析与决策 Profile 挑选
 *
 * 无 electron/axios 依赖，供 node --test 直接测试；
 * HTTP 行为由 DecisionClient 负责，本模块不触及
 */
import { getProviderConfig } from './providers/index.js'

// 协议限制（阿里云百炼 decision-model-preview 文档）
const MAX_QUESTIONS = 16
const MIN_OPTIONS = 1
const MAX_OPTIONS = 255
const MIN_SCORE_LEVELS = 2

const QUESTION_TYPES = ['choice', 'noul', 'score']

/**
 * 校验决策请求参数
 * @param {*} state - 业务状态（string/object/array，服务端自动序列化）
 * @param {object} questions - 问题集，key 为自定义问题 id
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateDecisionRequest(state, questions) {
  if (state === undefined || state === null) {
    return { valid: false, error: 'state 不能为空' }
  }

  if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
    return { valid: false, error: 'questions 必须为非空对象' }
  }

  const keys = Object.keys(questions)
  if (keys.length === 0) {
    return { valid: false, error: 'questions 至少包含一个问题' }
  }
  if (keys.length > MAX_QUESTIONS) {
    return { valid: false, error: `问题数超过上限（最多 ${MAX_QUESTIONS} 个）` }
  }

  for (const id of keys) {
    const question = questions[id]
    if (!question || typeof question !== 'object') {
      return { valid: false, error: `问题 "${id}" 必须为对象` }
    }

    if (!QUESTION_TYPES.includes(question.type)) {
      return { valid: false, error: `问题 "${id}" 的 type 必须为 ${QUESTION_TYPES.join('/')}` }
    }

    if (question.type === 'choice') {
      const count = question.criteria ? Object.keys(question.criteria).length : 0
      if (count < MIN_OPTIONS || count > MAX_OPTIONS) {
        return { valid: false, error: `问题 "${id}" 的 choice 选项数须为 ${MIN_OPTIONS}-${MAX_OPTIONS} 项` }
      }
    }

    if (question.type === 'score') {
      const levels = question.criteria
      if (!Array.isArray(levels) || levels.length < MIN_SCORE_LEVELS || levels.length > MAX_OPTIONS) {
        return { valid: false, error: `问题 "${id}" 的 score 等级须为 ${MIN_SCORE_LEVELS}-${MAX_OPTIONS} 级数组` }
      }
    }
  }

  return { valid: true }
}

/**
 * 解析决策响应
 * @param {object} data - API 响应体
 * @returns {{ valid: boolean, error?: string, answers?: object, usage?: object, latencyMs?: number, model?: string, requestId?: string }}
 */
export function parseDecisionResponse(data) {
  if (!data || typeof data !== 'object' || !data.answers || typeof data.answers !== 'object') {
    return { valid: false, error: 'API 返回格式错误：缺少 answers 字段' }
  }

  const answers = data.answers
  if (Object.keys(answers).length === 0) {
    return { valid: false, error: 'API 返回格式错误：answers 为空' }
  }

  return {
    valid: true,
    answers,
    usage: data.usage || undefined,
    latencyMs: data.latency_ms,
    model: data.model,
    requestId: data.request_id
  }
}

/**
 * 按全局配置挑选决策 Profile
 * @param {Array} profiles - 全部 LLM Profile
 * @param {string} decisionProfileId - 全局配置的决策 Profile ID
 * @returns {{ profile?: object, error?: string }}
 */
export function pickDecisionProfile(profiles, decisionProfileId) {
  if (!decisionProfileId) {
    return { error: '未配置决策模型，请在设置中选择' }
  }

  const profile = (profiles || []).find(p => p.id === decisionProfileId)
  if (!profile) {
    return { error: '决策模型配置不存在，请重新选择' }
  }

  if (getProviderConfig(profile.provider)?.modelType !== 'decision') {
    return { error: '所选配置不是决策模型' }
  }

  return { profile }
}
