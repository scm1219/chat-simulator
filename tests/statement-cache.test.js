import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prepareCached } from '../electron/utils/statement-cache.js'

// 说明：better-sqlite3 原生模块经 electron-rebuild 编译为 Electron ABI，
// 纯 Node 测试进程无法加载（ERR_DLOPEN_FAILED）。
// prepareCached 仅依赖 db.prepare 的存在性与对象身份（WeakMap 键），
// 因此用鸭子类型 fake db 覆盖缓存逻辑；SQL 执行语义由 better-sqlite3 自身保证。
function makeFakeDb() {
  const prepared = []
  return {
    prepareCount: 0,
    prepared,
    prepare(sql) {
      this.prepareCount++
      const stmt = { sql }
      prepared.push(stmt)
      return stmt
    }
  }
}

test('同一 db + 同一 SQL 返回同一 Statement 实例（命中缓存不重复 prepare）', () => {
  const db = makeFakeDb()
  const s1 = prepareCached(db, 'SELECT * FROM t WHERE id = ?')
  const s2 = prepareCached(db, 'SELECT * FROM t WHERE id = ?')
  assert.ok(s1 === s2, '应返回同一实例')
  assert.equal(db.prepareCount, 1, '底层仅编译一次')
})

test('同一 db 不同 SQL 生成不同 Statement', () => {
  const db = makeFakeDb()
  const s1 = prepareCached(db, 'SELECT * FROM t WHERE id = ?')
  const s2 = prepareCached(db, 'SELECT v FROM t')
  assert.notEqual(s1, s2)
  assert.equal(db.prepareCount, 2)
})

test('不同 db 实例互不共享缓存（WeakMap 按连接隔离）', () => {
  const db1 = makeFakeDb()
  const db2 = makeFakeDb()
  const sql = 'SELECT * FROM t'
  const s1 = prepareCached(db1, sql)
  const s2 = prepareCached(db2, sql)
  assert.notEqual(s1, s2)
  assert.ok(prepareCached(db1, sql) === s1, 'db1 缓存不受 db2 影响')
  assert.equal(db1.prepareCount, 1)
  assert.equal(db2.prepareCount, 1)
})
