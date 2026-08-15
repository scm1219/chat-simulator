/**
 * 时间戳工具
 *
 * nowTimestampMs 生成 UTC 毫秒级时间戳字符串（YYYY-MM-DD HH:MM:SS.mmm）。
 * 与 SQLite CURRENT_TIMESTAMP 生成的秒级存量字符串（YYYY-MM-DD HH:MM:SS，UTC）
 * 字典序兼容：同秒内带毫秒者更大、跨秒顺序正确，因此无需数据迁移，
 * ORDER BY timestamp 及字符串比较在混合数据下仍正确。
 */
export function nowTimestampMs() {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getMilliseconds(), 3)}`
}
