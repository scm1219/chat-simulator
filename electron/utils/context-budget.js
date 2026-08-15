/**
 * 上下文字符预算工具
 * 防止上下文无限增长触发供应商 context length 错误：
 * 系统段（提示词/人设/记忆/背景）保留，历史消息按预算截断（保最新丢最旧）。
 */

/** 默认上下文预算（字符数）。粗略对应 6k~12k token，主流供应商模型均可容纳。 */
export const DEFAULT_CONTEXT_BUDGET_CHARS = 24000

/**
 * 累加多段字符串的字符长度（null/undefined 计 0）
 * @param {Array<string|null|undefined>} parts
 * @returns {number} 总字符数
 */
export const sumChars = (parts) => parts.reduce((n, s) => n + String(s ?? '').length, 0)

/**
 * 将消息截断到指定字符预算内：从最旧开始丢弃，保最新，至少保留一条
 * @param {Array<{content: string}>} messages - 消息列表（按时间从旧到新）
 * @param {number} budgetChars - 字符预算
 * @returns {Array} 截断后的消息列表（新数组，不修改入参）
 */
export function truncateMessagesToBudget(messages, budgetChars = DEFAULT_CONTEXT_BUDGET_CHARS) {
  let total = sumChars(messages.map(m => m.content))
  const out = [...messages]
  while (total > budgetChars && out.length > 1) { // 至少保留最新一条
    total -= String(out.shift().content ?? '').length
  }
  return out
}
