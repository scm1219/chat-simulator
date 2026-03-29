# LLM 角色扮演聊天模拟器

一个基于 Electron + Vue 3 的桌面聊天模拟器，用户可以创建聊天群、添加多个 AI 角色，通过 LLM 进行多角色群聊对话。支持全局角色库、角色记忆、AI 抽卡、流式输出等丰富功能。

## 功能特性

- 🎭 **多角色对话**：一个聊天群中可添加多个 AI 角色，每个角色独立设定人设
- 🤖 **多 LLM 支持**：OpenAI、DeepSeek、通义千问、Moonshot、智谱AI、MiniMax、ModelScope、Ollama 等
- 🔧 **灵活配置**：全局和群组独立的 API Key 配置，LLM 配置 Profile 管理
- 🌐 **代理支持**：HTTP/HTTPS/SOCKS5 代理，可按 Profile 独立配置
- 💾 **本地存储**：每个聊天群使用独立 SQLite 数据库，全局角色库和记忆独立存储
- 📱 **微信风格 UI**：简洁优雅的微信绿色主题界面，四栏布局（可隐藏侧栏）
- ⚡ **两种回复模式**：顺序模式（剧情演绎）和并行模式（快速讨论）
- 🎨 **群背景设定**：为每个群组设置背景场景，增强对话沉浸感
- 🧠 **思考模式**：支持 LLM 思考模式（如 DeepSeek Reasoner），展示推理过程
- 👤 **用户角色**：支持添加用户角色，区分用户和 AI 角色
- 📚 **全局角色库**：跨群组角色库，支持标签分类、搜索、一键导入
- 🎲 **AI 角色抽卡**：使用 LLM 随机生成角色（姓名、性别、年龄、人设）
- 🧠 **角色记忆系统**：手动/自动记忆，AI 对话时参考角色记忆内容
- 🔍 **全局搜索**：跨群组搜索消息内容和角色名称
- 📋 **系统提示词模板**：内置 8 个多角色对话模板，支持自定义
- 📊 **Token 统计**：消息记录 prompt/completion token 用量
- 🔄 **流式输出**：SSE 流式消息推送，实时展示 AI 回复过程
- 📝 **消息管理**：编辑、删除、从某条开始删除、清空、导出 ZIP
- 🔀 **角色排序**：支持拖拽排序发言顺序，支持随机发言

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| **前端框架** | Vue | 3.5.30 |
| **构建工具** | Vite | 8.0.1 |
| **桌面框架** | Electron | 41.0.3 |
| **构建工具** | electron-vite | 5.0.0 |
| **状态管理** | Pinia | 3.0.4 |
| **数据库** | better-sqlite3 | 12.8.0 |
| **HTTP 客户端** | axios | 1.13.6 |
| **样式** | SCSS (Sass) | 1.98.0 |
| **语言** | JavaScript (ES Modules) | - |
| **LLM 协议** | OpenAI 兼容 | - |

## 安装和运行

### 前置要求

- Node.js >= 18
- npm >= 9

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

### 打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 使用说明

### 1. 配置 LLM

首次使用需要配置 LLM API：

1. 点击左侧面板"LLM 配置"Tab
2. 点击"添加配置"
3. 选择 LLM 供应商、输入 API Key 和模型名称
4. 可选配置自定义 API 地址和代理
5. 点击"测试连接"验证配置

### 2. 创建聊天群

1. 点击左侧面板"聊天群"Tab
2. 点击"+ 新建"按钮
3. 输入群名称
4. 选择 LLM 配置
5. 设置最大历史轮数、回复模式等
6. 可选配置群背景设定和系统提示词
7. 点击"创建"

### 3. 添加角色

- **手动创建**：在右侧面板点击"+ 添加角色"，输入角色名称和设定
- **从角色库导入**：点击"从角色库添加"，从全局角色库快速导入
- **AI 抽卡**：点击"AI 抽卡"随机生成角色

### 4. 开始对话

1. 在中间聊天窗口输入消息
2. 按 Enter 发送（Shift + Enter 换行）
3. 所有启用的角色会依次/并行回复
4. 支持流式输出，实时查看 AI 回复过程

### 5. 全局角色库

跨群组复用角色人设：

1. 点击左侧面板"角色库"Tab
2. 点击"添加角色"创建全局角色（或使用 AI 抽卡）
3. 输入角色名称、性别、年龄、设定和标签
4. 在任意群组中点击"从角色库添加"快速导入

**标签系统**：
- 为角色添加标签便于分类管理
- 支持按标签筛选角色
- 一个角色可添加多个标签

### 6. 角色记忆

为角色添加跨群组的持久化记忆：

- **手动记忆**：在角色详情中点击"记忆"，手动添加记忆条目
- **自动记忆**：在群设置中开启"自动提取记忆"，系统从对话中自动提取
- AI 对话时会将角色记忆注入上下文，增强角色一致性
- 记忆按角色名称关联，跨群组共享

### 7. 全局搜索

1. 在左侧面板顶部的搜索框输入关键词
2. 搜索范围包括所有群组的消息内容和角色名称
3. 点击搜索结果可跳转到对应群组

### 8. 消息管理

- **编辑消息**：双击消息进行编辑
- **删除消息**：右键或操作按钮删除单条消息
- **从某条开始删除**：删除某条消息及其后的所有消息
- **清空消息**：清空当前群组的所有消息
- **导出 ZIP**：将聊天记录导出为 ZIP 文件

### 9. 系统提示词模板

1. 创建角色时，点击"选择模板"下拉框
2. 选择合适的模板（内置 8 个多角色对话模板）
3. 模板会自动填充系统提示词
4. 支持自定义模板

## 配置说明

### 支持的 LLM 供应商

| 供应商 | 标识符 | 推荐模型 | 说明 |
|--------|--------|----------|------|
| **OpenAI** | `openai` | gpt-4o, gpt-4o-mini, o1-preview, o1-mini | 支持 GPT-4 和 GPT-3.5 系列 |
| **DeepSeek** | `deepseek` | deepseek-chat, deepseek-reasoner | 国产高性能 LLM，支持推理模式 |
| **通义千问** | `qwen` | qwen-turbo, qwen-plus, qwen-max | 阿里云大模型 |
| **Moonshot** | `moonshot` | moonshot-v1-8k, moonshot-v1-32k | Kimi 提供的 LLM |
| **智谱 AI** | `zhipu` | glm-4, glm-4-flash | 智谱 AI GLM 系列大模型 |
| **MiniMax** | `minimax` | MiniMax-Text-01 | MiniMax 大模型 |
| **ModelScope** | `modelscope` | 自定义 | 魔搭社区模型服务 |
| **Ollama** | `ollama` | llama3, qwen2, mistral | 本地部署，支持原生 API 和 OpenAI 兼容模式 |
| **自定义** | `custom` | 自定义 | 支持任何 OpenAI 兼容的 API |

### 回复模式

- **顺序模式**：一个角色回复完成后，才调用下一个角色
  - 适合：剧情演绎、连续对话场景
- **并行模式**：同时调用所有启用角色的 LLM
  - 适合：自由讨论、头脑风暴场景

### 角色排序与随机发言

- 支持拖拽排序 AI 角色的发言顺序
- 开启"随机发言"后，每轮对话随机决定角色发言顺序
- 用户角色不参与排序和 LLM 对话生成

### API Key 配置

- **全局 API Key**：在设置中配置，所有新群默认使用
- **群组独立 API Key**：在群设置中配置，优先级高于全局配置

### LLM 配置管理

应用支持保存多个 LLM 配置（Profile），每个配置包含：
- **配置名称**：便于识别和切换
- **供应商**：OpenAI、DeepSeek、通义千问、Moonshot 等
- **API Key**：供应商提供的访问密钥
- **模型名称**：要使用的模型
- **自定义 API 地址**：可选，用于自建服务或第三方中转
- **代理配置**：可选，按 Profile 独立配置代理

### 代理配置

支持以下代理类型：HTTP、HTTPS、SOCKS5、系统代理、不代理。

### 思考模式

- 在群设置或角色级别开启
- 模型会在回复前展示推理过程（reasoning_content）
- 适用于支持推理的模型（如 DeepSeek Reasoner、OpenAI o1 系列）

### 群背景设定

在群设置中配置背景场景，帮助 AI 更好地理解对话场景和角色关系。

**示例**：
```
这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话。
场景：赤壁之战前夕，刘备军营中，诸葛亮、刘备、关羽等人正在商议对策。
```

---

## 数据存储说明

### 存储位置

**Windows**：
```
C:\Users\{用户名}\AppData\Roaming\chat-simulator\
├── config/              # 配置文件目录
│   ├── llm-config.json          # 全局 LLM 配置
│   ├── llm-profiles.json        # LLM 配置列表
│   ├── proxy-config.json        # 代理配置
│   └── system-prompts.json      # 系统提示词模板
└── data/                # 数据文件目录
    ├── groups/                    # 群组数据库目录
    │   ├── group_{id1}.sqlite    # 群组数据库
    │   └── ...
    └── global/                    # 全局数据目录
        ├── character-library.sqlite    # 全局角色库
        └── character-memories.sqlite   # 角色记忆
```

**macOS**：`~/Library/Application Support/chat-simulator/`
**Linux**：`~/.config/chat-simulator/`

目录结构与 Windows 相同。

### 数据库结构

应用使用三类独立 SQLite 数据库：

#### 1. 群组数据库（`data/groups/group_{id}.sqlite`）

**groups（群组表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 群组 ID（主键） |
| name | TEXT | 群组名称 |
| llm_provider | TEXT | LLM 供应商 |
| llm_model | TEXT | 模型名称 |
| llm_api_key | TEXT | 独立 API Key（可选） |
| llm_base_url | TEXT | 自定义 API 地址（可选） |
| max_history | INTEGER | 最大历史轮数 |
| response_mode | TEXT | 回复模式（sequential/parallel） |
| use_global_api_key | INTEGER | 是否使用全局 API Key |
| thinking_enabled | INTEGER | 是否启用思考模式 |
| random_order | INTEGER | 是否随机发言顺序 |
| background | TEXT | 群背景设定 |
| system_prompt | TEXT | 群系统提示词 |
| auto_memory_extract | INTEGER | 是否自动提取角色记忆 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**characters（角色表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 角色 ID（主键） |
| group_id | TEXT | 所属群组 ID（外键） |
| name | TEXT | 角色名称 |
| system_prompt | TEXT | 系统提示词（人设） |
| enabled | INTEGER | 是否启用（0/1） |
| is_user | INTEGER | 是否为用户角色（0/1） |
| position | INTEGER | 发言排序位置 |
| thinking_enabled | INTEGER | 角色级思考模式开关 |
| created_at | DATETIME | 创建时间 |

**messages（消息表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 消息 ID（主键） |
| group_id | TEXT | 所属群组 ID（外键） |
| character_id | TEXT | 发送角色 ID（外键，可选） |
| role | TEXT | 角色（user/assistant/system） |
| content | TEXT | 消息内容 |
| reasoning_content | TEXT | 推理过程内容 |
| prompt_tokens | INTEGER | 输入 token 数 |
| completion_tokens | INTEGER | 输出 token 数 |
| timestamp | DATETIME | 时间戳 |

#### 2. 全局角色库数据库（`data/global/character-library.sqlite`）

**global_characters（全局角色表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 角色 ID（主键） |
| name | TEXT | 角色名称 |
| gender | TEXT | 性别（male/female/other） |
| age | TEXT | 年龄 |
| system_prompt | TEXT | 人物设定 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

**tags（标签表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 标签 ID（主键） |
| name | TEXT | 标签名称（唯一） |
| color | TEXT | 标签颜色 |
| is_default | INTEGER | 是否系统默认标签 |

**character_tags（角色-标签关联表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| character_id | TEXT | 角色 ID |
| tag_id | TEXT | 标签 ID |

#### 3. 角色记忆数据库（`data/global/character-memories.sqlite`）

**character_memories（角色记忆表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 记忆 ID（主键） |
| character_name | TEXT | 角色名称（按名称关联） |
| content | TEXT | 记忆内容 |
| source | TEXT | 来源（manual/auto） |
| group_id | TEXT | 来源群组 ID（自动提取时记录） |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

### 数据库迁移

应用启动时自动执行数据库结构升级，保证向后兼容性。历史迁移包括：reasoning_content、position、thinking_enabled（角色级）、random_order、prompt_tokens/completion_tokens、auto_memory_extract、system_prompt 等字段。

### 数据备份与恢复

#### 备份
1. 复制整个应用数据目录（包含 config 和 data）
2. 或单独备份 `data/` 目录

#### 恢复
1. 关闭应用
2. 将备份文件复制回对应目录
3. 重启应用

#### 迁移到其他电脑
1. 复制 `config/` 和 `data/` 目录
2. 在新电脑的对应位置替换文件

## 项目结构

```
chat-simulator/
├── electron/                # Electron 主进程
│   ├── main.js             # 主进程入口
│   ├── preload.js          # Preload 脚本
│   ├── ipc/                # IPC 通信层
│   │   ├── channels.js     # IPC 通道常量
│   │   └── handlers/       # IPC 处理器
│   │       ├── group.js
│   │       ├── character.js
│   │       ├── message.js
│   │       ├── llm.js
│   │       ├── config.js
│   │       ├── global-character.js
│   │       ├── memory.js
│   │       └── search.js
│   ├── database/           # 数据库层
│   │   ├── manager.js      # 数据库管理器
│   │   ├── schema.sql      # 数据库结构
│   │   ├── global-character-manager.js  # 全局角色库管理器
│   │   └── memory-manager.js            # 角色记忆管理器
│   ├── llm/                # LLM 服务层
│   │   ├── client.js       # LLM 客户端
│   │   ├── ollama-client.js # Ollama 原生客户端
│   │   ├── providers/      # 供应商配置
│   │   └── proxy.js        # 代理配置
│   └── config/             # 配置管理
│       ├── manager.js      # 全局配置管理
│       ├── llm-profiles.js # LLM 配置管理
│       └── system-prompts.js # 系统提示词模板
├── src/                    # Vue 渲染进程
│   ├── main.js             # 渲染进程入口
│   ├── App.vue             # 根组件（含全局 Toast）
│   ├── components/         # Vue 组件
│   │   ├── layout/         # 布局组件（MainLayout、LeftPanel、GroupList、CharacterLibrary、GroupSearch）
│   │   ├── chat/           # 聊天组件（ChatWindow、MessageBubble、MessageInput、CharacterPanel）
│   │   ├── config/         # 配置组件（创建群/角色、编辑角色、全局角色、抽卡、群设置、LLM配置等）
│   │   └── common/         # 通用组件（Toast、ConfirmDialog、TagFilter、TagSelector）
│   ├── stores/             # Pinia 状态管理
│   │   ├── groups.js       # 群组
│   │   ├── characters.js   # 角色
│   │   ├── messages.js     # 消息
│   │   ├── config.js       # 配置
│   │   ├── llm-profiles.js # LLM 配置
│   │   ├── global-characters.js # 全局角色
│   │   ├── toast.js        # Toast 通知
│   │   └── memory.js       # 角色记忆
│   ├── composables/        # 组合式函数（useDialog）
│   └── styles/             # 样式文件（variables.scss、global.scss）
├── docs/                   # 设计文档
├── CLAUDE.md               # AI 上下文文档
├── electron/CLAUDE.md      # Electron 模块文档
└── src/CLAUDE.md           # 渲染进程模块文档
```

### 详细文档

查看 [CLAUDE.md](./CLAUDE.md) 了解更详细的项目架构、模块索引和 AI 使用指引。

## 注意事项

1. **API Key 安全**：API Key 以明文存储在本地配置文件中，请勿分享给他人
2. **网络要求**：使用在线 LLM 需要稳定的网络连接
3. **Ollama 使用**：使用 Ollama 前需要先启动 Ollama 服务，支持原生 API 和 OpenAI 兼容两种模式
4. **代理配置**：如需使用代理，可在 LLM 配置 Profile 中独立配置
5. **用户角色**：用户角色不会参与 LLM 对话生成，仅用于标识真实用户
6. **全局角色库**：从角色库导入的角色会在群组中创建副本，修改全局角色不会影响已导入的群组角色
7. **角色记忆**：记忆按角色名称关联（不按 ID），同名角色跨群组共享记忆
8. **思考模式**：仅支持具备推理能力的模型，其他模型启用此选项可能无效
9. **流式输出**：LLM 回复使用流式推送，事件：`stream:start` -> `stream:chunk`(多次) -> `stream:end`

## 故障排查

### 应用无法启动

- 检查 Node.js 版本是否符合要求（>= 18）
- 删除 `node_modules` 和 `package-lock.json`，重新安装依赖

### LLM 调用失败

- 检查 API Key 是否正确
- 检查网络连接
- 尝试配置代理
- 查看控制台错误信息

### 数据库错误

- 检查数据目录是否有写入权限
- 数据库迁移会自动执行，无需手动操作

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！

### 开发规范

- **Vue 组件**：使用 Composition API (`<script setup>`)
- **样式**：使用 SCSS Scoped 样式，变量定义在 `src/styles/variables.scss`
- **IPC 通信**：所有调用返回 `{ success, data?, error? }` 格式
- **数据库**：通过 `DatabaseManager` / `GlobalCharacterManager` / `MemoryManager` 统一管理
- **命名规范**：组件 PascalCase、Store `use{功能}Store`、Composable `use{Name}`

### 添加新功能

1. 添加新的 LLM 供应商：修改 `electron/llm/providers/index.js`
2. 添加新的 IPC 接口：在 `electron/ipc/handlers/` 添加处理器 + `preload.js` 暴露 API
3. 添加新的 Vue 组件：在 `src/components/` 对应目录创建
4. 添加数据库字段：修改 `schema.sql` 并在 `runMigrations()` 中添加迁移逻辑

详细开发指南请查看 [CLAUDE.md](./CLAUDE.md)。
