/**
 * 流式 chunk 批处理器（主进程侧）
 *
 * 问题：OpenAI SSE 流式可能每秒几十个 token，逐 chunk 通过 IPC 发送
 * 会导致大量跨进程通信开销（每次都有序列化 + 调度成本）。
 *
 * 方案：按 tempId 聚合 chunk，以固定间隔（默认 50ms）批量发送一次 IPC，
 * 将 N 次 chunk 事件压缩为 N/（interval × 频率）次，显著降低 IPC 开销。
 *
 * 保证：
 * - 最终内容完整：flush() 在流结束/错误时被调用，确保不丢数据
 * - 顺序正确：每个 tempId 内部按到达顺序累积
 * - 低延迟：50ms 间隔对人眼几乎无感知
 */
import { createLogger } from './logger.js'

const log = createLogger('StreamBatcher')

// 默认刷新间隔（毫秒）
const DEFAULT_FLUSH_INTERVAL = 50

export class StreamBatcher {
  /**
   * @param {Function} sender - 发送函数，签名为 (payload) => void
   *   payload 形如 { tempId, type, content }
   * @param {number} [flushInterval=50] - 批量刷新间隔（毫秒）
   */
  constructor(sender, flushInterval = DEFAULT_FLUSH_INTERVAL) {
    this._sender = sender
    this._flushInterval = flushInterval

    // tempId → { type, content } 累积缓冲
    this._buffers = new Map()
    this._timer = null
  }

  /**
   * 添加一个 chunk 到批处理队列
   * @param {string} tempId - 临时消息 ID
   * @param {string} type - 'reasoning' | 'content'
   * @param {string} content - chunk 内容
   */
  add(tempId, type, content) {
    const buf = this._buffers.get(tempIdId(tempId, type))
    if (buf) {
      buf.content += content
    } else {
      this._buffers.set(tempIdId(tempId, type), { tempId, type, content })
    }

    // 延迟启动定时器（首个 chunk 触发）
    if (!this._timer) {
      this._timer = setTimeout(() => this.flush(), this._flushInterval)
      // 定时器不阻止进程退出
      if (this._timer.unref) this._timer.unref()
    }
  }

  /**
   * 立即发送所有累积的 chunk，并清除定时器
   */
  flush() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }

    if (this._buffers.size === 0) return

    // 按 tempId+type 聚合发送
    for (const buf of this._buffers.values()) {
      try {
        this._sender({ tempId: buf.tempId, type: buf.type, content: buf.content })
      } catch (err) {
        log.error('批量发送 chunk 失败:', err.message)
      }
    }
    this._buffers.clear()
  }

  /**
   * 销毁批处理器，清理定时器（不 flush）
   */
  destroy() {
    if (this._timer) {
      clearTimeout(this._timer)
      this._timer = null
    }
    this._buffers.clear()
  }
}

/**
 * 生成 tempId+type 的复合键
 */
function tempIdId(tempId, type) {
  return `${tempId}:${type}`
}
