/**
 * Prepared Statement 缓存
 *
 * 问题：better-sqlite3 的 prepare() 每次调用都会编译 SQL。
 * 热点路径（对话生成、情绪/关系更新）在单次会话中反复执行相同 SQL，
 * 却每次都重新 prepare，造成不必要的编译开销。
 *
 * 方案：以 Database 实例为键缓存 Statement。使用 WeakMap，
 * 当连接被 LRU 淘汰并关闭后，其缓存的 Statement 会随 GC 自动释放，
 * 无需手动清理。
 *
 * 安全性：better-sqlite3 的 prepare 是同步且幂等的，
 * 缓存同一个 db + sql 对应的 Statement 实例是安全的。
 */

// Database 实例 → (SQL 字符串 → Statement)
const cache = new WeakMap()

/**
 * 获取（或创建并缓存）prepared statement
 * @param {import('better-sqlite3').Database} db - 数据库连接
 * @param {string} sql - SQL 语句
 * @returns {import('better-sqlite3').Statement} 已编译的 Statement
 */
export function prepareCached(db, sql) {
  let stmtMap = cache.get(db)
  if (!stmtMap) {
    stmtMap = new Map()
    cache.set(db, stmtMap)
  }
  let stmt = stmtMap.get(sql)
  if (!stmt) {
    stmt = db.prepare(sql)
    stmtMap.set(sql, stmt)
  }
  return stmt
}
