import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { atomicWriteJson } from '../electron/utils/atomic-write.js'

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atomic-write-'))
  return path.join(dir, name)
}

test('atomicWriteJson 写入新文件并格式化为 2 空格缩进 JSON', () => {
  const file = tmpFile('config.json')
  atomicWriteJson(file, { a: 1, b: '中文' })

  const content = fs.readFileSync(file, 'utf-8')
  assert.equal(content, '{\n  "a": 1,\n  "b": "中文"\n}')
  assert.deepEqual(JSON.parse(content), { a: 1, b: '中文' })
})

test('atomicWriteJson 覆盖已存在文件（Windows rename 可替换目标）', () => {
  const file = tmpFile('config.json')
  fs.writeFileSync(file, '{"old": true}')

  atomicWriteJson(file, { new: 1 })

  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf-8')), { new: 1 })
})

test('atomicWriteJson 成功后不残留 .tmp 文件', () => {
  const file = tmpFile('config.json')
  atomicWriteJson(file, { a: 1 })

  assert.equal(fs.existsSync(`${file}.tmp`), false)
})
