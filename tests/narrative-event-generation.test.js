import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EmotionManager } from '../electron/narrative/emotion-manager.js'

// 记录 INSERT 参数的 fake db：prepareCached 仅依赖 db.prepare 存在性
function makeRecordingDb() {
  const calls = []
  const db = {
    prepare(sql) {
      return { run: (...args) => calls.push({ sql, args }) }
    },
    _calls: calls
  }
  return db
}

test('updateFromEvent jitter=0 保持基准强度（惊慌 0.8*0.8）', () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '惊慌', 0)
  assert.equal(db._calls[0].args[2], 0.8 * 0.8)
  assert.equal(db._calls[0].args[3], 'event')
})

test('updateFromEvent 抖动 clamp 到 [0,1]', () => {
  const db = makeRecordingDb()
  const mgr = new EmotionManager()
  const orig = Math.random
  try {
    Math.random = () => 1  // jitter=1 → base*2
    mgr.updateFromEvent(db, 'c1', '惊慌', 1)
    assert.equal(db._calls[0].args[2], 1)  // 0.64*2=1.28 → 1
    Math.random = () => 0  // → base*0
    mgr.updateFromEvent(db, 'c2', '惊慌', 1)
    assert.equal(db._calls[1].args[2], 0)
  } finally {
    Math.random = orig
  }
})

test("updateFromEvent '平静' 分支不受 jitter 影响，强度恒 0", () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '平静', 0.5)
  assert.equal(db._calls[0].args[1], '平静')
  assert.equal(db._calls[0].args[2], 0)
})

test('updateFromEvent 非标准 impact 经 EVENT_EMOTION_MAP 归一（焦急→焦虑）', () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '焦急', 0)
  assert.equal(db._calls[0].args[1], '焦虑')
})
