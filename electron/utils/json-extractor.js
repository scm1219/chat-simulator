/**
 * 从 LLM 响应中提取 JSON
 *
 * LLM 可能返回以下格式：
 * 1. 纯 JSON：{"name": "..."}
 * 2. Markdown 代码块：```json\n{...}\n```
 * 3. 代码块变体：``` \n{...}\n```
 * 4. JSON 前后带额外文字
 * 5. 被截断的 JSON（max_tokens 不够）
 */

/**
 * 从 LLM 响应文本中提取并解析 JSON
 * @param {string} raw - LLM 原始响应文本
 * @returns {{ success: boolean, data?: any, error?: string }}
 */
function extractJSON (raw) {
  if (!raw || typeof raw !== 'string') {
    return { success: false, error: '响应内容为空' }
  }

  const text = raw.trim()

  // 策略 1：提取 markdown 代码块中的内容（```json ... ``` 或 ``` ... ```）
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    const parsed = tryParse(codeBlockMatch[1].trim())
    if (parsed.success) return parsed
  }

  // 策略 2：直接解析整段文本
  const direct = tryParse(text)
  if (direct.success) return direct

  // 策略 3：移除 markdown 标记后再试（处理 startsWith("```") 但没有闭合的情况）
  const cleaned = text
    .replace(/^```(?:json)?\s*\n?/, '')
    .replace(/\n?\s*```$/, '')
    .trim()
  if (cleaned !== text) {
    const cleanedParse = tryParse(cleaned)
    if (cleanedParse.success) return cleanedParse
  }

  // 策略 4：从文本中查找第一个 { 到最后一个 } 之间的内容
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const extracted = text.substring(firstBrace, lastBrace + 1)
    const extractedParse = tryParse(extracted)
    if (extractedParse.success) return extractedParse

    // 策略 5：尝试修复截断的 JSON
    const repaired = tryRepairJSON(extracted)
    if (repaired) return { success: true, data: repaired }
  }

  return { success: false, error: '无法从响应中提取有效 JSON' }
}

/**
 * 尝试解析 JSON 字符串
 * @param {string} str
 * @returns {{ success: boolean, data?: any }}
 */
function tryParse (str) {
  try {
    return { success: true, data: JSON.parse(str) }
  } catch {
    return { success: false }
  }
}

/**
 * 尝试修复被截断的 JSON
 * 适用于 LLM 输出被 max_tokens 截断的情况
 * @param {string} str
 * @returns {any|null}
 */
function tryRepairJSON (str) {
  try {
    // 计算未闭合的括号/方括号数量
    let openBraces = 0
    let openBrackets = 0
    let inString = false
    let escape = false

    for (let i = 0; i < str.length; i++) {
      const ch = str[i]
      if (escape) {
        escape = false
        continue
      }
      if (ch === '\\') {
        if (inString) escape = true
        continue
      }
      if (ch === '"') {
        inString = !inString
        continue
      }
      if (inString) continue

      if (ch === '{') openBraces++
      else if (ch === '}') openBraces--
      else if (ch === '[') openBrackets++
      else if (ch === ']') openBrackets--
    }

    // 如果在字符串中被截断，先闭合字符串
    let repaired = str
    if (inString) {
      repaired += '"'
    }

    // 处理被截断的转义序列（如 \n 被截断为 \）
    repaired = repaired.replace(/\\$/, '')

    // 闭合所有未闭合的括号和方括号
    repaired += ']'.repeat(Math.max(0, openBrackets))
    repaired += '}'.repeat(Math.max(0, openBraces))

    return JSON.parse(repaired)
  } catch {
    return null
  }
}

module.exports = { extractJSON }
