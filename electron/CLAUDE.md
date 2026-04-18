# Electron 主进程模块

[根目录](../CLAUDE.md) > **electron**

> 最后更新：2026-04-18

---

## 变更记录 (Changelog)

### 2026-04-18
- **更新**：叙事系统 IPC 接口从 13 个扩充为 14 个（新增 `narrative:deleteEvent`、`narrative:setEmotion`、`narrative:getEmotion`、`narrative:removeRelationship`、`narrative:getRelationshipTypes`、`narrative:getEventPool`）
- **更新**：IPC 通道常量 `channels.js` 新增叙事相关常量（`NARRATIVE_SET_EMOTION`、`NARRATIVE_GET_EMOTION`、`NARRATIVE_REMOVE_RELATIONSHIP`、`NARRATIVE_GET_RELATIONSHIP_TYPES`、`NARRATIVE_GET_EVENT_POOL`、`NARRATIVE_DELETE_EVENT`）
- **更新**：情绪词典扩展至 15 种情绪（新增紧张、惊慌、好奇、无奈、沮丧、焦虑、恐慌）
- **更新**：事件场景从 4 场景扩展为 7 场景（新增 home、school、restaurant、travel、party），事件总数约 85 个
- **更新**：余波编排改为单角色模式（`_parseSingleAftermath`），余波消息携带 `message_type`、`is_aftermath`、`model`、`prompt_tokens`、`completion_tokens`
- **更新**：好感度系统支持 6 级等级和 4 类互动模式
- **更新**：数据库迁移新增 `narrative_enabled`、`aftermath_enabled`、`event_scene_type`（groups 表）和 `is_aftermath`、`message_type`（messages 表）
- **更新**：内联 Schema（`SCHEMA_SQL`）新增 `character_emotions`、`character_relationships`、`narrative_events` 三张表
- **更新**：叙事引擎通过 `narrative.js` Handler 暴露 14 个 IPC 接口
- **更新**：`main.js` 启动流程新增叙事引擎初始化和 `setupNarrativeHandlers` 注册
- **更新**：`llm.js` Handler 新增第三个参数 `narrativeEngine`，集成叙事引擎到对话流程

### 2026-04-17
- **新增**：AI 快速建群接口 `llm:generateGroup`（根据描述生成群名称、背景、多个角色）
- **新增**：快速建群配置管理（`quickGroupConfig` get/save/reset 接口）
- **新增**：角色独立 LLM 配置支持（`custom_llm_profile_id` 字段、`createClientForCharacter` 函数）
- **新增**：角色库同步接口（`syncToGroup`、`syncToAllGroups`、`existsInLibrary`）
- **新增**：JSON 提取工具 `json-extractor.js`（支持 markdown 代码块、截断 JSON 修复）
- **新增**：消息模型记录（`messages.model` 字段）
- **新增**：LLM Profile 更新时自动同步关联群组配置（`syncGroupsProfile` 函数）
- **新增**：供应商：智谱AI Coding（`zhipu-coding`，专用 Coding 端点）
- **优化**：供应商模型列表更新（OpenAI gpt-5.4 系列、通义千问 qwen3/qwen3.5、智谱 glm-5/5.1、MiniMax M2.7 系列）
- **优化**：角色导入群组时使用角色库原始 ID（便于追溯来源和同步）
- **优化**：角色 Handler 支持更新 `customLlmProfileId` 字段
- **删除**：`database/migrations/add_user_character.js`（迁移已内联到 manager.js）
- **新增**：叙事引擎模块 `narrative/`（engine.js、emotion-manager.js、relationship-manager.js、event-trigger.js、prompt-builder.js）
- **新增**：叙事系统 IPC 处理器 `narrative.js`（14 个接口：情绪/关系/事件管理）
- **新增**：角色情绪系统（关键词匹配 + LLM 推断混合模式，15 种情绪，情绪衰减机制）
- **新增**：角色关系系统（7 种预设关系类型，双向动态好感度 -100~100，互动关键词驱动更新）
- **新增**：事件触发系统（7 场景约 85 预设事件，推荐算法去重，对话平淡检测）
- **新增**：单角色余波编排（条件触发：高情绪/角色提及/紧张关系/随机，LLM 生成追评）
- **新增**：叙事上下文注入到 LLM prompt（情绪状态 + 角色关系 + 当前事件）
- **新增**：数据库迁移（character_emotions、character_relationships、narrative_events 三张表 + groups 表三个新字段 + messages 表两个新字段）
- **优化**：LLM Handler 集成叙事引擎（preGenerate + postCharacterResponse + generateAftermath）

### 2026-03-29
- **新增**：全局角色库管理器 `GlobalCharacterManager`（角色 CRUD、标签管理、搜索筛选、导入到群组）
- **新增**：角色记忆管理器 `MemoryManager`（记忆 CRUD、按角色名查询、自动记忆提取）
- **新增**：全局搜索 IPC 处理器 `search.js`（跨群组搜索消息和角色）
- **新增**：全局角色 IPC 处理器 `global-character.js`（角色管理 + 标签管理 + 导入群组）
- **新增**：记忆 IPC 处理器 `memory.js`（记忆 CRUD）
- **新增**：系统提示词模板管理 `system-prompts.js`（8 个内置模板、自定义模板 CRUD）
- **新增**：IPC 通道常量定义 `channels.js`
- **优化**：数据库 Schema 新增多字段（position、thinking_enabled、random_order、system_prompt、reasoning_content、prompt_tokens、auto_memory_extract）
- **优化**：LLM Handler 支持流式输出、角色记忆注入、自动记忆提取、单角色指令、角色抽卡
- **优化**：新增供应商：智谱AI、ModelScope 魔塔、MiniMax
- **优化**：Preload API 大幅扩展

### 2026-03-27
- **新增**：`llm/ollama-client.js` - Ollama 原生 API 客户端
- **更新**：LLM Handler 支持双模式（OpenAI 兼容 / 原生 Ollama API）
- **优化**：供应商配置添加 `supportsNativeApi` 和 `nativeBaseURL` 字段
- **优化**：LLM 配置存储添加 `useNativeApi` 字段迁移

### 2026-03-20
- **更新**：数据库管理器添加内联 Schema，支持自动迁移
- **更新**：LLM Handler 支持群背景设定和思考模式
- **更新**：角色 Handler 支持用户角色（`is_user` 字段）
- **优化**：改进上下文构建逻辑，添加群背景支持

### 2026-03-20
- 初始化模块文档
- 完成代码扫描与接口分析

---

## 模块职责

Electron 主进程是应用的核心后端，负责：
1. **窗口管理**：创建和管理应用窗口
2. **IPC 通信**：处理渲染进程的请求并返回结果
3. **数据库管理**：管理三套独立数据库系统（群组/全局角色库/角色记忆）
4. **LLM 集成**：调用各种 LLM 供应商的 API 进行对话生成、角色抽卡、快速建群
5. **叙事引擎**：编排情绪状态机、角色关系图谱、事件触发系统、余波生成
6. **配置管理**：管理全局 LLM、Profile、代理、系统提示词模板、抽卡配置、快速建群配置
7. **全局角色库**：跨群组的角色模板管理、标签系统、同步更新
8. **角色记忆**：跨群组的角色记忆管理（手动/自动）
9. **全局搜索**：跨群组搜索消息和角色
10. **数据迁移**：自动执行数据库结构升级
11. **Profile 同步**：LLM Profile 更新时自动同步关联群组配置

---

## 入口与启动

### 主入口文件
**路径**：`electron/main.js`

### 启动流程
1. 应用就绪时（`app.whenReady()`）创建主窗口
2. 动态导入各模块（数据库、IPC Handlers、叙事引擎）
3. 初始化 `DatabaseManager`（群组数据库）
4. 初始化 `GlobalCharacterManager`（全局角色库数据库）
5. 初始化 `MemoryManager`（角色记忆数据库）
6. 初始化 `NarrativeEngine`（叙事引擎，通过 `setDBManager` 关联数据库）
7. 注册所有 IPC Handlers（9 个模块）
8. 创建窗口
9. 监听窗口关闭事件，清理所有数据库连接

### 关键代码
```javascript
// 初始化三个数据库管理器
dbManager = new DatabaseManager()
globalCharManager = new GlobalCharacterManager()
memoryManager = new MemoryManager()

// 初始化叙事引擎
const narrativeEngine = new NarrativeEngine()
narrativeEngine.setDBManager(dbManager)

// 注册 9 个 IPC Handler 模块
setupGroupHandlers(dbManager)
setupCharacterHandlers(dbManager)
setupMessageHandlers(dbManager)
setupLLMHandlers(dbManager, memoryManager, narrativeEngine)
setupConfigHandlers(dbManager)
setupGlobalCharacterHandlers(dbManager, globalCharManager)
setupMemoryHandlers(memoryManager)
setupSearchHandlers(dbManager)
setupNarrativeHandlers(narrativeEngine)

// 应用退出前清理三个数据库
dbManager.closeAll()
globalCharManager.close()
memoryManager.close()
```

---

## 对外接口

### IPC 通信接口（通过 Preload 暴露）

所有 IPC 接口都在 `electron/preload.js` 中通过 `contextBridge` 暴露给渲染进程。

#### 1. 群组操作（`window.electronAPI.group`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `create(data)` | `{ name, llmProvider, llmModel, ... }` | `{ success, data: Group }` | 创建新群组 |
| `getAll()` | 无 | `{ success, data: Group[] }` | 获取所有群组 |
| `getById(id)` | 群组 ID | `{ success, data: Group }` | 获取单个群组 |
| `update(id, data)` | 群组 ID, 更新数据 | `{ success, data: Group }` | 更新群组 |
| `delete(id)` | 群组 ID | `{ success }` | 删除群组 |
| `duplicate(id)` | 群组 ID | `{ success }` | 复制群组 |

**Handler 实现**：`electron/ipc/handlers/group.js`

#### 2. 角色操作（`window.electronAPI.character`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `create(data)` | `{ groupId, name, systemPrompt }` | `{ success, data: Character }` | 创建角色 |
| `getByGroupId(groupId)` | 群组 ID | `{ success, data: Character[] }` | 获取群组的所有角色 |
| `update(id, data)` | 角色 ID, 更新数据（支持 `customLlmProfileId`） | `{ success, data: Character }` | 更新角色 |
| `delete(id)` | 角色 ID | `{ success }` | 删除角色 |
| `toggle(id, enabled)` | 角色 ID, 是否启用 | `{ success, data: Character }` | 启用/禁用角色 |
| `reorder(id, direction)` | 角色 ID, 方向 | `{ success }` | 角色排序 |

**Handler 实现**：`electron/ipc/handlers/character.js`

#### 3. 消息操作（`window.electronAPI.message`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getByGroupId(groupId)` | 群组 ID | `{ success, data: Message[] }` | 获取群组消息列表 |
| `create(data)` | `{ groupId, characterId, role, content }` | `{ success, data: Message }` | 创建消息 |
| `update(id, content)` | 消息 ID, 内容 | `{ success }` | 更新消息内容 |
| `delete(id)` | 消息 ID | `{ success }` | 删除消息 |
| `deleteFrom(id)` | 消息 ID | `{ success }` | 从此消息开始删除 |
| `clearByGroupId(groupId)` | 群组 ID | `{ success }` | 清空群组消息 |
| `exportToZip(groupId, groupName)` | 群组 ID, 名称 | `{ success, path }` | 导出聊天记录 ZIP |
| `onNewMessage(callback)` | 回调函数 | 清理函数 | 监听新消息事件 |
| `onStreamStart/Chunk/End/Error` | 回调函数 | 清理函数 | 流式消息事件 |
| `onUserMessageSaved(callback)` | 回调函数 | 清理函数 | 用户消息保存确认事件 |

**事件**：
- `message:new`：新消息（旧接口）
- `message:stream:start`：流式开始
- `message:stream:chunk`：流式片段（含 reasoning/content 类型）
- `message:stream:end`：流式结束
- `message:stream:error`：流式错误
- `message:user:saved`：用户消息保存确认（含真实 ID、character_id、message_type）

**Handler 实现**：`electron/ipc/handlers/message.js`

#### 4. LLM 操作（`window.electronAPI.llm`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getProviders()` | 无 | `{ success, data: Provider[] }` | 获取所有 LLM 供应商 |
| `getModels(provider)` | 供应商 ID | `{ success, data: string[] }` | 获取供应商的模型列表 |
| `testConnection(config)` | LLM 配置 | `{ success, message, model }` | 测试 LLM 连接 |
| `generate(groupId, content, options)` | 群组 ID, 用户消息, 选项（含 `messageType`） | 流式事件 | 生成 AI 回复（流式） |
| `generateCharacterCommand(...)` | 群组/角色/指令 | 流式事件 | 单角色指令回复 |
| `generateCharacter(hint)` | 提示词 | `{ success, data }` | AI 角色抽卡 |
| `generateGroup(description, profileId)` | 描述, Profile ID | `{ success, data }` | AI 快速建群 |
| `onProgress(callback)` | 回调函数 | 清理函数 | 监听生成进度 |

**Handler 实现**：`electron/ipc/handlers/llm.js`

#### 5. 配置操作（`window.electronAPI.config`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getLLMConfig()` | 无 | `{ success, data: LLMConfig }` | 获取全局 LLM 配置 |
| `saveLLMConfig(config)` | LLM 配置 | `{ success }` | 保存全局 LLM 配置 |
| `getProxyConfig()` | 无 | `{ success, data: ProxyConfig }` | 获取代理配置 |
| `saveProxyConfig(config)` | 代理配置 | `{ success }` | 保存代理配置 |

#### 6. LLM 配置管理（`window.electronAPI.config.llmProfile`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getAll()` | 无 | `{ success, data: LLMProfile[] }` | 获取所有 LLM 配置 |
| `add(profile)` | LLM 配置 | `{ success, data: LLMProfile }` | 添加 LLM 配置 |
| `update(id, data)` | 配置 ID, 更新数据 | `{ success, data, syncedGroups }` | 更新 LLM 配置（自动同步关联群组） |
| `delete(id)` | 配置 ID | `{ success }` | 删除 LLM 配置 |

#### 7. 系统提示词模板（`window.electronAPI.config.systemPrompt`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getAll()` | 无 | `{ success, data }` | 获取所有模板 |
| `save(templates)` | 模板数组 | `{ success }` | 保存模板 |
| `reset()` | 无 | `{ success }` | 重置为默认模板 |
| `add/update/delete` | 模板数据 | `{ success }` | 模板 CRUD |

#### 8. 抽卡配置（`window.electronAPI.config.gachaConfig`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `get()` | 无 | `{ success, data }` | 获取抽卡配置 |
| `save(config)` | 配置 | `{ success }` | 保存抽卡配置 |
| `reset()` | 无 | `{ success }` | 重置为默认配置 |

#### 9. 快速建群配置（`window.electronAPI.config.quickGroupConfig`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `get()` | 无 | `{ success, data }` | 获取快速建群提示词配置 |
| `save(config)` | 配置 | `{ success }` | 保存快速建群提示词配置 |
| `reset()` | 无 | `{ success }` | 重置为默认配置 |

#### 10. 全局角色库（`window.electronAPI.globalCharacter`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getAll/getById/create/update/delete` | 标准 CRUD | `{ success, data }` | 角色 CRUD |
| `search(keyword)` | 关键词 | `{ success, data }` | 搜索角色 |
| `importToGroup(characterId, groupId)` | 角色/群组 ID | `{ success, data }` | 导入角色到群组（使用原始 ID） |
| `syncToGroup(characterId, groupId)` | 角色/群组 ID | `{ success, data }` | 同步角色设定到群组 |
| `syncToAllGroups(characterId)` | 角色 ID | `{ success, data }` | 同步角色设定到所有关联群组 |
| `existsInLibrary(characterId)` | 角色 ID | `{ success, data: boolean }` | 检查角色是否存在于角色库 |
| `getAllTags/createTag/updateTag/deleteTag` | 标签 CRUD | `{ success, data }` | 标签管理 |
| `getCharacterTags/setCharacterTags` | 角色 ID | `{ success, data }` | 角色标签关联 |
| `getByTags/getAllWithTags/searchWithTags` | 筛选参数 | `{ success, data }` | 带标签查询 |

**Handler 实现**：`electron/ipc/handlers/global-character.js`

#### 11. 角色记忆（`window.electronAPI.memory`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getByName(characterName)` | 角色名称 | `{ success, data }` | 获取角色记忆列表 |
| `add(data)` | `{ characterName, content, source, groupId }` | `{ success, data }` | 添加记忆 |
| `update(id, content)` | 记忆 ID, 内容 | `{ success, data }` | 更新记忆 |
| `delete(id)` | 记忆 ID | `{ success }` | 删除记忆 |
| `getCount(characterName)` | 角色名称 | `{ success, data: number }` | 记忆条数 |

**Handler 实现**：`electron/ipc/handlers/memory.js`

#### 12. 全局搜索（`window.electronAPI.search`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `global(keyword)` | 搜索关键词 | `{ success, data }` | 跨群组搜索消息和角色 |

**Handler 实现**：`electron/ipc/handlers/search.js`

#### 13. 叙事系统（`window.electronAPI.narrative`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getEmotions(groupId)` | 群组 ID | `{ success, data }` | 获取群组所有角色情绪 |
| `getEmotion(groupId, characterId)` | 群组 ID, 角色 ID | `{ success, data }` | 获取指定角色情绪 |
| `setEmotion(groupId, characterId, emotion, intensity)` | 群组/角色/情绪/强度 | `{ success }` | 手动设置角色情绪 |
| `getRelationships(groupId)` | 群组 ID | `{ success, data }` | 获取群组角色关系 |
| `getRelationship(groupId, fromId, toId)` | 群组/角色/角色 | `{ success, data }` | 获取指定角色间关系 |
| `setRelationship(groupId, fromId, toId, type, description)` | 群组/角色/角色/类型/描述 | `{ success, data }` | 设置角色关系 |
| `removeRelationship(groupId, fromId, toId)` | 群组/角色/角色 | `{ success }` | 删除角色关系 |
| `getRelationshipTypes()` | 无 | `{ success, data }` | 获取关系类型列表 |
| `getEventPool(sceneType)` | 场景类型 | `{ success, data }` | 获取事件池 |
| `triggerEvent(groupId, eventKey, content, impact)` | 群组/事件键/内容/影响 | `{ success, data }` | 触发事件 |
| `getRecentEvents(groupId, limit)` | 群组 ID, 数量 | `{ success, data }` | 获取最近事件 |
| `getEventSuggestions(groupId, sceneType, count)` | 群组/场景/数量 | `{ success, data }` | 获取推荐事件 |
| `checkStaleness(groupId)` | 群组 ID | `{ success, data }` | 检查对话平淡度 |
| `deleteEvent(groupId, eventId)` | 群组 ID, 事件 ID | `{ success, deletedMessages }` | 删除事件（含关联消息） |
| `onAftermath(callback)` | 回调函数 | 清理函数 | 监听余波事件 |

**事件推送**：
- `narrative:aftermath`：余波消息（含角色信息、内容、model、token 用量）

**Handler 实现**：`electron/ipc/handlers/narrative.js`

---

## 关键依赖与配置

### 核心依赖
- **electron**：窗口管理、IPC 通信
- **better-sqlite3**：同步 SQLite 数据库操作
- **axios**：HTTP 客户端（用于 LLM API 调用）
- **archiver**：聊天记录导出 ZIP
- **uuid**：生成唯一 ID（通过 `electron/utils/uuid.js` 内置实现）

### 配置文件
1. **electron.vite.config.js**：构建配置
   - Main 进程入口：`electron/main.js`
   - Preload 脚本：`electron/preload.js`
   - Renderer 进程：`index.html`

2. **数据库结构**：`electron/database/schema.sql`（基础结构）+ `electron/database/manager.js` 内联 `SCHEMA_SQL`（完整结构，含叙事引擎表）
   - 定义了 groups、characters、messages、character_emotions、character_relationships、narrative_events 六张表
   - 包含外键约束和索引优化
   - 包含触发器自动更新 `updated_at`

3. **LLM 供应商配置**：`electron/llm/providers/index.js`
   - 预定义了 11 个供应商（OpenAI、DeepSeek、通义千问、Moonshot、智谱AI、智谱AI Coding、百川、Ollama、ModelScope、MiniMax、自定义）

### 数据存储位置
- **群组数据库**：`%APPDATA%/chat-simulator/data/groups/`（Windows）
- **全局角色库**：`%APPDATA%/chat-simulator/data/global/character-library.sqlite`
- **角色记忆**：`%APPDATA%/chat-simulator/data/global/character-memories.sqlite`
- **配置文件**：`%APPDATA%/chat-simulator/config/`
  - `llm-config.json`：全局 LLM 配置
  - `gacha-config.json`：抽卡提示词配置
  - `quick-group-config.json`：快速建群提示词配置

---

## LLM 服务层

### LLM 客户端
**路径**：`electron/llm/client.js`

**核心功能**：
- 封装 OpenAI 兼容的 API 调用
- 支持流式输出（SSE）
- 支持推理过程（reasoning_content）
- 支持自定义 baseURL、代理配置
- 提供 token 用量统计
- 错误处理和连接测试
- 支持 JSON 结构化输出（`responseFormat: { type: 'json_object' }`）

### Ollama 原生客户端
**路径**：`electron/llm/ollama-client.js`

- 支持 Ollama 原生 API
- 支持原生 think 参数
- 与 OpenAI 客户端接口统一

### LLM 供应商配置
**路径**：`electron/llm/providers/index.js`

**支持的供应商**（11 个 + 自定义）：
- **OpenAI**：gpt-5.4 / gpt-5.4-pro / gpt-5.4-mini / gpt-5.4-nano / gpt-5 系列
- **DeepSeek**：deepseek-chat / deepseek-coder
- **通义千问**：qwen-plus / qwen3-max / qwen3.5-flash / qwen3.5-plus
- **Moonshot AI (Kimi)**：moonshot-v1-8k / moonshot-v1-32k
- **智谱AI**：glm-4.5-air / glm-4.7-flash / glm-4.7 / glm-5 / glm-5-turbo / glm-5.1
- **智谱AI(Coding)**：glm-4.5-air / glm-4.7-flash / glm-4.7 / glm-5 系列（Coding 专用端点）
- **百川智能**：Baichuan2-Turbo / Baichuan2-53B
- **Ollama (本地)**：动态获取模型列表，支持原生 API
- **ModelScope 魔塔**：Qwen/Qwen3.5-27B / Qwen3.5-35B-A3B / Qwen3.5-122B-A10B
- **MiniMax**：MiniMax-M2.7 / M2.7-highspeed / M2.5 / M2.5-highspeed / M2.1 / M2.1-highspeed / M2
- **自定义**：用户自行配置

### 多角色对话逻辑
**路径**：`electron/ipc/handlers/llm.js`

**角色级 LLM 配置**：
- 每个角色可通过 `custom_llm_profile_id` 使用独立 LLM 配置
- `createClientForCharacter()` 函数优先使用角色级配置，未设置则回退到群组配置
- 独立配置包含完整的 provider、apiKey、baseURL、model、proxy 设置

**上下文构建**（增强版）：
1. 群组系统提示词（最高优先级）
2. 群背景设定
3. 群成员介绍（所有启用角色的名称和一句话简介）
4. 叙事上下文（情绪状态 + 角色关系 + 当前事件，仅叙事引擎启用时注入）
5. 角色全局记忆（跨群组共享）
6. 角色系统提示词（人设）
7. 历史消息（含角色名前缀，过滤定向指令和角色指令）
8. 强制性指令（只扮演当前角色）
9. 当前用户消息

**叙事引擎集成流程**：
1. `preGenerate()`：关键词快速判断情绪更新 + 构建叙事上下文注入 prompt
2. `postCharacterResponse()`：好感度更新 + LLM 情绪推断（关键节点）
3. `generateAftermath()`：所有角色回复完成后生成余波（条件触发：高情绪/角色提及/紧张关系/随机）

**流式输出**：
- `message:stream:start`：开始生成
- `message:stream:chunk`：推送片段（reasoning/content 类型）
- `message:stream:end`：生成完成，含完整消息、token 统计和实际模型名
- `message:stream:error`：生成失败

**自动记忆提取**：
- 开启 `auto_memory_extract` 后，每次对话异步提取角色关键信息
- 使用 `json-extractor.js` 解析 LLM 返回的 JSON
- 自动去重，避免重复提取已有记忆

**AI 快速建群**：
- `llm:generateGroup` 接口，接收群组描述和 Profile ID
- 使用可配置的系统提示词和用户提示模板
- 启用 JSON 结构化输出确保返回合法 JSON
- 返回群名称、背景设定和角色列表

### JSON 提取工具
**路径**：`electron/utils/json-extractor.js`

**核心功能**：
- 从 LLM 响应中提取 JSON（支持多种格式）
- 策略 1：提取 markdown 代码块（` ```json ``` `）
- 策略 2：直接解析
- 策略 3：移除未闭合的 markdown 标记
- 策略 4：提取第一个 `{` 到最后一个 `}` 之间的内容
- 策略 5：修复被 max_tokens 截断的 JSON（自动闭合括号/方括号/字符串）

---

## 叙事引擎

### 概述
叙事引擎通过 `NarrativeEngine` 类编排三个子系统：
- **EmotionManager**：角色情绪状态机
- **RelationshipManager**：角色关系图谱
- **EventTrigger**：事件触发系统
- **NarrativePromptBuilder**：叙事上下文构建

详见 [叙事引擎模块文档](./narrative/CLAUDE.md)。

---

## 测试与质量

### 当前状态
- **无自动化测试**
- **手动测试**：通过开发模式验证功能

### 推荐测试方案
1. **单元测试**：使用 Vitest 测试以下模块
   - `database/manager.js`：群组数据库操作
   - `database/global-character-manager.js`：全局角色库
   - `database/memory-manager.js`：角色记忆
   - `llm/client.js`：LLM 客户端
   - `utils/json-extractor.js`：JSON 提取（含截断修复）
   - `config/manager.js`：配置管理
   - `config/llm-profiles.js`：Profile 管理
   - `config/system-prompts.js`：模板管理
   - `narrative/emotion-manager.js`：情绪状态机
   - `narrative/relationship-manager.js`：关系管理器
   - `narrative/event-trigger.js`：事件触发

2. **集成测试**：测试 IPC Handlers（9 个模块）
   - 模拟渲染进程调用 IPC
   - 验证数据库操作和 LLM 调用
   - 测试迁移脚本是否正确执行
   - 测试角色独立 LLM 配置切换
   - 测试 Profile 更新群组同步
   - 测试叙事引擎完整流程

3. **E2E 测试**：使用 Spectron 或 Playwright
   - 测试完整的用户流程

---

## 常见问题 (FAQ)

### 1. 如何添加新的 LLM 供应商？
1. 在 `electron/llm/providers/index.js` 的 `LLM_PROVIDERS` 中添加配置
2. 如果需要自定义 API 格式，修改 `electron/llm/client.js`
3. 更新渲染进程的供应商选择界面

### 2. 数据库连接会泄漏吗？
- `DatabaseManager` 使用 Map 缓存连接
- 应用退出时调用 `closeAll()` 关闭所有连接
- 删除群组时会先关闭连接再删除文件
- `GlobalCharacterManager` 和 `MemoryManager` 也会在退出时关闭

### 3. 如何调试 LLM 调用失败？
1. 使用 `testConnection` 接口测试配置
2. 查看主进程控制台的错误日志
3. 检查代理配置是否正确
4. 验证 API Key 是否有效

### 4. IPC 调用超时怎么办？
- 增加 `LLMClient` 的 `timeout` 参数
- 检查网络连接和代理配置
- 考虑使用并行模式减少总等待时间

### 5. 如何添加新的数据库字段？
1. 修改 `electron/database/manager.js` 中的 `SCHEMA_SQL`
2. 在 `runMigrations()` 中添加迁移逻辑
3. 更新相关 IPC Handlers 和 Vue 组件
4. 测试新建群组和已有群组的兼容性

### 6. 全局角色库如何工作？
- 独立的 SQLite 数据库存储角色和标签
- 导入到群组时使用角色库原始 ID（非副本），便于追溯和同步
- 支持从角色库同步更新到单个群组（`syncToGroup`）或所有关联群组（`syncToAllGroups`）
- 标签系统支持 10 个默认标签 + 自定义标签
- 支持按标签和关键词组合筛选

### 7. 角色记忆如何工作？
- 独立的 SQLite 数据库，按角色名称关联
- 支持手动添加和自动提取两种来源
- 自动提取在每次对话后异步执行，不阻塞主流程
- AI 对话时将记忆注入上下文中的"角色记忆"区块
- 支持去重，避免重复提取

### 8. 流式输出如何工作？
- LLM 客户端使用 SSE 解析流式响应
- 每个 chunk 通过 IPC 事件推送到渲染进程
- 渲染进程监听事件实时更新 UI
- 最终保存完整消息到数据库（含 token 统计和实际模型名）

### 9. 角色独立 LLM 配置如何工作？
- 角色表有 `custom_llm_profile_id` 字段
- LLM 生成回复时，`createClientForCharacter()` 检查角色是否有独立配置
- 有独立配置：使用角色的 provider、model、apiKey、baseURL、proxy
- 无独立配置：回退到群组配置
- 在角色面板中可通过开关启用/关闭独立配置

### 10. LLM Profile 更新如何同步群组？
- 更新 Profile 时，`config.js` 的 `syncGroupsProfile()` 自动遍历所有群组
- 匹配条件：provider + model + apiKey + baseURL 完全一致
- 匹配的群组自动更新为新配置
- 返回结果中包含 `syncedGroups` 字段表示同步的群组数量

### 11. 叙事引擎如何与 LLM 对话集成？
- 叙事引擎在三个阶段介入对话流程：
  1. `preGenerate()`：为每个角色更新情绪（关键词匹配），构建叙事上下文（情绪+关系+事件）注入 system prompt
  2. `postCharacterResponse()`：根据回复内容更新好感度，在关键节点用 LLM 推断角色情绪
  3. `generateAftermath()`：所有角色回复完成后，检查余波触发条件（高情绪/角色提及/紧张关系/60%随机），生成单角色追评
- 叙事引擎功能可通过群设置的 `narrative_enabled` 和 `aftermath_enabled` 开关控制

---

## 相关文件清单

### 核心文件
- `electron/main.js`：主进程入口
- `electron/preload.js`：Preload 脚本（API 暴露）
- `electron.vite.config.js`：构建配置

### 数据库
- `electron/database/manager.js`：群组数据库管理器（含内联 Schema + 迁移）
- `electron/database/schema.sql`：数据库基础结构
- `electron/database/global-character-manager.js`：全局角色库管理器
- `electron/database/memory-manager.js`：角色记忆管理器

### LLM 服务
- `electron/llm/client.js`：OpenAI 兼容 LLM 客户端
- `electron/llm/ollama-client.js`：Ollama 原生客户端
- `electron/llm/providers/index.js`：供应商配置（11 个 + 自定义）
- `electron/llm/proxy.js`：代理配置

### IPC Handlers
- `electron/ipc/channels.js`：IPC 通道常量
- `electron/ipc/handlers/group.js`：群组操作
- `electron/ipc/handlers/character.js`：角色操作（含独立 LLM 配置）
- `electron/ipc/handlers/message.js`：消息操作
- `electron/ipc/handlers/llm.js`：LLM 操作（含快速建群、叙事引擎集成）
- `electron/ipc/handlers/config.js`：配置操作（含快速建群配置、Profile 同步）
- `electron/ipc/handlers/global-character.js`：全局角色库操作（含同步）
- `electron/ipc/handlers/memory.js`：角色记忆操作
- `electron/ipc/handlers/search.js`：全局搜索
- `electron/ipc/handlers/narrative.js`：叙事系统（14 个接口）

### 叙事引擎
- `electron/narrative/engine.js`：叙事引擎主控（编排情绪/关系/事件/余波）
- `electron/narrative/emotion-manager.js`：情绪状态机（15 种情绪关键词 + LLM 推断，情绪衰减）
- `electron/narrative/relationship-manager.js`：关系图谱管理（7 种关系类型，6 级好感度，4 类互动模式）
- `electron/narrative/event-trigger.js`：事件触发系统（7 场景约 85 事件，推荐算法，平淡检测）
- `electron/narrative/prompt-builder.js`：叙事上下文构建（情绪+关系+事件注入 prompt）

### 配置管理
- `electron/config/manager.js`：全局配置管理（含快速建群配置）
- `electron/config/llm-profiles.js`：LLM Profile 管理
- `electron/config/system-prompts.js`：系统提示词模板

### 工具
- `electron/utils/uuid.js`：UUID 生成工具
- `electron/utils/json-extractor.js`：LLM 响应 JSON 提取工具

---

**文档版本**：2.2.0
**维护者**：AI 架构师（自适应版）
