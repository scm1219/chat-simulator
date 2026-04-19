/**
 * 代理配置管理
 */
import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import { ensureConfigDir } from '../utils/config-dir.js'
import { createLogger } from '../utils/logger.js'

const log = createLogger('Proxy')

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
 * 获取代理配置
 */
export function getProxyConfig() {
  try {
    if (fs.existsSync(PROXY_CONFIG_FILE)) {
      const data = fs.readFileSync(PROXY_CONFIG_FILE, 'utf-8')
      return { ...DEFAULT_PROXY_CONFIG, ...JSON.parse(data) }
    }
  } catch (error) {
    log.error('加载代理配置失败', error)
  }
  return { ...DEFAULT_PROXY_CONFIG }
}

/**
 * 保存代理配置
 */
export function saveProxyConfig(config) {
  try {
    ensureConfigDir(PROXY_CONFIG_FILE)
    fs.writeFileSync(PROXY_CONFIG_FILE, JSON.stringify(config, null, 2))
    return true
  } catch (error) {
    log.error('保存代理配置失败', error)
    return false
  }
}

/**
 * 构建 Axios 代理配置（全局代理，向后兼容）
 */
export function buildAxiosProxyConfig(proxyConfig) {
  if (!proxyConfig || !proxyConfig.enabled) {
    return undefined
  }

  const { protocol, host, port, username, password } = proxyConfig

  if (!host || !port) {
    return undefined
  }

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

// ============ Profile 级别代理 ============

/**
 * Profile 代理默认配置
 */
export const DEFAULT_PROFILE_PROXY = {
  type: 'none',           // 'none' | 'system' | 'custom'
  customUrl: '',          // 自定义代理地址（如 http://127.0.0.1:58591）
  bypassRules: 'localhost,127.0.0.1,::1'  // 代理绕过规则
}

/**
 * 解析代理 URL 为 { protocol, host, port, auth }
 * @param {string} urlStr - 代理地址，如 http://user:pass@127.0.0.1:58591
 * @returns {object|null}
 */
export function parseProxyUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return null

  try {
    const url = new URL(urlStr)
    const result = {
      protocol: url.protocol.replace(':', ''), // 'http' | 'https' | 'socks5'
      host: url.hostname,
      port: parseInt(url.port, 10)
    }

    if (url.username && url.password) {
      result.auth = { username: url.username, password: url.password }
    }

    if (!result.host || !result.port) return null
    return result
  } catch {
    return null
  }
}

/**
 * 检查目标 URL 是否匹配代理绕过规则
 * @param {string} targetURL - 目标请求 URL
 * @param {string} bypassRules - 逗号分隔的绕过规则
 * @returns {boolean}
 */
export function shouldBypassProxy(targetURL, bypassRules) {
  if (!bypassRules || !targetURL) return false

  try {
    const target = new URL(targetURL)
    const rules = bypassRules.split(',').map(r => r.trim().toLowerCase()).filter(Boolean)
    const targetHost = target.hostname.toLowerCase()

    return rules.some(rule => {
      // 完全匹配
      if (targetHost === rule) return true
      // 通配符匹配（如 *.example.com）
      if (rule.startsWith('*.')) {
        const domain = rule.slice(2)
        return targetHost === domain || targetHost.endsWith('.' + domain)
      }
      // 后缀匹配（如 .local）
      if (rule.startsWith('.')) {
        return targetHost.endsWith(rule) || targetHost === rule.slice(1)
      }
      return false
    })
  } catch {
    return false
  }
}

/**
 * 从环境变量获取系统代理
 * @param {string} targetURL - 目标 URL（用于选择 http/https 代理）
 * @returns {object|null} axios proxy 配置
 */
function getSystemProxyFromEnv(targetURL) {
  try {
    const target = new URL(targetURL)
    const isHttps = target.protocol === 'https:'

    // 按优先级查找环境变量
    const envVar = isHttps
      ? (process.env.HTTPS_PROXY || process.env.https_proxy)
      : (process.env.HTTP_PROXY || process.env.http_proxy)
    const allProxy = process.env.ALL_PROXY || process.env.all_proxy

    const proxyUrlStr = envVar || allProxy
    if (!proxyUrlStr) return null

    return parseProxyUrl(proxyUrlStr)
  } catch {
    return null
  }
}

/**
 * 解析 Profile 代理配置为 axios 可用格式
 * @param {object} profileProxy - Profile 的 proxy 字段
 * @param {string} targetURL - 目标请求 URL（用于系统代理检测和绕过规则检查）
 * @returns {{ proxy: object|false|undefined, bypassRules: string }}
 *   proxy: undefined=不设置(axios默认), false=显式禁用, object=代理配置
 *   bypassRules: 绕过规则字符串
 */
export function resolveProfileProxy(profileProxy, targetURL = '') {
  const proxy = { ...DEFAULT_PROFILE_PROXY, ...profileProxy }

  switch (proxy.type) {
    case 'none':
      return { proxy: false, bypassRules: '' }

    case 'system': {
      if (!targetURL) return { proxy: undefined, bypassRules: '' }
      const sysProxy = getSystemProxyFromEnv(targetURL)
      return {
        proxy: sysProxy || undefined,
        bypassRules: ''
      }
    }

    case 'custom': {
      if (!proxy.customUrl) return { proxy: undefined, bypassRules: proxy.bypassRules }
      const parsed = parseProxyUrl(proxy.customUrl)
      if (!parsed) return { proxy: undefined, bypassRules: proxy.bypassRules }

      // 构建 axios proxy 配置
      const axiosProxy = {
        host: parsed.host,
        port: parsed.port
      }
      if (parsed.protocol === 'socks5') {
        axiosProxy.protocol = 'socks5'
      }
      if (parsed.auth) {
        axiosProxy.auth = parsed.auth
      }

      return {
        proxy: axiosProxy,
        bypassRules: proxy.bypassRules || ''
      }
    }

    default:
      return { proxy: undefined, bypassRules: '' }
  }
}
