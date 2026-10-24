import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EmotionManager } from '../electron/narrative/emotion-manager.js'
import { EventTrigger } from '../electron/narrative/event-trigger.js'
import { NarrativePromptBuilder } from '../electron/narrative/prompt-builder.js'
import { NarrativeEngine } from '../electron/narrative/engine.js'
import { EMOTION_KEYWORDS, mapEventImpactToEmotion } from '../electron/narrative/constants.js'

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

test('mapEventImpactToEmotion "平静" 透传为平静，未知词仍回退惊讶', () => {
  assert.equal(mapEventImpactToEmotion('平静'), '平静')
  assert.equal(mapEventImpactToEmotion('未知情绪'), '惊讶')
})

test('updateFromLLM 接受推断白名单中的"平静"（强度归零），白名单外词仍丢弃', () => {
  const db = makeRecordingDb()
  const mgr = new EmotionManager()
  mgr.updateFromLLM(db, 'c1', '平静', 0.5)
  assert.equal(db._calls[0].args[1], '平静')
  assert.equal(db._calls[0].args[2], 0)
  assert.equal(db._calls[0].args[3], 'llm')
  mgr.updateFromLLM(db, 'c2', '狂喜', 0.5)
  assert.equal(db._calls.length, 1)
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

test('parseGeneratedEvents trim content 与 impact 后再校验和存储', () => {
  const raw = JSON.stringify({ events: [
    { content: '  老板突然把张三叫进了办公室  ', impact: ' 紧张 ' }
  ]})
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].content, '老板突然把张三叫进了办公室')
  assert.equal(result[0].impact, '紧张')
})

test('parseGeneratedEvents 长度校验用 trim 后值（49 字加首尾空格不误杀）', () => {
  const core = '事'.repeat(49)
  const raw = JSON.stringify({ events: [{ content: `  ${core}  `, impact: '好奇' }] })
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].content, core)
})

test('parseGeneratedEvents impact "平静" 保持平静（不归一为语义相反的惊讶）', () => {
  const raw = JSON.stringify({ events: [{ content: '雨停了，一切恢复安静', impact: '平静' }] })
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].impact, '平静')
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
  assert.ok(p.includes('请为下面这个群聊生成 3 个突发事件'))   // count 出现在任务句
  assert.ok(p.includes('恰好 3 条'))                          // count 出现在约束句
  assert.ok(p.includes('{"events":[{"content":"事件描述","impact":"情绪词"}]}'))
  assert.ok(p.includes(`impact 只能从这些词中选：${Object.keys(EMOTION_KEYWORDS).join('、')}`))  // 完整白名单
  assert.ok(p.includes('每条 content 不超过 40 字'))
})

// 按 SQL 关键字分发的 fake db（better-sqlite3 无法在纯 Node 加载）
function makeFakeDb(rows = {}) {
  return {
    prepare(sql) {
      const stmt = {
        all: (..._a) => {
          if (sql.includes('FROM character_emotions')) return rows.emotions || []
          if (sql.includes('FROM character_relationships')) return rows.relationships || []
          if (sql.includes('FROM characters')) return rows.characters || []
          if (sql.includes('FROM messages')) return rows.messages || []
          if (sql.includes('FROM narrative_events')) return rows.recentEvents || []
          return []
        }
      }
      return stmt
    }
  }
}

const GROUP = { id: 'g1', narrative_enabled: 1, background: '办公室日常' }
const CHARACTERS = [{ id: 'c1', name: '张三', system_prompt: '工程师' }]

function goodClient() {
  return { chat: async () => ({
    success: true,
    content: JSON.stringify({ events: [{ content: '服务器宕机了', impact: '惊慌' }] })
  })}
}

test('generateEventSuggestions LLM 成功返回 generated', async () => {
  const engine = new NarrativeEngine()
  const result = await engine.generateEventSuggestions(makeFakeDb({ characters: CHARACTERS }), GROUP, 'office', 3, goodClient())
  assert.equal(result.source, 'generated')
  assert.equal(result.events[0].content, '服务器宕机了')
})

test('generateEventSuggestions chat 失败/抛异常/空 events 回退静态池', async () => {
  const engine = new NarrativeEngine()
  const db = makeFakeDb({ characters: CHARACTERS })
  const fail = { chat: async () => ({ success: false, error: 'x' }) }
  const thrower = { chat: async () => { throw new Error('network') } }
  const empty = { chat: async () => ({ success: true, content: '{"events":[]}' }) }
  for (const client of [fail, thrower, empty]) {
    const r = await engine.generateEventSuggestions(db, GROUP, 'office', 3, client)
    assert.equal(r.source, 'fallback')
    assert.ok(r.events.length > 0 && r.events.length <= 3)  // 静态池事件
  }
})

test('generateEventSuggestions narrative 关闭或 client 为 null 直接回退且不调 LLM', async () => {
  const engine = new NarrativeEngine()
  const db = makeFakeDb({ characters: CHARACTERS })
  let called = 0
  const counting = { chat: async () => { called++; return { success: true, content: '{}' } } }
  const off = await engine.generateEventSuggestions(db, { ...GROUP, narrative_enabled: 0 }, 'office', 3, counting)
  const noClient = await engine.generateEventSuggestions(db, GROUP, 'office', 3, null)
  assert.equal(off.source, 'fallback')
  assert.equal(noClient.source, 'fallback')
  assert.equal(called, 0)
})

test('generateEventSuggestions group 为 null 时安全返回空回退（不抛错、不调 LLM）', async () => {
  const engine = new NarrativeEngine()
  const db = makeFakeDb({ characters: CHARACTERS })
  let called = 0
  const counting = { chat: async () => { called++; return { success: true, content: '{}' } } }
  const r = await engine.generateEventSuggestions(db, null, 'office', 3, counting)
  assert.equal(r.source, 'fallback')
  assert.deepEqual(r.events, [])
  assert.equal(called, 0)
})

test('generateEventSuggestions few-shot 示例过滤"平静"事件（与 impact 白名单一致）', async () => {
  const engine = new NarrativeEngine()
  engine.eventTrigger.getEventPool = () => [
    { key: 'a', content: '事件A', impact: '紧张' },
    { key: 'calm', content: '窗外下起了小雨', impact: '平静' }
  ]
  let capturedPrompt = ''
  const client = { chat: async (messages) => {
    capturedPrompt = messages[1].content
    return { success: true, content: JSON.stringify({ events: [{ content: '新事件', impact: '开心' }] }) }
  }}
  const r = await engine.generateEventSuggestions(makeFakeDb({ characters: CHARACTERS }), GROUP, 'office', 3, client)
  assert.equal(r.source, 'generated')
  assert.ok(capturedPrompt.includes('事件A'))
  assert.ok(!capturedPrompt.includes('平静'), 'few-shot 示例不应包含白名单外的"平静"')
})

test('preGenerate 事件消息跳过关键词情绪更新（保留事件写入的强度不被衰减）', async () => {
  const engine = new NarrativeEngine()
  let keywordCalls = 0
  engine.emotion.updateFromMessage = () => { keywordCalls++ }
  const db = makeFakeDb({ characters: CHARACTERS })
  const chars = [{ id: 'c1', name: '张三' }]
  engine.preGenerate(db, 'c1', 'g1', '消防警报突然响了', null, chars, 'event')
  assert.equal(keywordCalls, 0, '事件消息不应走关键词情绪更新（避免每角色衰减一次）')
  engine.preGenerate(db, 'c1', 'g1', '今天真开心', null, chars, 'normal')
  assert.equal(keywordCalls, 1, '普通消息保持关键词情绪更新')
})
