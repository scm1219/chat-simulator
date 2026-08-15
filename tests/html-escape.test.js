// tests/html-escape.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from '../src/utils/html.js'

test('转义全部 HTML 实体字符', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')
})
test('普通文本与非字符串输入', () => {
  assert.equal(escapeHtml('hello'), 'hello')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(123), '123')
})
