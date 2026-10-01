# P3 架构重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 落地 2026-08-15 审查遗留的 4 项 P3 架构重构：CharacterPanel 拆分、Profile 管理统一、提示词 Tab 抽取、重复工具函数收敛，外加 confirm 弹窗统一进 app 上下文。

**Architecture:** 自底向上三层收敛——先建共享基础设施（工具/composable/共享组件/confirm store），再迁移全部调用方，最后把 CharacterPanel.vue（1459 行）拆为 GroupSettingsSection + CharacterCard + MemoryDialog，面板降到 300 行以内。每个任务独立 commit、独立可 revert。

**Tech Stack:** Electron 41 + Vue 3.5（Composition API `<script setup>`）+ Pinia 3 + SCSS；测试用 Node 内置 test runner（`node --test`，零新增框架）。

**Spec:** `docs/superpowers/specs/2026-09-01-p3-architecture-refactor-design.md`（本计划从 spec 论证，执行者须同时阅读两者）

## Global Constraints

- **零新依赖**；不改 IPC 协议、数据库 schema、任何 store 的对外接口
- `MainLayout.vue:11` 以 `<CharacterPanel />`（无 props/emits）挂载，此对外接口全程不变
- **行为保持**为原则；全计划仅有 3 处有意变化（均已在 spec §7 声明或此处补充）：B-1 分组排序统一为 LLMConfigPanel 行为（扁平下拉用 `sortProfilesByProvider` 保持原顺序零变化）；B-2 抽卡保存/恢复提示词补 toast；`getGenderLabel` 未知性别回退统一为 `'未知'`（CharacterLibrary 原 `''`，该分支仅在非法数据下触发）
- 每任务收尾验证三件套全绿后才允许 commit：`pnpm lint`（0 错误）、`pnpm build`（main/preload/renderer 全产出）、`pnpm test`（现有用例全过；开始前先跑一次记录基线数量）
- Commit 前缀 `refactor(p3):`，中文描述；一个任务一个 commit（Task 1 的测试与实现同一 commit）
- 涉及用户可见变化的任务（2/5/7/8/10）在 commit 前，按任务内"冒烟点"在 `pnpm dev` 下手动验证
- Vue 代码搬运时保持响应式写法原样：`reactive(new Map())` 不改为 ref、模板内不解构 props、`store.xxx` 直接访问
- 新文件放在既有目录约定内：工具 `src/utils/`、composable `src/composables/`、store `src/stores/`、通用组件 `src/components/common/`、聊天组件 `src/components/chat/`、配置组件 `src/components/config/`

## File Structure（最终形态）

```
src/
  utils/llm-providers.js                [新] getProviderName/getGenderLabel/groupProfilesByProvider/sortProfilesByProvider
  stores/confirm.js                     [新] 确认弹窗状态机
  composables/usePromptConfig.js        [新] 提示词配置加载/保存/恢复
  components/
    common/ConfirmHost.vue              [新] 全局确认弹窗宿主（复用 ConfirmDialog）
    config/PromptSettingsTab.vue        [新] 提示词设置 Tab 共享组件
    config/ProfileManager.vue           [新] Profile 列表 CRUD 核心（供两种外壳复用）
    config/ProfileManagerDialog.vue     [新] BaseDialog 外壳（CreateGroupDialog 用）
    chat/MemoryDialog.vue               [新] 记忆管理对话框（BaseDialog 外壳）
    chat/GroupSettingsSection.vue       [新] 群设置折叠区
    chat/CharacterCard.vue              [新] 单角色条目
    config/LLMProfileDialog.vue         [删]
tests/llm-providers.test.js             [新]
```

修改：App.vue、useDialog.js、QuickGroupDialog.vue、CharacterGachaDialog.vue、CreateGroupDialog.vue、GroupSettingsDialog.vue、CharacterLibrary.vue、LLMConfigPanel.vue、CharacterPanel.vue、styles/global.scss、CLAUDE.md、src/CLAUDE.md。

---

### Task 1: `llm-providers` 共享工具 + 单测（TDD）

**Files:**
- Create: `src/utils/llm-providers.js`
- Test: `tests/llm-providers.test.js`

**Interfaces:**
- Consumes: `LLM_PROVIDERS`（`electron/llm/providers/index.js` 纯数据导出，渲染进程直接 import 是项目既有模式）
- Produces（后续任务依赖的确切签名）:
  - `getProviderName(providerId) → string`（未知回退 providerId 本身）
  - `getGenderLabel(gender) → string`（male/female/other → 男/女/其他，未知回退 `'未知'`）
  - `groupProfilesByProvider(profiles) → [{ providerId, providerName, profiles: Profile[] }]`（组间按 providerName、组内按 name 排序；空/非数组返回 `[]`；过滤空组与未知供应商）
  - `sortProfilesByProvider(profiles) → Profile[]`（扁平：供应商声明顺序优先，同供应商内按 name；空/非数组返回 `[]`）

- [ ] **Step 1: 写失败测试** `tests/llm-providers.test.js`

```js
// tests/llm-providers.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  getProviderName,
  getGenderLabel,
  groupProfilesByProvider,
  sortProfilesByProvider
} from '../src/utils/llm-providers.js'

test('getProviderName 已知 id 返回供应商名', () => {
  assert.equal(getProviderName('openai'), 'OpenAI')
  assert.equal(getProviderName('deepseek'), 'DeepSeek')
})

test('getProviderName 未知 id 回退为 id 本身', () => {
  assert.equal(getProviderName('nonexistent'), 'nonexistent')
})

test('getGenderLabel 三种性别与未知回退', () => {
  assert.equal(getGenderLabel('male'), '男')
  assert.equal(getGenderLabel('female'), '女')
  assert.equal(getGenderLabel('other'), '其他')
  assert.equal(getGenderLabel('robot'), '未知')
  assert.equal(getGenderLabel(undefined), '未知')
})

test('groupProfilesByProvider 分组、组间/组内排序、过滤未知供应商', () => {
  const profiles = [
    { id: '1', provider: 'deepseek', name: 'B' },
    { id: '2', provider: 'openai', name: 'Z' },
    { id: '3', provider: 'openai', name: 'A' },
    { id: '4', provider: 'nonexistent', name: '丢弃' }
  ]
  const groups = groupProfilesByProvider(profiles)
  assert.equal(groups.length, 2)
  // 组间按供应商名 localeCompare：DeepSeek < OpenAI
  assert.equal(groups[0].providerId, 'deepseek')
  assert.equal(groups[0].providerName, 'DeepSeek')
  assert.equal(groups[1].providerId, 'openai')
  // 组内按配置名排序
  assert.deepEqual(groups[1].profiles.map(p => p.name), ['A', 'Z'])
})

test('groupProfilesByProvider 空/非数组防御', () => {
  assert.deepEqual(groupProfilesByProvider([]), [])
  assert.deepEqual(groupProfilesByProvider(null), [])
})

test('sortProfilesByProvider 供应商声明顺序优先、同供应商按名称排序', () => {
  const profiles = [
    { id: '1', provider: 'openai', name: 'B' },
    { id: '2', provider: 'openai', name: 'A' },
    { id: '3', provider: 'deepseek', name: 'X' }
  ]
  const sorted = sortProfilesByProvider(profiles)
  // providers/index.js 中 openai 声明在 deepseek 之前
  assert.deepEqual(sorted.map(p => p.id), ['2', '1', '3'])
})

test('sortProfilesByProvider 空/非数组防御', () => {
  assert.deepEqual(sortProfilesByProvider([]), [])
  assert.deepEqual(sortProfilesByProvider(undefined), [])
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `pnpm test 2>&1 | tail -20`
Expected: FAIL（`Cannot find module '../src/utils/llm-providers.js'` 或导出不存在）

- [ ] **Step 3: 写实现** `src/utils/llm-providers.js`

```js
// src/utils/llm-providers.js
// 渲染进程共享的 LLM 供应商相关工具（收敛自 6 份 getProviderName、
// 2 份 getGenderLabel、3 处 profile 排序/分组实现）
// 注意路径：src/utils/ 上两级即仓库根，与 src/components/**/ 下的三级路径不同
import { LLM_PROVIDERS } from '../../electron/llm/providers/index.js'

// 未知 id 回退返回 id 本身（与既有各处实现一致）
export function getProviderName(providerId) {
  const provider = LLM_PROVIDERS[providerId]
  return provider ? provider.name : providerId
}

// 未知性别回退 '未知'（统一自 CharacterGachaDialog 的 '未知' 与 CharacterLibrary 的 ''）
export function getGenderLabel(gender) {
  const labels = { male: '男', female: '女', other: '其他' }
  return labels[gender] || '未知'
}

// 按供应商分组（组间按供应商名、组内按配置名排序）——统一自
// LLMConfigPanel:131-153（基准行为）与 CharacterPanel:403-425（组内不排序的分叉版）
export function groupProfilesByProvider(profiles) {
  if (!Array.isArray(profiles)) return []
  const groups = {}
  Object.values(LLM_PROVIDERS).forEach(provider => {
    groups[provider.id] = {
      providerId: provider.id,
      providerName: provider.name,
      profiles: []
    }
  })
  profiles.forEach(profile => {
    if (groups[profile?.provider]) {
      groups[profile.provider].profiles.push(profile)
    }
  })
  return Object.values(groups)
    .filter(group => group.profiles.length > 0)
    .map(group => ({
      ...group,
      profiles: [...group.profiles].sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.providerName.localeCompare(b.providerName))
}

// 扁平排序（供应商声明顺序优先，同供应商内按名称）——等价搬运自
// CreateGroupDialog:133-141 与 QuickGroupDialog:301-311 的 providerOrder 实现
export function sortProfilesByProvider(profiles) {
  if (!Array.isArray(profiles)) return []
  const providerOrder = Object.keys(LLM_PROVIDERS)
  return [...profiles].sort((a, b) => {
    const ai = providerOrder.indexOf(a?.provider)
    const bi = providerOrder.indexOf(b?.provider)
    if (ai !== bi) return ai - bi
    return a.name.localeCompare(b.name)
  })
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `pnpm test 2>&1 | tail -8`
Expected: PASS（基线用例 + 新增 7 例全过）

- [ ] **Step 5: 验证 + Commit**

```bash
pnpm lint && pnpm build
git add src/utils/llm-providers.js tests/llm-providers.test.js
git commit -m "refactor(p3): 收敛 getProviderName/getGenderLabel/profiles 排序到 llm-providers 共享工具"
```

---

### Task 2: confirm 统一走 Pinia store（进 app 上下文）

**Files:**
- Create: `src/stores/confirm.js`、`src/components/common/ConfirmHost.vue`
- Modify: `src/App.vue`、`src/composables/useDialog.js`

**Interfaces:**
- Consumes: `ConfirmDialog.vue` 现有接口（props `title/message/confirmText/cancelText/confirmType`，emits `confirm/cancel`，expose `show()`，内部 Teleport 到 body + Escape 关闭）
- Produces: `useConfirmStore()`（Pinia，`setup` 风格）：`confirm(options) → Promise<boolean>`、`resolve(value)`、`visible`、`options`；`useDialog().confirm(options)` 对外签名与 Promise 语义不变（9 个调用方零改动）

- [ ] **Step 1: 新建** `src/stores/confirm.js`（仿 `stores/toast.js` 模式）

```js
import { defineStore } from 'pinia'
import { ref } from 'vue'

export const useConfirmStore = defineStore('confirm', () => {
  const visible = ref(false)
  const options = ref(null)
  let resolveFn = null

  // options: { title, message, confirmText, cancelText, confirmType }
  // 返回 Promise<boolean>；ConfirmHost 负责渲染并调用 resolve
  const confirm = (opts) => {
    return new Promise((resolve) => {
      options.value = { ...opts }
      visible.value = true
      resolveFn = resolve
    })
  }

  const resolve = (value) => {
    visible.value = false
    if (resolveFn) {
      resolveFn(value)
      resolveFn = null
    }
  }

  return { visible, options, confirm, resolve }
})
```

- [ ] **Step 2: 新建** `src/components/common/ConfirmHost.vue`

```vue
<template>
  <ConfirmDialog
    v-if="confirmStore.visible && confirmStore.options"
    :key="confirmKey"
    ref="dialogRef"
    v-bind="confirmStore.options"
    @confirm="confirmStore.resolve(true)"
    @cancel="confirmStore.resolve(false)"
  />
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useConfirmStore } from '../../stores/confirm.js'
import ConfirmDialog from './ConfirmDialog.vue'

const confirmStore = useConfirmStore()
const dialogRef = ref(null)

// 连续两次 confirm 内容不同时强制重建，确保动画与状态复位
const confirmKey = computed(() =>
  ['title', 'message', 'confirmText', 'confirmType']
    .map(k => confirmStore.options?.[k] ?? '')
    .join('|')
)

// ConfirmDialog 内部 visible 初始为 false，需调用暴露的 show()
watch(() => confirmStore.visible, async (visible) => {
  if (visible) {
    await nextTick()
    dialogRef.value?.show()
  }
})
</script>
```

- [ ] **Step 3: App.vue 挂载 ConfirmHost**

`src/App.vue` 改为：

```vue
<template>
  <div id="app">
    <MainLayout />
    <Toast />
    <ConfirmHost />
  </div>
</template>

<script setup>
import MainLayout from './components/layout/MainLayout.vue'
import Toast from './components/common/Toast.vue'
import ConfirmHost from './components/common/ConfirmHost.vue'
</script>

<style lang="scss">
#app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}
</style>
```

- [ ] **Step 4: useDialog.js 改为 store 薄壳**（整文件替换）

```js
import { useConfirmStore } from '../stores/confirm.js'

// 薄壳：保持 confirm(options) → Promise<boolean> 签名不变，
// 实际渲染由 App.vue 挂载的 ConfirmHost 完成（Pinia 上下文内，可用任意 store/注入）
export function useDialog() {
  const confirmStore = useConfirmStore()
  return {
    confirm: (options) => confirmStore.confirm(options)
  }
}
```

删除原 `createApp` 实现整块（原文件 1-56 行）。原实现的"每次独立 app、并发 confirm 叠加"语义变为"后到 confirm 覆盖前一个，前一个 Promise 以 undefined 结束"——现有 9 个调用方均为单弹窗 await 场景，不受影响。

- [ ] **Step 5: 验证 + 冒烟 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
```

冒烟点（`pnpm dev`）：删除角色（CharacterPanel ❌ 按钮）确认弹窗出现、确认/取消/Escape/点遮罩四条路径都正确 resolve；全局搜索无回归。

```bash
git add src/stores/confirm.js src/components/common/ConfirmHost.vue src/App.vue src/composables/useDialog.js
git commit -m "refactor(p3): confirm 统一走 Pinia store，确认弹窗进入 app 上下文"
```

---

### Task 3: `usePromptConfig` composable

**Files:**
- Create: `src/composables/usePromptConfig.js`

**Interfaces:**
- Consumes: `window.electronAPI.config[channelKey]` 的 `get()/save(data)/reset()`（preload 已暴露，QuickGroupDialog:518/537/559 与 CharacterGachaDialog:271/291/312 在用）；`useToastStore`；`createLogger`
- Produces: `usePromptConfig(channelKey) → { promptForm, promptDirty, promptLoading, promptSaving, loadPromptConfig, savePrompt, resetPrompt }`；`promptForm` 为 reactive 三字段对象（systemPrompt/userPromptTemplate/defaultUserPrompt）；保存成功 toast `'提示词配置已保存'`、恢复成功 toast `'已恢复默认配置'`（B-2：抽卡侧从无 toast 统一为有）

- [ ] **Step 1: 实现** `src/composables/usePromptConfig.js`

```js
import { ref, reactive, computed } from 'vue'
import { useToastStore } from '../stores/toast'
import { createLogger } from '../utils/logger.js'

// 提示词配置（快速建群 quickGroupConfig / 角色抽卡 gachaConfig 共用）。
// 收敛自 QuickGroupDialog:322-341,513-572 与 CharacterGachaDialog:187-207,266-324 的整段复制。
export function usePromptConfig(channelKey) {
  const api = window.electronAPI.config[channelKey]
  const toast = useToastStore()
  const log = createLogger('PromptConfig')

  const promptLoading = ref(false)
  const promptSaving = ref(false)
  const promptForm = reactive({
    systemPrompt: '',
    userPromptTemplate: '',
    defaultUserPrompt: ''
  })
  const savedPrompt = reactive({
    systemPrompt: '',
    userPromptTemplate: '',
    defaultUserPrompt: ''
  })

  const promptDirty = computed(() => {
    return (
      promptForm.systemPrompt !== savedPrompt.systemPrompt ||
      promptForm.userPromptTemplate !== savedPrompt.userPromptTemplate ||
      promptForm.defaultUserPrompt !== savedPrompt.defaultUserPrompt
    )
  })

  function applyData(data) {
    promptForm.systemPrompt = data.systemPrompt
    promptForm.userPromptTemplate = data.userPromptTemplate
    promptForm.defaultUserPrompt = data.defaultUserPrompt
    savedPrompt.systemPrompt = data.systemPrompt
    savedPrompt.userPromptTemplate = data.userPromptTemplate
    savedPrompt.defaultUserPrompt = data.defaultUserPrompt
  }

  async function loadPromptConfig() {
    promptLoading.value = true
    try {
      const result = await api.get()
      if (result.success) applyData(result.data)
    } catch (error) {
      log.error('加载提示词配置失败', error)
    } finally {
      promptLoading.value = false
    }
  }

  async function savePrompt() {
    promptSaving.value = true
    try {
      const result = await api.save({
        systemPrompt: promptForm.systemPrompt,
        userPromptTemplate: promptForm.userPromptTemplate,
        defaultUserPrompt: promptForm.defaultUserPrompt
      })
      if (result.success) {
        applyData(promptForm)
        toast.success('提示词配置已保存')
      } else {
        toast.error('保存失败')
      }
    } catch (error) {
      toast.error('保存失败：' + error.message)
    } finally {
      promptSaving.value = false
    }
  }

  async function resetPrompt() {
    try {
      const result = await api.reset()
      if (result.success) {
        applyData(result.data)
        toast.success('已恢复默认配置')
      }
    } catch (error) {
      toast.error('重置失败：' + error.message)
    }
  }

  return {
    promptForm,
    promptDirty,
    promptLoading,
    promptSaving,
    loadPromptConfig,
    savePrompt,
    resetPrompt
  }
}
```

注意：`applyData(promptForm)` 逐字段赋值拷贝 reactive 对象到 savedPrompt，与原两处实现逐字段同步语义一致。

- [ ] **Step 2: 验证 + Commit**

（composable 依赖 `window.electronAPI`，无法进 node:test；由 Task 5 迁移后的构建与冒烟覆盖。）

```bash
pnpm lint && pnpm build && pnpm test
git add src/composables/usePromptConfig.js
git commit -m "refactor(p3): 抽取 usePromptConfig composable"
```

---

### Task 4: `PromptSettingsTab` 共享组件

**Files:**
- Create: `src/components/config/PromptSettingsTab.vue`

**Interfaces:**
- Consumes: Task 3 的 `usePromptConfig(channelKey)`
- Produces: `<PromptSettingsTab channel="quickGroupConfig" system-hint="..." template-hint="..." template-placeholder="..." default-placeholder="..." />`；组件自身 onMounted 加载配置（与两处现状一致：QuickGroupDialog onMounted `loadPromptConfig()`、CharacterGachaDialog onMounted `loadGachaConfig()`）；父组件只需控制 `v-show`

- [ ] **Step 1: 实现** `src/components/config/PromptSettingsTab.vue`（模板/样式以 QuickGroupDialog 现版本为基准）

```vue
<template>
  <div class="prompt-settings-tab">
    <div v-if="promptLoading" class="prompt-loading">加载中...</div>
    <div v-else class="prompt-settings">
      <div class="form-group">
        <label class="form-label">
          系统提示词
          <span class="label-hint">{{ systemHint }}</span>
        </label>
        <textarea
          v-model="promptForm.systemPrompt"
          class="input textarea textarea-code"
          rows="14"
          placeholder="系统提示词..."
        ></textarea>
        <div class="form-hint">{{ promptForm.systemPrompt.length }} 字符</div>
      </div>

      <div class="form-group">
        <label class="form-label">
          用户提示模板
          <span class="label-hint">{{ templateHint }}</span>
        </label>
        <input
          v-model="promptForm.userPromptTemplate"
          class="input"
          :placeholder="templatePlaceholder"
        />
      </div>

      <div class="form-group">
        <label class="form-label">默认提示（无用户输入时使用）</label>
        <input
          v-model="promptForm.defaultUserPrompt"
          class="input"
          :placeholder="defaultPlaceholder"
        />
      </div>

      <div class="prompt-actions">
        <button class="btn btn-text" @click="resetPrompt">
          恢复默认
        </button>
        <button
          class="btn btn-primary"
          :disabled="!promptDirty"
          @click="savePrompt"
        >
          {{ promptSaving ? '保存中...' : '保存' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { usePromptConfig } from '../../composables/usePromptConfig.js'

const props = defineProps({
  // window.electronAPI.config 下的通道 key：'quickGroupConfig' | 'gachaConfig'
  channel: { type: String, required: true },
  systemHint: { type: String, default: '' },
  templateHint: { type: String, default: '' },
  templatePlaceholder: { type: String, default: '' },
  defaultPlaceholder: { type: String, default: '' }
})

const { promptForm, promptDirty, promptLoading, promptSaving, loadPromptConfig, savePrompt, resetPrompt } =
  usePromptConfig(props.channel)

onMounted(loadPromptConfig)
</script>

<style lang="scss" scoped>
@use 'sass:color';

.prompt-loading {
  text-align: center;
  padding: $spacing-xxl;
  color: $text-secondary;
}

.prompt-settings {
  display: flex;
  flex-direction: column;
}

.prompt-actions {
  display: flex;
  justify-content: flex-end;
  gap: $spacing-md;
  padding-top: $spacing-md;
  border-top: 1px solid $border-color-light;
}

.form-group {
  margin-bottom: $spacing-md;
}

.form-label {
  display: block;
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  margin-bottom: $spacing-sm;
  color: $text-primary;

  .label-hint {
    font-weight: $font-weight-normal;
    color: $text-placeholder;
    font-size: $font-size-xs;
  }
}

.input {
  width: 100%;
  padding: $spacing-md;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  transition: border-color 0.2s;
  box-sizing: border-box;
  background: $bg-primary;
  color: $text-primary;

  &:focus {
    outline: none;
    border-color: $wechat-green;
  }

  &::placeholder {
    color: $text-placeholder;
  }
}

.textarea {
  resize: none;
  min-height: 80px;
  font-family: inherit;
  line-height: 1.6;
}

.textarea-code {
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  font-size: $font-size-sm;
  line-height: 1.5;
  min-height: 240px;
  height: auto;
}

.form-hint {
  font-size: $font-size-xs;
  color: $text-placeholder;
  text-align: right;
  margin-top: $spacing-xs;
}

.btn {
  padding: $spacing-sm $spacing-lg;
  border: none;
  border-radius: $border-radius-md;
  font-size: $font-size-md;
  font-weight: $font-weight-medium;
  cursor: pointer;
  transition: all 0.2s;

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.btn-text {
  background: transparent;
  color: $text-secondary;

  &:hover:not(:disabled) {
    color: $text-primary;
    background: $bg-secondary;
  }
}

.btn-primary {
  background: $wechat-green;
  color: white;

  &:hover:not(:disabled) {
    background: color.adjust($wechat-green, $lightness: -5%);
  }
}
</style>
```

（样式块首行 `@use 'sass:color';` 已含——`.btn-primary` 的 `color.adjust` 需要。）

- [ ] **Step 2: 验证 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
git add src/components/config/PromptSettingsTab.vue
git commit -m "refactor(p3): 新增 PromptSettingsTab 共享组件"
```

---

### Task 5: 两个对话框迁移到 PromptSettingsTab

**Files:**
- Modify: `src/components/config/QuickGroupDialog.vue`、`src/components/config/CharacterGachaDialog.vue`

**Interfaces:**
- Consumes: Task 4 的 `<PromptSettingsTab>`；Task 6 之前的本文件内 `getProviderName` 保持现状（Task 6 再收敛，本任务不碰）
- Produces: 两对话框的提示词 Tab 对外表现不变（文案差异通过 props 保留）

- [ ] **Step 1: QuickGroupDialog 模板替换**（175-227 行整块）

把 `<!-- Tab: 提示词设置 -->` 的整块 `<div v-show="activeTab === 'prompt'" ...>...</div>`（原 176-227 行）替换为：

```vue
    <!-- Tab: 提示词设置 -->
    <PromptSettingsTab
      v-show="activeTab === 'prompt'"
      channel="quickGroupConfig"
      system-hint="（发给 LLM 的群组生成指令）"
      template-hint="（{description} 将替换为用户输入）"
      template-placeholder="例如：请根据以下描述生成一个聊天群组：{description}"
      default-placeholder="例如：请随机生成一个有趣的多人聊天群组，包含4-6个角色"
    />
```

- [ ] **Step 2: QuickGroupDialog 脚本清理**

1. import 区新增：`import PromptSettingsTab from './PromptSettingsTab.vue'`
2. 删除 `// ============ 提示词设置状态 ============` 整段（promptLoading/promptSaving/promptForm/savedPrompt/promptDirty，原 322-342 行）
3. 删除 `// ============ 提示词设置方法 ============` 整段（loadPromptConfig/handleSavePrompt/handleResetPrompt，原 513-572 行）
4. `switchToPromptTab`（574-579 行）删除，模板 Tab 头按钮 `@click="switchToPromptTab"` 改为 `@click="activeTab = 'prompt'"`
5. onMounted（583-586 行）删去 `loadPromptConfig()` 调用，仅保留 `await profilesStore.loadProfiles()`

- [ ] **Step 3: QuickGroupDialog 样式清理**

删除仅被提示词 Tab 使用的样式块：`.prompt-loading`（788-792）、`.prompt-settings`（794-797）、`.prompt-actions`（799-805）、`.textarea-code`（869-875）。保留其余（`.form-group`/`.input`/`.btn` 族被"快速建群" Tab 继续使用）。

- [ ] **Step 4: CharacterGachaDialog 同样三步**

模板：74-125 行整块替换为：

```vue
    <!-- Tab: 提示词设置 -->
    <PromptSettingsTab
      v-show="activeTab === 'prompt'"
      channel="gachaConfig"
      system-hint="（发给 LLM 的角色设定指令）"
      template-hint="（{hint} 将替换为用户输入）"
      template-placeholder="例如：请根据以下提示生成一个角色：{hint}"
      default-placeholder="例如：请随机生成一个有趣的角色"
    />
```

脚本：import `PromptSettingsTab`；删 187-207（状态）、268-332（loadGachaConfig/handleSavePrompt/handleResetPrompt/switchToPromptTab）；Tab 按钮 `@click="switchToPromptTab"` → `@click="activeTab = 'prompt'"`；onMounted（334-336）整段删除（组件自行加载）。

样式：删 `.prompt-loading`（551-555）、`.prompt-settings`（557-560）、`.prompt-actions`（562-568）、`.textarea-code`（439-445）。

- [ ] **Step 5: 验证 + 冒烟 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
```

冒烟点：两个对话框各自打开 → 提示词 Tab 加载出内容 → 修改 → 保存（抽卡侧此次应有"提示词配置已保存" toast，B-2）→ 关闭重开确认持久化 → "恢复默认"生效（抽卡侧应有"已恢复默认配置" toast）。

```bash
git add src/components/config/QuickGroupDialog.vue src/components/config/CharacterGachaDialog.vue
git commit -m "refactor(p3): 快速建群/抽卡提示词 Tab 迁移到共享组件"
```

---

### Task 6: 工具函数收敛（8 处替换 + 2 处死代码删除）

**Files:**
- Modify: `src/components/config/QuickGroupDialog.vue`、`src/components/config/CreateGroupDialog.vue`、`src/components/config/GroupSettingsDialog.vue`、`src/components/config/CharacterGachaDialog.vue`、`src/components/layout/CharacterLibrary.vue`、`src/components/chat/CharacterPanel.vue`、`src/components/config/LLMConfigPanel.vue`

**Interfaces:**
- Consumes: Task 1 的 `getProviderName/getGenderLabel/sortProfilesByProvider`
- Produces: 全项目 `getProviderName`/`getGenderLabel`/profile 排序只剩 `src/utils/llm-providers.js` 一份定义（CharacterPanel/LLMConfigPanel 的分组逻辑在 Task 7/10 处理）

- [ ] **Step 1: QuickGroupDialog**（注意：Task 5 已改动此文件，以下按内容锚点定位，不按行号）

1. 删除 `import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'`，改为：
   `import { getProviderName, sortProfilesByProvider } from '../../utils/llm-providers.js'`
2. 替换以 `// 按供应商定义顺序排序，同供应商内按名称字典序` 注释开始的 `providerOrder` 常量 + `llmProfiles` computed 整块为：
   `const llmProfiles = computed(() => sortProfilesByProvider(profilesStore.profiles))`（保留原注释）
3. 删除本地 `function getProviderName(providerId) {...}` 4 行块

- [ ] **Step 2: CreateGroupDialog**（此前未被改动，行号有效）

1. 116 行 `import { LLM_PROVIDERS } ...` 删除，改为：
   `import { getProviderName, sortProfilesByProvider } from '../../utils/llm-providers.js'`
2. 133-141 行（`providerOrder` + `llmProfiles` computed）替换为：
   `const llmProfiles = computed(() => sortProfilesByProvider(profilesStore.profiles))`（保留原注释）
3. 删除本地 `getProviderName`（195-199 行）

- [ ] **Step 3: GroupSettingsDialog**（此前未被改动，行号有效）

1. 112 行 `import { LLM_PROVIDERS } ...` 删除（该文件仅 getProviderName 使用它），改为：
   `import { getProviderName } from '../../utils/llm-providers.js'`
2. 删除本地 `getProviderName`（170-174 行）

- [ ] **Step 4: CharacterGachaDialog 与 CharacterLibrary**（Gacha 在 Task 5 已改动，按内容锚点定位）

1. CharacterGachaDialog：新增 `import { getGenderLabel } from '../../utils/llm-providers.js'`；删除 `// ============ 抽卡方法 ============` 注释下的本地 `function getGenderLabel(gender) {...}` 块
2. CharacterLibrary（此前未被改动，行号有效）：同上，删除本地 `getGenderLabel`（202-209 行）。行为说明：未知性别显示从 `''` 变 `'未知'`（Global Constraints 已声明）

- [ ] **Step 5: 删除两处死代码**

1. CharacterPanel.vue 删除 `_getProviderName`（427-431 行，模板无引用；`LLM_PROVIDERS` import 保留——profileGroups 仍用，Task 10 移除）
2. LLMConfigPanel.vue 删除 `_getProviderName`（170-174 行，模板无引用；`LLM_PROVIDERS` import 保留——providerGroups 与 handleAddModelToProvider 仍用）

- [ ] **Step 6: 验证 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
grep -rn "function getProviderName\|function getGenderLabel" src/ | grep -v llm-providers && echo "仍有残留！" || echo "收敛完成"
```

Expected: 输出"收敛完成"。

```bash
git add -A src/
git commit -m "refactor(p3): 工具函数收敛（getProviderName/getGenderLabel/排序）"
```

---

### Task 7: Profile 管理统一（删 LLMProfileDialog）

**Files:**
- Create: `src/components/config/ProfileManager.vue`、`src/components/config/ProfileManagerDialog.vue`
- Modify: `src/components/config/LLMConfigPanel.vue`、`src/components/config/CreateGroupDialog.vue`
- Delete: `src/components/config/LLMProfileDialog.vue`

**Interfaces:**
- Consumes: Task 1 `groupProfilesByProvider`；`LLMProfileForm.vue`（v-model/editing/submitting，emits submit/cancel）；`BaseDialog`（props `title/maxWidth/closeOnOverlay`，emit `close`，slots default/footer）；`useConfirmStore`（经 useDialog）；`window.electronAPI.llm.testConnection`
- Produces: `<ProfileManager ref>` expose `openAdd()`；`<ProfileManagerDialog @close>`；两外壳行为以 LLMConfigPanel 为基准（分组列表 + 思考开关 + 凭据复用建单），并移植 LLMProfileDialog 的"测试连接"能力（spec §5.1 明确列入 ProfileManager 职责）

- [ ] **Step 1: 新建** `src/components/config/ProfileManager.vue`

```vue
<template>
  <div class="profile-manager">
    <!-- 加载状态 -->
    <div v-if="loading" class="loading-state">
      <p>加载中...</p>
    </div>

    <!-- 空状态 -->
    <div v-else-if="profiles.length === 0" class="empty-state">
      <p>还没有配置 LLM</p>
      <p class="hint">点击"添加配置"开始使用</p>
    </div>

    <!-- 按供应商分组显示配置 -->
    <div v-else class="profile-groups">
      <div
        v-for="provider in providerGroups"
        :key="provider.providerId"
        class="provider-group"
      >
        <div class="provider-header">
          <h4>{{ provider.providerName }}</h4>
          <button
            class="btn-icon"
            @click="handleAddModelToProvider(provider.providerId)"
            title="添加模型"
          >
            +
          </button>
        </div>

        <div class="profile-list">
          <div
            v-for="profile in provider.profiles"
            :key="profile.id"
            class="profile-item"
            :class="{ testing: testingId === profile.id }"
          >
            <div class="profile-info">
              <div class="profile-name">{{ profile.name }}</div>
              <div class="profile-model">{{ profile.model }}</div>
            </div>

            <div class="profile-actions">
              <label class="thinking-toggle" title="思考模式">
                <input
                  type="checkbox"
                  :checked="profile.thinkingEnabled === true"
                  @change="toggleThinkingMode(profile)"
                />
                <span class="toggle-text">思考</span>
              </label>

              <button
                class="btn-icon"
                @click="handleTest(profile)"
                :disabled="testingId === profile.id"
                title="测试连接"
              >
                {{ testingId === profile.id ? '⏳' : '🔗' }}
              </button>

              <button
                class="btn-icon"
                @click="handleEdit(profile)"
                title="编辑"
              >
                ✏️
              </button>

              <button
                class="btn-icon btn-danger"
                @click="handleDelete(profile)"
                title="删除"
              >
                🗑️
              </button>
            </div>
          </div>

          <div v-if="provider.profiles.length === 0" class="empty-models">
            <p>还没有配置模型</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑/添加表单对话框（嵌套层，遮罩不关闭防误触丢 Key） -->
    <div v-if="showFormDialog" class="dialog-overlay-nested">
      <BaseDialog
        :title="editingProfile ? '编辑配置' : '添加配置'"
        max-width="500px"
        :close-on-overlay="false"
        @close="closeFormDialog"
      >
        <LLMProfileForm
          v-model="formData"
          :editing="!!editingProfile"
          :submitting="formSubmitting"
          @submit="handleFormSubmit"
          @cancel="closeFormDialog"
        />
      </BaseDialog>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useToastStore } from '../../stores/toast'
import { useDialog } from '../../composables/useDialog'
import { LLM_PROVIDERS } from '../../../electron/llm/providers/index.js'
import { groupProfilesByProvider } from '../../utils/llm-providers.js'
import BaseDialog from '../common/BaseDialog.vue'

// 表单组件按需异步加载，减小首屏 bundle 体积
const LLMProfileForm = defineAsyncComponent(() => import('./LLMProfileForm.vue'))

const store = useLLMProfilesStore()
const toast = useToastStore()
const { confirm } = useDialog()

const profiles = computed(() => store.profiles)
const loading = computed(() => store.loading)

const providerGroups = computed(() => groupProfilesByProvider(profiles.value))

const showFormDialog = ref(false)
const editingProfile = ref(null)
const formData = ref({})
const formSubmitting = ref(false)
const testingId = ref(null)

onMounted(() => store.loadProfiles())

// 添加配置（面板头部按钮与对话框底部按钮统一走这里）
function openAdd() {
  editingProfile.value = null
  formData.value = {
    name: '',
    provider: 'openai',
    apiKey: '',
    baseURL: '',
    model: '',
    thinkingEnabled: false
  }
  showFormDialog.value = true
}

// 为指定供应商添加模型
function handleAddModelToProvider(providerId) {
  editingProfile.value = null
  const providerConfig = LLM_PROVIDERS[providerId]

  // 优先复用同供应商已有配置的凭据，避免跨供应商泄漏 A 家 Key 到 B 家表单
  const sameProviderProfile = profiles.value?.find(p => p.provider === providerId)
  const defaultApiKey = sameProviderProfile?.apiKey || ''
  // Ollama 默认走原生 API，使用 nativeBaseURL（不带 /v1）
  const useNative = providerId === 'ollama' && providerConfig.defaultNativeApi !== false
  const defaultBaseURL = sameProviderProfile?.baseURL ||
    (useNative ? providerConfig.nativeBaseURL : providerConfig.baseURL) || ''

  formData.value = {
    name: `${providerConfig.name} 配置`,
    provider: providerId,
    apiKey: defaultApiKey,
    baseURL: defaultBaseURL,
    model: providerConfig.models?.[0] || '',
    streamEnabled: true,
    thinkingEnabled: false,
    // Ollama 默认使用原生 API（性能远优于 OpenAI 兼容端点）
    useNativeApi: useNative,
    proxy: { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
  }
  showFormDialog.value = true
}

// 编辑配置
function handleEdit(profile) {
  editingProfile.value = profile
  formData.value = {
    name: profile.name,
    provider: profile.provider,
    apiKey: profile.apiKey,
    baseURL: profile.baseURL,
    model: profile.model,
    streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
    thinkingEnabled: profile.thinkingEnabled === true,
    useNativeApi: profile.useNativeApi === true,
    proxy: profile.proxy || { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
  }
  showFormDialog.value = true
}

// 删除配置
async function handleDelete(profile) {
  const confirmed = await confirm({
    title: '删除配置',
    message: `确定要删除配置"${profile.name}"吗？`,
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  const result = await store.deleteProfile(profile.id)
  if (!result.success) {
    toast.error('删除失败: ' + result.error)
  }
}

// 测试连接（自 LLMProfileDialog 移植，spec §5.1）
async function handleTest(profile) {
  testingId.value = profile.id
  try {
    const result = await window.electronAPI.llm.testConnection({
      provider: profile.provider,
      apiKey: profile.apiKey,
      baseURL: profile.baseURL,
      model: profile.model,
      streamEnabled: profile.streamEnabled !== undefined ? profile.streamEnabled : true,
      useNativeApi: profile.useNativeApi === true,
      proxy: profile.proxy || { type: 'none', customUrl: '', bypassRules: 'localhost,127.0.0.1,::1' }
    })
    if (result.success) toast.success(`连接成功！模型：${result.model}`, 5000)
    else toast.error('连接失败: ' + result.error)
  } catch (error) {
    toast.error('连接失败: ' + error.message)
  } finally {
    testingId.value = null
  }
}

// 切换思考模式
async function toggleThinkingMode(profile) {
  const newThinkingEnabled = !(profile.thinkingEnabled === true)

  const result = await store.updateProfile(profile.id, {
    thinkingEnabled: newThinkingEnabled
  })

  if (!result.success) {
    toast.error('切换思考模式失败: ' + result.error)
  }
}

// 提交表单
async function handleFormSubmit(data) {
  if (formSubmitting.value) return
  formSubmitting.value = true

  try {
    // 深拷贝以剥离 Vue 响应式代理（IPC 结构化克隆要求纯对象）
    const submitData = JSON.parse(JSON.stringify(data))

    let result

    if (editingProfile.value) {
      result = await store.updateProfile(editingProfile.value.id, submitData)
    } else {
      result = await store.addProfile(submitData)
    }

    if (result.success) {
      closeFormDialog()
    } else {
      toast.error((editingProfile.value ? '保存失败: ' : '添加失败: ') + result.error)
    }
  } finally {
    formSubmitting.value = false
  }
}

// 关闭表单对话框
function closeFormDialog() {
  showFormDialog.value = false
  editingProfile.value = null
  formData.value = {}
}

defineExpose({ openAdd })
</script>

<style lang="scss" scoped>
@use "sass:color";

.loading-state,
.empty-state {
  padding: $spacing-xxl;
  text-align: center;
  color: $text-secondary;

  .hint {
    margin-top: $spacing-sm;
    font-size: $font-size-sm;
  }
}

.profile-groups {
  padding: $spacing-lg;
}

.provider-group {
  margin-bottom: $spacing-xl;
}

.provider-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: $spacing-md;

  h4 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    color: $text-primary;
  }
}

.profile-list {
  display: flex;
  flex-direction: column;
  gap: $spacing-sm;
}

.profile-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: $spacing-md;
  background: $bg-secondary;
  border: 1px solid $border-color;
  border-radius: $border-radius-md;
  transition: all 0.2s;

  &:hover {
    border-color: $color-primary;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  &.testing {
    opacity: 0.6;
    pointer-events: none;
  }
}

.profile-info {
  flex: 1;
  min-width: 0;
}

.profile-name {
  font-size: $font-size-sm;
  font-weight: $font-weight-medium;
  color: $text-primary;
  margin-bottom: 2px;
}

.profile-model {
  font-size: $font-size-xs;
  color: $text-secondary;
}

.profile-actions {
  display: flex;
  gap: $spacing-sm;
  align-items: center;
}

.thinking-toggle {
  display: flex;
  align-items: center;
  gap: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  background: $bg-tertiary;
  border-radius: $border-radius-sm;
  cursor: pointer;
  user-select: none;
  transition: background 0.2s;

  &:hover {
    background: color.adjust($bg-tertiary, $lightness: -5%);
  }

  input[type="checkbox"] {
    cursor: pointer;
  }

  .toggle-text {
    font-size: $font-size-xs;
    color: $text-secondary;
  }
}

.btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  border-radius: $border-radius-sm;
  cursor: pointer;
  font-size: 16px;
  transition: background 0.2s;

  &:hover:not(:disabled) {
    background: $bg-secondary;
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  &.btn-danger:hover:not(:disabled) {
    background: rgba($color-danger, 0.1);
  }
}

.empty-models {
  padding: $spacing-lg;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.dialog-overlay-nested {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1001; // 高于 BaseDialog 的 $z-index-dialog(1000)
}
</style>
```

- [ ] **Step 2: 新建** `src/components/config/ProfileManagerDialog.vue`

```vue
<template>
  <BaseDialog title="LLM 配置管理" max-width="800px" @close="$emit('close')">
    <ProfileManager ref="manager" />

    <template #footer>
      <button class="btn btn-secondary" @click="$emit('close')">关闭</button>
      <button class="btn btn-primary" @click="manager?.openAdd()">+ 添加配置</button>
    </template>
  </BaseDialog>
</template>

<script setup>
import { ref } from 'vue'
import BaseDialog from '../common/BaseDialog.vue'
import ProfileManager from './ProfileManager.vue'

defineEmits(['close'])

const manager = ref(null)
</script>
```

- [ ] **Step 3: LLMConfigPanel 瘦身**（整文件替换）

```vue
<template>
  <div class="llm-config-panel">
    <div class="panel-header">
      <h3>LLM 配置管理</h3>
      <button class="btn btn-primary btn-sm" @click="manager?.openAdd()">
        + 添加配置
      </button>
    </div>

    <div class="panel-content">
      <ProfileManager ref="manager" />
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import ProfileManager from './ProfileManager.vue'

const manager = ref(null)
</script>

<style lang="scss" scoped>
.llm-config-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.panel-header {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;
  display: flex;
  justify-content: space-between;
  align-items: center;

  h3 {
    font-size: $font-size-lg;
    font-weight: $font-weight-medium;
  }
}

.panel-content {
  flex: 1;
  overflow-y: auto;
}
</style>
```

- [ ] **Step 4: CreateGroupDialog 换用 + 删除旧对话框**（按内容锚点定位；Task 6 已替换过本文件的 LLM_PROVIDERS import）

1. `import LLMProfileDialog from './LLMProfileDialog.vue'` → `import ProfileManagerDialog from './ProfileManagerDialog.vue'`
2. 模板中 `<LLMProfileDialog v-if="showProfileManager" @close="closeProfileManager" />` → `<ProfileManagerDialog v-if="showProfileManager" @close="closeProfileManager" />`
3. `git rm src/components/config/LLMProfileDialog.vue`

- [ ] **Step 5: 验证 + 冒烟 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
grep -rn "LLMProfileDialog" src/ && echo "仍有引用！" || echo "引用清理完成"
```

Expected: "引用清理完成"。

冒烟点：LeftPanel 的 LLM 配置面板（列表分组/添加/编辑/删除/思考开关/测试连接）；建群对话框内打开配置管理（增删改测一遍后关闭，选中项正常回填）。

```bash
git add -A src/
git commit -m "refactor(p3): 统一 LLM Profile 管理，删除 LLMProfileDialog"
```

---

### Task 8: MemoryDialog 抽取 + CharacterPanel 接线

**Files:**
- Create: `src/components/chat/MemoryDialog.vue`
- Modify: `src/components/chat/CharacterPanel.vue`

**Interfaces:**
- Consumes: `BaseDialog`（max-width 480px）；`useMemoryStore`（`loadMemories(name)/addMemory({characterName, content})/deleteMemory(id, name)/getMemories(name)`）；`useToastStore`
- Produces: `<MemoryDialog v-if="visible" :character="char" @close="..." />`；props `character`（含 `name` 的对象），emit `close`

- [ ] **Step 1: 新建** `src/components/chat/MemoryDialog.vue`

```vue
<template>
  <BaseDialog :title="`${character?.name ?? ''} 的记忆`" max-width="480px" @close="$emit('close')">
    <div class="memory-dialog-body">
      <div class="memory-dialog-list">
        <div
          v-for="mem in memories"
          :key="mem.id"
          class="memory-item"
        >
          <span class="memory-source" :class="mem.source">{{ mem.source === 'manual' ? '手动' : '自动' }}</span>
          <span class="memory-content">{{ mem.content }}</span>
          <button class="btn-delete-memory" @click="deleteMemory(mem.id)" title="删除">×</button>
        </div>
        <div v-if="memories.length === 0" class="memory-empty">
          暂无记忆
        </div>
      </div>
      <div class="memory-add">
        <input
          v-model="newMemory"
          type="text"
          class="memory-input"
          placeholder="添加新记忆..."
          @keyup.enter="addMemory"
        />
        <button class="btn btn-primary btn-sm" @click="addMemory" :disabled="!newMemory?.trim()">
          添加
        </button>
      </div>
    </div>
  </BaseDialog>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMemoryStore } from '../../stores/memory.js'
import { useToastStore } from '../../stores/toast'

const props = defineProps({
  character: { type: Object, required: true }
})

defineEmits(['close'])

const memoryStore = useMemoryStore()
const toast = useToastStore()
const newMemory = ref('')

const memories = computed(() => memoryStore.getMemories(props.character?.name))

onMounted(() => {
  memoryStore.loadMemories(props.character.name)
})

async function addMemory() {
  const content = newMemory.value?.trim()
  if (!content) return
  try {
    await memoryStore.addMemory({
      characterName: props.character.name,
      content
    })
    newMemory.value = ''
  } catch (error) {
    toast.error('添加记忆失败: ' + error.message)
  }
}

async function deleteMemory(memoryId) {
  try {
    await memoryStore.deleteMemory(memoryId, props.character.name)
  } catch (error) {
    toast.error('删除记忆失败: ' + error.message)
  }
}
</script>

<style lang="scss" scoped>
.memory-dialog-body {
  display: flex;
  flex-direction: column;
  max-height: 60vh;
}

.memory-dialog-list {
  flex: 1;
  overflow-y: auto;
  padding: $spacing-xs 0;
}

.memory-item {
  display: flex;
  align-items: flex-start;
  gap: $spacing-xs;
  padding: $spacing-xs $spacing-sm;
  font-size: $font-size-sm;
  line-height: 1.4;
  border-bottom: 1px solid rgba(0, 0, 0, 0.05);

  &:last-child {
    border-bottom: none;
  }
}

.memory-source {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 3px;
  font-size: $font-size-xs;
  font-weight: $font-weight-medium;

  &.manual {
    background: rgba($color-primary, 0.1);
    color: $color-primary;
  }

  &.auto {
    background: rgba(255, 152, 0, 0.1);
    color: #ff9800;
  }
}

.memory-content {
  flex: 1;
  word-break: break-word;
}

.btn-delete-memory {
  flex-shrink: 0;
  background: none;
  border: none;
  color: $text-secondary;
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  opacity: 0.5;
  padding: 0 2px;

  &:hover {
    opacity: 1;
    color: #e53935;
  }
}

.memory-empty {
  padding: $spacing-md;
  text-align: center;
  color: $text-secondary;
  font-size: $font-size-sm;
}

.memory-add {
  display: flex;
  gap: $spacing-xs;
  padding: $spacing-sm 0 0;
  border-top: 1px solid $border-color;
  margin-top: $spacing-sm;
}

.memory-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid $border-color;
  border-radius: $border-radius-sm;
  font-size: $font-size-sm;
  background: $bg-primary;

  &:focus {
    outline: none;
    border-color: $color-primary;
  }
}
</style>
```

- [ ] **Step 2: CharacterPanel 接线**

1. import 区新增：`import MemoryDialog from './MemoryDialog.vue'`
2. 模板 314-350 行（`<!-- 角色记忆对话框 -->` 手写 overlay 整块）替换为：

```vue
    <!-- 角色记忆对话框 -->
    <MemoryDialog
      v-if="memoryDialogVisible"
      :character="memoryDialogChar"
      @close="memoryDialogVisible = false"
    />
```

3. 脚本：`openMemoryDialog` 简化为（加载逻辑移入组件）：

```js
// 打开记忆对话框
function openMemoryDialog(char) {
  memoryDialogChar.value = char
  memoryDialogVisible.value = true
}
```

4. 删除 `addMemoryFromDialog`（502-514 行）、`deleteMemory`（516-523 行）、`memoryDialogInput` ref（394 行）；删除 `import { useMemoryStore } from '../../stores/memory.js'` 与 `const memoryStore = useMemoryStore()`（面板其余处未用）

- [ ] **Step 3: CharacterPanel 样式清理**

删除仅被手写记忆对话框使用的样式：`.dialog-overlay`（1303-1314）、`.dialog`（1316-1323）、`.dialog-header`（1325-1354）、`.dialog-body`（1356-1358）、`.memory-dialog`（1360-1458 整块）。

- [ ] **Step 4: 验证 + 冒烟 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
```

冒烟点：角色面板 📝 打开记忆对话框 → 列表加载 → 添加记忆 → 删除记忆 → 空态展示 → Escape/关闭按钮可关。

```bash
git add src/components/chat/MemoryDialog.vue src/components/chat/CharacterPanel.vue
git commit -m "refactor(p3): 记忆对话框抽为 MemoryDialog 并接入 BaseDialog"
```

---

### Task 9: GroupSettingsSection 拆分

**Files:**
- Create: `src/components/chat/GroupSettingsSection.vue`
- Modify: `src/components/chat/CharacterPanel.vue`、`src/styles/global.scss`

**Interfaces:**
- Consumes: `useGroupsStore.updateGroup`、`useCharactersStore.updateCharacter/loadCharacters`、`useToastStore`、`createLogger`
- Produces: `<GroupSettingsSection :group="currentGroup" @open-settings="..." />`；emit `open-settings`（打开 GroupSettingsDialog）

- [ ] **Step 1: `.btn-link` 升为全局样式**

`src/styles/global.scss` 的 `.btn` 块之后追加：

```scss
.btn-link {
  background: none;
  border: none;
  color: $color-primary;
  font-size: $font-size-sm;
  cursor: pointer;
  padding: 0;

  &:hover {
    text-decoration: underline;
  }
}
```

（GroupSettingsSection 与 CharacterCard 都要用；避免拆分制造新的 scoped 重复。）

- [ ] **Step 2: 新建** `src/components/chat/GroupSettingsSection.vue`

模板 = CharacterPanel.vue 中 `<!-- 群设置 -->` 注释起的 `group-settings-section` 整块（Task 8 未触及，从现文件模板起始处逐行搬运），仅一处改动：`@click.stop="showGroupSettings = true"` → `@click.stop="$emit('open-settings')"`。

```vue
<script setup>
import { ref } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useToastStore } from '../../stores/toast'
import { createLogger } from '../../utils/logger.js'

const props = defineProps({
  group: { type: Object, required: true }
})

defineEmits(['open-settings'])

const log = createLogger('GroupSettings')
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const toast = useToastStore()

const groupSettingsCollapsed = ref(true) // 默认收起

async function updateMaxHistory(event) {
  const v = parseInt(event.target.value, 10)
  if (!Number.isInteger(v) || v < 1 || v > 50) {
    // 非法输入回显为当前生效值
    event.target.value = String(props.group?.max_history ?? 20)
    toast.error('历史条数需为 1-50 的整数')
    return
  }
  try {
    await groupsStore.updateGroup(props.group.id, {
      maxHistory: v
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateResponseMode(event) {
  try {
    await groupsStore.updateGroup(props.group.id, {
      responseMode: event.target.value
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateThinkingMode(event) {
  try {
    const enabled = event.target.checked
    await groupsStore.updateGroup(props.group.id, {
      thinkingEnabled: enabled
    })

    // 批量更新所有 AI 角色的思考模式（并行）
    const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
    await Promise.all(aiCharacters.map(char =>
      charactersStore.updateCharacter(char.id, { thinkingEnabled: enabled }).catch(err => {
        log.error(`更新角色 ${char.name} 思考模式失败:`, err)
      })
    ))

    // 重新加载角色列表以确保 UI 正确刷新
    await charactersStore.loadCharacters(props.group.id)
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}

async function updateRandomOrder(event) {
  try {
    await groupsStore.updateGroup(props.group.id, {
      randomOrder: event.target.checked
    })
  } catch (error) {
    toast.error('更新设置失败: ' + error.message)
  }
}
</script>
```

样式：把 CharacterPanel.vue 的 `.panel-section` 整块（以 `.panel-section {` 开头、含 `.group-settings-section` 折叠动画的完整嵌套块）与 `.setting-item` 整块（以 `.setting-item {` 开头的完整嵌套块）**原文搬入**本组件 scoped 样式（此两块在本步之后将从 CharacterPanel 删除，见 Step 3）。

- [ ] **Step 3: CharacterPanel 替换与清理**

1. import：`import GroupSettingsSection from './GroupSettingsSection.vue'`
2. 模板 5-101 行整块替换为：

```vue
      <GroupSettingsSection
        :group="currentGroup"
        @open-settings="showGroupSettings = true"
      />
```

3. 脚本删除（已随组件迁走）：`groupSettingsCollapsed` ref、`updateMaxHistory`、`updateResponseMode`、`updateThinkingMode`、`updateRandomOrder` 四个函数整块；`charactersStore` 若仍被角色列表循环使用则保留
4. 样式：`.panel-section` 整块替换为裁剪版（"角色列表"标题仍在面板层使用）：

```scss
.panel-section {
  padding: $spacing-lg;
  border-bottom: 1px solid $border-color;

  h3 {
    font-size: $font-size-md;
    font-weight: $font-weight-medium;
    margin-bottom: $spacing-md;
  }
}
```

5. 样式删除 `.setting-item` 整块与本地 `.btn-link` 块（已升全局）

- [ ] **Step 4: 验证 + 冒烟 + Commit**

```bash
pnpm lint && pnpm build && pnpm test
```

冒烟点：群设置折叠/展开动画正常；四个设置项修改生效；非法 max_history 回显 + toast；点"⚙️ 编辑"打开群设置对话框；"角色列表"标题样式无回归。

```bash
git add src/components/chat/GroupSettingsSection.vue src/components/chat/CharacterPanel.vue src/styles/global.scss
git commit -m "refactor(p3): 拆出 GroupSettingsSection"
```

---

### Task 10: CharacterCard 拆分 + CharacterPanel 收尾

**Files:**
- Create: `src/components/chat/CharacterCard.vue`
- Modify: `src/components/chat/CharacterPanel.vue`

**Interfaces:**
- Consumes: Task 1 `groupProfilesByProvider`；Task 2 confirm（经 useDialog）；stores：characters/messages/narrative/global-characters/llm-profiles/groups（仅取 `currentGroup?.narrative_enabled`）/toast
- Produces: `<CharacterCard :character="char" :index="index" @edit="editCharacter" @open-memory="openMemoryDialog" />`；emit `edit`（用户角色 ✏️ → 打开 EditCharacterDialog）、`open-memory`（📝 → 打开 MemoryDialog）

- [ ] **Step 1: 新建** `src/components/chat/CharacterCard.vue`

模板 = CharacterPanel.vue 中 `<!-- 角色列表 Tab -->` 区块的 `<div class="character-item">` 循环体整块（Task 8/9 已改动面板其他区域，以类名锚点定位）逐行搬运，做以下机械替换（其余不动）：
- `char.` → `character.`（全模板）
- `:class="['character-item', { 'user-character': char.is_user === 1 }]"` → `:class="{ 'user-character': character.is_user === 1 }"`（根类名固定）
- `expandedPrompts[char.id]` / `!expandedPrompts[char.id]` → `expanded` / `!expanded`
- `libraryCharIds.has(char.id)` → `librarySynced`
- `syncingIds.has(char.id)` → `syncing`
- `commandDrafts.get(char.id) ?? ''` → `commandDraft`
- `!(commandDrafts.get(char.id) ?? '').trim()` → `!commandDraft.trim()`
- `currentGroup?.narrative_enabled` → `groupsStore.currentGroup?.narrative_enabled`（EmotionTag 的 `:editable` 处）

```vue
<script setup>
import { ref, computed } from 'vue'
import { useGroupsStore } from '../../stores/groups.js'
import { useCharactersStore } from '../../stores/characters.js'
import { useMessagesStore } from '../../stores/messages.js'
import { useToastStore } from '../../stores/toast'
import { useGlobalCharactersStore } from '../../stores/global-characters.js'
import { useLLMProfilesStore } from '../../stores/llm-profiles.js'
import { useNarrativeStore } from '../../stores/narrative.js'
import { useDialog } from '../../composables/useDialog'
import { groupProfilesByProvider } from '../../utils/llm-providers.js'
import { createLogger } from '../../utils/logger.js'
import EmotionTag from './EmotionTag.vue'

const props = defineProps({
  character: { type: Object, required: true },
  index: { type: Number, required: true }
})

const emit = defineEmits(['edit', 'open-memory'])

const log = createLogger('CharCard')
const groupsStore = useGroupsStore()
const charactersStore = useCharactersStore()
const messagesStore = useMessagesStore()
const toast = useToastStore()
const globalCharsStore = useGlobalCharactersStore()
const llmProfilesStore = useLLMProfilesStore()
const narrativeStore = useNarrativeStore()
const { confirm } = useDialog()

// 卡片本地状态（原面板级 Map/Set 按卡片拆解，语义不变）
const expanded = ref(false)
const librarySynced = ref(false)
const syncing = ref(false)
const commandDraft = ref('') // 指令输入草稿（本地状态，避免直改 store）

const profileGroups = computed(() => groupProfilesByProvider(llmProfilesStore.profiles))

// 获取角色情绪
function getCharEmotion(characterId) {
  const emotion = narrativeStore.emotions.find(e => e.character_id === characterId)
  if (emotion && emotion.emotion !== '平静' && emotion.intensity > 0.1) return emotion
  return null
}

// 手动更新角色情绪
async function updateEmotion(characterId, { emotion, intensity }) {
  const groupId = groupsStore.currentGroup?.id
  if (!groupId) return
  await window.electronAPI.narrative.setEmotion(groupId, characterId, emotion, intensity)
  await narrativeStore.fetchEmotions(groupId)
}

// 展开设定时检查角色是否存在于角色库
function togglePromptExpand() {
  expanded.value = !expanded.value
  if (expanded.value && !librarySynced.value) {
    globalCharsStore.existsInLibrary(props.character.id).then(exists => {
      if (exists) librarySynced.value = true
    })
  }
}

// 同步角色设定从角色库到群组
async function syncFromLibrary() {
  const group = groupsStore.currentGroup
  if (!group) return
  syncing.value = true
  try {
    await globalCharsStore.syncToGroup(props.character.id, group.id)
    await charactersStore.loadCharacters(group.id)
    toast.success(`已同步 ${props.character.name} 的最新设定`)
  } catch (error) {
    toast.error('同步失败: ' + error.message)
  } finally {
    syncing.value = false
  }
}

// 判断角色是否可以上移/下移（与原实现同语义，基于列表与索引）
function canMoveUp() {
  const char = charactersStore.characters[props.index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex > 0
}

function canMoveDown() {
  const char = charactersStore.characters[props.index]
  if (char.is_user === 1) return false
  const aiCharacters = charactersStore.characters.filter(c => c.is_user !== 1)
  const aiIndex = aiCharacters.findIndex(c => c.id === char.id)
  return aiIndex < aiCharacters.length - 1
}

async function moveCharacter(direction) {
  try {
    await charactersStore.reorderCharacter(props.character.id, direction)
  } catch (error) {
    log.error('移动角色失败:', error)
    toast.error(`移动角色失败: ${error.message}`)
  }
}

async function toggleCharacter() {
  try {
    await charactersStore.toggleCharacter(props.character.id, props.character.enabled === 0)
  } catch (error) {
    toast.error('切换角色状态失败: ' + error.message)
  }
}

async function deleteCharacter() {
  const confirmed = await confirm({
    title: '删除角色',
    message: '确定要删除这个角色吗？',
    confirmText: '删除',
    cancelText: '取消'
  })
  if (!confirmed) return

  try {
    await charactersStore.deleteCharacter(props.character.id)
  } catch (error) {
    toast.error('删除角色失败: ' + error.message)
  }
}

async function toggleCharacterThinking() {
  try {
    const newEnabled = props.character.thinking_enabled === 0
    await charactersStore.updateCharacter(props.character.id, {
      thinkingEnabled: newEnabled
    })
  } catch (error) {
    toast.error('更新角色思考模式失败: ' + error.message)
  }
}

// 切换角色独立模型设置
async function toggleCustomModel() {
  try {
    const char = props.character
    const newValue = char.custom_llm_profile_id ? null : (llmProfilesStore.profiles[0]?.id || null)
    await charactersStore.updateCharacter(char.id, {
      customLlmProfileId: newValue
    })
    if (groupsStore.currentGroup) {
      await charactersStore.loadCharacters(groupsStore.currentGroup.id)
    }
  } catch (error) {
    toast.error('更新角色模型设置失败: ' + error.message)
  }
}

// 更新角色使用的 LLM Profile
async function updateCharacterModel(profileId) {
  try {
    await charactersStore.updateCharacter(props.character.id, {
      customLlmProfileId: profileId || null
    })
  } catch (error) {
    toast.error('更新角色模型失败: ' + error.message)
  }
}

async function sendCommand() {
  const char = props.character
  const draft = commandDraft.value.trim()
  if (!draft || char.sending) return

  const command = draft
  commandDraft.value = ''
  char.sending = true

  try {
    // 构建特殊的指令消息
    const instructionMessage = `【角色指令】\n请${char.name}按照以下指令进行回复：\n${command}\n\n请保持角色人设，以角色的身份回应。`

    await messagesStore.sendMessageToCharacter(char.id, instructionMessage)
  } catch (error) {
    toast.error('发送指令失败: ' + error.message)
    // 失败时恢复指令内容；若用户已重新输入则不覆盖
    if (!commandDraft.value.trim()) {
      commandDraft.value = command
    }
  } finally {
    char.sending = false
  }
}
</script>
```

模板中函数调用对应调整：`@click="deleteCharacter(char.id)"` → `deleteCharacter()`；`moveCharacter(char, 'up'/'down')` → `moveCharacter('up'/'down')`；`:disabled="!canMoveUp(index)"` → `!canMoveUp()`；`toggleCharacter(char)` / `toggleCharacterThinking(char)` / `toggleCustomModel(char)` → 无参；`updateCharacterModel(char, $event.target.value)` → `updateCharacterModel($event.target.value)`；`sendCommand(char)` → `sendCommand()`；`togglePromptExpand(char.id)` → `togglePromptExpand()`；`syncFromLibrary(char)` → `syncFromLibrary()`；`editCharacter(char)` → `$emit('edit')`；`openMemoryDialog(char)` → `$emit('open-memory')`；`@edit`/`@open-memory` 相关 title 属性不变。

样式：从 CharacterPanel.vue **原文搬入**（模板替换后仍被引用的全部选择器块，按选择器名定位）：`.character-item`（含 `.user-character` 全套）、`.character-header`、`.character-actions-left`、`.character-actions-right`、`.btn-delete-icon`、`.btn-order-icon`、`.btn-edit-icon`、`.btn-memory-icon`、`.checkbox-switch`、`.user-actions`、`.character-name`、`.character-prompt-collapsed`、`.character-prompt-expanded`、`.character-command`、`.character-model-setting`、`.command-input`（含 `@extend .input !optional;` 原样保留）、`.command-btn`、`.toggle-switch`。

- [ ] **Step 2: CharacterPanel 收尾**

1. import：新增 `import CharacterCard from './CharacterCard.vue'`；删除不再使用的 import（逐一核对：`useMessagesStore`、`useGlobalCharactersStore`、`useLLMProfilesStore`、`LLM_PROVIDERS`、`useDialog`、`createLogger` 在面板层是否还有使用，无则删；`computed` 若不再用也从 vue import 中去掉）
2. 模板：`<!-- 角色列表 Tab -->` 区块的 `<div class="character-list">` 内、`<div v-for="(char, index) in charactersStore.characters" ...>` 循环体整块替换为：

```vue
          <CharacterCard
            v-for="(char, index) in charactersStore.characters"
            :key="char.id"
            :character="char"
            :index="index"
            @edit="editCharacter"
            @open-memory="openMemoryDialog"
          />
```

3. 脚本删除（已随卡片迁走）：`getCharEmotion`、`updateEmotion`、`togglePromptExpand`、`syncFromLibrary`、`canMoveUp`、`canMoveDown`、`moveCharacter`、`toggleCharacter`、`deleteCharacter`、`toggleCharacterThinking`、`toggleCustomModel`、`updateCharacterModel`、`sendCommand`、`profileGroups` computed、`expandedPrompts`、`libraryCharIds`、`syncingIds`、`commandDrafts`；`editCharacter(char)` 保留（接收 emit）
4. `onMounted(loadProfiles)` 与 watch 保留在面板层（tab 重置 + fetchEmotions）
5. 样式：删除 Step 1 已搬走的全部选择器块；保留 `.character-panel`/`.panel-content`/`.tab-bar`/`.relationship-tab`/`.character-list`/`.empty-state,.empty-panel` 六个面板骨架块

- [ ] **Step 3: 行数与验证**

```bash
wc -l src/components/chat/CharacterPanel.vue
```

Expected: < 300 行。

```bash
pnpm lint && pnpm build && pnpm test
```

- [ ] **Step 4: 冒烟 + Commit**

冒烟点（覆盖角色卡全部交互）：AI 角色——删除（确认弹窗）/上移下移（首尾禁用态）/思考🧠开关/启用开关/展开设定/🔄 库同步（含 ⏳ 态）/指令输入发送（失败回填）/独立模型开与切；用户角色——徽标样式/✏️ 编辑；📝 记忆对话框；EmotionTag 情绪修改。

```bash
git add src/components/chat/CharacterCard.vue src/components/chat/CharacterPanel.vue
git commit -m "refactor(p3): 拆出 CharacterCard，CharacterPanel 瘦身"
```

---

### Task 11: 全量验证 + 文档更新

**Files:**
- Modify: `CLAUDE.md`、`src/CLAUDE.md`

- [ ] **Step 1: 全量验证**

```bash
pnpm lint && pnpm build && pnpm test
wc -l src/components/chat/CharacterPanel.vue
```

Expected: lint 0 错误；build 全产出；test 全过（基线 + 7 新增）；CharacterPanel < 300 行。

- [ ] **Step 2: spec §8 冒烟清单全量过一遍**

按 spec `2026-09-01-p3-architecture-refactor-design.md` §8 的 7 项清单逐条手动验证（dev 模式）。任何一项失败：修复后从失败任务对应步骤重验。

- [ ] **Step 3: 更新文档**

1. `src/CLAUDE.md`：组件清单补充新组件（ConfirmHost/PromptSettingsTab/ProfileManager/ProfileManagerDialog/MemoryDialog/GroupSettingsSection/CharacterCard）、composables 补 `usePromptConfig`、stores 补 `confirm`、utils 补 `llm-providers`；删除 LLMProfileDialog 相关描述
2. `CLAUDE.md`：Mermaid 结构图同步（Common 加 ConfirmHost；ConfigC 加 PromptSettingsTab/ProfileManager/ProfileManagerDialog 并删 LLMProfileDialog；Chat 加 CharacterCard/GroupSettingsSection/MemoryDialog；Composables 加 usePromptConfig；Stores 加 confirm）；变更记录顶部加 `### 2026-09-01` 条目（列本次重构 10 个 commit 摘要）

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md src/CLAUDE.md
git commit -m "docs(p3): 更新组件文档与变更记录"
```

---

## 任务依赖图

```
T1 ──→ T6 ──→ T7
 │╲
 │ ╲──→ T7（groupProfilesByProvider）
 │
T3 → T4 → T5
T2（独立，confirm 签名不变）
T8（独立，依赖 CharacterPanel 现状；须在 T9/T10 前完成）
T9 → T10（同文件串行）
T11 最后
```

推荐执行顺序：T1 → T2 → T3 → T4 → T5 → T6 → T7 → T8 → T9 → T10 → T11。
