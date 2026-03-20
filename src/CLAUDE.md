# 渲染进程 UI 模块

[根目录](../CLAUDE.md) > **src**

> 最后更新：2026-03-20 02:01:09

---

## 变更记录 (Changelog)

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
1. **UI 渲染**：提供微信风格的三栏布局界面
2. **用户交互**：处理用户输入、点击、拖拽等操作
3. **状态管理**：使用 Pinia 管理应用状态
4. **IPC 通信**：通过 `window.electronAPI` 与主进程通信

---

## 入口与启动

### 主入口文件
**路径**：`src/main.js`

### 启动流程
1. 创建 Vue 应用实例
2. 创建 Pinia 实例并注册
3. 挂载根组件 `App.vue`
4. 导入全局样式

### 关键代码
```javascript
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import './styles/global.scss'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.mount('#app')
```

### 安全检查
渲染进程通过 Preload 脚本暴露的 `window.electronAPI` 与主进程通信，确保：
- `nodeIntegration: false`：无法直接访问 Node.js API
- `contextIsolation: true`：隔离上下文，防止原型污染
- 所有主进程调用必须通过 `contextBridge` 暴露的接口

---

## 对外接口

### 组件结构
```
src/components/
├── layout/           # 布局组件
│   ├── MainLayout.vue    # 主布局（三栏）
│   └── GroupList.vue     # 群组列表（左栏）
├── chat/             # 聊天组件
│   ├── ChatWindow.vue    # 聊天窗口（中栏）
│   ├── MessageBubble.vue # 消息气泡
│   ├── MessageInput.vue  # 消息输入框
│   └── CharacterPanel.vue # 角色面板（右栏）
└── config/           # 配置组件
    ├── CreateGroupDialog.vue      # 创建群组对话框
    ├── CreateCharacterDialog.vue  # 创建角色对话框
    ├── GroupSettingsDialog.vue    # 群设置对话框
    ├── LLMProfileDialog.vue       # LLM 配置管理
    └── LLMProfileForm.vue         # LLM 配置表单
```

### 核心组件说明

#### 1. MainLayout（主布局）
**路径**：`src/components/layout/MainLayout.vue`

**职责**：
- 渲染三栏布局（左：群组列表，中：聊天窗口，右：角色面板）
- 在挂载时加载群组列表

**关键代码**：
```vue
<template>
  <div class="main-layout">
    <aside class="left-pane">
      <GroupList />
    </aside>
    <main class="center-pane">
      <ChatWindow />
    </main>
    <aside class="right-pane">
      <CharacterPanel />
    </aside>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'

const groupsStore = useGroupsStore()

onMounted(() => {
  groupsStore.loadGroups()
})
</script>
```

#### 2. GroupList（群组列表）
**路径**：`src/components/layout/GroupList.vue`

**职责**：
- 显示所有聊天群
- 点击群组切换当前群组
- 提供创建新群组的入口

**关键交互**：
- 点击群组：调用 `groupsStore.selectGroup(id)`
- 点击"+ 新建"：显示 `CreateGroupDialog`

#### 3. ChatWindow（聊天窗口）
**路径**：`src/components/chat/ChatWindow.vue`

**职责**：
- 显示聊天头部（群组名称、模型信息）
- 渲染消息列表（使用 `MessageBubble`）
- 提供消息输入框（`MessageInput`）
- 监听新消息并自动滚动到底部

**关键逻辑**：
```javascript
// 监听群组变化，加载消息和角色
watch(() => groupsStore.currentGroupId, async (newGroupId) => {
  if (newGroupId) {
    await messagesStore.loadMessages(newGroupId)
    await charactersStore.loadCharacters(newGroupId)
    await scrollToBottom()
  }
})

// 监听新消息
onMounted(() => {
  messagesStore.setupMessageListener((message) => {
    messagesStore.appendMessage(message)
    scrollToBottom()
  })
})
```

#### 4. MessageBubble（消息气泡）
**路径**：`src/components/chat/MessageBubble.vue`

**职责**：
- 根据消息类型渲染不同样式的气泡
- 显示角色名称（assistant 消息）
- 显示消息时间戳

**样式类型**：
- `user`：绿色气泡（右侧）
- `assistant`：白色气泡（左侧，带角色名）
- `system`：灰色气泡（中间）

#### 5. MessageInput（消息输入框）
**路径**：`src/components/chat/MessageInput.vue`

**职责**：
- 提供多行文本输入
- 支持 Enter 发送（Shift+Enter 换行）
- 禁用状态（发送中）

#### 6. CharacterPanel（角色面板）
**路径**：`src/components/chat/CharacterPanel.vue`

**职责**：
- 显示当前群组的所有角色
- 区分用户角色和 AI 角色（用户角色显示紫色渐变背景）
- 启用/禁用 AI 角色
- 添加新角色
- 编辑/删除角色
- 群设置快捷入口

**用户角色特殊样式**：
```scss
.character-item.user-character {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: 2px solid #5a67d8;
}
```

**群设置部分**：
- 最大历史轮数调整
- 回复模式切换
- 点击"编辑"打开 `GroupSettingsDialog`

#### 7. CreateGroupDialog（创建群组对话框）
**路径**：`src/components/config/CreateGroupDialog.vue`

**职责**：
- 从 LLM 配置列表选择（而不是手动输入供应商和模型）
- 表单：群组名称、LLM 配置、最大历史轮数、回复模式、思考模式、群背景设定
- 验证输入
- 调用 `groupsStore.createGroup()`

**新增字段**：
- **思考模式**：启用后模型会在回复前展示思考过程
- **群背景设定**：设定群场景和背景，增强对话沉浸感

**LLM 配置选择**：
```vue
<select v-model="form.selectedProfileId" class="input">
  <option value="">-- 请选择配置 --</option>
  <option
    v-for="profile in llmProfiles"
    :key="profile.id"
    :value="profile.id"
  >
    {{ profile.name }} ({{ getProviderName(profile.provider) }} - {{ profile.model }})
  </option>
</select>
```

#### 8. CreateCharacterDialog（创建角色对话框）
**路径**：`src/components/config/CreateCharacterDialog.vue`

**职责**：
- 表单：角色名称、系统提示词
- 验证输入
- 调用 `charactersStore.createCharacter()`

#### 9. GroupSettingsDialog（群设置对话框）
**路径**：`src/components/config/GroupSettingsDialog.vue`

**职责**：
- 编辑群组名称
- 编辑群背景设定
- 调整最大历史轮数
- 切换回复模式
- 切换思考模式
- 显示只读信息（供应商、模型、API Key）

**交互逻辑**：
- 只有表单有变化时"保存"按钮才可用
- 点击"保存"调用 `groupsStore.updateGroup()`
- 保存成功后触发 `@saved` 事件

#### 10. LLMProfileDialog（LLM 配置管理）
**路径**：`src/components/config/LLMProfileDialog.vue`

**职责**：
- 显示所有已保存的 LLM 配置
- 添加新配置
- 编辑现有配置
- 删除配置
- 测试连接

**功能特点**：
- 支持多个供应商配置并存
- 测试连接功能（显示"测试中..."状态）
- 内嵌表单对话框（添加/编辑）

#### 11. LLMProfileForm（LLM 配置表单）
**路径**：`src/components/config/LLMProfileForm.vue`

**职责**：
- 配置名称
- 供应商选择
- API Key 输入
- 自定义 Base URL（可选）
- 模型名称输入

---

## 关键依赖与配置

### 核心依赖
- **vue**：前端框架
- **pinia**：状态管理
- **axios**：HTTP 客户端（备用，主进程已使用）

### 构建配置
**路径**：`vite.config.js`

**关键配置**：
```javascript
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        additionalData: `@use "@/styles/variables.scss" as *;`
      }
    }
  }
})
```

### 样式系统
**路径**：`src/styles/`

#### variables.scss（设计变量）
```scss
// 微信绿色主题
$wechat-green: #07c160;
$wechat-light-green: #95ec69;
$wechat-bg: #f5f5f5;
$wechat-border: #e7e7e7;

// 三栏布局
$layout-left-width: 280px;
$layout-center-width: 1fr;
$layout-right-width: 320px;

// 消息气泡颜色
$bubble-user: $wechat-green;
$bubble-assistant: #ffffff;
$bubble-system: #f0f0f0;

// 用户角色渐变色
$user-character-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
```

#### global.scss（全局样式）
- 重置默认样式
- 设置全局字体
- 定义通用类（按钮、输入框等）

---

## 数据模型

### Pinia Stores

#### 1. groupsStore（群组状态）
**路径**：`src/stores/groups.js`

**状态**：
```javascript
{
  groups: Group[],           // 所有群组
  currentGroupId: string,    // 当前选中的群组 ID
  loading: boolean           // 加载状态
}
```

**计算属性**：
- `currentGroup`：当前选中的群组对象

**方法**：
- `loadGroups()`：加载所有群组
- `createGroup(data)`：创建新群组（支持 `thinkingEnabled` 和 `background`）
- `updateGroup(id, data)`：更新群组
- `deleteGroup(id)`：删除群组
- `selectGroup(id)`：选择群组

#### 2. charactersStore（角色状态）
**路径**：`src/stores/characters.js`

**状态**：
```javascript
{
  characters: Character[],   // 当前群组的角色列表
  loading: boolean           // 加载状态
}
```

**计算属性**：
- `enabledCharacters`：已启用的角色列表（排除用户角色）

**方法**：
- `loadCharacters(groupId)`：加载群组的角色
- `createCharacter(data)`：创建新角色
- `updateCharacter(id, data)`：更新角色
- `deleteCharacter(id)`：删除角色
- `toggleCharacter(id, enabled)`：启用/禁用角色

#### 3. messagesStore（消息状态）
**路径**：`src/stores/messages.js`

**状态**：
```javascript
{
  messages: Message[],       // 当前群组的消息列表
  loading: boolean,          // 加载状态
  sending: boolean           // 发送状态
}
```

**方法**：
- `loadMessages(groupId)`：加载群组消息
- `sendMessage(content)`：发送消息（调用 LLM）
- `appendMessage(message)`：追加新消息
- `setupMessageListener(callback)`：监听新消息事件
- `clearMessages()`：清空消息列表

#### 4. configStore（配置状态）
**路径**：`src/stores/config.js`

**职责**：
- 管理全局 LLM 配置
- 管理代理配置
- 提供配置更新接口

**方法**：
- `loadLLMConfig()`：加载 LLM 配置
- `saveLLMConfig(config)`：保存 LLM 配置
- `loadProxyConfig()`：加载代理配置
- `saveProxyConfig(config)`：保存代理配置

#### 5. llmProfilesStore（LLM 配置管理）
**路径**：`src/stores/llm-profiles.js`

**状态**：
```javascript
{
  profiles: LLMProfile[],    // 所有 LLM 配置
  loading: boolean           // 加载状态
}
```

**计算属性**：
- `profileCount`：配置数量

**方法**：
- `loadProfiles()`：加载所有配置
- `addProfile(profile)`：添加配置
- `updateProfile(id, data)`：更新配置
- `deleteProfile(id)`：删除配置
- `getProfileById(id)`：根据 ID 获取配置

**LLMProfile 结构**：
```javascript
{
  id: string,           // 配置 ID
  name: string,         // 配置名称（如 "OpenAI GPT-4"）
  provider: string,     // 供应商 ID（如 "openai"）
  apiKey: string,       // API Key
  baseURL: string,      // 自定义 Base URL（可选）
  model: string         // 模型名称（如 "gpt-4"）
}
```

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

2. **Store 测试**：测试 Pinia Store
   - 测试状态变化
   - 测试异步操作
   - 测试 IPC 调用

3. **E2E 测试**：使用 Playwright 测试完整流程
  - 创建群组
  - 添加角色
  - 发送消息
  - 验证回复

---

## 常见问题 (FAQ)

### 1. 如何添加新的组件？
**步骤**：
1. 在 `src/components/` 对应目录创建 `.vue` 文件
2. 使用 `<script setup>` + Composition API
3. 使用 SCSS Scoped 样式
4. 在父组件中导入并使用

**示例**：
```vue
<template>
  <div class="my-component">
    <button @click="handleClick">{{ text }}</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const text = ref('Click me')
function handleClick() {
  alert('Clicked!')
}
</script>

<style lang="scss" scoped>
.my-component {
  button {
    padding: 8px 16px;
    background: $wechat-green;
  }
}
</style>
```

### 2. 如何调用主进程 API？
**方法**：
所有主进程调用都通过 `window.electronAPI`：

```javascript
// 调用群组 API
const result = await window.electronAPI.group.create({
  name: 'My Group',
  llmProvider: 'openai',
  llmModel: 'gpt-3.5-turbo'
})

// 调用 LLM API
const response = await window.electronAPI.llm.generate(groupId, userMessage)

// 调用 LLM 配置 API
const profiles = await window.electronAPI.config.llmProfile.getAll()
```

### 3. 如何监听主进程事件？
**方法**：
使用 `setupMessageListener` 或其他 `on*` 方法：

```javascript
// 监听新消息
messagesStore.setupMessageListener((message) => {
  console.log('New message:', message)
})

// 清理监听器
const cleanup = messagesStore.setupMessageListener(callback)
// 组件卸载时
onUnmounted(() => cleanup())
```

### 4. 样式如何继承全局变量？
**方法**：
所有 SCSS 文件自动注入 `variables.scss`，可以直接使用变量：

```vue
<style lang="scss" scoped>
.my-component {
  color: $text-primary;
  background: $bg-secondary;
  padding: $spacing-lg;
  border-radius: $border-radius-md;
}
</style>
```

### 5. 如何使用 LLM 配置管理？
**步骤**：
1. 点击应用右上角设置图标
2. 选择"LLM 配置管理"
3. 点击"+ 添加配置"
4. 填写配置信息（名称、供应商、API Key、模型）
5. 点击"测试连接"验证配置
6. 保存配置
7. 创建群组时从配置列表选择

**优势**：
- 避免每次创建群组时重复输入配置
- 支持多个供应商配置并存
- 方便切换不同的 LLM 配置

### 6. 用户角色和 AI 角色在 UI 上有什么区别？
- **用户角色**：
  - 显示紫色渐变背景（`#667eea` → `#764ba2`）
  - 显示"用户"徽章（不可切换启用状态）
  - 不显示"删除"按钮
  - 输入框背景为半透明白色

- **AI 角色**：
  - 显示灰色背景
  - 显示启用/禁用切换开关
  - 显示"删除"按钮
  - 可以编辑名称和设定

### 7. 群背景设定如何影响对话？
- 群背景设定会在每次发送消息时作为上下文传给 LLM
- 在创建群组时可以设置（可选）
- 在群设置中可以编辑
- 适用于需要特定场景设定的对话

**示例**：
```
这是一个三国时期的讨论群，各位角色根据自己的历史背景和性格特点参与对话。
场景：赤壁之战前夕，刘备军营中，诸葛亮、刘备、关羽等人正在商议对策。
```

---

## 开发建议

### 组件设计原则
1. **单一职责**：每个组件只做一件事
2. **Props Down, Events Up**：父传子用 Props，子传父用 Events
3. **状态提升**：共享状态放在 Pinia Store 中
4. **避免直接操作 DOM**：使用 Vue 的 Ref 和 Template Refs

### 状态管理最佳实践
1. **异步操作**：所有异步操作都在 Store 中进行
2. **错误处理**：使用 try-catch 捕获错误，并通过 Alert 或 Toast 提示用户
3. **加载状态**：使用 `loading` 状态显示加载动画
4. **数据持久化**：所有数据都存储在主进程，Store 只是缓存

### 性能优化建议
1. **虚拟滚动**：如果消息列表很长，考虑使用虚拟滚动
2. **防抖/节流**：输入框搜索、滚动事件等使用防抖
3. **懒加载**：角色列表很长时，考虑懒加载
4. **缓存优化**：避免重复调用 IPC，使用 Store 缓存数据

---

## 相关文件清单

### 入口文件
- `src/main.js`：渲染进程入口
- `src/App.vue`：根组件

### 布局组件
- `src/components/layout/MainLayout.vue`：主布局
- `src/components/layout/GroupList.vue`：群组列表

### 聊天组件
- `src/components/chat/ChatWindow.vue`：聊天窗口
- `src/components/chat/MessageBubble.vue`：消息气泡
- `src/components/chat/MessageInput.vue`：消息输入框
- `src/components/chat/CharacterPanel.vue`：角色面板

### 配置组件
- `src/components/config/CreateGroupDialog.vue`：创建群组对话框
- `src/components/config/CreateCharacterDialog.vue`：创建角色对话框
- `src/components/config/GroupSettingsDialog.vue`：群设置对话框
- `src/components/config/LLMProfileDialog.vue`：LLM 配置管理
- `src/components/config/LLMProfileForm.vue`：LLM 配置表单

### 状态管理
- `src/stores/groups.js`：群组状态
- `src/stores/characters.js`：角色状态
- `src/stores/messages.js`：消息状态
- `src/stores/config.js`：配置状态
- `src/stores/llm-profiles.js`：LLM 配置状态

### 样式
- `src/styles/variables.scss`：设计变量
- `src/styles/global.scss`：全局样式

---

**文档版本**：1.1.0
**维护者**：AI 架构师（自适应版）
