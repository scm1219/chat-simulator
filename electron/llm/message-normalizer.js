/**
 * 消息列表规范化
 * 供所有 OpenAI 协议类客户端共用
 */

/**
 * 规范化消息列表：合并所有 system 消息并置顶
 * 许多后端（vLLM、llama.cpp、本地模型 Jinja 模板）要求 system 消息
 * 只能出现在开头（且通常仅允许一条），否则报 400
 * （"System message must be at the beginning"）
 * @param {Array} messages - 原始消息列表
 * @returns {Array} 规范化后的消息列表（system 合并为一条置顶）
 */
export function normalizeSystemMessages(messages) {
  const systemParts = []
  const rest = []
  for (const msg of messages) {
    if (msg.role === 'system') {
      // 空 system 消息一并丢弃：留在中置位置同样会触发严格后端的 400
      if (msg.content) systemParts.push(msg.content)
    } else {
      rest.push(msg)
    }
  }
  if (systemParts.length === 0) return rest.length === messages.length ? messages : rest
  return [{ role: 'system', content: systemParts.join('\n\n') }, ...rest]
}
