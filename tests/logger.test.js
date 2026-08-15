import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger, destroyAllLoggers } from '../electron/utils/logger.js'

// 轮转/写入均为异步（WriteStream + end 回调内 rename），用短轮询等待落盘
async function waitFor(cond, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (cond()) return true
    await new Promise(r => setTimeout(r, 20))
  }
  return cond()
}

test('模块可在纯 Node（无 electron）环境导入并使用（惰性 electron 依赖）', () => {
  const log = createLogger('PureNodeSmoke')
  assert.doesNotThrow(() => log.info('hello from pure node'))
  destroyAllLoggers()
})

test('超过大小阈值触发轮转且不中断写入', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'))
  const file = path.join(dir, 'app.log')
  const log = createLogger('T', file, { maxSize: 200 })

  for (let i = 0; i < 50; i++) log.info('x'.repeat(20))
  // createWriteStream 异步打开文件，需等待创建
  assert.ok(await waitFor(() => fs.existsSync(file)), '当前日志文件已创建')

  const rotated = await waitFor(() => fs.existsSync(path.join(dir, 'app.old.log')))
  assert.ok(rotated, '超过阈值后产生 .old.log 轮转备份')

  log.info('after-rotate')
  const written = await waitFor(() => fs.readFileSync(file, 'utf8').includes('after-rotate'))
  assert.ok(written, '轮转后写入不中断')

  destroyAllLoggers()
  fs.rmSync(dir, { recursive: true, force: true })
})

test('小体积日志不轮转，内容完整落盘', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'))
  const file = path.join(dir, 'app.log')
  const log = createLogger('Small', file, { maxSize: 1024 * 1024 })

  log.info('line-1')
  log.warn('line-2')
  const ok = await waitFor(() => {
    try {
      const c = fs.readFileSync(file, 'utf8')
      return c.includes('line-1') && c.includes('line-2')
    } catch {
      return false // 文件尚未异步创建
    }
  })
  assert.ok(ok, '两条日志均已写入')
  assert.equal(fs.existsSync(path.join(dir, 'app.old.log')), false, '未超限不轮转')

  destroyAllLoggers()
  fs.rmSync(dir, { recursive: true, force: true })
})
