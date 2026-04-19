/**
 * 主进程统一日志模块
 * 支持日志级别、Console 带颜色输出、文件持久化、按日期切割
 * 所有 Logger 实例共享同一个文件写入流，避免多实例并发写入同一文件
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

// 日志级别枚举
const LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
}

// ANSI 颜色（Console 输出用）
const COLORS = {
  DEBUG: '\x1b[36m', // 青色
  INFO: '\x1b[32m',  // 绿色
  WARN: '\x1b[33m',  // 黄色
  ERROR: '\x1b[31m', // 红色
  RESET: '\x1b[0m',
  DIM: '\x1b[2m',
  BRIGHT: '\x1b[1m'
}

// 配置常量
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_RETAIN_DAYS = 7

/**
 * 获取当前日志级别
 * 环境变量 LOG_LEVEL 优先，开发模式默认 DEBUG，生产模式默认 WARN
 */
function resolveLogLevel() {
  const env = process.env.LOG_LEVEL?.toUpperCase()
  if (env && LEVELS[env] !== undefined) return LEVELS[env]
  const isDev = process.env.NODE_ENV === 'development' || !app?.isPackaged
  return isDev ? LEVELS.DEBUG : LEVELS.WARN
}

/**
 * 格式化时间戳
 */
function timestamp() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const ms = String(d.getMilliseconds()).padStart(3, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${ms}`
}

/**
 * 获取日志目录路径
 */
function getLogDir() {
  const userDataPath = app.getPath('userData')
  return path.join(userDataPath, 'logs')
}

/**
 * 获取当天日志文件名
 */
function getLogFileName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `app-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`
}

// 模块级共享文件流状态（所有 Logger 实例共用一个写入流）
let _sharedStream = null
let _sharedCurrentFile = null
let _dirInitialized = false
let _logDir = null

/**
 * 确保日志目录存在（仅执行一次）
 */
function _ensureLogDir() {
  if (_dirInitialized) return
  _logDir = getLogDir()
  fs.mkdirSync(_logDir, { recursive: true })
  _dirInitialized = true
}

/**
 * 获取或创建共享文件写入流
 * 所有 Logger 实例共享同一个流，避免多实例并发写入同一文件
 */
function _getSharedStream() {
  _ensureLogDir()
  const fileName = getLogFileName()
  const filePath = path.join(_logDir, fileName)

  // 文件名变化（日期切换）时关闭旧流
  if (_sharedStream && _sharedCurrentFile !== fileName) {
    _sharedStream.end()
    _sharedStream = null
  }

  if (!_sharedStream) {
    _sharedStream = fs.createWriteStream(filePath, { flags: 'a' })
    _sharedCurrentFile = fileName
    _cleanOldLogs()
  }

  // 检查文件大小，超限则截断重建
  try {
    const stat = fs.statSync(filePath)
    if (stat.size > MAX_FILE_SIZE) {
      _sharedStream.end()
      const backupPath = filePath.replace('.log', '.old.log')
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
      fs.renameSync(filePath, backupPath)
      _sharedStream = fs.createWriteStream(filePath, { flags: 'a' })
    }
  } catch {
    // 文件不存在等异常忽略
  }

  return _sharedStream
}

/**
 * 清理过期日志文件（超过 MAX_RETAIN_DAYS 天）
 */
function _cleanOldLogs() {
  try {
    const files = fs.readdirSync(_logDir)
    const now = Date.now()
    const retentionMs = MAX_RETAIN_DAYS * 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.startsWith('app-') || !file.endsWith('.log')) continue
      const filePath = path.join(_logDir, file)
      try {
        const stat = fs.statSync(filePath)
        if (now - stat.mtimeMs > retentionMs) {
          fs.unlinkSync(filePath)
        }
      } catch {
        // 单文件清理失败不影响整体
      }
    }
  } catch {
    // 目录不存在等忽略
  }
}

/**
 * Logger 核心类
 * 每个实例仅持有模块名和日志级别，文件写入通过模块级共享流完成
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

    const msg = args.map(a => (typeof a === 'string' ? a : (a instanceof Error ? a.stack || a.message : String(a)))).join(' ')
    const ts = timestamp()
    const line = `${ts} [${level}] [${this.module}] ${msg}`

    // Console 输出
    const consoleFn = level === 'ERROR' ? console.error : level === 'WARN' ? console.warn : console.log
    const color = COLORS[level] || ''
    consoleFn(`${COLORS.DIM}${ts}${COLORS.RESET} ${color}${COLORS.BRIGHT}[${level}]${COLORS.RESET} ${COLORS.BRIGHT}[${this.module}]${COLORS.RESET} ${msg}`)

    // 文件输出（通过共享流，异步，不阻塞主流程）
    try {
      const stream = _getSharedStream()
      if (stream?.writable) {
        stream.write(line + '\n')
      }
    } catch {
      // 文件写入失败不影响运行
    }
  }

  debug(...args) { this._write('DEBUG', args) }
  info(...args) { this._write('INFO', args) }
  warn(...args) { this._write('WARN', args) }
  error(...args) { this._write('ERROR', args) }
}

// 模块级缓存，同模块名复用实例
const _instances = new Map()

/**
 * 创建（或获取缓存的）Logger 实例
 * @param {string} moduleName - 模块名称，如 'Database'、'LLM'
 * @returns {Logger}
 */
export function createLogger(moduleName) {
  if (_instances.has(moduleName)) return _instances.get(moduleName)
  const logger = new Logger(moduleName)
  _instances.set(moduleName, logger)
  return logger
}

/**
 * 销毁共享文件流和所有 Logger 实例（应用退出时调用一次）
 */
export function destroyAllLoggers() {
  // 关闭共享文件流
  if (_sharedStream) {
    _sharedStream.end()
    _sharedStream = null
  }
  _sharedCurrentFile = null
  _dirInitialized = false
  _instances.clear()
}
