import { contextBridge, ipcRenderer } from 'electron'

/**
 * 创建 IPC 事件监听器工厂
 * 统一 on* 事件监听器的注册/清理模式
 * @param {string} channel - IPC 通道名
 * @returns {Function} (callback) => cleanupFunction
 */
function createEventListener(channel) {
  return (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  }
}

// 暴露安全的 API 到渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  // ============ 群组操作 ============
  group: {
    create: (data) => ipcRenderer.invoke('group:create', data),
    getAll: () => ipcRenderer.invoke('group:getAll'),
    getById: (id) => ipcRenderer.invoke('group:getById', id),
    update: (id, data) => ipcRenderer.invoke('group:update', id, data),
    delete: (id) => ipcRenderer.invoke('group:delete', id),
    duplicate: (id) => ipcRenderer.invoke('group:duplicate', id)
  },

  // ============ 角色操作 ============
  character: {
    create: (data) => ipcRenderer.invoke('character:create', data),
    getByGroupId: (groupId) => ipcRenderer.invoke('character:getByGroupId', groupId),
    update: (id, data) => ipcRenderer.invoke('character:update', id, data),
    delete: (id) => ipcRenderer.invoke('character:delete', id),
    toggle: (id, enabled) => ipcRenderer.invoke('character:toggle', id, enabled),
    reorder: (id, direction) => ipcRenderer.invoke('character:reorder', id, direction)
  },

  // ============ 消息操作 ============
  message: {
    getByGroupId: (groupId) => ipcRenderer.invoke('message:getByGroupId', groupId),
    create: (data) => ipcRenderer.invoke('message:create', data),
    update: (groupId, id, content) => ipcRenderer.invoke('message:update', groupId, id, content),
    delete: (groupId, id) => ipcRenderer.invoke('message:delete', groupId, id),
    deleteFrom: (groupId, id) => ipcRenderer.invoke('message:deleteFrom', groupId, id),
    clearByGroupId: (groupId) => ipcRenderer.invoke('message:clearByGroupId', groupId),
    exportToZip: (groupId, groupName) => ipcRenderer.invoke('message:exportToZip', groupId, groupName),
    onNewMessage: createEventListener('message:new'),
    // 流式消息事件
    onStreamStart: createEventListener('message:stream:start'),
    onStreamChunk: createEventListener('message:stream:chunk'),
    onStreamEnd: createEventListener('message:stream:end'),
    onStreamError: createEventListener('message:stream:error'),
    // 用户消息保存事件（更新前端消息的真实 ID）
    onUserMessageSaved: createEventListener('message:user:saved')
  },

  // ============ LLM 操作 ============
  llm: {
    getProviders: () => ipcRenderer.invoke('llm:getProviders'),
    getModels: (provider) => ipcRenderer.invoke('llm:getModels', provider),
    testConnection: (config) => ipcRenderer.invoke('llm:testConnection', config),
    generate: (groupId, content, options) =>
      ipcRenderer.invoke('llm:generate', groupId, content, options),
    generateCharacterCommand: (groupId, characterId, instruction) =>
      ipcRenderer.invoke('llm:generateCharacterCommand', groupId, characterId, instruction),
    generateCharacter: (hint) => ipcRenderer.invoke('llm:generateCharacter', hint),
    generateGroup: (description, profileId) => ipcRenderer.invoke('llm:generateGroup', description, profileId)
  },

  // ============ 配置操作 ============
  config: {
    getLLMConfig: () => ipcRenderer.invoke('config:getLLMConfig'),
    saveLLMConfig: (config) => ipcRenderer.invoke('config:saveLLMConfig', config),
    getProxyConfig: () => ipcRenderer.invoke('config:getProxyConfig'),
    saveProxyConfig: (config) => ipcRenderer.invoke('config:saveProxyConfig', config),
    // LLM 配置管理
    llmProfile: {
      getAll: () => ipcRenderer.invoke('llmProfile:getAll'),
      add: (profile) => ipcRenderer.invoke('llmProfile:add', profile),
      update: (id, data) => ipcRenderer.invoke('llmProfile:update', id, data),
      delete: (id) => ipcRenderer.invoke('llmProfile:delete', id)
    },
    // 系统提示词模板
    systemPrompt: {
      getAll: () => ipcRenderer.invoke('systemPrompt:getAll'),
      save: (templates) => ipcRenderer.invoke('systemPrompt:save', templates),
      reset: () => ipcRenderer.invoke('systemPrompt:reset'),
      add: (template) => ipcRenderer.invoke('systemPrompt:add', template),
      update: (id, data) => ipcRenderer.invoke('systemPrompt:update', id, data),
      delete: (id) => ipcRenderer.invoke('systemPrompt:delete', id)
    },
    // 抽卡配置
    gachaConfig: {
      get: () => ipcRenderer.invoke('gachaConfig:get'),
      save: (config) => ipcRenderer.invoke('gachaConfig:save', config),
      reset: () => ipcRenderer.invoke('gachaConfig:reset')
    },
    // 快速建群配置
    quickGroupConfig: {
      get: () => ipcRenderer.invoke('quickGroupConfig:get'),
      save: (config) => ipcRenderer.invoke('quickGroupConfig:save', config),
      reset: () => ipcRenderer.invoke('quickGroupConfig:reset')
    }
  },

  // ============ 全局角色库操作 ============
  globalCharacter: {
    getAll: () => ipcRenderer.invoke('globalCharacter:getAll'),
    getById: (id) => ipcRenderer.invoke('globalCharacter:getById', id),
    create: (data) => ipcRenderer.invoke('globalCharacter:create', data),
    update: (id, data) => ipcRenderer.invoke('globalCharacter:update', id, data),
    delete: (id) => ipcRenderer.invoke('globalCharacter:delete', id),
    search: (keyword) => ipcRenderer.invoke('globalCharacter:search', keyword),
    importToGroup: (characterId, groupId) =>
      ipcRenderer.invoke('globalCharacter:importToGroup', characterId, groupId),
    syncToGroup: (characterId, groupId) =>
      ipcRenderer.invoke('globalCharacter:syncToGroup', characterId, groupId),
    syncToAllGroups: (characterId) =>
      ipcRenderer.invoke('globalCharacter:syncToAllGroups', characterId),
    existsInLibrary: (characterId) =>
      ipcRenderer.invoke('globalCharacter:existsInLibrary', characterId),
    // 标签管理
    getAllTags: () => ipcRenderer.invoke('globalCharacter:getAllTags'),
    createTag: (data) => ipcRenderer.invoke('globalCharacter:createTag', data),
    updateTag: (id, data) => ipcRenderer.invoke('globalCharacter:updateTag', id, data),
    deleteTag: (id) => ipcRenderer.invoke('globalCharacter:deleteTag', id),
    getCharacterTags: (characterId) =>
      ipcRenderer.invoke('globalCharacter:getCharacterTags', characterId),
    setCharacterTags: (characterId, tagIds) =>
      ipcRenderer.invoke('globalCharacter:setCharacterTags', characterId, tagIds),
    getByTags: (tagIds) => ipcRenderer.invoke('globalCharacter:getByTags', tagIds),
    getAllWithTags: () => ipcRenderer.invoke('globalCharacter:getAllWithTags'),
    searchWithTags: (keyword, tagIds) =>
      ipcRenderer.invoke('globalCharacter:searchWithTags', keyword, tagIds),
    regeneratePrompt: (characterId, style, profileId, originalPrompt) =>
      ipcRenderer.invoke('globalCharacter:regeneratePrompt', characterId, style, profileId, originalPrompt)
  },

  // ============ 角色全局记忆操作 ============
  memory: {
    getByName: (characterName) => ipcRenderer.invoke('memory:getByName', characterName),
    add: (data) => ipcRenderer.invoke('memory:add', data),
    update: (id, content) => ipcRenderer.invoke('memory:update', id, content),
    delete: (id) => ipcRenderer.invoke('memory:delete', id),
    getCount: (characterName) => ipcRenderer.invoke('memory:getCount', characterName)
  },

  // ============ 叙事系统 ============
  narrative: {
    getEmotions: (groupId) => ipcRenderer.invoke('narrative:getEmotions', groupId),
    getEmotion: (groupId, characterId) => ipcRenderer.invoke('narrative:getEmotion', groupId, characterId),
    setEmotion: (groupId, characterId, emotion, intensity) => ipcRenderer.invoke('narrative:setEmotion', groupId, characterId, emotion, intensity),
    getRelationships: (groupId) => ipcRenderer.invoke('narrative:getRelationships', groupId),
    getRelationship: (groupId, fromId, toId) => ipcRenderer.invoke('narrative:getRelationship', groupId, fromId, toId),
    setRelationship: (groupId, fromId, toId, type, description) => ipcRenderer.invoke('narrative:setRelationship', groupId, fromId, toId, type, description),
    removeRelationship: (groupId, fromId, toId) => ipcRenderer.invoke('narrative:removeRelationship', groupId, fromId, toId),
    getRelationshipTypes: () => ipcRenderer.invoke('narrative:getRelationshipTypes'),
    getSceneLabels: () => ipcRenderer.invoke('narrative:getSceneLabels'),
    getEmotionList: () => ipcRenderer.invoke('narrative:getEmotionList'),
    getEventPool: (sceneType) => ipcRenderer.invoke('narrative:getEventPool', sceneType),
    triggerEvent: (groupId, eventKey, content, impact) => ipcRenderer.invoke('narrative:triggerEvent', groupId, eventKey, content, impact),
    getRecentEvents: (groupId, limit) => ipcRenderer.invoke('narrative:getRecentEvents', groupId, limit),
    getEventSuggestions: (groupId, sceneType, count) => ipcRenderer.invoke('narrative:getEventSuggestions', groupId, sceneType, count),
    checkStaleness: (groupId) => ipcRenderer.invoke('narrative:checkStaleness', groupId),
    deleteEvent: (groupId, eventId) => ipcRenderer.invoke('narrative:deleteEvent', groupId, eventId),
    onAftermath: createEventListener('narrative:aftermath')
  },

  // ============ 全局搜索 ============
  search: {
    global: (keyword) => ipcRenderer.invoke('search:global', keyword)
  }
})
