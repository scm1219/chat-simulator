/**
 * 渲染进程统一日志模块
 * 支持日志级别、DevTools Console 带样式输出
 * 无文件写入能力（渲染进程限制），可选 IPC 桥接到主进程
 */

// 日志级别枚举
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

// DevTools Console 样式
const STYLES = {
  DEBUG: 'color: #00bcd4; font-weight: bold', // 青色
  INFO: 'color: #4caf50; font-weight: bold',   // 绿色
  WARN: 'color: #ff9800; font-weight: bold',   // 橙色
  ERROR: 'color: #f44336; font-weight: bold'    // 红色
}

/**
 * 判断当前是否开发模式
 */
function isDev() {
  return import.meta.env?.DEV ?? false
}

/**
 * 获取当前日志级别
 * 优先读取 localStorage，开发模式默认 DEBUG，生产模式默认 WARN
 */
function resolveLogLevel() {
  try {
    const stored = localStorage.getItem('LOG_LEVEL')?.toUpperCase()
    if (stored && LEVELS[stored] !== undefined) return LEVELS[stored]
  } catch {
    // localStorage 不可用时忽略
  }
  return isDev() ? LEVELS.DEBUG : LEVELS.WARN
}

/**
 * Logger 核心类
 */
class Logger {
  constructor(moduleName) {
    this.module = moduleName
    this.level = resolveLogLevel()
  }

  /**
   * 核心写入方法
   */
  _write(level, args) {
    if (LEVELS[level] < this.level) return

    const prefix = `%c[${level}]%c [${this.module}]`
    const style = STYLES[level] || ''
    const reset = 'color: inherit; font-weight: normal'

    const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
    consoleFn(prefix, style, reset, ...args)
  }

  debug(...args) { this._write('DEBUG', args) }
  info(...args) { this._write('INFO', args) }
  warn(...args) { this._write('WARN', args) }
  error(...args) { this._write('ERROR', args) }
}

// 模块级缓存
const _instances = new Map()

/**
 * 创建（或获取缓存的）Logger 实例
 * @param {string} moduleName - 模块名称，如 'GroupsStore'、'ChatWindow'
 * @returns {Logger}
 */
export function createLogger(moduleName) {
  if (_instances.has(moduleName)) return _instances.get(moduleName)
  const logger = new Logger(moduleName)
  _instances.set(moduleName, logger)
  return logger
}
