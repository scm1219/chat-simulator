/**
 * IPC 通道常量定义
 */
export const IPC_CHANNELS = {
  // 群组操作
  GROUP_CREATE: 'group:create',
  GROUP_GET_ALL: 'group:getAll',
  GROUP_GET_BY_ID: 'group:getById',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',

  // 角色操作
  CHARACTER_CREATE: 'character:create',
  CHARACTER_GET_BY_GROUP_ID: 'character:getByGroupId',
  CHARACTER_UPDATE: 'character:update',
  CHARACTER_DELETE: 'character:delete',
  CHARACTER_TOGGLE: 'character:toggle',

  // 消息操作
  MESSAGE_GET_BY_GROUP_ID: 'message:getByGroupId',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_NEW: 'message:new',

  // LLM 操作
  LLM_GET_PROVIDERS: 'llm:getProviders',
  LLM_GET_MODELS: 'llm:getModels',
  LLM_TEST_CONNECTION: 'llm:testConnection',
  LLM_GENERATE: 'llm:generate',
  LLM_PROGRESS: 'llm:progress',

  // 配置操作
  CONFIG_GET_LLM: 'config:getLLMConfig',
  CONFIG_SAVE_LLM: 'config:saveLLMConfig',
  CONFIG_GET_PROXY: 'config:getProxyConfig',
  CONFIG_SAVE_PROXY: 'config:saveProxyConfig'
}
