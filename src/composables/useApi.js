import { ref } from 'vue'
import { createLogger } from '../utils/logger.js'

/**
 * 统一 IPC API 调用 composable
 * 封装 loading 状态、result.success 检查、错误日志
 */
export function useApi(label) {
  const loading = ref(false)
  const log = label ? createLogger(label) : null

  /**
   * 加载型调用：设置 loading，失败不抛异常
   * 适用于 loadXxx 方法
   */
  async function load(fn) {
    loading.value = true
    try {
      const result = await fn()
      if (result.success) return result.data
      log?.error('加载失败:', result.error)
      return null
    } catch (error) {
      log?.error('加载失败:', error)
      return null
    } finally {
      loading.value = false
    }
  }

  /**
   * 操作型调用：失败时抛异常
   * 适用于 create/update/delete 方法
   */
  async function call(fn) {
    try {
      const result = await fn()
      if (result.success) return result.data
      throw new Error(result.error)
    } catch (error) {
      log?.error('操作失败:', error)
      throw error
    }
  }

  /**
   * 简易调用：仅检查 success，不抛异常，不 log
   * 适用于 narrative 等轻量场景
   */
  async function silent(fn) {
    try {
      const result = await fn()
      return result.success ? result : null
    } catch {
      return null
    }
  }

  return { loading, load, call, silent }
}
