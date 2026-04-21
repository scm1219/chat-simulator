# 渲染进程 UI 模块

[根目录](../CLAUDE.md) > **src**

> 最后更新：2026-04-22

---

## 变更记录 (Changelog)

### 2026-04-22
- **重构**：8 个对话框组件迁移到 `BaseDialog.vue` 通用组件（overlay/header/body/footer/header-extra 插槽）
- **重构**：所有 Store 迁移到 `useApi` composable 统一 IPC 调用模式（load/call/silent）
- **新增**：`BaseDialog.vue` 通用对话框组件（含 header-extra 插槽支持 Tab 导航）
- **新增**：`FormGroup.vue` 通用表单组组件（label/hint/error 插槽）
- **新增**：`useApi.js` composable（load/call/silent 三种 IPC 调用模式）
- **新增**：`validators.js` 表单验证工具（required/maxLength/compose/validate）
- **优化**：Store 平均减少 47% 代码量，对话框平均减少 34-54% 代码量
- **优化**：消除 `.form-group`、`.dialog-overlay`、`.dialog-header` 等 CSS 重复定义

### 2026-04-18
- **更新**：Pinia Store 从 8 个扩展为 9 个（新增 `narrative.js` Store 详情）
- **更新**：叙事组件位置标注更正（EmotionTag、RelationshipPanel、EventPanel、StalenessTip 位于 `chat/` 目录而非 `common/`）
- **更新**：组件结构图新增叙事引擎相关组件和 Store
- **更新**：叙事 Store 接口完善（`fetchEmotions`、`setRelationship`、`removeRelationship`、`fetchEventSuggestions`、`fetchRecentEvents`、`triggerEvent`、`deleteEvent`、`checkStaleness`、`setupAftermathListener`、`clearAftermath`）

### 2026-04-17
- **新增**：`QuickGroupDialog.vue`（AI 快速建群对话框，含快速建群/提示词设置两 Tab）
- **新增**：`GroupList.vue` 集成快速建群入口（"AI 建群"按钮）
- **新增**：`CharacterPanel.vue` 支持角色独立 LLM 配置（`custom_llm_profile_id` 开关和选择器）
- **新增**：`CharacterPanel.vue` 支持角色库同步功能（`syncToGroup`、`existsInLibrary`）
- **新增**：`GlobalCharacterDialog.vue` 支持同步角色设定到所有关联群组（`syncToAllGroups`）
- **新增**：`globalCharactersStore` 新增方法：`syncToGroup`、`syncToAllGroups`、`existsInLibrary`
- **修正**：全局角色库导入机制说明（使用原始 ID，非副本）
- **新增**：叙事引擎 Store（`narrative.js`，情绪/关系/事件/余波状态管理）
- **新增**：`EmotionTag.vue`（角色情绪标签组件，显示当前情绪状态，支持手动编辑 15 种情绪 + 强度滑块）
- **新增**：`RelationshipPanel.vue`（角色关系图谱面板，双向关系可视化，支持手动添加/删除关系）
- **新增**：`EventPanel.vue`（叙事事件面板，推荐事件列表与手动触发，支持事件删除）
- **新增**：`StalenessTip.vue`（对话平淡提示组件，基于平淡度显示建议）
- **新增**：`GroupSettingsDialog.vue` 集成叙事配置（引擎开关、余波开关、事件场景类型）

### 2026-03-29
- **新增**：全局角色库 Store（`global-characters.js`）、角色标签管理、搜索筛选、导入到群组
- **新增**：角色记忆 Store（`memory.js`）、记忆 CRUD
- **新增**：Toast Store（`toast.js`）、全局消息提示
- **新增**：`useDialog` composable（程序化确认对话框）
- **新增**：`LeftPanel.vue`（三 Tab 导航：聊天群/角色库/LLM 配置）
- **新增**：`CharacterLibrary.vue`（角色库面板，含搜索、标签筛选、分页、导入）
- **新增**：`GroupSearch.vue`（全局搜索，含防抖、关键词高亮）
- **新增**：`LLMConfigPanel.vue`（按供应商分组的 LLM 配置管理面板）
- **新增**：`GlobalCharacterDialog.vue`（角色库角色创建/编辑对话框，含基本信息/标签/记忆三 Tab）
- **新增**：`CharacterGachaDialog.vue`（AI 角色抽卡对话框，含抽卡/提示词设置两 Tab）
- **新增**：`EditCharacterDialog.vue`（群组角色编辑对话框）
- **新增**：`Toast.vue`（全局消息提示组件）
- **新增**：`ConfirmDialog.vue`（确认对话框组件）
- **新增**：`TagFilter.vue`（标签筛选组件）
- **新增**：`TagSelector.vue`（标签选择器组件，含创建标签）
- **优化**：`MainLayout.vue` 改用 `LeftPanel` 替代直接使用 `GroupList`，四栏 grid 布局含可隐藏分割线
- **优化**：`App.vue` 添加全局 Toast 组件
- **优化**：`GroupList.vue` 添加搜索功能

### 2026-03-20
- **更新**：角色面板支持用户角色特殊显示
- **更新**：创建群组对话框支持背景设定和思考模式
- **新增**：群设置对话框（`GroupSettingsDialog.vue`）
- **新增**：LLM 配置管理对话框（`LLMProfileDialog.vue`）
- **新增**：LLM 配置状态管理（`stores/llm-profiles.js`）
- **优化**：改进创建群组流程，支持从配置列表选择

### 2026-03-20
- 初始化模块文档
- 完成组件扫描与状态管理分析

---

## 模块职责

渲染进程是应用的前端界面，负责：
1. **UI 渲染**：提供微信风格的多栏布局界面
2. **用户交互**：处理用户输入、点击、搜索等操作
3. **状态管理**：使用 Pinia 管理应用状态（9 个 Store）
4. **IPC 通信**：通过 `window.electronAPI` 与主进程通信
5. **流式消息展示**：实时展示 LLM 流式输出和推理过程
6. **AI 快速建群**：通过自然语言描述生成完整群组方案
7. **叙事引擎 UI**：展示和管理角色情绪、关系图谱、事件触发、余波消息

---

## 入口与启动

### 主入口文件
**路径**：`src/main.js`

### 启动流程
1. 创建 Vue 应用实例
2. 创建 Pinia 实例并注册
3. 挂载根组件 `App.vue`
4. 导入全局样式

### 安全检查
渲染进程通过 Preload 脚本暴露的 `window.electronAPI` 与主进程通信，确保：
- `nodeIntegration: false`：无法直接访问 Node.js API
- `contextIsolation: true`：隔离上下文，防止原型污染
- 所有主进程调用必须通过 `contextBridge` 暴露的接口

---

## 对外接口

### 组件结构
```
src/
├── main.js                    # 入口
├── App.vue                    # 根组件（含全局 Toast）
├── composables/
│   ├── useDialog.js           # 确认对话框
│   └── useApi.js              # 统一 IPC 调用（load/call/silent） composable
├── components/
│   ├── layout/                # 布局组件
│   │   ├── MainLayout.vue     # 主布局（四栏 grid）
│   │   ├── LeftPanel.vue      # 左侧面板（三 Tab）
│   │   ├── GroupList.vue      # 群组列表（含 AI 建群入口）
│   │   ├── GroupSearch.vue    # 全局搜索
│   │   └── CharacterLibrary.vue # 角色库面板
│   ├── chat/                  # 聊天组件
│   │   ├── ChatWindow.vue     # 聊天窗口（中栏）
│   │   ├── MessageBubble.vue  # 消息气泡
│   │   ├── MessageInput.vue   # 消息输入框
│   │   ├── CharacterPanel.vue # 角色面板（右栏，含独立 LLM 配置、叙事控制）
│   │   ├── EmotionTag.vue     # 角色情绪标签（15 种情绪 + 强度编辑）
│   │   ├── RelationshipPanel.vue # 角色关系图谱（可视化 + CRUD）
│   │   ├── EventPanel.vue     # 叙事事件面板（推荐 + 触发 + 删除）
│   │   └── StalenessTip.vue   # 对话平淡提示
│   ├── config/                # 配置组件
│   │   ├── CreateGroupDialog.vue      # 创建群组对话框
│   │   ├── QuickGroupDialog.vue       # AI 快速建群对话框
│   │   ├── CreateCharacterDialog.vue  # 创建群内角色对话框
│   │   ├── EditCharacterDialog.vue    # 编辑群内角色对话框
│   │   ├── GroupSettingsDialog.vue    # 群设置对话框（含叙事配置）
│   │   ├── LLMProfileDialog.vue       # LLM 配置管理对话框
│   │   ├── LLMProfileForm.vue         # LLM 配置表单
│   │   ├── LLMConfigPanel.vue         # LLM 配置面板（左栏 Tab）
│   │   ├── GlobalCharacterDialog.vue  # 角色库角色创建/编辑
│   │   └── CharacterGachaDialog.vue   # AI 角色抽卡
│   └── common/                # 通用组件
│       ├── BaseDialog.vue     # 通用对话框（插槽：header-extra/body/footer）
│       ├── FormGroup.vue      # 通用表单组（插槽：label/hint/error）
│       ├── Toast.vue          # 全局消息提示
│       ├── ConfirmDialog.vue  # 确认对话框
│       ├── TagFilter.vue      # 标签筛选
│       └── TagSelector.vue    # 标签选择器（含创建）
├── stores/                    # 状态管理
│   ├── groups.js              # 群组
│   ├── characters.js          # 群内角色
│   ├── messages.js            # 消息
│   ├── config.js              # 配置
│   ├── llm-profiles.js        # LLM 配置 Profile
│   ├── global-characters.js   # 全局角色库（含同步）
│   ├── memory.js              # 角色记忆
│   ├── toast.js               # 消息提示
│   └── narrative.js           # 叙事引擎（情绪/关系/事件/余波）
├── composables/
│   ├── useDialog.js           # 确认对话框
│   └── useApi.js              # 统一 IPC 调用（load/call/silent）
└── styles/
    ├── variables.scss          # 设计变量
    └── global.scss             # 全局样式
```

### 核心组件说明

#### 1. MainLayout（主布局）
**路径**：`src/components/layout/MainLayout.vue`

**职责**：
- 渲染四栏 grid 布局（左：LeftPanel，中：ChatWindow，分割线，右：CharacterPanel）
- 右侧面板支持双击隐藏/显示
- 通过 `provide` 提供面板状态给子组件

#### 2. LeftPanel（左侧面板）
**路径**：`src/components/layout/LeftPanel.vue`

**职责**：
- 三个 Tab 导航：聊天群、角色库、LLM 配置
- 预加载角色库数据
- 使用 `v-show` 切换内容，保持状态

#### 3. GroupList（群组列表）
**路径**：`src/components/layout/GroupList.vue`

**职责**：
- 显示所有群组列表
- 搜索功能
- "AI 建群"按钮，打开 `QuickGroupDialog`

#### 4. QuickGroupDialog（AI 快速建群对话框）
**路径**：`src/components/config/QuickGroupDialog.vue`

**职责**：
- 两个 Tab：快速建群、提示词设置
- **快速建群流程**：
  1. 选择 LLM 配置 Profile
  2. 输入群组描述（如"办公室白领聊天群，3个女性，1个男性"）
  3. 点击"AI 生成"，调用 `llm:generateGroup` 接口
  4. 预览生成的群名称、背景设定、角色列表（可编辑）
  5. 确认创建群组和角色（可选同时保存到角色库）
- **提示词设置**：可自定义系统提示词、用户提示模板、默认用户提示

#### 5. CharacterLibrary（角色库面板）
**路径**：`src/components/layout/CharacterLibrary.vue`

**职责**：
- 显示全局角色库列表（含分页）
- 搜索和标签筛选
- 角色创建、编辑、删除
- 导入角色到当前群组

#### 6. GroupSearch（全局搜索）
**路径**：`src/components/layout/GroupSearch.vue`

**职责**：
- 跨群组搜索消息内容和角色名称
- 300ms 防抖搜索
- 关键词高亮显示
- 点击结果跳转到对应群组

#### 7. GlobalCharacterDialog（角色库角色对话框）
**路径**：`src/components/config/GlobalCharacterDialog.vue`

**职责**：
- 三个 Tab：基本信息（姓名/性别/年龄/人设）、标签选择、记忆管理
- 创建/编辑全局角色
- 标签选择器集成
- 记忆 CRUD（编辑模式）
- **同步功能**：编辑模式下支持将角色设定同步到所有关联群组

#### 8. CharacterPanel（角色面板）
**路径**：`src/components/chat/CharacterPanel.vue`

**职责**：
- 角色列表（含用户角色特殊显示）
- 启用/禁用角色
- 角色编辑
- **独立 LLM 配置**：每个角色可开关独立 LLM Profile，选择不同的供应商/模型
- **角色库同步**：群组角色如果来自角色库，显示"同步"按钮更新设定
- 群设置入口
- 群设置快捷操作（最大历史轮数、回复模式、思考模式、随机发言）

#### 9. CharacterGachaDialog（角色抽卡对话框）
**路径**：`src/components/config/CharacterGachaDialog.vue`

**职责**：
- 两个 Tab：抽卡、提示词设置
- 输入角色提示，使用 LLM 生成角色
- 可配置系统提示词和用户提示模板
- 预览生成结果，添加到角色库

#### 10. LLMConfigPanel（LLM 配置面板）
**路径**：`src/components/config/LLMConfigPanel.vue`

**职责**：
- 按供应商分组显示 LLM 配置
- 配置 CRUD 操作
- 思考模式切换
- 内嵌编辑/添加表单

#### 11. ChatWindow（聊天窗口）
**路径**：`src/components/chat/ChatWindow.vue`

**职责**：
- 显示聊天头部（群组名称、模型信息）
- 渲染消息列表（使用 `MessageBubble`）
- 提供消息输入框（`MessageInput`）
- 监听流式消息事件并实时更新

#### 12. EmotionTag（情绪标签）
**路径**：`src/components/chat/EmotionTag.vue`

**职责**：
- 显示角色当前情绪状态（带颜色标签）
- 支持手动编辑：15 种情绪选项 + 强度滑块（0.1~1.0）
- 提供 `update` 事件（含 emotion 和 intensity）
- 点击外部自动关闭编辑器

#### 13. RelationshipPanel（关系图谱面板）
**路径**：`src/components/chat/RelationshipPanel.vue`

**职责**：
- 显示群组内所有角色关系（A -> B 格式）
- 关系类型标签 + 好感度进度条（颜色分级）
- 支持手动添加关系（选择角色对 + 关系类型 + 描述）
- 支持删除关系
- 好感度颜色分级：深厚(绿)/亲密(浅绿)/友好(黄绿)/中立(黄)/不满(橙)/敌对(红)

#### 14. EventPanel（事件面板）
**路径**：`src/components/chat/EventPanel.vue`

**职责**：
- 显示推荐事件列表（含影响标签和内容）
- 点击事件卡片触发事件
- "换一批"按钮刷新推荐
- 显示最近事件列表（含事件类型标签：手动/自动）
- 支持删除事件（同时删除关联的聊天消息）

#### 15. StalenessTip（平淡提示）
**路径**：`src/components/chat/StalenessTip.vue`

**职责**：
- 当对话平淡度检测为 true 时显示提示条
- 提供"查看推荐事件"按钮
- 提供"忽略"关闭按钮

#### 16. GroupSettingsDialog（群设置对话框）
**路径**：`src/components/config/GroupSettingsDialog.vue`

**职责**：
- 群名称编辑
- 系统提示词编辑（最高优先级）
- 群背景设定编辑
- 最大历史轮数设置
- 回复模式选择
- 思考模式开关
- 随机发言开关
- 自动记忆提取开关
- **叙事引擎配置**：叙事引擎开关、余波编排开关、事件场景类型选择

#### 17. 其他组件
- **MessageBubble**：消息气泡（用户/助手/系统三种样式）
- **MessageInput**：消息输入框（Enter 发送，Shift+Enter 换行）
- **Toast**：全局消息提示（success/error/warning/info 四种类型）
- **ConfirmDialog**：确认对话框（通过 `useDialog` composable 调用）
- **TagFilter**：标签筛选组件（多选切换）
- **TagSelector**：标签选择器（含创建自定义标签、颜色选择）
- **EditCharacterDialog**：编辑群内角色
- **CreateGroupDialog**：手动创建群组对话框
- **CreateCharacterDialog**：创建群内角色对话框
- **LLMProfileDialog**：LLM 配置管理对话框
- **LLMProfileForm**：LLM 配置表单

---

## 关键依赖与配置

### 核心依赖
- **vue**：前端框架
- **pinia**：状态管理

### 构建配置
**路径**：`electron.vite.config.js`（由 electron-vite 管理）

### 样式系统
**路径**：`src/styles/`

#### variables.scss（设计变量）
- 微信绿色主题（`$wechat-green`、`$wechat-bg` 等）
- 三栏布局宽度变量
- 消息气泡颜色
- 用户角色渐变色
- 间距、字体、圆角、阴影等设计系统变量

#### global.scss（全局样式）
- 重置默认样式
- 设置全局字体
- 定义通用类（按钮、输入框等）

---

## 数据模型

### Pinia Stores（9 个）

#### 1. groupsStore（群组状态）
**路径**：`src/stores/groups.js`

**方法**：`loadGroups`、`createGroup`、`updateGroup`、`deleteGroup`、`selectGroup`、`duplicateGroup`

#### 2. charactersStore（群内角色状态）
**路径**：`src/stores/characters.js`

**计算属性**：`enabledCharacters`（已启用的非用户角色）

**方法**：`loadCharacters`、`createCharacter`、`updateCharacter`、`deleteCharacter`、`toggleCharacter`、`reorderCharacter`

#### 3. messagesStore（消息状态）
**路径**：`src/stores/messages.js`

**方法**：`loadMessages`、`sendMessage`、`appendMessage`、`setupMessageListener`、`clearMessages`、`deleteMessage`、`deleteFromMessage`、`exportMessages`

**流式消息**：`setupStreamListeners`（start/chunk/end/error）

#### 4. configStore（配置状态）
**路径**：`src/stores/config.js`

**方法**：`loadLLMConfig`、`saveLLMConfig`、`loadProxyConfig`、`saveProxyConfig`

#### 5. llmProfilesStore（LLM 配置管理）
**路径**：`src/stores/llm-profiles.js`

**方法**：`loadProfiles`、`addProfile`、`updateProfile`、`deleteProfile`

#### 6. globalCharactersStore（全局角色库）
**路径**：`src/stores/global-characters.js`

**状态**：`characters`、`tags`、`searchKeyword`、`selectedTagIds`

**计算属性**：`filteredCharacters`（带标签和关键词筛选）、`characterCount`、`defaultTags`、`customTags`

**方法**：角色 CRUD、标签 CRUD、`searchCharacters`、`importToGroup`、`syncToGroup`、`syncToAllGroups`、`existsInLibrary`、`toggleTagFilter`、`clearTagFilter`

#### 7. memoryStore（角色记忆）
**路径**：`src/stores/memory.js`

**状态**：`memoriesMap`（按角色名缓存）

**方法**：`loadMemories`、`addMemory`、`updateMemory`、`deleteMemory`、`getMemories`

#### 8. toastStore（消息提示）
**路径**：`src/stores/toast.js`

**方法**：`success`、`error`、`warning`、`info`（便捷方法）、`addToast`、`removeToast`

#### 9. narrativeStore（叙事引擎状态）
**路径**：`src/stores/narrative.js`

**状态**：
- `emotions`：角色情绪列表
- `relationships`：角色关系列表
- `eventSuggestions`：推荐事件列表
- `recentEvents`：最近事件列表
- `staleness`：对话平淡度（`{ stale: boolean, reason: string|null }`）
- `aftermathMessages`：余波消息列表

**方法**：
- `fetchEmotions(groupId)`：获取群组所有角色情绪
- `fetchRelationships(groupId)`：获取群组角色关系
- `setRelationship(groupId, fromId, toId, type, description)`：设置角色关系
- `removeRelationship(groupId, fromId, toId)`：删除角色关系
- `fetchEventSuggestions(groupId, sceneType)`：获取推荐事件
- `fetchRecentEvents(groupId)`：获取最近事件
- `triggerEvent(groupId, eventKey, content, impact)`：触发事件
- `deleteEvent(groupId, eventId)`：删除事件（含关联消息）
- `checkStaleness(groupId)`：检查对话平淡度
- `setupAftermathListener()`：监听余波事件（`narrative:aftermath`）
- `clearAftermath()`：清空余波消息列表

---

## 测试与质量

### 当前状态
- **无自动化测试**
- **手动测试**：通过开发模式验证 UI 交互

### 推荐测试方案
1. **组件测试**：使用 @vue/test-utils 测试组件
   - 测试用户交互（点击、输入）
   - 测试 Props 和 Events
   - 测试条件渲染
   - 测试标签筛选和搜索
   - 测试情绪标签编辑（15 种情绪选择 + 强度滑块）
   - 测试关系面板添加/删除关系
   - 测试事件面板推荐/触发/删除

2. **Store 测试**：测试 Pinia Store
   - 测试状态变化
   - 测试异步操作
   - 测试 IPC 调用
   - 测试筛选逻辑（`filteredCharacters`）
   - 测试叙事 Store 的事件监听和余波消息管理

3. **E2E 测试**：使用 Playwright 测试完整流程
   - 创建群组、添加角色、发送消息
   - 角色库管理、导入角色、同步角色
   - 全局搜索
   - LLM 配置管理
   - AI 快速建群
   - 叙事引擎：情绪查看/编辑、关系管理、事件触发

---

## 常见问题 (FAQ)

### 1. 如何添加新的组件？
**步骤**：
1. 在 `src/components/` 对应目录创建 `.vue` 文件
2. 使用 `<script setup>` + Composition API
3. 使用 SCSS Scoped 样式
4. 在父组件中导入并使用

### 2. 如何调用主进程 API？
所有主进程调用都通过 `window.electronAPI`：

```javascript
// 调用群组 API
const result = await window.electronAPI.group.create({...})

// 调用全局角色库 API
const chars = await window.electronAPI.globalCharacter.getAllWithTags()

// 调用记忆 API
await window.electronAPI.memory.add({...})

// 全局搜索
const results = await window.electronAPI.search.global(keyword)

// AI 快速建群
const group = await window.electronAPI.llm.generateGroup(description, profileId)

// 快速建群配置
const config = await window.electronAPI.config.quickGroupConfig.get()

// 角色库同步
const synced = await window.electronAPI.globalCharacter.syncToAllGroups(characterId)

// 叙事引擎
const emotions = await window.electronAPI.narrative.getEmotions(groupId)
await window.electronAPI.narrative.setEmotion(groupId, charId, '开心', 0.8)
await window.electronAPI.narrative.triggerEvent(groupId, 'fire_alarm', '消防警报响了', '惊慌')
```

### 3. 如何监听主进程事件？
使用 Store 的 `setupMessageListener` 或其他 `on*` 方法：

```javascript
// 监听流式消息
messagesStore.setupStreamListeners()

// 监听余波消息
narrativeStore.setupAftermathListener()

// Toast 提示
toast.success('操作成功')
```

### 4. 样式如何继承全局变量？
所有 SCSS 文件自动注入 `variables.scss`，可以直接使用变量：

```vue
<style lang="scss" scoped>
.my-component {
  color: $text-primary;
  background: $wechat-green;
}
</style>
```

### 5. 如何使用 useDialog composable？
```javascript
import { useDialog } from '../../composables/useDialog'
const { confirm } = useDialog()

const confirmed = await confirm({
  title: '确认操作',
  message: '确定要删除吗？',
  confirmText: '删除',
  cancelText: '取消'
})
```

### 6. 全局角色库和群组角色如何协作？
- 全局角色库通过 `LeftPanel` 的"角色库" Tab 管理
- 群组角色通过 `CharacterPanel` 管理
- 全局角色可以一键导入到当前群组（使用角色库原始 ID）
- 导入后可通过 `syncToGroup` 从角色库同步更新到群组
- 在角色库编辑角色时可通过 `syncToAllGroups` 同步到所有关联群组
- 角色记忆通过角色名称跨群组关联

### 7. 标签系统如何工作？
- 10 个系统默认标签（现代、古代、科幻等）
- 支持创建自定义标签（含颜色选择）
- 角色可关联多个标签
- 角色库列表支持标签筛选
- 系统默认标签不可删除

### 8. 角色独立 LLM 配置如何使用？
- 在 `CharacterPanel` 中，每个角色卡片有"独立配置"开关
- 开启后可选择不同的 LLM Profile
- 角色发言时将使用独立配置的供应商/模型/API Key/代理
- 关闭后回退到群组配置

### 9. 叙事引擎 UI 如何使用？
- **情绪标签**：在角色面板或聊天窗口中显示 `EmotionTag`，点击可手动编辑情绪和强度
- **关系图谱**：通过 `RelationshipPanel` 查看和编辑角色间关系，支持添加/删除
- **事件面板**：通过 `EventPanel` 查看推荐事件，点击触发，支持删除已有事件
- **平淡提示**：`StalenessTip` 在对话平淡时自动显示，引导用户触发事件
- **群设置**：`GroupSettingsDialog` 中可开关叙事引擎和余波编排，选择事件场景类型

---

## 开发建议

### 组件设计原则
1. **单一职责**：每个组件只做一件事
2. **Props Down, Events Up**：父传子用 Props，子传父用 Events
3. **状态提升**：共享状态放在 Pinia Store 中
4. **避免直接操作 DOM**：使用 Vue 的 Ref 和 Template Refs
5. **Composable 复用**：通用逻辑抽取为 composable（如 `useDialog`）

### 状态管理最佳实践
1. **异步操作**：所有异步操作都在 Store 中进行
2. **错误处理**：使用 `toast.error()` 提示用户
3. **加载状态**：使用 `loading` 状态显示加载动画
4. **数据持久化**：所有数据都存储在主进程，Store 只是缓存
5. **筛选逻辑**：使用 computed 属性实现本地筛选（如 `filteredCharacters`）

### 性能优化建议
1. **虚拟滚动**：消息列表考虑虚拟滚动
2. **防抖/节流**：搜索使用 300ms 防抖
3. **懒加载**：角色库标签和记忆按需加载
4. **缓存优化**：避免重复调用 IPC，使用 Store 缓存数据
5. **分页**：角色库使用分页（每页 5 条）

---

## 相关文件清单

### 入口文件
- `src/main.js`：渲染进程入口
- `src/App.vue`：根组件（含全局 Toast）

### 布局组件
- `src/components/layout/MainLayout.vue`：主布局
- `src/components/layout/LeftPanel.vue`：左侧面板（三 Tab）
- `src/components/layout/GroupList.vue`：群组列表（含 AI 建群入口）
- `src/components/layout/GroupSearch.vue`：全局搜索
- `src/components/layout/CharacterLibrary.vue`：角色库面板

### 聊天组件
- `src/components/chat/ChatWindow.vue`：聊天窗口
- `src/components/chat/MessageBubble.vue`：消息气泡
- `src/components/chat/MessageInput.vue`：消息输入框
- `src/components/chat/CharacterPanel.vue`：角色面板（含独立 LLM 配置、同步功能）
- `src/components/chat/EmotionTag.vue`：角色情绪标签（15 种情绪编辑）
- `src/components/chat/RelationshipPanel.vue`：角色关系图谱面板
- `src/components/chat/EventPanel.vue`：叙事事件面板
- `src/components/chat/StalenessTip.vue`：对话平淡提示

### 配置组件
- `src/components/config/CreateGroupDialog.vue`：创建群组对话框
- `src/components/config/QuickGroupDialog.vue`：AI 快速建群对话框
- `src/components/config/CreateCharacterDialog.vue`：创建群内角色对话框
- `src/components/config/EditCharacterDialog.vue`：编辑群内角色对话框
- `src/components/config/GroupSettingsDialog.vue`：群设置对话框（含叙事配置）
- `src/components/config/LLMProfileDialog.vue`：LLM 配置管理对话框
- `src/components/config/LLMProfileForm.vue`：LLM 配置表单
- `src/components/config/LLMConfigPanel.vue`：LLM 配置面板
- `src/components/config/GlobalCharacterDialog.vue`：角色库角色创建/编辑
- `src/components/config/CharacterGachaDialog.vue`：AI 角色抽卡

### 通用组件
- `src/components/common/BaseDialog.vue`：通用对话框（overlay/header/body/footer/header-extra 插槽）
- `src/components/common/FormGroup.vue`：通用表单组（label/hint/error 插槽）
- `src/components/common/Toast.vue`：全局消息提示
- `src/components/common/ConfirmDialog.vue`：确认对话框
- `src/components/common/TagFilter.vue`：标签筛选
- `src/components/common/TagSelector.vue`：标签选择器

### 状态管理
- `src/stores/groups.js`：群组状态
- `src/stores/characters.js`：群内角色状态
- `src/stores/messages.js`：消息状态
- `src/stores/config.js`：配置状态
- `src/stores/llm-profiles.js`：LLM 配置状态
- `src/stores/global-characters.js`：全局角色库状态（含同步）
- `src/stores/memory.js`：角色记忆状态
- `src/stores/toast.js`：消息提示状态
- `src/stores/narrative.js`：叙事引擎状态（情绪/关系/事件/余波）

### Composables
- `src/composables/useDialog.js`：确认对话框
- `src/composables/useApi.js`：统一 IPC API 调用（`load`/`call`/`silent` 三种模式，自动管理 loading 状态和错误日志）

### 样式
- `src/styles/variables.scss`：设计变量
- `src/styles/global.scss`：全局样式

---

**文档版本**：2.3.0
**维护者**：AI 架构师（自适应版）
