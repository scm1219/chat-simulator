/**
 * 通用表单验证工具
 */
export const required = (msg = '此项不能为空') => (v) =>
  (v !== undefined && v !== null && String(v).trim().length > 0) ? '' : msg

export const maxLength = (max, msg) => (v) =>
  (!v || v.length <= max) ? '' : (msg || `不能超过${max}个字符`)

export const minLength = (min, msg) => (v) =>
  (v && v.trim().length >= min) ? '' : (msg || `至少需要${min}个字符`)

export const compose = (...rules) => (v) => {
  for (const rule of rules) {
    const error = rule(v)
    if (error) return error
  }
  return ''
}

export const validate = (form, schema) => {
  const errors = {}
  let valid = true
  for (const [field, rules] of Object.entries(schema)) {
    const error = compose(...rules)(form[field])
    if (error) {
      errors[field] = error
      valid = false
    }
  }
  return { valid, errors }
}
