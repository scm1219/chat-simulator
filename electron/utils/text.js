/**
 * 文本处理工具函数
 */

/**
 * 转义 SQL LIKE 模式中的通配符（配合 ESCAPE '\' 子句使用）
 * 将 %、_ 和转义符 \ 本身前置反斜杠，使其按字面量匹配
 * @param {string} keyword - 原始关键词
 * @returns {string} 转义后的关键词
 */
export function escapeLike(keyword) {
  return String(keyword ?? '').replace(/[\\%_]/g, (m) => '\\' + m)
}
