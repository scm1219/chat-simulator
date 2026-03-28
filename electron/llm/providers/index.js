/**
 * LLM 供应商配置预设
 */
export const LLM_PROVIDERS = {
  openai: {
    id: 'openai',
    name: 'OpenAI',
    baseURL: 'https://api.openai.com/v1',
    models: ['gpt-5.4', 'gpt-5.4-pro', 'gpt-5.4-mini', 'gpt-5.4-nano', 'gpt-5', 'gpt-5-pro', 'gpt-5-mini', 'gpt-5-nano'],
    needApiKey: true,
    needBaseUrl: false
  },
  deepseek: {
    id: 'deepseek',
    name: 'DeepSeek',
    baseURL: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    needApiKey: true,
    needBaseUrl: false
  },
  qwen: {
    id: 'qwen',
    name: '通义千问',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-plus', 'qwen-turbo', 'qwen-max'],
    needApiKey: true,
    needBaseUrl: false
  },
  moonshot: {
    id: 'moonshot',
    name: 'Moonshot AI (Kimi)',
    baseURL: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-8k', 'moonshot-v1-32k'],
    needApiKey: true,
    needBaseUrl: false
  },
  zhipu: {
    id: 'zhipu',
    name: '智谱AI',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-5', 'glm-4.7', 'glm-4.6v', 'glm-4-plus', 'glm-4-flash'],
    needApiKey: true,
    needBaseUrl: false
  },
  baichuan: {
    id: 'baichuan',
    name: '百川智能',
    baseURL: 'https://api.baichuan-ai.com/v1',
    models: ['Baichuan2-Turbo', 'Baichuan2-53B'],
    needApiKey: true,
    needBaseUrl: false
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama (本地)',
    baseURL: 'http://localhost:11434/v1',
    nativeBaseURL: 'http://localhost:11434', // 原生 API 地址
    models: [], // 动态获取
    needApiKey: false,
    needBaseUrl: true,
    supportsNativeApi: true // 支持原生 API
  },
  modelscope: {
    id: 'modelscope',
    name: 'ModelScope 魔塔',
    baseURL: 'https://api-inference.modelscope.cn/v1',
    models: ['Qwen/Qwen3.5-27B', 'Qwen/Qwen3.5-35B-A3B', 'Qwen/Qwen3.5-122B-A10B'],
    needApiKey: true,
    needBaseUrl: false
  },
  minimax: {
    id: 'minimax',
    name: 'MiniMax',
    baseURL: 'https://api.minimaxi.com/v1',
    models: ['MiniMax-M2.7', 'MiniMax-M2.7-highspeed', 'MiniMax-M2.5', 'MiniMax-M2.5-highspeed', 'MiniMax-M2.1', 'MiniMax-M2.1-highspeed', 'MiniMax-M2'],
    needApiKey: true,
    needBaseUrl: false
  },
  custom: {
    id: 'custom',
    name: '自定义',
    baseURL: '',
    models: [], // 用户输入
    needApiKey: true,
    needBaseUrl: true
  }
}

/**
 * 获取供应商配置
 */
export function getProviderConfig(providerId) {
  return LLM_PROVIDERS[providerId] || LLM_PROVIDERS.custom
}

/**
 * 获取供应商默认 baseURL
 */
export function getProviderDefaultBaseURL(providerId) {
  const config = LLM_PROVIDERS[providerId]
  return config?.baseURL || ''
}

/**
 * 获取所有供应商列表
 */
export function getAllProviders() {
  return Object.values(LLM_PROVIDERS)
}
