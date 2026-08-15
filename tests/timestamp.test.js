import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowTimestampMs } from '../electron/utils/timestamp.js'

test('格式为毫秒级且字典序与秒级存量兼容', () => {
  const ts = nowTimestampMs()
  assert.match(ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
  // 同一秒内：带毫秒 > 不带毫秒；跨秒：晚的更大
  assert.ok('2026-08-15 07:00:00.123' > '2026-08-15 07:00:00')
  assert.ok('2026-08-15 07:00:00.999' < '2026-08-15 07:00:01')
})

test('两次调用单调不减', () => {
  assert.ok(nowTimestampMs() <= nowTimestampMs())
})

test('混合秒级与毫秒级数据排序仍正确（ORDER BY timestamp 兼容）', () => {
  const mixed = [
    '2026-08-15 07:00:00.999', // 新格式，同秒末
    '2026-08-15 06:59:59',     // 旧格式，早一秒
    '2026-08-15 07:00:00',     // 旧格式，同秒整
    '2026-08-15 07:00:01.001', // 新格式，下一秒
    '2026-08-15 07:00:00.001'  // 新格式，同秒初
  ]
  const sorted = [...mixed].sort() // 字符串排序与 ORDER BY timestamp（TEXT/DATETIME 存储）一致
  assert.deepEqual(sorted, [
    '2026-08-15 06:59:59',
    '2026-08-15 07:00:00',
    '2026-08-15 07:00:00.001',
    '2026-08-15 07:00:00.999',
    '2026-08-15 07:00:01.001'
  ])
})
