// tests/decision-protocol.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  validateDecisionRequest,
  parseDecisionResponse,
  pickDecisionProfile
} from '../electron/llm/decision-protocol.js'

// ============ validateDecisionRequest ============

test('validateDecisionRequest 合法 choice 问题通过', () => {
  const result = validateDecisionRequest('工单内容', {
    department: {
      type: 'choice',
      instructions: '选择处理部门',
      criteria: {
        tech: '技术问题',
        billing: '账单问题',
        other: '其他'
      }
    }
  })
  assert.equal(result.valid, true)
  assert.equal(result.error, undefined)
})

test('validateDecisionRequest 合法 noul 与 score 问题通过', () => {
  const result = validateDecisionRequest({ level: 3 }, {
    urgent: { type: 'noul' },
    satisfaction: { type: 'score', criteria: ['低', '中', '高'] }
  })
  assert.equal(result.valid, true)
})

test('validateDecisionRequest state 为对象时原样透传（不做序列化）', () => {
  const state = { a: 1, nested: { b: [1, 2] } }
  const result = validateDecisionRequest(state, { q: { type: 'noul' } })
  assert.equal(result.valid, true)
  // 模块不返回任何序列化后的 state 字段（透传由客户端保证）
  assert.equal('state' in result, false)
  assert.equal('stateText' in result, false)
})

test('validateDecisionRequest 拒绝 undefined/null state', () => {
  assert.equal(validateDecisionRequest(undefined, { q: { type: 'noul' } }).valid, false)
  assert.equal(validateDecisionRequest(null, { q: { type: 'noul' } }).valid, false)
})

test('validateDecisionRequest 拒绝空 questions 与非对象 questions', () => {
  assert.equal(validateDecisionRequest('s', {}).valid, false)
  assert.equal(validateDecisionRequest('s', null).valid, false)
  assert.equal(validateDecisionRequest('s', undefined).valid, false)
})

test('validateDecisionRequest 拒绝超过 16 个问题', () => {
  const questions = {}
  for (let i = 0; i < 17; i++) {
    questions[`q${i}`] = { type: 'noul' }
  }
  const result = validateDecisionRequest('s', questions)
  assert.equal(result.valid, false)
  assert.match(result.error, /16/)
})

test('validateDecisionRequest 拒绝未知问题 type', () => {
  const result = validateDecisionRequest('s', { q: { type: 'unknown' } })
  assert.equal(result.valid, false)
  assert.match(result.error, /type/)
})

test('validateDecisionRequest choice 要求 criteria 为 1-255 键对象', () => {
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'choice', criteria: {} } }).valid, false
  )
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'choice' } }).valid, false
  )
  const big = {}
  for (let i = 0; i < 256; i++) big[`opt${i}`] = 'x'
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'choice', criteria: big } }).valid, false
  )
  // 恰好 255 项合法
  const max = {}
  for (let i = 0; i < 255; i++) max[`opt${i}`] = 'x'
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'choice', criteria: max } }).valid, true
  )
})

test('validateDecisionRequest score 要求 criteria 为 2-255 级数组', () => {
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'score', criteria: ['低'] } }).valid, false
  )
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'score', criteria: '低' } }).valid, false
  )
  assert.equal(
    validateDecisionRequest('s', { q: { type: 'score', criteria: ['低', '中', '高'] } }).valid, true
  )
})

// ============ parseDecisionResponse ============

test('parseDecisionResponse 完整响应映射为 camelCase 字段', () => {
  const data = {
    model: 'decision-model-preview',
    request_id: 'req-123',
    answers: {
      department: {
        type: 'choice',
        choice: 'tech',
        probabilities: { tech: 0.8, billing: 0.15, other: 0.05 },
        confidence: 0.8
      }
    },
    usage: { input_tokens: 42 },
    latency_ms: 120
  }
  const result = parseDecisionResponse(data)
  assert.equal(result.valid, true)
  assert.deepEqual(result.answers.department.probabilities, { tech: 0.8, billing: 0.15, other: 0.05 })
  assert.deepEqual(result.usage, { input_tokens: 42 })
  assert.equal(result.latencyMs, 120)
  assert.equal(result.model, 'decision-model-preview')
  assert.equal(result.requestId, 'req-123')
})

test('parseDecisionResponse 缺 answers 返回格式错误', () => {
  const result = parseDecisionResponse({ model: 'decision-model-preview' })
  assert.equal(result.valid, false)
  assert.match(result.error, /格式错误/)
})

test('parseDecisionResponse 空 answers 对象返回格式错误', () => {
  const result = parseDecisionResponse({ answers: {} })
  assert.equal(result.valid, false)
  assert.match(result.error, /格式错误/)
})

test('parseDecisionResponse null 输入返回格式错误', () => {
  const result = parseDecisionResponse(null)
  assert.equal(result.valid, false)
  assert.match(result.error, /格式错误/)
})

// ============ pickDecisionProfile ============

const PROFILES = [
  { id: 'c1', provider: 'openai', name: '聊天配置' },
  { id: 'd1', provider: 'bailian-decision', name: '决策配置' }
]

test('pickDecisionProfile 未配置 id 返回引导配置错误', () => {
  const result = pickDecisionProfile(PROFILES, '')
  assert.equal(result.error, '未配置决策模型，请在设置中选择')
  assert.equal(result.profile, undefined)
})

test('pickDecisionProfile 指向不存在的 Profile 返回错误', () => {
  const result = pickDecisionProfile(PROFILES, 'gone')
  assert.equal(result.error, '决策模型配置不存在，请重新选择')
})

test('pickDecisionProfile 指向非决策类型 Profile 返回错误', () => {
  const result = pickDecisionProfile(PROFILES, 'c1')
  assert.equal(result.error, '所选配置不是决策模型')
})

test('pickDecisionProfile 命中决策 Profile 返回 profile 且无 error', () => {
  const result = pickDecisionProfile(PROFILES, 'd1')
  assert.equal(result.profile.id, 'd1')
  assert.equal('error' in result, false)
})
