# 数据存储说明

## 存储位置

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

## 数据库结构

应用使用三类独立 SQLite 数据库：

### 1. 群组数据库（`data/groups/group_{id}.sqlite`）

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
| narrative_enabled | INTEGER | 是否启用叙事引擎 |
| aftermath_enabled | INTEGER | 是否启用余波互动 |
| event_scene_type | TEXT | 事件场景类型 |
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
| custom_llm_profile_id | TEXT | 角色独立 LLM Profile ID（可选） |
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
| model | TEXT | 实际使用的 LLM 模型名称（可选） |
| is_aftermath | INTEGER | 是否为余波消息 |
| message_type | TEXT | 消息类型（如 aftermath） |
| timestamp | DATETIME | 时间戳 |

**character_emotions（角色情绪表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 记录 ID（主键） |
| group_id | TEXT | 群组 ID |
| character_id | TEXT | 角色 ID |
| emotion | TEXT | 情绪类型 |
| intensity | REAL | 情绪强度（0-1） |
| reason | TEXT | 情绪原因 |
| updated_at | DATETIME | 更新时间 |

**character_relationships（角色关系表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 记录 ID（主键） |
| group_id | TEXT | 群组 ID |
| character_id | TEXT | 角色 ID |
| target_character_id | TEXT | 目标角色 ID |
| relationship_type | TEXT | 关系类型 |
| affinity | INTEGER | 好感度（-100~100） |
| updated_at | DATETIME | 更新时间 |

**narrative_events（叙事事件表）**

| 字段 | 类型 | 说明 |
|------|------|------|
| id | TEXT | 事件 ID（主键） |
| group_id | TEXT | 群组 ID |
| event_type | TEXT | 事件类型 |
| description | TEXT | 事件描述 |
| scene_type | TEXT | 场景类型 |
| triggered | INTEGER | 是否已触发 |
| triggered_at | DATETIME | 触发时间 |
| created_at | DATETIME | 创建时间 |

### 2. 全局角色库数据库（`data/global/character-library.sqlite`）

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

### 3. 角色记忆数据库（`data/global/character-memories.sqlite`）

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

## 数据库迁移

应用启动时自动执行数据库结构升级，保证向后兼容性。历史迁移包括：reasoning_content、position、thinking_enabled（角色级）、random_order、prompt_tokens/completion_tokens、auto_memory_extract、system_prompt、custom_llm_profile_id、model、narrative_enabled、aftermath_enabled、event_scene_type、is_aftermath、message_type 等字段，以及 character_emotions、character_relationships、narrative_events 三张叙事引擎相关表。

## 数据备份与恢复

### 备份
1. 复制整个应用数据目录（包含 config 和 data）
2. 或单独备份 `data/` 目录

### 恢复
1. 关闭应用
2. 将备份文件复制回对应目录
3. 重启应用

### 迁移到其他电脑
1. 复制 `config/` 和 `data/` 目录
2. 在新电脑的对应位置替换文件
