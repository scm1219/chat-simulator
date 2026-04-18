# 项目结构与开发规范

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
│   │       ├── search.js
│   │       └── narrative.js
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
│   ├── config/             # 配置管理
│   │   ├── manager.js      # 全局配置管理
│   │   ├── llm-profiles.js # LLM 配置管理
│   │   └── system-prompts.js # 系统提示词模板
│   ├── narrative/          # 叙事引擎
│   │   ├── engine.js       # 叙事引擎主控
│   │   ├── emotion-manager.js    # 情绪状态机
│   │   ├── relationship-manager.js # 关系图谱
│   │   ├── event-trigger.js      # 事件触发系统
│   │   └── prompt-builder.js     # 叙事上下文构建
│   └── utils/              # 工具函数
│       ├── uuid.js         # UUID 生成
│       └── json-extractor.js # JSON 提取工具
├── src/                    # Vue 渲染进程
│   ├── main.js             # 渲染进程入口
│   ├── App.vue             # 根组件（含全局 Toast）
│   ├── components/         # Vue 组件
│   │   ├── layout/         # 布局组件（MainLayout、LeftPanel、GroupList、CharacterLibrary、GroupSearch）
│   │   ├── chat/           # 聊天组件（ChatWindow、MessageBubble、MessageInput、CharacterPanel、EmotionTag、RelationshipPanel、EventPanel、StalenessTip）
│   │   ├── config/         # 配置组件（创建群/角色、快速建群、编辑角色、全局角色、抽卡、群设置、LLM配置等）
│   │   └── common/         # 通用组件（Toast、ConfirmDialog、TagFilter、TagSelector）
│   ├── stores/             # Pinia 状态管理
│   │   ├── groups.js       # 群组
│   │   ├── characters.js   # 角色
│   │   ├── messages.js     # 消息
│   │   ├── config.js       # 配置
│   │   ├── llm-profiles.js # LLM 配置
│   │   ├── global-characters.js # 全局角色
│   │   ├── narrative.js    # 叙事引擎
│   │   ├── toast.js        # Toast 通知
│   │   └── memory.js       # 角色记忆
│   ├── composables/        # 组合式函数（useDialog）
│   └── styles/             # 样式文件（variables.scss、global.scss）
├── docs/                   # 项目文档
├── CLAUDE.md               # AI 上下文文档
├── electron/CLAUDE.md      # Electron 模块文档
├── electron/narrative/CLAUDE.md # 叙事引擎模块文档
└── src/CLAUDE.md           # 渲染进程模块文档
```

## 开发规范

### 编码规范

- **Vue 组件**：使用 Composition API (`<script setup>`)
- **样式**：使用 SCSS Scoped 样式，变量定义在 `src/styles/variables.scss`
- **IPC 通信**：所有调用返回 `{ success, data?, error? }` 格式
- **数据库**：通过 `DatabaseManager` / `GlobalCharacterManager` / `MemoryManager` 统一管理
- **命名规范**：组件 PascalCase、Store `use{功能}Store`、Composable `use{Name}`

### 添加新功能

1. **添加新的 LLM 供应商**：修改 `electron/llm/providers/index.js`
2. **添加新的 IPC 接口**：在 `electron/ipc/handlers/` 添加处理器 + `preload.js` 暴露 API
3. **添加新的 Vue 组件**：在 `src/components/` 对应目录创建
4. **添加数据库字段**：修改 `schema.sql` 并在 `runMigrations()` 中添加迁移逻辑

详细开发指南请查看 [CLAUDE.md](../CLAUDE.md)。
