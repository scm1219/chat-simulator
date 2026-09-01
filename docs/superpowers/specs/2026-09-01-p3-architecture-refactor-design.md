# P3 架构重构设计（遗留项落地）

- 日期：2026-09-01
- 状态：待审阅
- 依据：`docs/代码审查/2026-08-15-代码审查报告.md` §7（重复代码与架构问题）+ `docs/代码审查/2026-08-15-修复记录.md` 遗留项汇总（P3 架构重构为 2026-08-15 修复计划唯一整批排除项）
- 范围决定：**仅做 P3 架构重构 4 项**；FTS5 搜索、记忆 schema 改 character_id、focus trap 完整实现三项技术债不在本次范围
- 策略：**自底向上分层收敛**（先建共享基础设施，再迁移调用方，最后拆分上帝组件），每个重复收敛点只改一次
- 约束：重构以**行为保持**为原则（有意的行为统一点在 §8 单独声明并逐一列出）；不引入任何新依赖；不改 IPC 协议、数据库 schema、store 对外接口

## 1. 背景与目标

2026-08-15 审查的 99 项问题已全部修复（37 个 commit，`e2f0ebe..1ab2f7e`），审查报告 §7 识别的结构性问题按计划整批排除，遗留至今。本次重构目标：

1. 拆分 `CharacterPanel.vue` 上帝组件（当前 1459 行，混 7 个关注点）
2. 消灭 LLM Profile 管理双实现（LLMConfigPanel 与 LLMProfileDialog）
3. 抽取 QuickGroupDialog 与 CharacterGachaDialog 整段复制的提示词设置 Tab
4. 收敛 6 份 `getProviderName`、2 份 `getGenderLabel`、3 处行为分叉的 profile 分组逻辑
5. 将 `useDialog.confirm()` 的 createApp 命令式实现统一进 app 上下文

成功标准：CharacterPanel.vue < 300 行；上述重复定义降为 1 份；`pnpm lint` 0 错误、`pnpm build` 成功、`pnpm test` 全过；手动冒烟清单通过。

## 2. 现状核实（2026-09 代码实证）

审查报告写于 8 批修复之前，以下为修复后逐项复核结果（均仍存在）：

| # | 问题 | 现状证据 |
|---|---|---|
| 1 | CharacterPanel.vue 上帝组件 | 1459 行 = 模板 352（群设置/角色列表/关系 Tab/记忆对话框/3 个异步对话框）+ 脚本 360（9 个 store、30+ 函数）+ 样式 740（占 51%）；记忆对话框为手写 overlay + 自带全套 dialog 样式（315-350 行模板、1303-1458 行样式），绕过 BaseDialog |
| 2 | Profile 管理双实现 | `LLMProfileDialog.vue` 仅被 `CreateGroupDialog.vue:104,116` 引用；与 `LLMConfigPanel.vue`（LeftPanel 主入口）各自实现"列表 + 增删改 + 测试连接"完整闭环 |
| 3 | 提示词 Tab 整段复制 | QuickGroupDialog（状态 322-341、方法 513-560、模板 175-194、样式 786+）与 CharacterGachaDialog（状态 187-206、方法 266-300、模板 73-86、样式 549+）近乎逐行一致，唯一差异为 config 通道名（`quickGroupConfig` / `gachaConfig`） |
| 4 | 工具函数复制 | `getProviderName` ×6（CharacterPanel:428、LLMConfigPanel:171、QuickGroupDialog:346、GroupSettingsDialog:171、LLMProfileDialog:87、CreateGroupDialog:196）；`getGenderLabel` ×2（CharacterGachaDialog:211、CharacterLibrary:202）；profile 按供应商分组 ×3 且行为分叉：LLMConfigPanel:131-153 组间+组内都排序，CharacterPanel:403-425 仅组间排序，CreateGroupDialog:133-139 与 QuickGroupDialog:302-308 另用一套 providerOrder |
| 5 | confirm() 脱离 app 上下文 | `useDialog.js:10-50` 每次 confirm 用 `createApp` 挂独立 Vue app，不继承 Pinia/provide；当前未出事仅因 `ConfirmDialog.vue` 零 store 依赖（脆弱平衡）；9 个组件在用 |

## 3. 设计总览：三层收敛

```
第 1 层（基础设施）→ 第 2 层（调用方迁移）→ 第 3 层（CharacterPanel 拆分）
  utils/llm-providers.js      6+2 处函数替换          GroupSettingsSection.vue
  usePromptConfig.js          2 个对话框换共享 Tab      CharacterCard.vue
  PromptSettingsTab.vue       Profile 管理统一         MemoryDialog 摘除接线
  stores/confirm.js           MemoryDialog 接线
  MemoryDialog.vue
```

每一层完成后 lint/build/test 全绿并独立 commit；第 3 层风险最高放最后，其依赖的共享件已在前两层就位。

## 4. 第 1 层：共享基础设施

### 4.1 `src/utils/llm-providers.js`（新建）

```js
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'

export function getProviderName(providerId)
// 未知名回退返回 providerId 本身（与现有 6 份实现一致）

export function getGenderLabel(gender)
// { male: '男', female: '女', other: '其他' }，未知回退 '未知'

export function groupProfilesByProvider(profiles)
// 输出 [{ providerId, providerName, profiles: [...] }]
// 空列表/缺字段防御；过滤空组
// 统一排序：组间按 providerName localeCompare，组内按 profile.name localeCompare
```

渲染进程直接 import `electron/llm/providers/index.js` 是项目既有模式（6 处重复均如此），保持不变。

### 4.2 `src/composables/usePromptConfig.js`（新建）

```js
export function usePromptConfig(channelKey)
// channelKey: 'quickGroupConfig' | 'gachaConfig'
// 内部: window.electronAPI.config[channelKey].get() / .save(data)
// 返回: { promptForm, promptDirty, promptLoading, promptSaving,
//         loadPromptConfig, savePrompt }
```

承载现有重复实现的三段状态（form/saved/dirty computed）与加载/保存方法；保存成功统一 toast `提示词配置已保存`（行为统一点 B-2，见 §7）。

### 4.3 `src/components/config/PromptSettingsTab.vue`（新建共享组件）

- 内部使用 `usePromptConfig(props.channel)`，props 仅 `channel` 一个字符串
- 模板以 QuickGroupDialog 现版本为基准（系统提示词 / userPromptTemplate / defaultUserPrompt 三字段 + loading 态 + dirty 态 + 保存按钮），样式随之迁入
- CharacterGachaDialog 版本如有细微差异（文案/占位符），实施时以基准版本为准

### 4.4 confirm() 统一：`src/stores/confirm.js`（新建）+ ConfirmHost

仿现有 `stores/toast.js`（42 行）模式：

- store 状态：`{ visible, options }`；action `confirm(options) → Promise<boolean>`（保存 resolve，供调用方 await）
- `src/components/common/ConfirmHost.vue`：读 store 渲染现有 `ConfirmDialog.vue`（组件本体零改动），挂载于 App.vue
- `useDialog.js` 改为薄壳：`confirm` 委托 store；对外签名与返回 Promise 语义不变，**9 个调用方 import 零改动**；删除 createApp 实现块

选型说明：走 Pinia store 而非 provide/inject，是因为 store 在任何 setup 上下文（含非组件场景）均可用，且与项目现有 toast 模式一致。

### 4.5 `src/components/chat/MemoryDialog.vue`（新建）

- BaseDialog 外壳（max-width 480px），props `character`，内部自用 memoryStore（loadMemories/addMemory/deleteMemory）+ toast
- 迁入 CharacterPanel 的记忆模板（315-350 行）与记忆专属样式（1360-1458 行）；手写 overlay/dialog-header 等通用样式随 BaseDialog 外壳消失

## 5. 第 2 层：调用方迁移

| 收敛点 | 改动 | 文件 |
|---|---|---|
| getProviderName | 删 6 份本地定义，改 import | CharacterPanel / LLMConfigPanel / QuickGroupDialog / GroupSettingsDialog / LLMProfileDialog（随 §5 Profile 统一删除）/ CreateGroupDialog |
| getGenderLabel | 删 2 份本地定义，改 import | CharacterGachaDialog / CharacterLibrary |
| profile 分组 | 删 3 处本地实现，改用 `groupProfilesByProvider`；模板字段名按新输出结构对齐（`providerName`） | CharacterPanel（profileGroups）/ LLMConfigPanel（providerGroups）/ CreateGroupDialog + QuickGroupDialog（providerOrder 一套） |
| 提示词 Tab | 删除各自状态/方法/模板/样式，替换为 `<PromptSettingsTab channel="quickGroupConfig" />` / `<PromptSettingsTab channel="gachaConfig" />` | QuickGroupDialog / CharacterGachaDialog（各净减约 100+ 行） |
| Profile 管理 | 见 §5.1 | LLMConfigPanel / CreateGroupDialog / 删除 LLMProfileDialog |
| 记忆对话框 | CharacterPanel 挂 `<MemoryDialog v-if="memoryDialogVisible" :character="memoryDialogChar" @close="..." />`，删除手写模板与 3 个方法 | CharacterPanel |

### 5.1 Profile 管理统一

- 从 LLMConfigPanel 抽出核心列表 CRUD（列表渲染、测试连接、增删改、内嵌 LLMProfileForm 异步加载）为 `src/components/config/ProfileManager.vue`
- LLMConfigPanel 保留面板容器（标题栏、外层布局）+ 组合 ProfileManager，行为以现 LLMConfigPanel 为基准
- 新建 `src/components/config/ProfileManagerDialog.vue`（BaseDialog 壳 + ProfileManager）供 CreateGroupDialog 替换原 LLMProfileDialog 引用
- **删除 `LLMProfileDialog.vue`**（唯一引用点已迁移）

## 6. 第 3 层：CharacterPanel 拆分

目标：CharacterPanel.vue < 300 行，只保留 tab 容器、角色列表循环、对话框挂载与组装。

| 新组件（`src/components/chat/`） | 职责 | 约行数 |
|---|---|---|
| `GroupSettingsSection.vue` | 群设置折叠区：max_history（1-50 校验与回显）/ 回复模式 / 思考模式（联动批量更新 AI 角色）/ 随机发言 + "编辑"按钮 emit `open-settings`；内部直调 groupsStore.updateGroup，沿用现有校验与 toast | ~180 |
| `CharacterCard.vue` | 单角色条目：删除确认（用统一后的 confirm）、上移/下移、思考开关、启用开关、设定展开与角色库同步（librarySynced/syncing 状态为卡片本地）、指令输入（commandDrafts 草稿随组件）、独立模型下拉（用 `groupProfilesByProvider`） | ~280 |
| `MemoryDialog.vue` | §4.5 已建，此处完成摘除接线 | — |

依赖取舍：CharacterCard 参照 RelationshipPanel 既有模式（props 传数据、内部自用 store），props 仅 `character / index`，不用十几条 emits；`getCharEmotion`/`updateEmotion` 等叙事交互内聚在卡片。原面板级 `libraryCharIds` Set 改为卡片内 `librarySynced` 布尔（existsInLibrary 检查本就按卡片触发，共享 Set 只是无谓的跨卡状态）。CharacterPanel 的 `watch(currentGroup)` 重置 tab 与拉取情绪的逻辑保留在面板层。

样式归属：`.character-item` 全套（含用户角色渐变 `.user-character`）随 CharacterCard；`.setting-item`/折叠动画随 GroupSettingsSection；memory 样式随 MemoryDialog；`.tab-bar`/panel 骨架/empty 态留 CharacterPanel。拆分后各组件 scoped 样式互不污染，**不做额外全局化**（见 §11 排除项）。

保持不变：三个配置对话框的 `defineAsyncComponent` 按需加载；所有对外事件流（ChatWindow 对 CharacterPanel 的引用不受影响，其 props/emits 本次无改动）。

## 7. 行为一致性声明

重构以行为保持为原则，全方案**仅以下两处有意的行为统一**，均为收敛重复时的必选决策：

| 编号 | 变化 | 原因 |
|---|---|---|
| B-1 | profile 分组排序统一为 LLMConfigPanel 行为：组间按供应商名、组内按配置名排序。CharacterPanel 的"组内不排序"与 CreateGroupDialog/QuickGroupDialog 的 providerOrder 方案被替换 | 三个实现必须选一；LLMConfigPanel 行为最完整，且为主入口 |
| B-2 | CharacterGachaDialog 保存提示词成功后补 toast `提示词配置已保存`（原仅快速建群侧有提示） | usePromptConfig 统一保存路径的副作用 |

除上述两项外，所有改动为等价搬运；如实施中发现必须的行为差异，在修复记录中单列说明。

## 8. 验证策略

- **每步机械验证**：`pnpm lint` 0 错误；`pnpm build` main/preload/renderer 全产出；`pnpm test` 36 例全过
- **新增单测** `tests/llm-providers.test.js`（node:test，与现有 9 个测试文件同风格，零新增框架）：getProviderName 已知/未知 id 回退；getGenderLabel 三性别/未知回退；groupProfilesByProvider 分组正确性、组间/组内排序、空列表与未知 provider 过滤
- **手动冒烟清单**（dev 模式）：
  1. 角色面板四个群设置项修改后生效并持久化
  2. 角色卡：添加/删除（确认弹窗）/上下移/思考与启用开关/指令发送（失败回填）/独立模型切换
  3. 记忆对话框：添加/删除记忆、空态展示
  4. 设定展开 → 🔄 从角色库同步
  5. 建群对话框内打开 profile 管理（新 BaseDialog 壳），增删改测一遍
  6. 快速建群 + 角色抽卡：提示词 Tab 加载/修改/保存/再次打开确认持久化
  7. LeftPanel 的 LLM 配置面板功能不回归

## 9. 阶段与提交划分

| 阶段 | 内容 | commit 颗粒度 |
|---|---|---|
| 1 基础设施 | §4 ①~⑤ 每件一个 commit（llm-providers + 测试 / usePromptConfig / PromptSettingsTab / confirm store + Host / MemoryDialog） | 5 个 |
| 2 调用方迁移 | 函数收敛（6+2 处 + 3 处分组）/ 提示词 Tab 迁移（2 文件）/ Profile 统一（3 文件 + 删 1）/ MemoryDialog 接线 | 4 个 |
| 3 CharacterPanel 拆分 | GroupSettingsSection / CharacterCard / 面板瘦身收尾 | 2~3 个 |

每阶段收尾跑一次完整验证并更新 `src/CLAUDE.md`（或对应模块文档）中受影响的组件清单与行数描述。

## 10. 风险与回滚

- 每个 commit 独立可 revert；阶段间无交叉文件（个别文件跨阶段时在实施计划中注明先后）
- 拆分涉及 Vue 响应式边界（Map 的 reactive、props 解构丢失响应性等），实施时保持 `reactive(new Map())`、`props.xxx` 访问方式原样搬运
- LLMProfileDialog 删除为不可逆点，前置条件是 CreateGroupDialog 迁移 commit 已验证

## 11. 排除项（本次不做）

1. FTS5 / worker 搜索（审查 M-23 本体）
2. 记忆 schema 改 character_id 关联（M-4 完整方案）
3. focus trap 完整实现（M-31）
4. 对话框按钮/表单 SCSS 的全面全局化收敛（审查报告 §7 第 3 条后半）——本次仅随组件拆分自然消除 MemoryDialog 的 dialog 复制样式，其余保持组件内 scoped
5. ChatWindow.vue（1035 行）等其他大文件的进一步拆分
6. 新增通用组件库能力（如 Tabs 组件抽象）——`.tab-bar` 仅两处使用，不值得抽象
