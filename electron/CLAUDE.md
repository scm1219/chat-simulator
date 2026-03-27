# Electron 主进程模块

[根目录](../CLAUDE.md) > **electron**

> 最后更新：2026-03-27

---

## 变更记录 (Changelog)

### 2026-03-27
- **新增**：`llm/ollama-client.js` - Ollama 原生 API 客户端
- **更新**：LLM Handler 支持双模式（OpenAI 兼容 / 原生 Ollama API）
- **优化**：供应商配置添加 `supportsNativeApi` 和 `nativeBaseURL` 字段
- **优化**：LLM 配置存储添加 `useNativeApi` 字段迁移

### 2026-03-20
- **更新**：数据库管理器添加内联 Schema，支持自动迁移
- **更新**：LLM Handler 支持群背景设定和思考模式
- **更新**：角色 Handler 支持用户角色（`is_user` 字段）
- **新增**：数据库迁移脚本 `migrations/add_user_character.js`
- **优化**：改进上下文构建逻辑，添加群背景支持

### 2026-03-20
- 初始化模块文档
- 完成代码扫描与接口分析

---

## 模块职责

Electron 主进程是应用的核心后端，负责：
1. **窗口管理**：创建和管理应用窗口
2. **IPC 通信**：处理渲染进程的请求并返回结果
3. **数据库管理**：管理所有聊天群的 SQLite 数据库连接
4. **LLM 集成**：调用各种 LLM 供应商的 API 进行对话生成
5. **配置管理**：管理全局 LLM 和代理配置
6. **数据迁移**：自动执行数据库结构升级

---

## 入口与启动

### 主入口文件
**路径**：`electron/main.js`

### 启动流程
1. 应用就绪时（`app.whenReady()`）创建主窗口
2. 动态导入各模块（数据库、IPC Handlers）
3. 初始化 `DatabaseManager`
4. 执行数据库迁移（添加用户角色）
5. 注册所有 IPC Handlers
6. 监听窗口关闭事件，清理资源

### 关键代码
```javascript
// 创建窗口
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 开发模式加载 Vite 服务器，生产模式加载构建文件
  const isDev = process.env.NODE_ENV === 'development'
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

// 应用退出前清理
app.on('before-quit', () => {
  if (dbManager) {
    dbManager.closeAll() // 关闭所有数据库连接
  }
})
```

---

## 对外接口

### IPC 通信接口（通过 Preload 暴露）

所有 IPC 接口都在 `electron/preload.js` 中通过 `contextBridge` 暴露给渲染进程。

#### 1. 群组操作（`window.electronAPI.group`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `create(data)` | `{ name, llmProvider, llmModel, maxHistory, responseMode, thinkingEnabled, background }` | `{ success, data: Group }` | 创建新群组 |
| `getAll()` | 无 | `{ success, data: Group[] }` | 获取所有群组 |
| `getById(id)` | 群组 ID | `{ success, data: Group }` | 获取单个群组 |
| `update(id, data)` | 群组 ID, 更新数据 | `{ success, data: Group }` | 更新群组 |
| `delete(id)` | 群组 ID | `{ success }` | 删除群组 |

**Handler 实现**：`electron/ipc/handlers/group.js`

#### 2. 角色操作（`window.electronAPI.character`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `create(data)` | `{ groupId, name, systemPrompt }` | `{ success, data: Character }` | 创建角色 |
| `getByGroupId(groupId)` | 群组 ID | `{ success, data: Character[] }` | 获取群组的所有角色 |
| `update(id, data)` | 角色 ID, 更新数据 | `{ success, data: Character }` | 更新角色 |
| `delete(id)` | 角色 ID | `{ success }` | 删除角色 |
| `toggle(id, enabled)` | 角色 ID, 是否启用 | `{ success, data: Character }` | 启用/禁用角色 |

**Handler 实现**：`electron/ipc/handlers/character.js`

#### 3. 消息操作（`window.electronAPI.message`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getByGroupId(groupId)` | 群组 ID | `{ success, data: Message[] }` | 获取群组消息列表 |
| `create(data)` | `{ groupId, characterId, role, content }` | `{ success, data: Message }` | 创建消息 |
| `onNewMessage(callback)` | 回调函数 | 清理函数 | 监听新消息事件 |

**事件**：
- `message:new`：当有新消息时触发

**Handler 实现**：`electron/ipc/handlers/message.js`

#### 4. LLM 操作（`window.electronAPI.llm`）
| 方法 | 参数 | 返回值 | 说明 |
|------|------|--------|------|
| `getProviders()` | 无 | `{ success, data: Provider[] }` | 获取所有 LLM 供应商 |
| `getModels(provider)` | 供应商 ID | `{ success, data: string[] }` | 获取供应商的模型列表 |
| `testConnection(config)` | LLM 配置 | `{ success, message, model }` | 测试 LLM 连接 |
| `generate(groupId, content)` | 群组 ID, 用户消息 | `{ success, data: Response[] }` | 生成 AI 回复 |
| `onProgress(callback)` | 回调函数 | 清理函数 | 监听生成进度（预留） |

**事件**：
- `llm:progress`：LLM 生成进度（预留接口）

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
| `update(id, data)` | 配置 ID, 更新数据 | `{ success, data: LLMProfile }` | 更新 LLM 配置 |
| `delete(id)` | 配置 ID | `{ success }` | 删除 LLM 配置 |

**Handler 实现**：`electron/ipc/handlers/config.js`

---

## 关键依赖与配置

### 核心依赖
- **electron**：窗口管理、IPC 通信
- **better-sqlite3**：同步 SQLite 数据库操作
- **axios**：HTTP 客户端（用于 LLM API 调用）
- **uuid**：生成唯一 ID

### 配置文件
1. **electron.vite.config.js**：构建配置
   - Main 进程入口：`electron/main.js`
   - Preload 脚本：`electron/preload.js`
   - Renderer 进程：`index.html`

2. **数据库结构**：`electron/database/schema.sql`
   - 定义了 groups、characters、messages 三张表
   - 包含外键约束和索引优化
   - 包含触发器自动更新 `updated_at`

3. **LLM 供应商配置**：`electron/llm/providers/index.js`
   - 预定义了 OpenAI、DeepSeek、通义千问、Moonshot、Ollama 等供应商
   - 每个供应商包含：baseURL、models、needApiKey、needBaseUrl

### 数据存储位置
- **开发模式**：`%APPDATA%/chat-simulator/data/groups/`（Windows）
- **生产模式**：应用用户数据目录下的 `data/groups/`
- **配置文件**：`%APPDATA%/chat-simulator/config/`

---

## 数据模型

### 数据库表结构

#### groups（群组表）
```sql
CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  llm_api_key TEXT,
  llm_base_url TEXT,
  max_history INTEGER DEFAULT 10,
  response_mode TEXT DEFAULT 'sequential',
  use_global_api_key INTEGER DEFAULT 1,
  thinking_enabled INTEGER DEFAULT 0,
  background TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

#### characters（角色表）
```sql
CREATE TABLE characters (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  is_user INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
)
```

#### messages（消息表）
```sql
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  character_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
)
```

### 数据库管理器
**路径**：`electron/database/manager.js`

**核心功能**：
- 为每个群组创建独立的 SQLite 数据库文件
- 缓存数据库连接，避免重复创建
- 自动初始化表结构（使用内联 Schema）
- 自动执行数据库迁移
- 提供关闭连接和删除数据库的方法

**关键方法**：
```javascript
class DatabaseManager {
  getGroupDB(groupId)      // 获取群组的数据库连接
  closeGroupDB(groupId)    // 关闭群组数据库连接
  closeAll()               // 关闭所有数据库连接
  deleteGroupDB(groupId)   // 删除群组数据库文件
  getGroupDBFiles()        // 获取所有群组 ID
  initSchema(db)           // 初始化表结构并执行迁移
}
```

**自动迁移逻辑**：
1. 检查表结构，添加 `thinking_enabled` 字段（群组表）
2. 检查表结构，添加 `background` 字段（群组表）
3. 检查表结构，添加 `is_user` 字段（角色表）

### 数据库迁移脚本
**路径**：`electron/database/migrations/add_user_character.js`

**功能**：为所有已存在的群组添加默认用户角色

**执行时机**：主进程启动时自动执行一次

**迁移逻辑**：
```javascript
export function migrateAddUserCharacter(dbManager) {
  const groupIds = dbManager.getGroupDBFiles()

  for (const groupId of groupIds) {
    const db = dbManager.getGroupDB(groupId)
    const existingUserChar = db.prepare(
      'SELECT * FROM characters WHERE group_id = ? AND is_user = 1'
    ).get(groupId)

    if (!existingUserChar) {
      // 添加默认用户角色
      db.prepare(`
        INSERT INTO characters (id, group_id, name, system_prompt, enabled, is_user)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(userCharacterId, groupId, '用户', '你是用户，正在参与群聊对话。', 1, 1)
    }
  }
}
```

---

## LLM 服务层

### LLM 客户端
**路径**：`electron/llm/client.js`

**核心功能**：
- 封装 OpenAI 兼容的 API 调用
- 支持自定义 baseURL（用于其他供应商）
- 支持代理配置
- 支持思考模式（thinking_enabled）
- 提供错误处理和连接测试

**关键方法**：
```javascript
class LLMClient {
  chat(messages, options)        // 发送聊天请求
  testConnection()               // 测试连接
  getModels()                    // 获取可用模型（Ollama）
  handleError(error)             // 统一错误处理
}
```

**思考模式支持**：
```javascript
const result = await client.chat(messages, {
  thinkingEnabled: true  // 启用思考模式（适用于 o1 等模型）
})
```

### LLM 供应商配置
**路径**：`electron/llm/providers/index.js`

**支持的供应商**：
- **OpenAI**：https://api.openai.com/v1
- **DeepSeek**：https://api.deepseek.com/v1
- **通义千问**：https://dashscope.aliyuncs.com/compatible-mode/v1
- **Moonshot AI**：https://api.moonshot.cn/v1
- **百川智能**：https://api.baichuan-ai.com/v1
- **Ollama**：http://localhost:11434/v1（本地）
- **自定义**：用户自行配置

### 多角色对话逻辑
**路径**：`electron/ipc/handlers/llm.js`

**顺序模式（sequential）**：
1. 获取所有启用的 AI 角色（排除 `is_user = 1` 的角色）
2. 按顺序为每个角色调用 LLM
3. 将每个角色的回复添加到历史记录
4. 下一个角色可以看到之前的回复

**并行模式（parallel）**：
1. 获取所有启用的 AI 角色（排除 `is_user = 1` 的角色）
2. 同时调用所有角色的 LLM
3. 所有角色同时返回回复

**上下文构建**（增强版）：
```javascript
function buildContextMessages(character, history, userContent, background = null) {
  const messages = []

  // 1. 添加群背景（如果存在）
  if (background && background.trim()) {
    messages.push({
      role: 'system',
      content: `【群背景设定】\n${background.trim()}`
    })
  }

  // 2. 添加角色系统提示词（人设）
  messages.push({
    role: 'system',
    content: character.system_prompt
  })

  // 3. 添加历史消息（排除当前角色的 assistant 消息，避免重复）
  const roleMessages = history
    .filter(msg => msg.role !== 'system')
    .map(msg => ({
      role: msg.role,
      content: msg.content
    }))

  messages.push(...roleMessages)

  // 4. 添加当前用户消息
  messages.push({
    role: 'user',
    content: userContent
  })

  return messages
}
```

**群背景设定示例**：
```
【群背景设定】
这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话。
场景：赤壁之战前夕，刘备军营中，诸葛亮、刘备、关羽等人正在商议对策。
```

---

## 测试与质量

### 当前状态
- **无自动化测试**
- **手动测试**：通过开发模式验证功能

### 推荐测试方案
1. **单元测试**：使用 Vitest 测试以下模块
   - `database/manager.js`：数据库操作
   - `llm/client.js`：LLM 客户端
   - `config/manager.js`：配置管理
   - `migrations/add_user_character.js`：迁移逻辑

2. **集成测试**：测试 IPC Handlers
   - 模拟渲染进程调用 IPC
   - 验证数据库操作和 LLM 调用
   - 测试迁移脚本是否正确执行

3. **E2E 测试**：使用 Spectron 或 Playwright
   - 测试完整的用户流程（创建群组、添加角色、发送消息）

---

## 常见问题 (FAQ)

### 1. 如何添加新的 LLM 供应商？
**步骤**：
1. 在 `electron/llm/providers/index.js` 的 `LLM_PROVIDERS` 中添加配置
2. 如果需要自定义 API 格式，修改 `electron/llm/client.js`
3. 更新渲染进程的供应商选择界面

**示例**：
```javascript
export const LLM_PROVIDERS = {
  // ... 其他供应商
  newprovider: {
    id: 'newprovider',
    name: 'New Provider',
    baseURL: 'https://api.newprovider.com/v1',
    models: ['model-1', 'model-2'],
    needApiKey: true,
    needBaseUrl: false
  }
}
```

### 2. 数据库连接会泄漏吗？
**不会**：
- `DatabaseManager` 使用 Map 缓存连接
- 应用退出时调用 `closeAll()` 关闭所有连接
- 删除群组时会先关闭连接再删除文件

### 3. 如何调试 LLM 调用失败？
**方法**：
1. 使用 `testConnection` 接口测试配置
2. 查看主进程控制台的错误日志
3. 检查代理配置是否正确
4. 验证 API Key 是否有效

### 4. IPC 调用超时怎么办？
**解决方案**：
- 增加 `LLMClient` 的 `timeout` 参数（默认 60 秒）
- 检查网络连接和代理配置
- 考虑使用并行模式减少总等待时间

### 5. 如何添加新的数据库字段？
**步骤**：
1. 修改 `electron/database/schema.sql` 添加新字段
2. 在 `DatabaseManager.initSchema()` 添加迁移逻辑
3. 更新相关 IPC Handlers 和 Vue 组件
4. 测试新建群组和已有群组的兼容性

**示例**：
```javascript
// DatabaseManager.initSchema()
const tableInfo = db.pragma('table_info(groups)')
const hasNewField = tableInfo.some(col => col.name === 'new_field')

if (!hasNewField) {
  console.log('[Database] 执行迁移：添加 new_field 字段')
  db.exec('ALTER TABLE groups ADD COLUMN new_field TEXT DEFAULT null')
  console.log('[Database] 迁移完成')
}
```

### 6. 用户角色和 AI 角色有什么区别？
- **用户角色**（`is_user = 1`）：
  - 不会参与 LLM 对话生成
  - 在角色面板中显示特殊的紫色样式
  - 用于标识真实用户
  - 每个群组创建时自动添加

- **AI 角色**（`is_user = 0` 或 `null`）：
  - 会参与 LLM 对话生成
  - 根据人设生成回复
  - 可以启用/禁用

### 7. 群背景设定如何影响对话？
- 群背景设定会在每次调用 LLM 时作为第一条 system 消息传入
- 帮助所有 AI 角色理解对话场景和角色关系
- 适用于需要特定场景设定的对话（如历史人物讨论、虚构世界角色扮演等）

---

## 相关文件清单

### 核心文件
- `electron/main.js`：主进程入口
- `electron/preload.js`：Preload 脚本（API 暴露）
- `electron.vite.config.js`：构建配置

### 数据库
- `electron/database/manager.js`：数据库管理器
- `electron/database/schema.sql`：数据库结构
- `electron/database/migrations/add_user_character.js`：用户角色迁移脚本

### LLM 服务
- `electron/llm/client.js`：LLM 客户端
- `electron/llm/providers/index.js`：供应商配置
- `electron/llm/proxy.js`：代理配置

### IPC Handlers
- `electron/ipc/handlers/group.js`：群组操作
- `electron/ipc/handlers/character.js`：角色操作
- `electron/ipc/handlers/message.js`：消息操作
- `electron/ipc/handlers/llm.js`：LLM 操作
- `electron/ipc/handlers/config.js`：配置操作

### 配置管理
- `electron/config/manager.js`：全局配置管理

### 工具
- `electron/utils/uuid.js`：UUID 生成工具

---

**文档版本**：1.1.0
**维护者**：AI 架构师（自适应版）
