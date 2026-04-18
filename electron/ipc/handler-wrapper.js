/**
 * IPC Handler 包装器
 * 统一 try/catch 错误处理，消除每个 handler 的样板代码
 */

/**
 * 创建带统一错误处理的 IPC Handler
 * @param {Function} handler - 业务逻辑函数，签名 (event, ...args) => result
 * @param {string} [label] - 可选错误日志标签（如 'Group:create'），传入则自动 console.error
 * @returns {Function} 包装后的 async 函数，直接传给 ipcMain.handle
 */
export function createHandler(handler, label) {
  return async (event, ...args) => {
    try {
      return await handler(event, ...args)
    } catch (error) {
      if (label) console.error(`[${label}]`, error.message)
      return { success: false, error: error.message }
    }
  }
}
