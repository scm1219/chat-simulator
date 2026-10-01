// src/utils/llm-providers.js
// 渲染进程共享的 LLM 供应商相关工具（收敛自 6 份 getProviderName、
// 2 份 getGenderLabel、3 处 profile 排序/分组实现）
import { LLM_PROVIDERS } from '../../electron/llm/providers/index.js'

// 未知 id 回退返回 id 本身（与既有各处实现一致）
export function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

// 未知性别回退 '未知'（统一自 CharacterGachaDialog 的 '未知' 与 CharacterLibrary 的 ''）
export function getGenderLabel(gender) {
  const labels = { male: '男', female: '女', other: '其他' }
  return labels[gender] || '未知'
}

// 按供应商分组（组间按供应商名、组内按配置名排序）——统一自
// LLMConfigPanel:131-153（基准行为）与 CharacterPanel:403-425（组内不排序的分叉版）
export function groupProfilesByProvider(profiles) {
  if (!Array.isArray(profiles)) return []
  const groups = {}
  Object.values(LLM_PROVIDERS).forEach(provider => {
    groups[provider.id] = {
      providerId: provider.id,
      providerName: provider.name,
      profiles: []
    }
  })
  profiles.forEach(profile => {
    if (groups[profile?.provider]) {
      groups[profile.provider].profiles.push(profile)
    }
  })
  return Object.values(groups)
    .filter(group => group.profiles.length > 0)
    .map(group => ({
      ...group,
      profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName))
}

// 扁平排序（供应商声明顺序优先，同供应商内按名称）——等价搬运自
// CreateGroupDialog:133-141 与 QuickGroupDialog:301-311 的 providerOrder 实现
export function sortProfilesByProvider(profiles) {
  if (!Array.isArray(profiles)) return []
  const providerOrder = Object.keys(LLM_PROVIDERS)
  return [...profiles].sort((a, b) => {
    const ai = providerOrder.indexOf(a?.provider)
    const bi = providerOrder.indexOf(b?.provider)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
}
