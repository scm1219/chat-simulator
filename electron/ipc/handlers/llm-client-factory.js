/**
 * LLM 客户端工厂
 * 统一管理 LLM 客户端的创建、代理解析和 API Key 获取
 */
import { LLMClient } from '../../llm/client.js'
import { OllamaNativeClient } from '../../llm/ollama-client.js'
import { getProviderConfig } from '../../llm/providers/index.js'
import { resolveProfileProxy } from '../../llm/proxy.js'
import { getLLMProfiles } from '../../config/llm-profiles.js'

/**
 * 解析 Profile 代理配置为客户端可用的 proxy + bypassRules
 * @param {object|null} profile - LLM Profile 对象（含 proxy 字段）
 * @param {string} baseURL - API 基础 URL（用于系统代理检测）
 * @returns {{ proxy: object|false|undefined, bypassRules: string }}
 */
export function resolveClientProxy(profile, baseURL) {
  const proxyConfig = profile?.proxy || null
  return resolveProfileProxy(proxyConfig, baseURL || '')
}

/**
 * 创建 LLM 客户端（根据配置自动选择 OpenAI 兼容或原生客户端）
 * @param {object} config - 客户端配置
 * @returns {LLMClient|OllamaNativeClient}
 */
export function createLLMClient(config) {
  const { provider, useNativeApi, baseURL, proxy, bypassRules, ...rest } = config

  // 如果是 Ollama 且启用原生 API，使用原生客户端
  if (provider === 'ollama' && useNativeApi) {
    const providerConfig = getProviderConfig('ollama')
    return new OllamaNativeClient({
      ...rest,
      baseURL: baseURL || providerConfig.nativeBaseURL || 'http://localhost:11434',
      proxy,
      bypassRules
    })
  }

  return new LLMClient({ provider, useNativeApi, baseURL, proxy, bypassRules, ...rest })
}

/**
 * 为角色创建 LLM 客户端
 * 如果角色有独立 LLM Profile 配置，使用角色级配置；否则回退到群组配置
 * @param {object} character - 角色对象（含 custom_llm_profile_id）
 * @param {object} group - 群组对象
 * @param {Array} llmProfiles - 所有 LLM Profile 列表
 * @param {string} apiKey - API Key
 * @returns {{ client: LLMClient|OllamaNativeClient, profileId: string|null }}
 */
export function createClientForCharacter(character, group, llmProfiles, apiKey) {
  // 角色有独立 LLM Profile，使用角色级配置
  if (character.custom_llm_profile_id) {
    const profile = llmProfiles.find(p => p.id === character.custom_llm_profile_id)
    if (profile) {
      const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(profile, profile.baseURL)
      const client = createLLMClient({
        provider: profile.provider,
        apiKey: profile.apiKey || apiKey,
        baseURL: profile.baseURL,
        model: profile.model,
        proxy: resolvedProxy,
        bypassRules,
        streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
        useNativeApi: profile.useNativeApi === true
      })
      return { client, profileId: profile.id }
    } else {
      console.warn(`[LLM] 角色 ${character.name} 的独立 LLM Profile ${character.custom_llm_profile_id} 未找到，回退到群组配置`)
    }
  }

  // 使用群组默认配置
  const currentProfile = llmProfiles.find(p =>
    p.provider === group.llm_provider && p.model === group.llm_model
  )
  const streamEnabled = currentProfile?.streamEnabled !== undefined
    ? currentProfile.streamEnabled
    : true
  const useNativeApi = currentProfile?.useNativeApi === true
  const { proxy: resolvedProxy, bypassRules } = resolveClientProxy(
    currentProfile || null,
    group.llm_base_url
  )

  const client = createLLMClient({
    provider: group.llm_provider,
    apiKey: apiKey,
    baseURL: group.llm_base_url,
    model: group.llm_model,
    proxy: resolvedProxy,
    bypassRules,
    streamEnabled,
    useNativeApi
  })

  return { client, profileId: null }
}

/**
 * 统一解析 API Key（优先使用群组独立 Key）
 * @param {object} group - 群组对象
 * @param {object} globalLLMConfig - 全局 LLM 配置
 * @returns {string} API Key
 */
export function resolveApiKey(group, globalLLMConfig) {
  return group.use_global_api_key
    ? globalLLMConfig.apiKey
    : (group.llm_api_key || globalLLMConfig.apiKey)
}
