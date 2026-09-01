// tests/llm-providers.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getProviderName,
  getGenderLabel,
  groupProfilesByProvider,
  sortProfilesByProvider
} from '../src/utils/llm-providers.js'

test('getProviderName 已知 id 返回供应商名', () => {
  assert.equal(getProviderName('openai'), 'OpenAI')
  assert.equal(getProviderName('deepseek'), 'DeepSeek')
})

test('getProviderName 未知 id 回退为 id 本身', () => {
  assert.equal(getProviderName('nonexistent'), 'nonexistent')
})

test('getGenderLabel 三种性别与未知回退', () => {
  assert.equal(getGenderLabel('male'), '男')
  assert.equal(getGenderLabel('female'), '女')
  assert.equal(getGenderLabel('other'), '其他')
  assert.equal(getGenderLabel('robot'), '未知')
  assert.equal(getGenderLabel(undefined), '未知')
})

test('groupProfilesByProvider 分组、组间/组内排序、过滤未知供应商', () => {
  const profiles = [
    { id: '1', provider: 'deepseek', name: 'B' },
    { id: '2', provider: 'openai', name: 'Z' },
    { id: '3', provider: 'openai', name: 'A' },
    { id: '4', provider: 'nonexistent', name: '丢弃' }
  ]
  const groups = groupProfilesByProvider(profiles)
  assert.equal(groups.length, 2)
  // 组间按供应商名 localeCompare：DeepSeek < OpenAI
  assert.equal(groups[0].providerId, 'deepseek')
  assert.equal(groups[0].providerName, 'DeepSeek')
  assert.equal(groups[1].providerId, 'openai')
  // 组内按配置名排序
  assert.deepEqual(groups[1].profiles.map(p => p.name), ['A', 'Z'])
})

test('groupProfilesByProvider 空/非数组防御', () => {
  assert.deepEqual(groupProfilesByProvider([]), [])
  assert.deepEqual(groupProfilesByProvider(null), [])
})

test('sortProfilesByProvider 供应商声明顺序优先、同供应商按名称排序', () => {
  const profiles = [
    { id: '1', provider: 'openai', name: 'B' },
    { id: '2', provider: 'openai', name: 'A' },
    { id: '3', provider: 'deepseek', name: 'X' }
  ]
  const sorted = sortProfilesByProvider(profiles)
  // providers/index.js 中 openai 声明在 deepseek 之前
  assert.deepEqual(sorted.map(p => p.id), ['2', '1', '3'])
})

test('sortProfilesByProvider 空/非数组防御', () => {
  assert.deepEqual(sortProfilesByProvider([]), [])
  assert.deepEqual(sortProfilesByProvider(undefined), [])
})
