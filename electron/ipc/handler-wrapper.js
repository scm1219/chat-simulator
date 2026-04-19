/**
 * IPC Handler 包装器
 * 统一 try/catch 错误处理，消除每个 handler 的样板代码
 */
import { createLogger } from '../utils/logger.js'

const log = createLogger('IPC')

/**
 * 创建带统一错误处理的 IPC Handler
 * @param {Function} handler - 业务逻辑函数，签名 (event, ...args) => result
 * @param {string} [label] - 可选错误日志标签（如 'Group:create'），传入则自动记录错误
 * @returns {Function} 包装后的 async 函数，直接传给 ipcMain.handle
 */
export function createHandler(handler, label) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      if (label) log.error(`[${label}]`, error.message)
      return { success: false, error: error.message }
    }
  }
}

/**
 * 构建动态 UPDATE 语句并执行
 * 根据前端传入的字段自动生成 SET 子句，跳过 undefined 字段
 * @param {object} db - better-sqlite3 数据库实例
 * @param {string} table - 表名（必须在白名单内）
 * @param {object} data - 前端传入的数据（camelCase）
 * @param {Array<Array<string>>} fieldMap - 字段映射 [[前端key, 数据库列名], ...]
 *   支持 transform 回调：[前端key, 数据库列名, (val) => transformedVal]
 * @param {string} id - WHERE 条件的 ID 值
 * @returns {boolean} 是否有字段被更新
 */
const ALLOWED_TABLES = new Set(['groups', 'characters', 'global_characters', 'tags', 'messages'])

// 合法列名正则：仅允许字母、数字、下划线
const SAFE_COL_NAME = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export function buildDynamicUpdate(db, table, data, fieldMap, id) {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`buildDynamicUpdate: 不允许的表名 "${table}"`)
  }

  const updates = []
  const values = []

  for (const entry of fieldMap) {
    const [dataKey, colName, transform] = entry
    if (data[dataKey] !== undefined) {
      if (!SAFE_COL_NAME.test(colName)) {
        throw new Error(`buildDynamicUpdate: 非法列名 "${colName}"`)
      }
      updates.push(`${colName} = ?`)
      values.push(transform ? transform(data[dataKey]) : data[dataKey])
    }
  }

  if (updates.length === 0) return false

  values.push(id)
  db.prepare(`UPDATE ${table} SET ${updates.join(', ')} WHERE id = ?`).run(...values)
  return true
}

