import { contextBridge, ipcRenderer } from 'electron'

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
    update: (id, content) => ipcRenderer.invoke('message:update', id, content),
    delete: (id) => ipcRenderer.invoke('message:delete', id),
    clearByGroupId: (groupId) => ipcRenderer.invoke('message:clearByGroupId', groupId),
    exportToZip: (groupId, groupName) => ipcRenderer.invoke('message:exportToZip', groupId, groupName),
    onNewMessage: (callback) => {
      const listener = (event, message) => callback(message)
      ipcRenderer.on('message:new', listener)
      return () => ipcRenderer.removeListener('message:new', listener)
    },
    // 流式消息事件
    onStreamStart: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('message:stream:start', listener)
      return () => ipcRenderer.removeListener('message:stream:start', listener)
    },
    onStreamChunk: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('message:stream:chunk', listener)
      return () => ipcRenderer.removeListener('message:stream:chunk', listener)
    },
    onStreamEnd: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('message:stream:end', listener)
      return () => ipcRenderer.removeListener('message:stream:end', listener)
    },
    onStreamError: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('message:stream:error', listener)
      return () => ipcRenderer.removeListener('message:stream:error', listener)
    }
  },

  // ============ LLM 操作 ============
  llm: {
    getProviders: () => ipcRenderer.invoke('llm:getProviders'),
    getModels: (provider) => ipcRenderer.invoke('llm:getModels', provider),
    testConnection: (config) => ipcRenderer.invoke('llm:testConnection', config),
    generate: (groupId, content, characterId) =>
      ipcRenderer.invoke('llm:generate', groupId, content, characterId),
    generateCharacterCommand: (groupId, characterId, instruction) =>
      ipcRenderer.invoke('llm:generateCharacterCommand', groupId, characterId, instruction),
    generateCharacter: (hint) => ipcRenderer.invoke('llm:generateCharacter', hint),
    onProgress: (callback) => {
      const listener = (event, data) => callback(data)
      ipcRenderer.on('llm:progress', listener)
      return () => ipcRenderer.removeListener('llm:progress', listener)
    }
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
      ipcRenderer.invoke('globalCharacter:searchWithTags', keyword, tagIds)
  }
})

console.log('Preload script loaded successfully')
