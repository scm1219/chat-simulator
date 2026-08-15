/**
 * 简单的 UUID 生成器
 */
import { randomUUID } from 'node:crypto'

export function generateUUID() {
  return randomUUID()
}
