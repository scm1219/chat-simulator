/**
 * 配置目录工具
 * 确保配置文件所在目录存在，供多个配置模块共享
 */
import fs from 'fs'
import path from 'path'

/**
 * 确保指定文件路径的父目录存在
 * @param {string} filePath - 文件路径（取其 dirname 作为目标目录）
 */
export function ensureConfigDir(filePath) {
  const configDir = path.dirname(filePath)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}
