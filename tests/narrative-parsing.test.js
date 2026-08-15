import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeRegExp, stripMentionPunctuation } from '../electron/utils/text.js'

test('escapeRegExp 特殊字符全部转义', () => {
  assert.equal(escapeRegExp('A+B('), 'A\\+B\\(')
  // 转义后作为正则片段使用，不应意外匹配含特殊字符的原文（如"小美("不应匹配"小美："）
  assert.equal(new RegExp(`^${escapeRegExp('小美(')}[：:]`).test('小美：hi'), false)
})

test('escapeRegExp 构造正则不抛异常', () => {
  // 含全部正则特殊字符的字符串，转义后构造 RegExp 必须成功
  const special = '.*+?^${}()|[]\\'
  let compiled
  try {
    compiled = new RegExp(`^${escapeRegExp(special)}$`)
  } catch {
    assert.fail('escapeRegExp 转义结果构造 RegExp 抛出异常')
  }
  assert.ok(compiled.test(special))
})

test('escapeRegExp 空值安全', () => {
  assert.equal(escapeRegExp(null), '')
  assert.equal(escapeRegExp(undefined), '')
})

test('@提及剥离尾部标点', () => {
  assert.equal(stripMentionPunctuation('张三，你觉得呢'), '张三')
  assert.equal(stripMentionPunctuation('李四!'), '李四')
  assert.equal(stripMentionPunctuation('王五'), '王五')
})

test('@提及剥离中英文标点与空白组合', () => {
  assert.equal(stripMentionPunctuation('赵六，。！？,.!?:：;；、~—…'), '赵六')
  assert.equal(stripMentionPunctuation('孙七  '), '孙七')
  assert.equal(stripMentionPunctuation(null), '')
})
