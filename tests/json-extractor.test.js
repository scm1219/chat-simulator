import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJSON } from '../electron/utils/json-extractor.js'

// 现有 API 契约：返回 { success, data?, error? }，调用方（llm.js 等 3 处）依赖此包装

test('提取 markdown 代码块中的 JSON', () => {
  const r = extractJSON('前言```json\n{"a":1}\n```后记')
  assert.equal(r.success, true)
  assert.deepEqual(r.data, { a: 1 })
})

test('容错：前后杂文字与首尾花括号', () => {
  const r = extractJSON('xx {"b":2} yy')
  assert.equal(r.success, true)
  assert.deepEqual(r.data, { b: 2 })
})

test('容错：截断 JSON 修复（未闭合字符串与数组）', () => {
  const r = extractJSON('```json\n{"name":"小美","tags":["a"')
  assert.equal(r.success, true)
  assert.equal(r.data.name, '小美')
  assert.deepEqual(r.data.tags, ['a'])
})

test('完全非法输入返回 success:false', () => {
  const r = extractJSON('no json here')
  assert.equal(r.success, false)
  assert.ok(r.error)
})

test('空输入返回 success:false', () => {
  assert.equal(extractJSON('').success, false)
  assert.equal(extractJSON(null).success, false)
})
