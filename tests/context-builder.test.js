import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildContextMessages } from '../electron/ipc/handlers/llm-context-builder.js'
import { normalizeSystemMessages } from '../electron/llm/message-normalizer.js'

const character = { name: '夏知了', system_prompt: '你是夏知了，性格活泼' }
const history = [
  { role: 'user', content: '大家好' },
  { role: 'assistant', content: '嗨！', character_name: '王欣然' }
]

test('所有 system 消息都位于首个 user/assistant 之前（vLLM 400 回归）', () => {
  const messages = buildContextMessages(
    character,
    history,
    '今天天气怎么样',
    '一个聊天群',
    '群规则',
    [character],
    [{ content: '记得用户喜欢猫' }],
    [{ role: 'system', content: '当前情绪：开心' }]
  )

  const firstNonSystem = messages.findIndex(m => m.role !== 'system')
  assert.ok(firstNonSystem !== -1, '数组中必须存在非 system 消息')
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === 'system') {
      assert.ok(i < firstNonSystem, `索引 ${i} 的 system 消息出现在 user/assistant 之后`)
    }
  }
})

test('身份提醒并入人设 system 消息，不再单独出现在末尾', () => {
  const messages = buildContextMessages(character, history, '你好')
  const persona = messages.find(m => m.role === 'system' && m.content.includes('性格活泼'))
  assert.ok(persona, '人设 system 消息必须存在')
  assert.ok(persona.content.includes('你是夏知了，现在直接说你的台词就好'), '身份提醒应追加在人设末尾')

  // 末尾（用户消息之前）不得再有独立 system 消息
  const lastIsUser = messages[messages.length - 1].role === 'user'
  const trailingSystem = messages[messages.length - 2]
  assert.ok(lastIsUser && trailingSystem.role !== 'system')
})

test('人设为空时身份提醒单独成为 system 消息', () => {
  const messages = buildContextMessages({ name: '夏知了', system_prompt: '' }, [], '你好')
  const systemMsgs = messages.filter(m => m.role === 'system')
  assert.equal(systemMsgs.length, 1)
  assert.ok(systemMsgs[0].content.startsWith('你是夏知了，'))
})

test('历史消息顺序保持，用户消息始终在最后', () => {
  const messages = buildContextMessages(character, history, '新消息')
  assert.equal(messages[messages.length - 1].role, 'user')
  assert.equal(messages[messages.length - 1].content, '新消息')
  const mid = messages.slice(0, -1).filter(m => m.role === 'user' || m.role === 'assistant')
  assert.deepEqual(
    mid.map(m => m.content),
    ['大家好', '王欣然：嗨！']
  )
})

test('normalizeSystemMessages：中置 system 合并置顶，非 system 顺序不变', () => {
  const input = [
    { role: 'system', content: 'A' },
    { role: 'user', content: 'U1' },
    { role: 'system', content: 'B' },
    { role: 'assistant', content: 'R1' },
    { role: 'system', content: 'C' },
    { role: 'user', content: 'U2' }
  ]
  const out = normalizeSystemMessages(input)
  assert.equal(out.length, 4)
  assert.deepEqual(out[0], { role: 'system', content: 'A\n\nB\n\nC' })
  assert.deepEqual(out.slice(1).map(m => [m.role, m.content]), [
    ['user', 'U1'],
    ['assistant', 'R1'],
    ['user', 'U2']
  ])
})

test('normalizeSystemMessages：空 system 内容被丢弃，无 system 时原样透传', () => {
  const withEmpty = normalizeSystemMessages([
    { role: 'system', content: '' },
    { role: 'user', content: 'U' }
  ])
  assert.deepEqual(withEmpty, [{ role: 'user', content: 'U' }])

  const noSystem = [{ role: 'user', content: 'U' }, { role: 'assistant', content: 'R' }]
  assert.equal(normalizeSystemMessages(noSystem), noSystem)
})
