import { test } from 'node:test'
import assert from 'node:assert/strict'
import { StreamBatcher } from '../electron/utils/stream-batcher.js'

test('同一 tempId+type 多次 add 聚合为一次合并负载', () => {
  const sent = []
  const b = new StreamBatcher(p => sent.push(p), 10000)

  b.add('t1', 'content', 'Hello')
  b.add('t1', 'content', ' ')
  b.add('t1', 'content', 'World')
  b.add('t1', 'reasoning', '思考中')
  b.flush()

  assert.equal(sent.length, 2, 'content 与 reasoning 各聚合成一次发送')
  const content = sent.find(p => p.type === 'content')
  const reasoning = sent.find(p => p.type === 'reasoning')
  assert.equal(content.tempId, 't1')
  assert.equal(content.content, 'Hello World', '内容按到达顺序拼接完整')
  assert.equal(reasoning.content, '思考中')
  b.destroy()
})

test('不同 tempId 各自独立聚合', () => {
  const sent = []
  const b = new StreamBatcher(p => sent.push(p), 10000)

  b.add('a', 'content', '1')
  b.add('b', 'content', '2')
  b.add('a', 'content', '3')
  b.flush()

  assert.equal(sent.length, 2)
  const a = sent.find(p => p.tempId === 'a')
  const bb = sent.find(p => p.tempId === 'b')
  assert.equal(a.content, '13')
  assert.equal(bb.content, '2')
  b.destroy()
})

test('flush 幂等：缓冲清空后再次 flush 不重复发送', () => {
  const sent = []
  const b = new StreamBatcher(p => sent.push(p), 10000)

  b.add('t2', 'content', 'abc')
  b.flush()
  const count = sent.length
  b.flush()
  assert.equal(sent.length, count, '第二次 flush 无新增发送')
  b.destroy()
})

test('到达刷新间隔后定时器自动 flush', async () => {
  const sent = []
  const b = new StreamBatcher(p => sent.push(p), 20)

  b.add('t3', 'content', 'auto')
  await new Promise(r => setTimeout(r, 80))

  assert.equal(sent.length, 1, '定时器到期自动发送')
  assert.equal(sent[0].content, 'auto')
  b.destroy()
})

test('destroy 清理定时器与缓冲，未发送数据不再发送', async () => {
  const sent = []
  const b = new StreamBatcher(p => sent.push(p), 20)

  b.add('t4', 'content', 'will-be-dropped')
  b.destroy()
  assert.equal(sent.length, 0, 'destroy 不发送缓冲数据')

  await new Promise(r => setTimeout(r, 80))
  assert.equal(sent.length, 0, 'destroy 后定时器不再触发')

  b.flush()
  assert.equal(sent.length, 0, 'destroy 后 flush 无数据可发')
})
