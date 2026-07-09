# 设计：添加 Google (谷歌) 模型供应商

- 日期：2026-07-09
- 状态：已确认，待实现

## 背景与目标

为 chat-simulator 新增 Google Gemini 作为可选 LLM 供应商。默认模型 ID 为 `gemini-2.5-flash` 与 `gemini-3.5-flash`。接入方式采用 Gemini 的 OpenAI 兼容端点，复用现有 `LLMClient`，不新增客户端类。

## 现状

供应商的单一事实来源是 `electron/llm/providers/index.js` 中的 `LLM_PROVIDERS` 对象。每个条目结构为 `{ id, name, baseURL, models, needApiKey, needBaseUrl, capabilities?, protocol? }`。所有 UI 组件（`LLMProfileForm.vue`、`LLMConfigPanel.vue`、各 Dialog、`CharacterPanel.vue`、`ChatWindow.vue`）通过 `Object.values`/`Object.keys` 动态读取该注册表，新增条目会自动出现在下拉框、分组与排序中。客户端选择逻辑位于 `electron/ipc/handlers/llm-client-factory.js`，按 `protocol` 与是否 ollama 分流，其余落入默认的 `LLMClient`（OpenAI 兼容）。数据库 `groups` 表的 `llm_provider` 等列为 free-text，无需迁移。

## 方案

在 `LLM_PROVIDERS` 中 `minimax` 条目之后、`custom` 之前新增一个 `google` 条目：

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
}
```

### 字段说明

- `id: 'google'` — provider 标识，存入 `groups.llm_provider`（free-text，无需迁移）。
- `baseURL` — Gemini 官方 OpenAI 兼容端点。
- `models` — 默认模型 ID 列表；首项 `gemini-2.5-flash` 为选中该供应商时自动选中的默认模型（`LLMProfileForm.vue` `handleProviderChange`）。
- `needApiKey: true` — UI 显示 API Key 输入框；鉴权头 `Authorization: Bearer <apiKey>` 由 `client.js:22-25` 设置，Gemini 兼容端点接受。
- `needBaseUrl: false` — 隐藏 baseURL 编辑框，固定使用预设端点。
- `capabilities` — 预防性守卫，详见下节。

### capabilities 守卫机制

`LLMClient.chat()`（`client.js:124-155`）读取 `providerConfig.capabilities` 决定是否注入某些可选请求字段：

| 标志 | 默认行为 | 设为 false 的效果 | 代码位置 |
|---|---|---|---|
| `responseFormat` | 发送 `response_format` | 跳过 | `client.js:143` |
| `streamOptions` | 流式时发送 `stream_options.include_usage` | 跳过 | `client.js:148` |
| `thinking` | 调用 `applyThinkingMode` 注入思考参数 | 跳过 | `client.js:153` |
| `maxCompletionTokens` | 用 `max_tokens` | — | `client.js:136-140` |

Google 条目不设 `maxCompletionTokens`，保持默认使用 `max_tokens`。`responseFormat`/`streamOptions`/`thinking` 设为 `false` 是预防性猜测，规避 Gemini 兼容端点已知对这几个字段支持不稳定的风险。若联调发现某字段实际可用，移除对应 flag 即可恢复，无需改客户端代码。

### 客户端选择路径（无改动）

`llm-client-factory.js:30-55` 的 `createLLMClient()`：
1. 非 ollama → 跳过原生分支
2. `protocol !== 'anthropic'` → 跳过 Anthropic 分支
3. 落入默认分支 → 使用 `LLMClient`（OpenAI 兼容）✓

### UI 自动适配（无改动）

以下组件通过动态读取 `LLM_PROVIDERS` 自动发现新条目，无需修改：

- `src/components/config/LLMProfileForm.vue` — 供应商下拉框（按 `name` 排序）+ 模型下拉框
- `src/components/config/LLMConfigPanel.vue` — 供应商分组
- `src/components/config/CreateGroupDialog.vue` — provider 排序
- `src/components/config/QuickGroupDialog.vue` — provider 排序
- `src/components/config/GroupSettingsDialog.vue` — provider 显示名查找
- `src/components/config/LLMProfileDialog.vue` — provider 显示名查找
- `src/components/chat/CharacterPanel.vue` — 角色 LLM 配置分组
- `src/components/chat/ChatWindow.vue` — 对话中显示供应商名

### 持久化（无改动）

`groups` 表 `llm_provider`/`llm_model`/`llm_api_key`/`llm_base_url` 均为 free-text；`llm-profiles.json` 为 schemaless JSON。无需迁移。

## 测试策略

1. **静态验证**：`getProviderConfig('google')` 返回正确配置；`getAllProviders()` 包含 google。
2. **UI 验证**：启动应用，确认供应商下拉框出现"谷歌"，选中后自动填入 baseURL 且默认模型为 `gemini-2.5-flash`。
3. **联调验证**：配置真实 API Key，发送一条测试对话，确认请求成功；若返回字段不兼容错误，据此调整 `capabilities`。
4. **回归**：确认其他供应商不受影响（改动仅新增一个对象 key）。

## 不做的事（YAGNI）

- 不新增 GeminiClient 类（OpenAI 兼容端点无需）。
- 不加原生/兼容协议切换开关。
- 不改数据库 schema。
- 不改 IPC 层。

## 涉及文件

- `electron/llm/providers/index.js` — **唯一需编辑的文件**，新增 `google` 条目。
