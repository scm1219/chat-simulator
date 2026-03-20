/**
 * 代理配置管理
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

const PROXY_CONFIG_FILE = path.join(app.getPath('userData'), 'config', 'proxy-config.json')

/**
 * 默认代理配置
 */
const DEFAULT_PROXY_CONFIG = {
  enabled: false,
  protocol: 'http', // http | https | socks5
  host: '',
  port: 8080,
  username: '',
  password: ''
}

/**
 * 确保配置目录存在
 */
function ensureConfigDir() {
  const configDir = path.dirname(PROXY_CONFIG_FILE)
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true })
  }
}

/**
 * 获取代理配置
 */
export function getProxyConfig() {
  try {
    if (fs.existsSync(PROXY_CONFIG_FILE)) {
      const data = fs.readFileSync(PROXY_CONFIG_FILE, 'utf-8')
      return { ...DEFAULT_PROXY_CONFIG, ...JSON.parse(data) }
    }
  } catch (error) {
    console.error('Failed to load proxy config:', error)
  }
  return { ...DEFAULT_PROXY_CONFIG }
}

/**
 * 保存代理配置
 */
export function saveProxyConfig(config) {
  try {
    ensureConfigDir()
    fs.writeFileSync(PROXY_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    console.error('Failed to save proxy config:', error)
    return false
  }
}

/**
 * 构建 Axios 代理配置
 */
export function buildAxiosProxyConfig(proxyConfig) {
  if (!proxyConfig || !proxyConfig.enabled) {
    return undefined
  }

  const { protocol, host, port, username, password } = proxyConfig

  if (!host || !port) {
    return undefined
  }

  const proxyUrl = username && password
    ? `${protocol}://${username}:${password}@${host}:${port}`
    : `${protocol}://${host}:${port}`

  return {
    protocol: protocol === 'socks5' ? 'socks5' : undefined,
    host: host,
    port: port,
    auth: username && password ? {
      username: username,
      password: password
    } : undefined
  }
}
