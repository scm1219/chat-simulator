# LLM 角色扮演聊天模拟器

一个基于 Electron + Vite + Vue3 的桌面聊天模拟器，用户可以创建聊天群、添加 AI 角色，并通过 LLM 进行多角色对话模拟。

## 功能特性

- 🎭 **多角色对话**：支持在一个聊天群中添加多个 AI 角色，进行角色扮演对话
- 🤖 **多 LLM 支持**：支持 OpenAI、DeepSeek、通义千问、Moonshot、Ollama 等多种 LLM 供应商
- 🔧 **灵活配置**：支持全局和群组独立的 API Key 配置
- 🌐 **代理支持**：支持 HTTP/HTTPS/SOCKS5 代理
- 💾 **本地存储**：每个聊天群使用独立的 SQLite 数据库存储
- 📱 **微信风格 UI**：简洁优雅的微信绿色主题界面
- ⚡ **多种回复模式**：支持顺序和并行两种对话模式

## 技术栈

- **前端**：Vue 3 + Vite + Pinia + SCSS
- **桌面**：Electron + electron-vite
- **数据库**：better-sqlite3
- **LLM**：OpenAI 兼容协议

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

1. 点击应用右上角设置图标
2. 选择 LLM 供应商（OpenAI、DeepSeek 等）
3. 输入 API Key 和模型名称
4. 点击"测试连接"验证配置

### 2. 创建聊天群

1. 点击左上角"+ 新建"按钮
2. 输入群名称
3. 选择 LLM 供应商和模型
4. 设置最大历史轮数
5. 点击"创建"

### 3. 添加角色

1. 选择一个聊天群
2. 在右侧面板点击"+ 添加角色"
3. 输入角色名称和设定
4. 角色会自动启用，参与下一轮对话

### 4. 开始对话

1. 在中间聊天窗口输入消息
2. 按 Enter 发送（Shift + Enter 换行）
3. 所有启用的角色会依次/并行回复

## 配置说明

### 回复模式

- **顺序模式**：一个角色回复完成后，才调用下一个角色
  - 优点：逻辑清晰，避免角色回复冲突
  - 适合：剧情演绎、连续对话场景

- **并行模式**：同时调用所有启用角色的 LLM
  - 优点：速度快，适合大量角色
  - 适合：自由讨论、头脑风暴场景

### API Key 配置

- **全局 API Key**：在设置中配置，所有新群默认使用
- **群组独立 API Key**：在群设置中配置，优先级高于全局配置

### LLM 配置管理

应用支持保存多个 LLM 配置（Profile），每个配置包含：
- **配置名称**：便于识别和切换
- **供应商**：OpenAI、DeepSeek、通义千问、Moonshot 等
- **API Key**：供应商提供的访问密钥
- **模型名称**：要使用的模型（如 gpt-4、deepseek-chat 等）
- **自定义 API 地址**：可选，用于自建服务或第三方中转

**使用方式**：
1. 点击设置 → "LLM 配置管理"
2. 添加多个配置（如"OpenAI GPT-4"、"DeepSeek"、"Ollama 本地"）
3. 创建群组时选择合适的配置
4. 支持编辑、删除、测试连接

### 代理配置

如果需要使用代理访问 LLM API，可以在设置中配置：

- **协议类型**：HTTP、HTTPS、SOCKS5
- **代理地址**：代理服务器地址和端口
- **认证信息**：用户名和密码（可选）

**配置示例**：
```
协议: SOCKS5
地址: 127.0.0.1
端口: 7890
```

### 思考模式

适用于支持推理的 LLM（如 OpenAI o1 系列）：
- 启用后，模型会在回复前展示思考过程
- 可以增强复杂任务的推理质量
- 在群设置中开启"思考模式"开关

### 群背景设定

为每个群组设置背景场景，增强对话沉浸感：
- 在群设置中配置"背景设定"
- 背景会在每次调用 LLM 时作为上下文传入
- 帮助 AI 更好地理解对话场景和角色关系

**示例**：
```
这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话。
场景：赤壁之战前夕，刘备军营中，诸葛亮、刘备、关羽等人正在商议对策。
```

---

## 数据存储说明

### 存储位置

应用数据存储在系统用户数据目录下：

**Windows**：
```
C:\Users\{用户名}\AppData\Roaming\chat\

├── config/              # 配置文件目录
│   ├── llm-config.json          # 全局 LLM 配置
│   ├── llm-profiles.json        # LLM 配置列表
│   └── proxy-config.json        # 代理配置
│
└── data/                # 数据文件目录
    └── groups/          # 群组数据库目录
        ├── group_{id1}.sqlite    # 群组 1 的数据库
        ├── group_{id2}.sqlite    # 群组 2 的数据库
        └── ...
```

**macOS**：
```
~/Library/Application Support/chat/

├── config/
└── data/
    └── groups/
```

**Linux**：
```
~/.config/chat/

├── config/
└── data/
    └── groups/
```

### 数据库结构

每个聊天群使用独立的 SQLite 数据库文件（`group_{id}.sqlite`），包含三张表：

#### groups（群组表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 群组唯一 ID（主键） |
| name | TEXT | 群组名称 |
| llm_provider | TEXT | LLM 供应商 |
| llm_model | TEXT | 模型名称 |
| llm_api_key | TEXT | 独立 API Key（可选） |
| llm_base_url | TEXT | 自定义 API 地址（可选） |
| max_history | INTEGER | 最大历史轮数 |
| response_mode | TEXT | 回复模式（sequential/parallel） |
| use_global_api_key | INTEGER | 是否使用全局 API Key |
| thinking_enabled | INTEGER | 是否启用思考模式 |
| background | TEXT | 群背景设定 |
| system_prompt | TEXT | 群系统提示词 |
| created_at | DATETIME | 创建时间 |
| updated_at | DATETIME | 更新时间 |

#### characters（角色表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 角色 ID（主键） |
| group_id | TEXT | 所属群组 ID（外键） |
| name | TEXT | 角色名称 |
| system_prompt | TEXT | 系统提示词（人设） |
| enabled | INTEGER | 是否启用（0/1） |
| is_user | INTEGER | 是否为用户角色（0/1） |
| created_at | DATETIME | 创建时间 |

#### messages（消息表）
| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 消息 ID（主键） |
| group_id | TEXT | 所属群组 ID（外键） |
| character_id | TEXT | 发送角色 ID（外键，可选） |
| role | TEXT | 角色（user/assistant/system） |
| content | TEXT | 消息内容 |
| timestamp | DATETIME | 时间戳 |

### 配置文件说明

#### llm-config.json
全局 LLM 配置，新建群组时的默认配置：
```json
{
  "provider": "openai",
  "apiKey": "sk-xxx...",
  "model": "gpt-3.5-turbo",
  "baseURL": ""
}
```

#### llm-profiles.json
LLM 配置列表，保存多个预设配置：
```json
[
  {
    "id": "uuid-xxx",
    "name": "OpenAI GPT-4",
    "provider": "openai",
    "apiKey": "sk-xxx...",
    "model": "gpt-4",
    "baseURL": "",
    "createdAt": "2026-03-20T00:00:00.000Z"
  }
]
```

#### proxy-config.json
代理配置：
```json
{
  "enabled": true,
  "protocol": "socks5",
  "host": "127.0.0.1",
  "port": 7890,
  "username": "",
  "password": ""
}
```

### 数据备份与恢复

#### 备份
1. 复制整个应用数据目录（包含配置和数据库）
2. 或单独备份 `data/groups/` 目录

#### 恢复
1. 关闭应用
2. 将备份的数据库文件复制回 `data/groups/` 目录
3. 重启应用

#### 迁移到其他电脑
1. 复制 `config/` 和 `data/groups/` 目录
2. 在新电脑的对应位置替换文件

### 数据库迁移

应用会自动执行数据库结构升级：
- 添加新字段时自动迁移已有数据
- 保证向后兼容性
- 主进程启动时自动执行

## 项目结构

```
chat-simulator/
├── electron/              # Electron 主进程
│   ├── main.js           # 主进程入口
│   ├── ipc/              # IPC 通信
│   ├── database/         # 数据库层
│   ├── llm/              # LLM 服务层
│   └── config/           # 配置管理
├── src/                  # Vue 渲染进程
│   ├── components/       # Vue 组件
│   ├── stores/           # Pinia 状态管理
│   └── styles/           # 样式文件
├── data/                 # 数据存储
└── package.json
```

## 注意事项

1. **API Key 安全**：API Key 以明文存储在本地配置文件中，请勿分享给他人
2. **网络要求**：使用在线 LLM 需要稳定的网络连接
3. **Ollama 使用**：使用 Ollama 前需要先启动 Ollama 服务
4. **代理配置**：如需使用代理，请在设置中配置代理信息

## 故障排查

### 应用无法启动

- 检查 Node.js 版本是否符合要求
- 删除 `node_modules` 和 `package-lock.json`，重新安装依赖

### LLM 调用失败

- 检查 API Key 是否正确
- 检查网络连接
- 尝试配置代理
- 查看控制台错误信息

### 数据库错误

- 检查 `data/groups` 目录是否有写入权限
- 删除对应的 `.sqlite` 文件重新创建群组

## 许可证

MIT License

## 贡献

欢迎提交 Issue 和 Pull Request！
