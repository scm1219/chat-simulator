/**
 * 安全存储工具
 * 使用 Electron safeStorage 加密 API Key 等敏感信息
 * 兼容策略：safeStorage 不可用或解密失败（旧版明文数据）时原样返回，不做迁移阻断
 */
import { safeStorage } from 'electron'
import { createLogger } from './logger.js'

const log = createLogger('SecureStorage')

/**
 * 加密明文密钥（用于写入存储前）
 * 注意：仅对"来自渲染进程的新明文输入"调用；来自存储旧值的回写不得再次加密
 * @param {string|null|undefined} plain - 明文密钥
 * @returns {string|null|undefined} Base64 密文；不可用/失败时原样返回（保持明文兼容）
 */
export function encryptSecret(plain) {
  if (plain == null || plain === '') return plain
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(String(plain)).toString('base64')
    }
    log.warn('safeStorage 不可用，API Key 将以明文存储')
  } catch (error) {
    log.warn('加密失败，保持明文存储:', error.message)
  }
  return plain
}

/**
 * 解密密文密钥（用于读取存储后）
 * 旧版明文数据：Base64 解密失败时原样返回
 * @param {string|null|undefined} stored - 存储中的密钥（Base64 密文或旧版明文）
 * @returns {string|null|undefined} 明文密钥
 */
export function decryptSecret(stored) {
  if (stored == null || stored === '') return stored
  try {
    const buf = Buffer.from(String(stored), 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
  } catch {
    // 旧版明文数据：解密失败，原样返回
  }
  return stored
}
