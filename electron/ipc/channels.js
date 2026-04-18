/**
 * IPC 通道常量定义
 *
 * @deprecated 此文件当前未被任何 Handler 直接引用，仅作为文档参考。
 * 各 Handler 使用硬编码字符串注册通道（如 ipcMain.handle('group:create', ...)）。
 * 如需引入类型安全，请在各 Handler 中统一 import 此文件替换硬编码字符串。
 */

export const IPC_CHANNELS = {
  // ============ 群组操作 ============
  GROUP_CREATE: 'group:create',
  GROUP_GET_ALL: 'group:getAll',
  GROUP_GET_BY_ID: 'group:getById',
  GROUP_UPDATE: 'group:update',
  GROUP_DELETE: 'group:delete',
  GROUP_DUPLICATE: 'group:duplicate',

  // ============ 角色操作 ============
  CHARACTER_CREATE: 'character:create',
  CHARACTER_GET_BY_GROUP_ID: 'character:getByGroupId',
  CHARACTER_UPDATE: 'character:update',
  CHARACTER_DELETE: 'character:delete',
  CHARACTER_TOGGLE: 'character:toggle',
  CHARACTER_REORDER: 'character:reorder',

  // ============ 消息操作 ============
  MESSAGE_GET_BY_GROUP_ID: 'message:getByGroupId',
  MESSAGE_CREATE: 'message:create',
  MESSAGE_UPDATE: 'message:update',
  MESSAGE_DELETE: 'message:delete',
  MESSAGE_DELETE_FROM: 'message:deleteFrom',
  MESSAGE_CLEAR_BY_GROUP_ID: 'message:clearByGroupId',
  MESSAGE_EXPORT_TO_ZIP: 'message:exportToZip',
  MESSAGE_NEW: 'message:new',
  MESSAGE_STREAM_START: 'message:stream:start',
  MESSAGE_STREAM_CHUNK: 'message:stream:chunk',
  MESSAGE_STREAM_END: 'message:stream:end',
  MESSAGE_STREAM_ERROR: 'message:stream:error',
  MESSAGE_USER_SAVED: 'message:user:saved',

  // ============ LLM 操作 ============
  LLM_GET_PROVIDERS: 'llm:getProviders',
  LLM_GET_MODELS: 'llm:getModels',
  LLM_TEST_CONNECTION: 'llm:testConnection',
  LLM_GENERATE: 'llm:generate',
  LLM_GENERATE_CHARACTER_COMMAND: 'llm:generateCharacterCommand',
  LLM_GENERATE_CHARACTER: 'llm:generateCharacter',
  LLM_GENERATE_GROUP: 'llm:generateGroup',
  LLM_PROGRESS: 'llm:progress',

  // ============ 配置操作 ============
  CONFIG_GET_LLM: 'config:getLLMConfig',
  CONFIG_SAVE_LLM: 'config:saveLLMConfig',
  CONFIG_GET_PROXY: 'config:getProxyConfig',
  CONFIG_SAVE_PROXY: 'config:saveProxyConfig',

  // LLM 配置管理
  LLM_PROFILE_GET_ALL: 'llmProfile:getAll',
  LLM_PROFILE_ADD: 'llmProfile:add',
  LLM_PROFILE_UPDATE: 'llmProfile:update',
  LLM_PROFILE_DELETE: 'llmProfile:delete',

  // 系统提示词模板
  SYSTEM_PROMPT_GET_ALL: 'systemPrompt:getAll',
  SYSTEM_PROMPT_SAVE: 'systemPrompt:save',
  SYSTEM_PROMPT_RESET: 'systemPrompt:reset',
  SYSTEM_PROMPT_ADD: 'systemPrompt:add',
  SYSTEM_PROMPT_UPDATE: 'systemPrompt:update',
  SYSTEM_PROMPT_DELETE: 'systemPrompt:delete',

  // 抽卡配置
  GACHA_CONFIG_GET: 'gachaConfig:get',
  GACHA_CONFIG_SAVE: 'gachaConfig:save',
  GACHA_CONFIG_RESET: 'gachaConfig:reset',

  // 快速建群配置
  QUICK_GROUP_CONFIG_GET: 'quickGroupConfig:get',
  QUICK_GROUP_CONFIG_SAVE: 'quickGroupConfig:save',
  QUICK_GROUP_CONFIG_RESET: 'quickGroupConfig:reset',

  // ============ 全局角色库 ============
  GLOBAL_CHARACTER_GET_ALL: 'globalCharacter:getAll',
  GLOBAL_CHARACTER_GET_BY_ID: 'globalCharacter:getById',
  GLOBAL_CHARACTER_CREATE: 'globalCharacter:create',
  GLOBAL_CHARACTER_UPDATE: 'globalCharacter:update',
  GLOBAL_CHARACTER_DELETE: 'globalCharacter:delete',
  GLOBAL_CHARACTER_SEARCH: 'globalCharacter:search',
  GLOBAL_CHARACTER_IMPORT_TO_GROUP: 'globalCharacter:importToGroup',
  GLOBAL_CHARACTER_SYNC_TO_GROUP: 'globalCharacter:syncToGroup',
  GLOBAL_CHARACTER_SYNC_TO_ALL: 'globalCharacter:syncToAllGroups',
  GLOBAL_CHARACTER_EXISTS_IN_LIBRARY: 'globalCharacter:existsInLibrary',
  GLOBAL_CHARACTER_GET_ALL_TAGS: 'globalCharacter:getAllTags',
  GLOBAL_CHARACTER_CREATE_TAG: 'globalCharacter:createTag',
  GLOBAL_CHARACTER_UPDATE_TAG: 'globalCharacter:updateTag',
  GLOBAL_CHARACTER_DELETE_TAG: 'globalCharacter:deleteTag',
  GLOBAL_CHARACTER_GET_TAGS: 'globalCharacter:getCharacterTags',
  GLOBAL_CHARACTER_SET_TAGS: 'globalCharacter:setCharacterTags',
  GLOBAL_CHARACTER_GET_BY_TAGS: 'globalCharacter:getByTags',
  GLOBAL_CHARACTER_GET_ALL_WITH_TAGS: 'globalCharacter:getAllWithTags',
  GLOBAL_CHARACTER_SEARCH_WITH_TAGS: 'globalCharacter:searchWithTags',

  // ============ 角色记忆 ============
  MEMORY_GET_BY_NAME: 'memory:getByName',
  MEMORY_ADD: 'memory:add',
  MEMORY_UPDATE: 'memory:update',
  MEMORY_DELETE: 'memory:delete',
  MEMORY_GET_COUNT: 'memory:getCount',

  // ============ 叙事系统 ============
  NARRATIVE_GET_EMOTIONS: 'narrative:getEmotions',
  NARRATIVE_GET_EMOTION: 'narrative:getEmotion',
  NARRATIVE_SET_EMOTION: 'narrative:setEmotion',
  NARRATIVE_GET_RELATIONSHIPS: 'narrative:getRelationships',
  NARRATIVE_GET_RELATIONSHIP: 'narrative:getRelationship',
  NARRATIVE_SET_RELATIONSHIP: 'narrative:setRelationship',
  NARRATIVE_REMOVE_RELATIONSHIP: 'narrative:removeRelationship',
  NARRATIVE_GET_RELATIONSHIP_TYPES: 'narrative:getRelationshipTypes',
  NARRATIVE_GET_SCENE_LABELS: 'narrative:getSceneLabels',
  NARRATIVE_GET_EMOTION_LIST: 'narrative:getEmotionList',
  NARRATIVE_GET_EVENT_POOL: 'narrative:getEventPool',
  NARRATIVE_TRIGGER_EVENT: 'narrative:triggerEvent',
  NARRATIVE_GET_RECENT_EVENTS: 'narrative:getRecentEvents',
  NARRATIVE_GET_EVENT_SUGGESTIONS: 'narrative:getEventSuggestions',
  NARRATIVE_CHECK_STALENESS: 'narrative:checkStaleness',
  NARRATIVE_DELETE_EVENT: 'narrative:deleteEvent',
  NARRATIVE_AFTERMATH: 'narrative:aftermath',

  // ============ 全局搜索 ============
  SEARCH_GLOBAL: 'search:global'
}
