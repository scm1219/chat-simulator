import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeLike } from '../electron/utils/text.js'

test('转义 LIKE 通配符', () => {
  assert.equal(escapeLike('100%'), '100\\%')
  assert.equal(escapeLike('a_b'), 'a\\_b')
  assert.equal(escapeLike('back\\slash'), 'back\\\\slash')
  assert.equal(escapeLike('普通'), '普通')
})
