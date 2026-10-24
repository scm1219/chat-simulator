# LLM 动态事件推荐 + 事件情绪接线 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 事件面板的推荐事件由 LLM 根据剧情上下文动态生成（静态池兜底），事件触发时将 impact 写入角色情绪（带抖动）。

**Architecture:** 新增 `engine.generateEventSuggestions`（上下文收集 → 纯函数 prompt 构建 → 单次 LLM JSON 调用 → 解析；任一步失败回退现有静态池洗牌）。IPC handler 负责用群组 LLM 配置创建客户端；`llm:generate` 在事件消息落库后对启用角色调 `updateFromEvent(…, 0.2)`。

**Tech Stack:** Electron 主进程 ESM (node)、better-sqlite3（经 prepareCached）、Vue 3 + Pinia 渲染层、`node --test` 单元测试。

**Spec:** `docs/superpowers/specs/2026-10-24-llm-event-suggestions-design.md`

## Global Constraints

- 失败时静默降级：LLM 生成任一步失败 → 回退静态池，面板永远有内容
- 不新增数据库表、不新增 LLM 配置项、不改 `electron/main.js` 接线
- LLM 客户端一律用群组自身配置（provider/model/baseURL/apiKey），与角色对话同源
- `narrative_enabled !== 1` 时直接走静态池（现行为），不发起 LLM 调用
- `updateFromEvent` 新增 `jitter` 参数默认 0，现有签名语义不变；抖动后强度 clamp 到 [0,1]，`'平静'` 重置分支不参与抖动
- 测试体系是 `node --test`（`pnpm test`）；better-sqlite3 原生模块是 Electron ABI，纯 Node 无法加载，测试一律用鸭子类型 fake db（见 `tests/statement-cache.test.js` 的先例）
- 项目为 ESM（`"type": "module"`）；提交信息用 conventional commits + 中文描述（如 `feat(narrative): ...`）

## Review Focus

1. LLM 返回 `events` 数量超过 count 或根本不是数组 → 截断到 count / 整批拒绝（Task 2 测试）
2. `content` 为空/纯空白/超 50 字 → 单条过滤，不丢弃整批；`impact` 缺失或非法 → 归一为"惊讶"（Task 2 测试）
3. `client.chat` 抛异常、返回 `success:false`、或 JSON 解析出 `events: []` → 回退静态池（Task 4 测试）
4. 群组 `narrative_enabled = 0` 或 client 为 null → 不发起 LLM 调用直接回退（Task 4 测试）
5. 抖动把强度推出 [0,1] 边界 → clamp；`'平静'` impact 不受 jitter 影响恒为强度 0（Task 1 测试）

---

### Task 1: `updateFromEvent` 增加 jitter 参数

**Files:**
- Modify: `electron/narrative/emotion-manager.js:115-131`
- Test: `tests/narrative-event-generation.test.js`（新建）

**Interfaces:**
- Consumes: 无（独立）
- Produces: `updateFromEvent(db, characterId, impact, jitter = 0)`——Task 6 以 `jitter=0.2` 调用

- [ ] **Step 1: 写失败测试**

```js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EmotionManager } from '../electron/narrative/emotion-manager.js'

// 记录 INSERT 参数的 fake db：prepareCached 仅依赖 db.prepare 存在性
function makeRecordingDb() {
  const calls = []
  const db = {
    prepare(sql) {
      return { run: (...args) => calls.push({ sql, args }) }
    },
    _calls: calls
  }
  return db
}

test('updateFromEvent jitter=0 保持基准强度（惊慌 0.8*0.8）', () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '惊慌', 0)
  assert.equal(db._calls[0].args[2], 0.8 * 0.8)
  assert.equal(db._calls[0].args[3], 'event')
})

test('updateFromEvent 抖动 clamp 到 [0,1]', () => {
  const db = makeRecordingDb()
  const mgr = new EmotionManager()
  const orig = Math.random
  try {
    Math.random = () => 1  // jitter=1 → base*2
    mgr.updateFromEvent(db, 'c1', '惊慌', 1)
    assert.equal(db._calls[0].args[2], 1)  // 0.64*2=1.28 → 1
    Math.random = () => 0  // → base*0
    mgr.updateFromEvent(db, 'c2', '惊慌', 1)
    assert.equal(db._calls[1].args[2], 0)
  } finally {
    Math.random = orig
  }
})

test("updateFromEvent '平静' 分支不受 jitter 影响，强度恒 0", () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '平静', 0.5)
  assert.equal(db._calls[0].args[1], '平静')
  assert.equal(db._calls[0].args[2], 0)
})

test('updateFromEvent 非标准 impact 经 EVENT_EMOTION_MAP 归一（焦急→焦虑）', () => {
  const db = makeRecordingDb()
  new EmotionManager().updateFromEvent(db, 'c1', '焦急', 0)
  assert.equal(db._calls[0].args[1], '焦虑')
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: FAIL（jitter 参数被忽略，第 2 个测试断言 0.64 而非 1）

- [ ] **Step 3: 实现 jitter**

`emotion-manager.js` 的 `updateFromEvent(db, characterId, impact, jitter = 0)`，非平静分支：

```js
const config = this.keywords[standardEmotion]
const base = config ? config.intensity * 0.8 : 0.6
const jitterFactor = jitter > 0 ? 1 + (Math.random() * 2 - 1) * jitter : 1
const intensity = Math.min(1, Math.max(0, base * jitterFactor))
this._saveEmotion(db, characterId, standardEmotion, intensity, 'event')
```

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: PASS 全部

- [ ] **Step 5: Commit**

```bash
git add electron/narrative/emotion-manager.js tests/narrative-event-generation.test.js
git commit -m "feat(narrative): updateFromEvent 支持强度抖动参数"
```

---

### Task 2: `EventTrigger.parseGeneratedEvents` 解析与校验

**Files:**
- Modify: `electron/narrative/event-trigger.js`（类内新增方法；顶部 import 补 `mapEventImpactToEmotion`）
- Test: `tests/narrative-event-generation.test.js`（追加）

**Interfaces:**
- Consumes: `extractJSON(raw) → {success, data|error}`（`electron/utils/json-extractor.js`，已存在）；`mapEventImpactToEmotion(impact)`（`constants.js`，已存在）
- Produces: `parseGeneratedEvents(rawContent, count = 3) → Array<{key, content, impact}>`——可能为空数组（由 Task 4 决定回退）；key 形如 `llm_${Date.now()}_${i}`

- [ ] **Step 1: 写失败测试（追加到同一测试文件）**

```js
import { EventTrigger } from '../electron/narrative/event-trigger.js'

test('parseGeneratedEvents 解析合法事件并归一 impact', () => {
  const raw = JSON.stringify({ events: [
    { content: '老板突然把张三叫进了办公室', impact: '紧张' },
    { content: '群里流出了未公开的调薪名单', impact: '震惊' }  // 非标准词→惊讶
  ]})
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 2)
  assert.equal(result[0].content, '老板突然把张三叫进了办公室')
  assert.equal(result[1].impact, '惊讶')
  assert.match(result[0].key, /^llm_\d+_\d+$/)
})

test('parseGeneratedEvents 过滤空/超长 content，缺失 impact 默认惊讶', () => {
  const raw = JSON.stringify({ events: [
    { content: '   ', impact: '开心' },
    { content: 'a'.repeat(51), impact: '开心' },
    { content: '外卖送错了' }                     // 无 impact
  ]})
  const result = new EventTrigger().parseGeneratedEvents(raw, 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].impact, '惊讶')
})

test('parseGeneratedEvents events 非数组或空数组返回空数组', () => {
  const t = new EventTrigger()
  assert.deepEqual(t.parseGeneratedEvents('{"events":"x"}', 3), [])
  assert.deepEqual(t.parseGeneratedEvents('{"events":[]}', 3), [])
  assert.deepEqual(t.parseGeneratedEvents('不是JSON', 3), [])
})

test('parseGeneratedEvents 超出 count 截断', () => {
  const events = Array.from({ length: 5 }, (_, i) => ({ content: `事件${i}`, impact: '好奇' }))
  const result = new EventTrigger().parseGeneratedEvents(JSON.stringify({ events }), 3)
  assert.equal(result.length, 3)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: FAIL（方法不存在，TypeError）

- [ ] **Step 3: 实现 `parseGeneratedEvents`**

import 补：`import { SCENE_LABELS, mapEventImpactToEmotion } from './constants.js'`，`import { extractJSON } from '../utils/json-extractor.js'`。类内新增：extractJSON 解析 → `data.events` 非数组返回 `[]` → 逐条过滤（`typeof content === 'string'`、trim 后非空、长度 ≤ 50）、impact 归一（缺失/非法走 `mapEventImpactToEmotion`，其内部未知词返回 `'惊讶'`）→ 有效条目截断到 count → key 为 `` `llm_${Date.now()}_${i}` ``。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: PASS 全部

- [ ] **Step 5: Commit**

```bash
git add electron/narrative/event-trigger.js tests/narrative-event-generation.test.js
git commit -m "feat(narrative): 事件触发器新增 LLM 生成事件解析校验"
```

---

### Task 3: `buildEventSuggestionPrompt` 纯函数构建

**Files:**
- Modify: `electron/narrative/prompt-builder.js`（新增方法；顶部 import 补 `EMOTION_KEYWORDS`）
- Test: `tests/narrative-event-generation.test.js`（追加）

**Interfaces:**
- Consumes: `getRelationshipType` / `getFavorabilityLevel` / `EMOTION_KEYWORDS`（constants.js，前两者已 import）
- Produces: `buildEventSuggestionPrompt({ sceneLabel, background, characters, emotions, relationships, sampleEvents, recentMessages, count }) → string`（纯函数，不碰 db）。characters: `[{id, name, system_prompt}]`；emotions: `[{character_id, emotion, intensity}]`；relationships: `[{from_id, to_id, type, favorability}]`；sampleEvents: `[{content, impact}]`；recentMessages: `[{role, character_name, content}]`。Task 4 按此形状收集数据。

- [ ] **Step 1: 写失败测试（追加）**

```js
import { NarrativePromptBuilder } from '../electron/narrative/prompt-builder.js'

const PROMPT_INPUT = {
  sceneLabel: '聚会', background: '一家互联网公司的日常',
  characters: [
    { id: 'c1', name: '张三', system_prompt: '张三是后端工程师\n喜欢摸鱼' },
    { id: 'c2', name: '李四', system_prompt: '李四是产品经理' }
  ],
  emotions: [{ character_id: 'c1', emotion: '焦虑', intensity: 0.6 }],
  relationships: [{ from_id: 'c1', to_id: 'c2', type: 'colleague', favorability: -30 }],
  sampleEvents: [{ content: '办公室突然停电了', impact: '惊讶' }],
  recentMessages: [
    { role: 'user', character_name: null, content: '今天好累' },
    { role: 'assistant', character_name: '张三', content: '我也是' }
  ],
  count: 3
}

test('buildEventSuggestionPrompt 包含角色/情绪/关系/示例/对话各段', () => {
  const p = new NarrativePromptBuilder().buildEventSuggestionPrompt(PROMPT_INPUT)
  assert.ok(p.includes('张三') && p.includes('李四'))
  assert.ok(p.includes('焦虑'))
  assert.ok(p.includes('同事') && p.includes('不满'))   // 类型标签 + 好感度等级
  assert.ok(p.includes('办公室突然停电了'))
  assert.ok(p.includes('张三：我也是') && p.includes('用户：今天好累'))
  assert.ok(p.includes('聚会'))                         // 场景段（sceneLabel）
}

test('buildEventSuggestionPrompt 固定输出约束（count、JSON 结构、情绪词白名单、字数）', () => {
  const p = new NarrativePromptBuilder().buildEventSuggestionPrompt(PROMPT_INPUT)
  assert.ok(p.includes('"events"'))
  assert.ok(p.includes('3'))
  assert.ok(p.includes('开心') && p.includes('恐慌'))   // 情绪白名单抽样
  assert.ok(p.includes('40'))                           // content 字数约束
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现纯函数 prompt 构建**

段落顺序：任务说明（为群聊生成 count 个突发事件）→ 场景与背景 → 群成员（`name: system_prompt 首个非空行`，超 80 字截断加 `...`，同 `llm-context-builder.js:125` 规则）→ 当前情绪（`- 名字（情绪 强度）`，空数组省略段落）→ 角色关系（`- A → B：类型标签（好感度 X，等级标签）`，用 id→name 映射）→ 最近对话（`名字：内容`，user 显示为 `用户`）→ 示例事件（`- content（impact）`）→ 输出要求：只返回 JSON `{"events":[{"content":"...","impact":"..."}]}`、恰好 count 条、impact 从 `Object.keys(EMOTION_KEYWORDS).join('、')` 中选、每条 content ≤ 40 字、贴合当前剧情与人物关系、事件应能推动对话。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: PASS 全部

- [ ] **Step 5: Commit**

```bash
git add electron/narrative/prompt-builder.js tests/narrative-event-generation.test.js
git commit -m "feat(narrative): 新增 LLM 事件推荐 prompt 构建器"
```

---

### Task 4: `engine.generateEventSuggestions`（含降级）

**Files:**
- Modify: `electron/narrative/engine.js`（类内新增方法）
- Test: `tests/narrative-event-generation.test.js`（追加）

**Interfaces:**
- Consumes: Task 2 的 `parseGeneratedEvents`、Task 3 的 `buildEventSuggestionPrompt`、已有 `eventTrigger.getEventSuggestions(db, groupId, sceneType, count)`、`eventTrigger.getEventPool(sceneType)`、`extractJSON`（engine 已 import）、`SCENE_LABELS`（需新增 import）
- Produces: `async generateEventSuggestions(db, group, sceneType, count = 3, client = null) → { source: 'generated'|'fallback', events: Array<{key, content, impact}> }`——Task 5 的 IPC handler 调用

- [ ] **Step 1: 写失败测试（追加）**

```js
import { NarrativeEngine } from '../electron/narrative/engine.js'

// 按 SQL 关键字分发的 fake db（better-sqlite3 无法在纯 Node 加载）
function makeFakeDb(rows = {}) {
  return {
    prepare(sql) {
      const stmt = {
        all: (...a) => {
          if (sql.includes('FROM character_emotions')) return rows.emotions || []
          if (sql.includes('FROM character_relationships')) return rows.relationships || []
          if (sql.includes('FROM characters')) return rows.characters || []
          if (sql.includes('FROM messages')) return rows.messages || []
          if (sql.includes('FROM narrative_events')) return rows.recentEvents || []
          return []
        }
      }
      return stmt
    }
  }
}

const GROUP = { id: 'g1', narrative_enabled: 1, background: '办公室日常' }
const CHARACTERS = [{ id: 'c1', name: '张三', system_prompt: '工程师' }]

function goodClient() {
  return { chat: async () => ({
    success: true,
    content: JSON.stringify({ events: [{ content: '服务器宕机了', impact: '惊慌' }] })
  })}
}

test('generateEventSuggestions LLM 成功返回 generated', async () => {
  const engine = new NarrativeEngine()
  const result = await engine.generateEventSuggestions(makeFakeDb({ characters: CHARACTERS }), GROUP, 'office', 3, goodClient())
  assert.equal(result.source, 'generated')
  assert.equal(result.events[0].content, '服务器宕机了')
})

test('generateEventSuggestions chat 失败/抛异常/空 events 回退静态池', async () => {
  const engine = new NarrativeEngine()
  const db = makeFakeDb({ characters: CHARACTERS })
  const fail = { chat: async () => ({ success: false, error: 'x' }) }
  const thrower = { chat: async () => { throw new Error('network') } }
  const empty = { chat: async () => ({ success: true, content: '{"events":[]}' }) }
  for (const client of [fail, thrower, empty]) {
    const r = await engine.generateEventSuggestions(db, GROUP, 'office', 3, client)
    assert.equal(r.source, 'fallback')
    assert.ok(r.events.length > 0 && r.events.length <= 3)  // 静态池事件
  }
})

test('generateEventSuggestions narrative 关闭或 client 为 null 直接回退且不调 LLM', async () => {
  const engine = new NarrativeEngine()
  const db = makeFakeDb({ characters: CHARACTERS })
  let called = 0
  const counting = { chat: async () => { called++; return { success: true, content: '{}' } } }
  const off = await engine.generateEventSuggestions(db, { ...GROUP, narrative_enabled: 0 }, 'office', 3, counting)
  const noClient = await engine.generateEventSuggestions(db, GROUP, 'office', 3, null)
  assert.equal(off.source, 'fallback')
  assert.equal(noClient.source, 'fallback')
  assert.equal(called, 0)
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: FAIL（方法不存在）

- [ ] **Step 3: 实现 `generateEventSuggestions`**

守卫（`!group || group.narrative_enabled !== 1 || !client`）→ `getEventSuggestions` 回退。否则收集上下文（各一条 prepareCached 查询）：characters（`WHERE group_id = ? AND enabled = 1`）、emotions（`WHERE intensity > 0.1`）、relationships（全量）、recentMessages（`SELECT m.*, c.name AS character_name FROM messages m LEFT JOIN characters c ON c.id = m.character_id WHERE m.group_id = ? ORDER BY m.timestamp DESC LIMIT 10` 后 reverse，同 `generateAftermath` 的查询模式）、sampleEvents（`getEventPool(sceneType)` 洗牌取 4）。调 `promptBuilder.buildEventSuggestionPrompt({ sceneLabel: SCENE_LABELS[sceneType] || '通用', background: group.background, ..., count })`，然后：

```js
const result = await client.chat([
  { role: 'system', content: '你是群聊剧情事件生成器。只返回 JSON，格式 {"events":[{"content":"事件描述","impact":"情绪词"}]}，不要输出其他内容。' },
  { role: 'user', content: prompt }
], { maxTokens: 400, thinkingEnabled: false, responseFormat: { type: 'json_object' } })
```

成功 → `parseGeneratedEvents(result.content, count)`，空数组也走回退；任何 throw 也回退。回退统一：`{ source: 'fallback', events: this.eventTrigger.getEventSuggestions(db, group.id, sceneType, count) }`；成功：`{ source: 'generated', events }`。顶部补 `import { SCENE_LABELS } from './constants.js'`。

- [ ] **Step 4: 运行测试确认通过**

Run: `node --test tests/narrative-event-generation.test.js`
Expected: PASS 全部

- [ ] **Step 5: 运行全量测试回归**

Run: `pnpm test`
Expected: 全部 PASS（无既有测试破坏）

- [ ] **Step 6: Commit**

```bash
git add electron/narrative/engine.js tests/narrative-event-generation.test.js
git commit -m "feat(narrative): 引擎新增 LLM 事件推荐生成与静态池降级"
```

---

### Task 5: IPC handler + preload 通道 + 群组客户端工厂

**Files:**
- Modify: `electron/ipc/handlers/llm-client-factory.js`（从 `createClientForCharacter` 的群组分支提取 `createClientForGroup`，原函数改为调用它，签名不变）
- Modify: `electron/ipc/handlers/narrative.js`（新增 handler）
- Modify: `electron/preload.js:163` 附近（narrative 命名空间新增一行）

**Interfaces:**
- Consumes: Task 4 的 `generateEventSuggestions`；`createLLMClient` / `resolveClientProxy`（llm-client-factory 已有）、`resolveApiKey`（同文件）、`getLLMProfiles`（config/llm-profiles）、`getGlobalLLMConfig`（config/manager）、`getProviderConfig`（llm/providers）
- Produces: IPC `narrative:generateEventSuggestions` → `{ success: true, data: { source, events } }`；`createClientForGroup(group, llmProfiles, apiKey) → { client }`；preload `window.electronAPI.narrative.generateEventSuggestions(groupId, sceneType, count)`（Task 7 消费）

（本任务含 electron 依赖模块，纯 Node 单测不可行，以 lint + 全量回归验证。）

- [ ] **Step 1: 工厂提取 `createClientForGroup`**

把 `createClientForCharacter`（llm-client-factory.js:89-118）的群组匹配 + 创建逻辑原样移入新导出函数 `createClientForGroup(group, llmProfiles, apiKey)`，返回 `{ client, profileId: null }`；`createClientForCharacter` 的群组分支改为 `return createClientForGroup(group, llmProfiles, apiKey)`。行为不变。

- [ ] **Step 2: 新增 IPC handler**

`electron/ipc/handlers/narrative.js`：顶部 import `prepareCached`、`createClientForGroup`、`resolveApiKey`、`getLLMProfiles`、`getGlobalLLMConfig`、`getProviderConfig`。handler 流程：

```js
ipcMain.handle('narrative:generateEventSuggestions', createHandler(async (event, groupId, sceneType, count) => {
  const db = narrativeEngine.getGroupDB(groupId)
  const group = prepareCached(db, 'SELECT * FROM groups WHERE id = ?').get(groupId)
  if (!group) return { success: false, error: '群组不存在' }
  // 供应商需要 Key 而群组没有可用 Key 时不建客户端，引擎直接走静态池
  const apiKey = resolveApiKey(group, getGlobalLLMConfig())
  const needApiKey = getProviderConfig(group.llm_provider)?.needApiKey !== false
  const client = (needApiKey && !apiKey)
    ? null
    : createClientForGroup(group, getLLMProfiles(), apiKey).client
  const data = await narrativeEngine.generateEventSuggestions(db, group, sceneType || 'general', count || 3, client)
  return { success: true, data }
}))
```

- [ ] **Step 3: preload 注册通道**

`preload.js` narrative 命名空间 `getEventSuggestions` 行后新增：

```js
generateEventSuggestions: (groupId, sceneType, count) => ipcRenderer.invoke('narrative:generateEventSuggestions', groupId, sceneType, count),
```

- [ ] **Step 4: 全量回归 + lint**

Run: `pnpm test && pnpm lint`
Expected: 测试全部 PASS；lint 无错误

- [ ] **Step 5: Commit**

```bash
git add electron/ipc/handlers/llm-client-factory.js electron/ipc/handlers/narrative.js electron/preload.js
git commit -m "feat(narrative): 新增 LLM 事件推荐 IPC 通道与群组客户端工厂"
```

---

### Task 6: `llm:generate` 事件情绪接线

**Files:**
- Modify: `electron/ipc/handlers/llm.js:183`（`saveUserMessage` 调用之后插入）

**Interfaces:**
- Consumes: Task 1 的 `updateFromEvent(db, characterId, impact, jitter)`；handler 内已有变量 `characters`（启用的非用户角色）、`narrativeEngine`、`group`、`messageType`、`eventImpact`
- Produces: 无下游依赖

- [ ] **Step 1: 插入接线代码**

`saveUserMessage(...)` 之后、`responseMode` 分支之前：

```js
// 事件消息：将 impact 写入所有启用角色的情绪（±20% 抖动，避免整齐划一）
if (messageType === 'event' && eventImpact && narrativeEngine && group.narrative_enabled === 1) {
  for (const char of characters) {
    narrativeEngine.emotion.updateFromEvent(db, char.id, eventImpact, 0.2)
  }
}
```

- [ ] **Step 2: 全量回归 + lint**

Run: `pnpm test && pnpm lint`
Expected: 测试全部 PASS；lint 无错误

- [ ] **Step 3: Commit**

```bash
git add electron/ipc/handlers/llm.js
git commit -m "feat(narrative): 事件触发时将 impact 接入角色情绪状态"
```

---

### Task 7: 前端 store + EventPanel loading 态

**Files:**
- Modify: `src/stores/narrative.js`
- Modify: `src/components/chat/EventPanel.vue`
- Modify: `CLAUDE.md`（叙事引擎能力描述与变更记录各一行）

**Interfaces:**
- Consumes: preload 的 `narrative.generateEventSuggestions(groupId, sceneType, count)`（Task 5）；IPC 返回 `{ success, data: { source, events } }`
- Produces: store 新增 `eventSuggestionsLoading: Ref<boolean>`、`eventSuggestionsSource: Ref<'generated'|'fallback'>`、`generateEventSuggestions(groupId, sceneType)`；EventPanel 刷新改走生成

（无渲染层组件测试设施，以 lint 验证。）

- [ ] **Step 1: store 新增生成方法**

`stores/narrative.js`：新增两个 ref 与方法（`fetchEventSuggestions` 保留不动）：

```js
const eventSuggestionsLoading = ref(false)
const eventSuggestionsSource = ref('fallback')

async function generateEventSuggestions(groupId, sceneType) {
  eventSuggestionsLoading.value = true
  try {
    const r = await silent(() => window.electronAPI.narrative.generateEventSuggestions(groupId, sceneType, 3))
    if (r?.success) {
      eventSuggestions.value = r.data.events
      eventSuggestionsSource.value = r.data.source
    }
  } finally {
    eventSuggestionsLoading.value = false
  }
}
```

导出列表补三个新名字。

- [ ] **Step 2: EventPanel 接入生成与 loading**

`refresh()` 改调 `narrativeStore.generateEventSuggestions(props.groupId, props.sceneType)`，本地 `suggestions.value = narrativeStore.eventSuggestions`；`handleTrigger` 成功后的 `refresh()` 不变（自动走生成）。loading 期间：卡片区域显示 `生成中…` 占位（复用 `.empty-tip` 样式），`换一批` 按钮加 `:disabled="narrativeStore.eventSuggestionsLoading"`。LLM 生成失败时后端已回退静态池，前端无需额外处理。

- [ ] **Step 3: 更新 CLAUDE.md**

叙事引擎能力描述行（`CLAUDE.md:153` 附近）补"LLM 动态事件推荐（静态池兜底）"；变更记录新增一行本次 feat 摘要（沿用现有格式）。

- [ ] **Step 4: lint 验证**

Run: `pnpm lint`
Expected: 无错误

- [ ] **Step 5: Commit**

```bash
git add src/stores/narrative.js src/components/chat/EventPanel.vue CLAUDE.md
git commit -m "feat(narrative): 事件面板接入 LLM 动态推荐与加载态"
```
