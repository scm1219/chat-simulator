/**
 * 主进程统一日志模块
 * 支持日志级别、Console 带颜色输出、文件持久化、按日期切割
 * 所有 Logger 实例按目标文件共享写入流，避免多实例并发写入同一文件
 *
 * 可测试性：
 * - electron 依赖惰性获取（纯 Node 环境 import 不报错，文件输出自动禁用）
 * - createLogger(name, filePath?, options?) 支持注入日志文件路径与轮转阈值
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'node:module'

const nodeRequire = createRequire(import.meta.url)

// 惰性获取 electron app：纯 Node（测试）环境下 require('electron') 返回
// 可执行文件路径字符串而非 app 对象，此时返回 null 并禁用默认文件输出
let _electronApp
function getElectronApp() {
  if (_electronApp !== undefined) return _electronApp
  try {
    const m = nodeRequire('electron')
    _electronApp = m && typeof m.getPath === 'function' ? m : null
  } catch {
    _electronApp = null
  }
  return _electronApp
}

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
  const isDev = process.env.NODE_ENV === 'development' || !getElectronApp()?.isPackaged
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
 * 获取当天日志文件名
 */
function getLogFileName() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `app-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`
}

// 模块级文件流状态：目标文件路径 → 状态对象
// { stream, bytesWritten, maxSize, pending, rotating }
// 同一文件的所有 Logger 实例共享一个流；bytesWritten 为内存字节计数，
// 仅在流创建时 statSync 一次校准，之后不再每条日志 stat
const _fileStates = new Map()

/**
 * 清理过期日志文件（超过 MAX_RETAIN_DAYS 天）
 */
function _cleanOldLogs(logDir) {
  try {
    const files = fs.readdirSync(logDir)
    const now = Date.now()
    const retentionMs = MAX_RETAIN_DAYS * 24 * 60 * 60 * 1000

    for (const file of files) {
      if (!file.startsWith('app-') || !file.endsWith('.log')) continue
      const filePath = path.join(logDir, file)
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
 * 获取（或创建）目标文件的写入状态
 */
function _getFileState(filePath, maxSize) {
  let st = _fileStates.get(filePath)
  if (!st) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    let initialSize = 0
    try {
      initialSize = fs.statSync(filePath).size // 仅创建流时校准一次
    } catch {
      // 文件尚不存在
    }
    st = {
      filePath,
      maxSize,
      stream: fs.createWriteStream(filePath, { flags: 'a' }),
      bytesWritten: initialSize,
      pending: [],
      rotating: false
    }
    _fileStates.set(filePath, st)
    if (initialSize > maxSize) {
      _rotate(st) // 启动时已超限，立即轮转
    }
  }
  return st
}

/**
 * 追加一行日志（超限时先触发轮转；轮转期间的写入暂存 pending）
 */
function _appendLine(st, line) {
  const len = Buffer.byteLength(line)
  if (!st.rotating && st.bytesWritten + len > st.maxSize) {
    _rotate(st)
  }
  if (st.stream && st.stream.writable) {
    st.stream.write(line)
    st.bytesWritten += len
  } else {
    st.pending.push(line)
  }
}

/**
 * 轮转：先 end 关闭旧流（释放句柄），在 end 回调内 rename，
 * 避免 Windows 上句柄未释放导致 EPERM；rename 失败时降级 truncate
 */
function _rotate(st) {
  const old = st.stream
  st.stream = null
  st.bytesWritten = 0
  st.rotating = true
  if (old) {
    old.end(() => _finishRotate(st))
  } else {
    _finishRotate(st)
  }
}

function _finishRotate(st) {
  const backupPath = st.filePath.replace(/\.log$/, '.old.log')
  try {
    if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
    fs.renameSync(st.filePath, backupPath) // 旧流已关闭，Windows 可安全 rename
  } catch {
    try {
      fs.truncateSync(st.filePath, 0) // rename 失败降级为清空当前文件
    } catch {
      // 彻底失败则放弃本次轮转，保留当前文件继续追加
    }
  }
  st.rotating = false
  st.stream = fs.createWriteStream(st.filePath, { flags: 'a' })
  // 补写轮转期间暂存的日志
  for (const line of st.pending) {
    st.stream.write(line)
    st.bytesWritten += Buffer.byteLength(line)
  }
  st.pending = []
}

/**
 * Logger 核心类
 * 每个实例仅持有模块名、日志级别与目标文件，文件写入通过共享流完成
 */
class Logger {
  /**
   * @param {string} moduleName - 模块名称
   * @param {string} [filePath] - 显式日志文件路径（测试注入用）；缺省时按 electron userData + 日期自动生成
   * @param {{ maxSize?: number }} [options] - maxSize 轮转阈值（字节），缺省 5MB
   */
  constructor(moduleName, filePath, options) {
    this.module = moduleName
    this.level = resolveLogLevel()
    this._explicitFile = filePath || null
    this._maxSize = options?.maxSize || MAX_FILE_SIZE
    this._lastAutoPath = null
  }

  /**
   * 解析本次写入的目标文件路径（显式路径固定；默认路径按日期变化，
   * 日期切换时关闭旧流，与既有按日切割行为一致）
   */
  _resolveFilePath() {
    if (this._explicitFile) return this._explicitFile
    const app = getElectronApp()
    if (!app) return null // 纯 Node 环境无 electron，禁用默认文件输出
    const logDir = path.join(app.getPath('userData'), 'logs')
    const fileName = getLogFileName()
    const filePath = path.join(logDir, fileName)
    if (this._lastAutoPath && this._lastAutoPath !== filePath) {
      const prev = _fileStates.get(this._lastAutoPath)
      if (prev) {
        if (prev.stream) prev.stream.end()
        _fileStates.delete(this._lastAutoPath)
      }
      _cleanOldLogs(logDir)
    }
    if (!this._lastAutoPath) {
      _cleanOldLogs(logDir)
    }
    this._lastAutoPath = filePath
    return filePath
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

    // 文件输出（异步，不阻塞主流程）
    try {
      const filePath = this._resolveFilePath()
      if (!filePath) return
      const st = _getFileState(filePath, this._maxSize)
      _appendLine(st, line + '\n')
    } catch {
      // 文件写入失败不影响运行
    }
  }

  debug(...args) { this._write('DEBUG', args) }
  info(...args) { this._write('INFO', args) }
  warn(...args) { this._write('WARN', args) }
  error(...args) { this._write('ERROR', args) }
}

// 模块级缓存，同模块名（+目标文件）复用实例
const _instances = new Map()

/**
 * 创建（或获取缓存的）Logger 实例
 * @param {string} moduleName - 模块名称，如 'Database'、'LLM'
 * @param {string} [filePath] - 显式日志文件路径（可选，测试注入）
 * @param {{ maxSize?: number }} [options] - 轮转阈值等选项（可选）
 * @returns {Logger}
 */
export function createLogger(moduleName, filePath, options) {
  const key = filePath ? `${moduleName}::${filePath}` : moduleName
  if (_instances.has(key)) return _instances.get(key)
  const logger = new Logger(moduleName, filePath, options)
  _instances.set(key, logger)
  return logger
}

/**
 * 销毁所有共享文件流和 Logger 实例（应用退出或测试清理时调用）
 */
export function destroyAllLoggers() {
  for (const st of _fileStates.values()) {
    if (st.stream) st.stream.end()
  }
  _fileStates.clear()
  _instances.clear()
}
