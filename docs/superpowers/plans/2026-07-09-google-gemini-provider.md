# Google Gemini 供应商 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `LLM_PROVIDERS` 注册表中新增 `google` 供应商，默认模型 `gemini-2.5-flash` 与 `gemini-3.5-flash`，通过 Gemini OpenAI 兼容端点接入。

**Architecture:** 单一文件改动。在 `electron/llm/providers/index.js` 的 `LLM_PROVIDERS` 对象中插入一个 `google` 条目，结构照搬 DeepSeek/Qwen，额外预置 `capabilities` 守卫规避兼容端点不支持的可选请求字段。客户端选择逻辑、UI 下拉框、分组排序、数据库存储全部自动适配，无需其他改动。

**Tech Stack:** 原生 ES Modules（Node，无构建步骤参与此文件）、Vue 3 渲染层、electron-vite、eslint。项目无测试框架，验证采用内联 node 脚本 + eslint。

**Reference spec:** `docs/superpowers/specs/2026-07-09-google-gemini-provider-design.md`

## Global Constraints

- 供应商 id 为字符串 `'google'`，显示名为 `'谷歌'`。
- 默认模型数组严格为 `['gemini-2.5-flash', 'gemini-3.5-flash']`，顺序不可调换（首项为选中供应商时的默认模型）。
- baseURL 固定为 `https://generativelanguage.googleapis.com/v1beta/openai`。
- `needApiKey: true`，`needBaseUrl: false`。
- `capabilities` 仅包含 `responseFormat: false`、`streamOptions: false`、`thinking: false` 三个键；不设 `maxCompletionTokens`。
- 仅编辑 `electron/llm/providers/index.js` 一个文件；不新增客户端类、不改数据库、不改 IPC、不改 UI 组件。
- 遵循文件现有代码风格：2 空格缩进、无尾逗号（与该文件其余条目一致）、键名无引号（除特殊字符外）。

---

## File Structure

- Modify: `electron/llm/providers/index.js` — 在 `minimax` 条目（第 79-87 行）之后、`custom` 条目（第 88 行）之前插入 `google` 条目。该文件是供应商的单一事实来源，被主进程客户端工厂与全部渲染层 UI 组件动态读取。

---

### Task 1: 在 LLM_PROVIDERS 中新增 google 条目

**Files:**
- Modify: `electron/llm/providers/index.js`（在 `minimax` 条目之后、`custom` 条目之前插入）

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: `LLM_PROVIDERS.google` 条目，后续验证任务与运行时客户端/UI 均通过 `getProviderConfig('google')` / `getAllProviders()` / `Object.values(LLM_PROVIDERS)` 读取。

- [ ] **Step 1: 查看插入位置**

确认 `minimax` 条目结束于 `}`（第 87 行），其后紧跟 `custom: {`（第 88 行）。新条目插入二者之间。

读取 `electron/llm/providers/index.js` 第 79-95 行以确认当前确切文本。

- [ ] **Step 2: 插入 google 条目**

在 `minimax` 条目的闭合 `},`（第 87 行）之后、`custom: {`（第 88 行）之前，插入以下条目。使用 Edit 工具，`old_string` 为 minimax 闭合与 custom 开头的衔接处，`new_string` 在中间插入 google 条目。

插入内容：

```js
  google: {
    id: 'google',
    name: '谷歌',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-3.5-flash'],
    needApiKey: true,
    needBaseUrl: false,
    capabilities: {
      responseFormat: false,
      streamOptions: false,
      thinking: false
    }
  },
```

完整 Edit 操作：

- `old_string`:
```
  },
  custom: {
```
- `new_string`:
```
  },
  google: {
    id: 'google',
    name: '谷歌',
    baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: ['gemini-2.5-flash', 'gemini-3.5-flash'],
    needApiKey: true,
    needBaseUrl: false,
    capabilities: {
      responseFormat: false,
      streamOptions: false,
      thinking: false
    }
  },
  custom: {
```

注意：`old_string` 中 `  },\n  custom: {` 在文件中唯一（minimax 是 custom 前最后一个条目），故无需 `replace_all`。

- [ ] **Step 3: 运行 eslint 验证语法与风格**

Run: `npx eslint electron/llm/providers/index.js`
Expected: 无输出（无错误）。若报错，按提示修正（通常是逗号/缩进问题）。

- [ ] **Step 4: 运行内联验证脚本确认条目正确**

Run:
```bash
node --input-type=module -e "import('file:///D:/work_github/chat-simulator/electron/llm/providers/index.js').then(m => { const g = m.getProviderConfig('google'); const all = m.getAllProviders(); console.log('id:', g.id); console.log('name:', g.name); console.log('baseURL:', g.baseURL); console.log('models:', JSON.stringify(g.models)); console.log('needApiKey:', g.needApiKey); console.log('needBaseUrl:', g.needBaseUrl); console.log('capabilities:', JSON.stringify(g.capabilities)); console.log('inAllProviders:', all.some(p => p.id === 'google')); console.log('defaultBaseURL:', m.getProviderDefaultBaseURL('google')); })"
```

Expected output（逐行）:
```
id: google
name: 谷歌
baseURL: https://generativelanguage.googleapis.com/v1beta/openai
models: ["gemini-2.5-flash","gemini-3.5-flash"]
needApiKey: true
needBaseUrl: false
capabilities: {"responseFormat":false,"streamOptions":false,"thinking":false}
inAllProviders: true
defaultBaseURL: https://generativelanguage.googleapis.com/v1beta/openai
```

若任一行不符，回到 Step 2 修正条目内容。

- [ ] **Step 5: 确认回归——其他供应商未受影响**

Run:
```bash
node --input-type=module -e "import('file:///D:/work_github/chat-simulator/electron/llm/providers/index.js').then(m => { const ids = m.getAllProviders().map(p => p.id); console.log('count:', ids.length); console.log('has openai:', ids.includes('openai')); console.log('has custom:', ids.includes('custom')); console.log('has minimax:', ids.includes('minimax')); console.log('custom fallback:', m.getProviderConfig('nonexistent').id); })"
```

Expected output:
```
count: 12
has openai: true
has custom: true
has minimax: true
custom fallback: custom
```

说明：改动前供应商数为 11（openai, deepseek, qwen, moonshot, zhipu, zhipu-coding, baichuan, ollama, modelscope, minimax, custom），新增 google 后为 12。未知 id 仍回退到 custom。

- [ ] **Step 6: 提交**

```bash
git add electron/llm/providers/index.js
git commit -m "feat: 添加谷歌(Google Gemini)供应商"
```

---

## 验证清单（实现完成后）

- [ ] eslint 无报错
- [ ] 内联脚本输出与预期完全一致
- [ ] 供应商总数从 11 增至 12，原有供应商均存在
- [ ] 未知 provider id 仍回退到 custom
- [ ] git 工作区干净（已提交）

## 联调说明（可选，需真实 API Key，不在本计划范围内）

启动 `pnpm dev`，在设置界面供应商下拉框选择"谷歌"，确认 baseURL 自动填入、默认模型为 `gemini-2.5-flash`，填入 API Key 后发送测试对话。若返回字段不兼容错误，按错误信息调整 `capabilities` 中对应 flag（移除即可恢复该字段发送）。
