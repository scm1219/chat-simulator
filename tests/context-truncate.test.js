import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateMessagesToBudget, sumChars, DEFAULT_CONTEXT_BUDGET_CHARS } from '../electron/utils/context-budget.js'

test('预算内全保留', () => {
  const msgs = [{ content: 'a'.repeat(10) }, { content: 'b'.repeat(10) }]
  assert.equal(truncateMessagesToBudget(msgs, 100).length, 2)
})

test('超预算时从最旧开始丢弃', () => {
  // 3 条各 30 字符共 90；预算 70 → 丢最旧 old 后 60 ≤ 70，保留 mid+new
  const msgs = [{ content: 'old'.repeat(10) }, { content: 'mid'.repeat(10) }, { content: 'new'.repeat(10) }]
  const out = truncateMessagesToBudget(msgs, 70)
  assert.equal(out.length, 2)
  assert.equal(out[0].content.startsWith('mid'), true)
})

test('至少保留最新一条（即使单条超预算）', () => {
  const msgs = [{ content: 'old'.repeat(100) }, { content: 'new'.repeat(100) }]
  const out = truncateMessagesToBudget(msgs, 10)
  assert.equal(out.length, 1)
  assert.equal(out[0].content.startsWith('new'), true)
})

test('空数组与预算为负时安全', () => {
  assert.equal(truncateMessagesToBudget([], 100).length, 0)
  const msgs = [{ content: 'a' }, { content: 'b' }]
  assert.equal(truncateMessagesToBudget(msgs, -5).length, 1)
})

test('sumChars 累加长度', () => {
  assert.equal(sumChars(['ab', 'cde', '']), 5)
  assert.equal(sumChars([null, undefined]), 0)
})

test('默认预算常量为 24000', () => {
  assert.equal(DEFAULT_CONTEXT_BUDGET_CHARS, 24000)
})
