import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EmotionManager } from '../electron/narrative/emotion-manager.js'
import { EventTrigger } from '../electron/narrative/event-trigger.js'
import { NarrativePromptBuilder } from '../electron/narrative/prompt-builder.js'

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

test('parseGeneratedEvents 解析合法事件并归一 impact', () => {
  const raw = JSON.stringify({ events: [
    { content: '老板突然把张三叫进了办公室', impact: '紧张' },
    { content: '群里流出了未公开的调薪名单', impact: '震惊' }  // 非标准词→惊讶
  ]})
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 2)
  assert.equal(result[0].content, '老板突然把张三叫进了办公室')
  assert.equal(result[1].impact, '惊讶')
  assert.match(result[0].key, /^llm_\d+_\d+$/)
})

test('parseGeneratedEvents 过滤空/超长 content，缺失 impact 默认惊讶', () => {
  const raw = JSON.stringify({ events: [
    { content: '   ', impact: '开心' },
    { content: 'a'.repeat(51), impact: '开心' },
    { content: '外卖送错了' }                     // 无 impact
  ]})
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].impact, '惊讶')
})

test('parseGeneratedEvents events 非数组或空数组返回空数组', () => {
  const t = new EventTrigger()
  assert.deepEqual(t.parseGeneratedEvents('{"events":"x"}', 3), [])
  assert.deepEqual(t.parseGeneratedEvents('{"events":[]}', 3), [])
  assert.deepEqual(t.parseGeneratedEvents('不是JSON', 3), [])
})

test('parseGeneratedEvents 超出 count 截断', () => {
  const events = Array.from({ length: 5 }, (_, i) => ({ content: `事件${i}`, impact: '好奇' }))
  const result = new EventTrigger().parseGeneratedEvents(JSON.stringify({ events }), 3)
  assert.equal(result.length, 3)
})

const PROMPT_INPUT = {
  sceneLabel: '聚会', background: '一家互联网公司的日常',
  characters: [
    { id: 'c1', name: '张三', system_prompt: '张三是后端工程师\n喜欢摸鱼' },
    { id: 'c2', name: '李四', system_prompt: '李四是产品经理' }
  ],
  emotions: [{ character_id: 'c1', emotion: '焦虑', intensity: 0.6 }],
  relationships: [{ from_id: 'c1', to_id: 'c2', type: 'colleague', favorability: -30 }],
  sampleEvents: [{ content: '办公室突然停电了', impact: '惊讶' }],
  recentMessages: [
    { role: 'user', character_name: null, content: '今天好累' },
    { role: 'assistant', character_name: '张三', content: '我也是' }
  ],
  count: 3
}

test('buildEventSuggestionPrompt 包含角色/情绪/关系/示例/对话各段', () => {
  const p = new NarrativePromptBuilder().buildEventSuggestionPrompt(PROMPT_INPUT)
  assert.ok(p.includes('张三') && p.includes('李四'))
  assert.ok(p.includes('焦虑'))
  assert.ok(p.includes('同事') && p.includes('不满'))   // 类型标签 + 好感度等级
  assert.ok(p.includes('办公室突然停电了'))
  assert.ok(p.includes('张三：我也是') && p.includes('用户：今天好累'))
  assert.ok(p.includes('聚会'))                         // 场景段（sceneLabel）
})

test('buildEventSuggestionPrompt 固定输出约束（count、JSON 结构、情绪词白名单、字数）', () => {
  const p = new NarrativePromptBuilder().buildEventSuggestionPrompt(PROMPT_INPUT)
  assert.ok(p.includes('"events"'))
  assert.ok(p.includes('3'))
  assert.ok(p.includes('开心') && p.includes('恐慌'))   // 情绪白名单抽样
  assert.ok(p.includes('40'))                           // content 字数约束
})
