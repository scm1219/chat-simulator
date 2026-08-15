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

/**
 * 转义正则表达式特殊字符（用于将任意字符串安全拼接为 RegExp 字面量片段）
 * @param {string} string - 原始字符串
 * @returns {string} 转义后的字符串
 */
export const escapeRegExp = (string) => String(string ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * 剥离 @提及 捕获段中的标点与空白（用于角色名解析）
 * @提及 正则捕获到首个空白为止，会连带句中标点及其后内容（如"张三，你觉得呢"），
 * 因此从首个中英文标点处截断，再去除尾部空白
 * @param {string} string - 原始字符串
 * @returns {string} 清洗后的角色名
 */
export function stripMentionPunctuation(string) {
  return String(string ?? '')
    .replace(/[，。！？,.!?:：;；、~—…].*$/, '')
    .replace(/\s+$/, '')
}
