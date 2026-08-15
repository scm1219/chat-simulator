# 代码审查问题修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 `docs/代码审查/2026-08-15-代码审查报告.md` 中除 P3 重构外的全部约 95 项问题。

**Architecture:** 按主题分 8 个批次（安全防线 → 数据完整性 → LLM 客户端 → 前端竞态 → LLM 处理层 → 叙事引擎 → 配置组件 → 清理验证）串行修复；每项修复前先复查当前代码确认问题仍存在，复查不成立则跳过并记录；每任务独立提交。

**Tech Stack:** Electron 41 / Vue 3.5 / Pinia 3 / better-sqlite3 12 / Node 内置 `node --test`；新增依赖仅 `socks-proxy-agent`。

**设计规格:** `docs/superpowers/specs/2026-08-15-code-review-fixes-design.md`（每个任务开头都应重读相关条目）

## Global Constraints

- 零新增测试框架：测试用 Node 内置 `node --test`，放 `tests/` 目录，ESM 语法（项目 `"type": "module"`）。
- 唯一允许的新依赖：`socks-proxy-agent`。
- 不做 P3 重构：不拆分 CharacterPanel.vue、不统一对话框体系、不抽取 getProviderName 等重复函数。
- 每个任务开始前必须先 Read 目标文件的 cited 行号区域**复查**问题是否仍存在；行号漂移则按语义定位；问题不存在则在修复记录中记"复查不成立"，不修改代码。
- 修复代码块是"目标实现"：以复查到的当前代码为准适配变量名/缩进，保持修复语义不变。
- 提交信息：`fix(batch-N): 描述` / `test(batch-N): ...` / `chore(batch-N): ...`，每任务一提交（比规格 §5 的每批次一提交更细，方向安全）。
- 验证命令：`pnpm lint`（零错误）、`pnpm build`（成功）、`pnpm test`（通过）。Electron 主进程改动无单测覆盖的部分以 lint+build 为准。
- Windows 平台（win32 / Git Bash）：路径分隔符、文件句柄行为按 Windows 考虑。

---

## Batch 1：安全防线

### Task 1: 测试基础设施 + escapeHtml 工具（TDD）

**Files:**
- Create: `tests/html-escape.test.js`
- Create: `src/utils/html.js`
- Modify: `package.json`（scripts 加 `"test": "node --test tests/"`）

**Interfaces:**
- Produces: `escapeHtml(text: unknown): string`（src 与 electron 两侧均可用的纯函数，后续任务复用）

- [ ] **Step 1: 写失败测试**

```js
// tests/html-escape.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml } from '../src/utils/html.js'

test('转义全部 HTML 实体字符', () => {
  assert.equal(escapeHtml('<img src=x onerror="a">&\''), '&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;')
})
test('普通文本与非字符串输入', () => {
  assert.equal(escapeHtml('hello'), 'hello')
  assert.equal(escapeHtml(null), '')
  assert.equal(escapeHtml(123), '123')
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/html-escape.test.js`，期望 `Cannot find module '../src/utils/html.js'`
- [ ] **Step 3: 实现**

```js
// src/utils/html.js
const HTML_ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch])
}
```

- [ ] **Step 4: package.json scripts 加 `"test": "node --test tests/"`**
- [ ] **Step 5: `pnpm test` 通过后提交** — `test(batch-1): escapeHtml 工具与测试脚手架`

### Task 2: S-2 修复 GroupSearch XSS

**Files:**
- Modify: `src/components/layout/GroupSearch.vue:92-104`（highlightKeyword）、`:34,43`（v-html，保留但内容已安全）

**Interfaces:**
- Consumes: Task 1 的 `escapeHtml`

- [ ] **Step 1: 复查** — Read GroupSearch.vue:30-45 与 90-105，确认 `highlightKeyword` 未做 HTML 转义且 `v-html` 渲染 `item.snippet`
- [ ] **Step 2: 替换 highlightKeyword**（在转义后的文本上匹配转义后的关键词）

```js
import { escapeHtml } from '../../utils/html'

function highlightKeyword(text) {
  const escapedHtml = escapeHtml(text)
  const kw = keyword.value.trim()
  if (!kw) return escapedHtml
  const kwPattern = escapeHtml(kw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return escapedHtml.replace(new RegExp(`(${kwPattern})`, 'gi'), '<mark class="search-highlight">$1</mark>')
}
```

- [ ] **Step 3: 同文件顺带修复（报告中低优先级项）**：debounce 定时器卸载清理 + 搜索请求序号防过期覆盖（GroupSearch.vue:62,72-84）：

```js
let debounceTimer = null
let searchSeq = 0
onUnmounted(() => clearTimeout(debounceTimer))
async function doSearch() {
  const seq = ++searchSeq
  const res = await window.electronAPI.search.global(keyword.value.trim())
  if (seq !== searchSeq) return
  if (res.success) results.value = res.data || []
}
```

（适配现有函数名；debounce 回调改调 doSearch）

- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-1): 修复全局搜索高亮 XSS 与搜索竞态`

### Task 3: H-3 CSP + 窗口防线 + M-16 单实例锁

**Files:**
- Modify: `index.html`（加 CSP meta）
- Modify: `electron/main.js:16-28`（sandbox）、`:38-49`（删 onHeadersReceived）、新增 setWindowOpenHandler/will-navigate、新增单实例锁

- [ ] **Step 1: 复查** — Read main.js 全文（162 行）与 index.html，确认 onHeadersReceived CSP 代码、无 setWindowOpenHandler、无 requestSingleInstanceLock
- [ ] **Step 2: index.html `<head>` 首行加 CSP meta**（dev 模式 vite/HMR 需要 localhost + ws）

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://* http://localhost:* ws://localhost:*; img-src 'self' data: blob: https://*">
```

- [ ] **Step 3: main.js 改动**：
  1. BrowserWindow webPreferences 显式加 `sandbox: true`
  2. createWindow 内（webContents 创建后）加：

```js
mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
mainWindow.webContents.on('will-navigate', (event, url) => {
  const allowed = isDev ? url.startsWith(devUrl) : url.startsWith('file://')
  if (!allowed) event.preventDefault()
})
```

（isDev/devUrl 变量已存在于 main.js:32-33 附近，注意声明顺序，必要时把这两行放到变量定义之后）
  3. 删除生产分支整段 `session.webRequest.onHeadersReceived(...)` 代码块（对 file:// 无效），仅保留注释说明 CSP 由 index.html meta 提供
  4. `app.whenReady()` 调用之前加单实例锁：

```js
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })
}
```

（后续 `app.whenReady().then(createWindow)` 需包进 else 分支或用早 return 保证未获锁不建窗）

- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-1): CSP meta、窗口打开/导航拦截、sandbox 与单实例锁`

### Task 4: H-1 groupId 白名单校验与路径包含检查

**Files:**
- Modify: `electron/database/manager.js:290-310`（getGroupDB）、`:400-410`（deleteGroupDB）

**Interfaces:**
- Produces: manager.js 内 `isValidGroupId(id)` 导出，后续 handler 任务可复用

- [ ] **Step 1: 复查** — Read manager.js:280-425，确认 getGroupDB/deleteGroupDB 直接拼路径；Read `electron/ipc/handlers/group.js` 一处 create 流程确认群组 ID 由 generateUUID 生成（36 位）
- [ ] **Step 2: 实现**（manager.js 顶部）：

```js
const GROUP_ID_RE = /^[a-zA-Z0-9-]{8,64}$/
export function isValidGroupId(id) {
  return typeof id === 'string' && GROUP_ID_RE.test(id)
}
function assertValidGroupId(groupId) {
  if (!isValidGroupId(groupId)) {
    throw new Error('非法的群组 ID 格式')
  }
}
```

getGroupDB 与 deleteGroupDB 开头调用 `assertValidGroupId(groupId)`，并在拼出 dbPath 后加包含校验：

```js
const dbPath = path.join(this.dataDir, `group_${groupId}.sqlite`)
if (!path.resolve(dbPath).startsWith(path.resolve(this.dataDir) + path.sep)) {
  throw new Error('数据库路径越界')
}
```

（createHandler 会把 throw 转成 `{success:false, error}` 返回渲染进程，无需改 handler）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-1): groupId 白名单校验与路径穿越防护`

### Task 5: H-2 safeStorage 加密 API Key（含旧明文兼容）

**Files:**
- Create: `electron/utils/secure-storage.js`
- Modify: `electron/config/llm-profiles.js`（save/load 时加解密）
- Modify: `electron/config/manager.js`（DEFAULT_LLM_CONFIG 读写路径）
- Modify: `electron/ipc/handlers/group.js`（llm_api_key 写入点加密）
- Modify: `electron/ipc/handlers/config.js`（syncGroupsProfile 写入点加密）
- Modify: `electron/ipc/handlers/llm-client-factory.js`（读取点解密）
- Modify: `electron/database/manager.js`（groups 表读取点若返回 apiKey 也解密——复查确认）

**Interfaces:**
- Produces: `encryptSecret(plain: string): string`、`decryptSecret(stored: string): string`（不可用/失败时原样返回）

- [ ] **Step 1: 复查** — `grep -rn "apiKey\|llm_api_key" electron/ --include="*.js"` 列出全部读写点；Read llm-profiles.js、config/manager.js、group.js、config.js、llm-client-factory.js 相关行
- [ ] **Step 2: 实现 secure-storage.js**

```js
import { safeStorage } from 'electron'
import { createLogger } from './logger.js'
const log = createLogger('SecureStorage')

export function encryptSecret(plain) {
  if (plain == null || plain === '') return plain
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.encryptString(String(plain)).toString('base64')
    }
    log.warn('safeStorage 不可用，API Key 将以明文存储')
  } catch (error) {
    log.warn('加密失败，保持明文存储:', error.message)
  }
  return plain
}

export function decryptSecret(stored) {
  if (stored == null || stored === '') return stored
  try {
    const buf = Buffer.from(String(stored), 'base64')
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf)
    }
  } catch {
    // 旧版明文数据：Base64 解密失败，原样返回
  }
  return stored
}
```

- [ ] **Step 3: 接入全部读写点**——写入侧（llm-profiles.js 的 saveLLMProfiles 序列化前对每个 profile.apiKey 调 encryptSecret；config/manager.js 同理；group.js 与 config.js 中写 groups 表 llm_api_key 的值先 encryptSecret）注意 save 前若值已是密文不要二次加密（save 侧统一在"接收渲染进程明文输入"的入口加密，存储层直接存；load 侧统一 decrypt）。读取侧（getLLMProfiles 返回前 decrypt 每个 apiKey；config getLLMConfig 同理；llm-client-factory 使用 group.llm_api_key / profile.apiKey 前 decrypt；group:getAll 等返回给渲染进程的 groups 数据**保持密文原样**，前端只判断非空——复查前端确实只判空，若前端显示明文则需同步调整该展示）
- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-1): API Key 使用 safeStorage 加密存储`

### Task 6: M-14 handler-wrapper 错误处理

**Files:**
- Modify: `electron/ipc/handler-wrapper.js:15-25`（createHandler catch）

- [ ] **Step 1: 复查** — Read handler-wrapper.js 全文（约 70 行），确认 catch 中 `if (label) log.error(...)` 与裸 `error.message` 返回
- [ ] **Step 2: 修改 catch**

```js
} catch (error) {
  const tag = label || 'IPC'
  log.error(`[${tag}]`, error.stack || error.message)
  const safeMessage = String(error.message || '未知错误')
    // 过滤 Windows 绝对路径，避免向渲染进程泄漏本机目录结构
    .replace(/[A-Za-z]:\\[^\s'"]*/g, '[路径]')
  return { success: false, error: safeMessage }
}
```

- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-1): IPC 错误统一日志与路径脱敏`

---

## Batch 2：数据完整性

### Task 7: S-1 syncGroupsProfile 用合并后 profile 同步

**Files:**
- Modify: `electron/ipc/handlers/config.js:97-108`（llmProfile:update）、`:190-215`（syncGroupsProfile）

- [ ] **Step 1: 复查** — Read config.js:90-220，确认 update 后用原始 `data` 调 syncGroupsProfile 且 apiKey/baseURL 无兜底；确认 `updateLLMProfile` 返回值含合并后数据（Read electron/config/llm-profiles.js:140-160 确认返回结构，通常是 `{ success: true, data: profile }`）
- [ ] **Step 2: 修改 llmProfile:update**

```js
const oldProfile = getLLMProfiles().find(p => p.id === id) || null
const result = await updateLLMProfile(id, data)
if (result.success && oldProfile && dbManager) {
  const mergedProfile = result.data || getLLMProfiles().find(p => p.id === id)
  const syncedGroups = mergedProfile
    ? syncGroupsProfile(dbManager, oldProfile, mergedProfile)
    : 0
  log.info(`Profile "${mergedProfile?.name ?? id}" 已同步更新 ${syncedGroups} 个群组`)
  result.syncedGroups = syncedGroups
}
```

- [ ] **Step 3: syncGroupsProfile 内四字段统一兜底**（newProfileData 现在是完整对象，仍保留防御）：

```js
newProfileData.provider || oldProfile.provider,
newProfileData.model || oldProfile.model,
newProfileData.apiKey ? String(newProfileData.apiKey) : (oldProfile.apiKey || null),
newProfileData.baseURL ? String(newProfileData.baseURL) : (oldProfile.baseURL || null),
newProfileData.apiKey ? 0 : 1,
```

（若 Task 5 已在该处包 encryptSecret，保持加密调用不变，仅补 `|| oldProfile.xxx || null` 兜底）
- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-2): Profile 部分更新不再清空群组 API Key`

### Task 8: H-6 毫秒级时间戳 + rowid 定位删除（TDD）

**Files:**
- Create: `electron/utils/timestamp.js`
- Create: `tests/timestamp.test.js`
- Modify: `electron/ipc/handlers/message.js`（插入点 + deleteFrom）
- Modify: `electron/ipc/handlers/llm-response-handler.js`（两处消息插入）
- Modify: `electron/ipc/handlers/llm.js`（saveUserMessage / character command 插入点，复查确认）
- Modify: `electron/narrative/engine.js:290` 附近（事件消息插入）
- Modify: `electron/ipc/handlers/narrative.js:100-115`（deleteEvent）

**Interfaces:**
- Produces: `nowTimestampMs(): string`（格式 `YYYY-MM-DD HH:MM:SS.mmm`，UTC，与秒级存量字符串排序兼容）

- [ ] **Step 1: 写失败测试**

```js
// tests/timestamp.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nowTimestampMs } from '../electron/utils/timestamp.js'

test('格式为毫秒级且字典序与秒级存量兼容', () => {
  const ts = nowTimestampMs()
  assert.match(ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/)
  // 同一秒内：带毫秒 > 不带毫秒；跨秒：晚的更大
  assert.ok('2026-08-15 07:00:00.123' > '2026-08-15 07:00:00')
  assert.ok('2026-08-15 07:00:00.999' < '2026-08-15 07:00:01')
})

test('两次调用单调不减', () => {
  assert.ok(nowTimestampMs() <= nowTimestampMs())
})
```

- [ ] **Step 2: 运行确认失败** — `node --test tests/timestamp.test.js`（模块不存在）
- [ ] **Step 3: 实现**

```js
// electron/utils/timestamp.js
export function nowTimestampMs() {
  const d = new Date()
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}.${p(d.getMilliseconds(), 3)}`
}
```

- [ ] **Step 4: 接入全部消息插入点** — `grep -rn "INSERT INTO messages" electron/` 逐处在 column 列表加 `timestamp`、values 加 `nowTimestampMs()`（import 该工具）
- [ ] **Step 5: 重写 message.js deleteFrom**（复查当前 handler 签名后适配；目标语义：按消息 id 定位，按 timestamp+rowid 复合条件删除）：

```js
const target = db.prepare(
  'SELECT timestamp, rowid AS rid FROM messages WHERE group_id = ? AND id = ?'
).get(groupId, messageId)
if (!target) return { success: false, error: '消息不存在' }
db.prepare(`
  DELETE FROM messages
  WHERE group_id = ? AND (timestamp > ? OR (timestamp = ? AND rowid >= ?))
`).run(groupId, target.timestamp, target.timestamp, target.rid)
```

（preload/前端若传的是 timestamp 参数，同步改为传 messageId——grep 渲染端 deleteFrom 调用点一并修改）
- [ ] **Step 6: 重写 narrative.js deleteEvent 的级联删除**——匹配用户消息改为限定该事件时间之前最近一条同内容消息并校验，删除条件同上复合式：

```js
const msg = db.prepare(`
  SELECT timestamp, rowid AS rid FROM messages
  WHERE group_id = ? AND role = 'user' AND content = ? AND timestamp <= ?
  ORDER BY timestamp DESC, rowid DESC LIMIT 1
`).get(groupId, evt.content, evt.triggered_at || evt.created_at || '9999')
```

（复查 events 表列名后适配 `evt` 字段；无合适时间列则维持 ORDER BY timestamp DESC LIMIT 1 + 复合删除条件）
- [ ] **Step 7: `pnpm test && pnpm lint && pnpm build` 通过后提交** — `fix(batch-2): 消息时间戳毫秒化与按 rowid 精确删除`

### Task 9: M-3 配置文件原子写

**Files:**
- Create: `electron/utils/atomic-write.js`
- Modify: `electron/config/manager.js:129`、`electron/config/llm-profiles.js:92`、`electron/config/system-prompts.js:97`

- [ ] **Step 1: 复查** — Read 三处 writeFileSync 调用及上下文
- [ ] **Step 2: 实现并替换**

```js
// electron/utils/atomic-write.js
import fs from 'node:fs'
export function atomicWriteJson(filePath, data) {
  const tmpPath = `${filePath}.tmp`
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2))
  fs.renameSync(tmpPath, filePath)
}
```

三处 `fs.writeFileSync(x, JSON.stringify(y, null, 2))` 全部改为 `atomicWriteJson(x, y)`。
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-2): 配置文件原子写入防止损坏`

### Task 10: M-2/M-22 标签事务 + LIKE 转义（TDD）

**Files:**
- Create: `electron/utils/text.js`（escapeLike，后续 Task 33 扩展 escapeRegExp 等）
- Create: `tests/like-escape.test.js`
- Modify: `electron/database/global-character-manager.js:205-215`（搜索）、`:285-295`（deleteTag）、`:315-330`（setCharacterTags）
- Modify: `electron/ipc/handlers/search.js:40-80`（LIKE + LIMIT）

**Interfaces:**
- Produces: `escapeLike(keyword: string): string`

- [ ] **Step 1: 写失败测试**

```js
// tests/like-escape.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeLike } from '../electron/utils/text.js'

test('转义 LIKE 通配符', () => {
  assert.equal(escapeLike('100%'), '100\\%')
  assert.equal(escapeLike('a_b'), 'a\\_b')
  assert.equal(escapeLike('back\\slash'), 'back\\\\slash')
  assert.equal(escapeLike('普通'), '普通')
})
```

- [ ] **Step 2: 确认失败 → 实现**

```js
// electron/utils/text.js
export function escapeLike(keyword) {
  return String(keyword ?? '').replace(/[\\%_]/g, (m) => '\\' + m)
}
```

- [ ] **Step 3: global-character-manager 搜索改 `LIKE ? ESCAPE '\\'`（参数用 escapeLike 包裹）；search.js 的消息与角色 LIKE 同改，角色查询加 `LIMIT 20`**（复查 search.js:75-77 的 characters 查询与 131-132 的限额逻辑）
- [ ] **Step 4: setCharacterTags 包事务；deleteTag 删除手动关联表 DELETE（schema 已 ON DELETE CASCADE，保留单条 `DELETE FROM tags WHERE id = ?`）**

```js
setCharacterTags(characterId, tagIds) {
  this.getDB().transaction(() => {
    this.getDB().prepare('DELETE FROM character_tags WHERE character_id = ?').run(characterId)
    if (tagIds && tagIds.length > 0) {
      const insert = this.getDB().prepare('INSERT INTO character_tags (character_id, tag_id) VALUES (?, ?)')
      for (const tagId of tagIds) insert.run(characterId, tagId)
    }
  })()
}
```

- [ ] **Step 5: `pnpm test && pnpm lint && pnpm build` 通过后提交** — `fix(batch-2): 标签写入事务化与 LIKE 通配符转义`

### Task 11: M-1/M-5/M-6 模板深拷贝、群组复制补列、maxHistory 边界

**Files:**
- Modify: `electron/config/system-prompts.js:75-130`
- Modify: `electron/ipc/handlers/group.js:10-45,170-185`
- Modify: `electron/ipc/handlers/config.js`（save handler 失败带 error，4 处）

- [ ] **Step 1: 复查** — Read 三个文件相关区域
- [ ] **Step 2: system-prompts.js** — 所有 `return DEFAULT_TEMPLATES` 改 `return DEFAULT_TEMPLATES.map(t => ({ ...t }))`；`custom-${Date.now()}` 改用 `generateUUID()`（import '../utils/uuid.js'）
- [ ] **Step 3: group.js** — GROUP_COLUMNS 数组补 `'auto_memory_extract', 'narrative_enabled', 'aftermath_enabled', 'event_scene_type'` 四项，mapGroupValues 补对应取值（复查 groups 表各列类型后适配，布尔列按 `? 1 : 0` 归一，snake 分支 `use_global_api_key` 同样归一）；maxHistory 边界：

```js
const rawMaxHistory = data.maxHistory ?? data.max_history
let maxHistory = 20
if (rawMaxHistory !== undefined && rawMaxHistory !== null) {
  const parsed = parseInt(rawMaxHistory, 10)
  if (Number.isFinite(parsed)) maxHistory = Math.max(0, parsed) // 0 合法：不携带历史
}
```

- [ ] **Step 4: config.js 四个 save handler** — `return { success: result }` 改 `return result === true ? { success: true } : { success: false, error: '配置保存失败（路径不可写或数据非法）' }`（复查 registerConfigCRUD 工厂内实现统一改）
- [ ] **Step 5: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-2): 模板常量深拷贝、群组复制补全列、maxHistory 边界与保存错误提示`

### Task 12: 低优先级清理（llm-profiles / LRU / 附属文件 / config-dir / dev.js / channels.js）

**Files:**
- Modify: `electron/config/llm-profiles.js:35-80,110-120`
- Modify: `electron/database/manager.js:15,400-410`
- Modify: `electron/utils/config-dir.js:12-27`
- Modify: `scripts/dev.js:26-28`
- Delete: `electron/ipc/channels.js`

- [ ] **Step 1: 复查** — 逐项 Read；`grep -rn "channels" electron/ src/ --include="*.js" --include="*.vue"` 确认 channels.js 无引用
- [ ] **Step 2: 修改**：
  1. llm-profiles.js：getLLMProfiles 加 `if (!Array.isArray(profiles)) { log.warn(...); profiles = [] }`；迁移写回 `migrated` 分支移入 `enqueueWrite(() => saveLLMProfiles(profiles))`；75 行日志文案改为与迁移内容一致（`'已迁移配置：补充 streamEnabled/useNativeApi/proxy 字段'`）
  2. addLLMProfile 的 `{ id: generateUUID(), ...profile, createdAt }` 改 `{ ...profile, id: generateUUID(), createdAt }`
  3. manager.js：`MAX_CACHED_CONNECTIONS` 10 → 64；deleteGroupDB 补附属文件清理：

```js
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  const p = dbPath + suffix
  if (fs.existsSync(p)) fs.unlinkSync(p)
}
```

  4. config-dir.js：`ensureConfigDir` 改为 `return ensureDataDir(path.dirname(filePath))`
  5. dev.js：`process.exit(code || 0)` 改 `process.exit(code ?? 1)`
  6. 删除 `electron/ipc/channels.js`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `chore(batch-2): 主进程低优先级清理（死代码/事务细节/LRU/退出码）`

---

## Batch 3：LLM 客户端

### Task 13: H-5 SOCKS5 代理（socks-proxy-agent）

**Files:**
- Modify: `package.json`（dependencies 加 `"socks-proxy-agent": "^8.0.5"`）
- Modify: `electron/llm/base-client.js`（axios 创建处）
- Modify: `electron/llm/proxy.js`（保留解析，删除 buildAxiosProxyConfig 死函数）

- [ ] **Step 1: 安装** — `pnpm add socks-proxy-agent`
- [ ] **Step 2: 复查** — Read base-client.js 构造函数中 axios.create 与 proxy 拦截逻辑（约 20-60 行），Read proxy.js 全文
- [ ] **Step 3: base-client.js**——在设置代理处分支：

```js
import { SocksProxyAgent } from 'socks-proxy-agent'
// 构造 axios 实例时：
const proxyUrl = this.proxyUrl // 复查实际变量名：来自 resolveProfileProxy 的结果
let axiosConfig = { timeout: ..., headers: ... }
if (proxyUrl && proxyUrl.protocol === 'socks5:') {
  const agent = new SocksProxyAgent(proxyUrl.href)
  axiosConfig = { ...axiosConfig, httpAgent: agent, httpsAgent: agent, proxy: false }
} else if (proxyUrl) {
  axiosConfig = { ...axiosConfig, proxy: { protocol: proxyUrl.protocol.replace(':', ''), host: proxyUrl.hostname, port: Number(proxyUrl.port) } }
}
this.client = axios.create(axiosConfig)
```

（以复查到的现有代理注入方式为准：现有若用 `proxy` 字段或拦截器，仅插入 socks 分支，http/https 路径保持原样不动）
- [ ] **Step 4: proxy.js** — 删除无调用方的 `buildAxiosProxyConfig`（先 `grep -rn "buildAxiosProxyConfig" electron/ src/` 确认）
- [ ] **Step 5: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-3): SOCKS5 代理经 socks-proxy-agent 生效`

### Task 14: H-4/M-11 Anthropic 思考预算 + SSE type 优先 + data: 前缀容错

**Files:**
- Modify: `electron/llm/anthropic-client.js:83-96,160-190`
- Modify: `electron/llm/client.js:65-75`（data 前缀解析）

- [ ] **Step 1: 复查** — Read anthropic-client.js 全文（263 行）与 client.js:60-80
- [ ] **Step 2: budget_tokens 动态计算**（anthropic-client.js chat 请求组装处）：

```js
const maxTokens = options.maxTokens || 2000
// thinking 预算必须严格小于 max_tokens（Anthropic/MiniMax 校验）
const budgetTokens = Math.min(Math.max(1024, Math.floor(maxTokens * 0.6)), maxTokens - 1)
requestData.thinking = options.thinkingEnabled
  ? { type: 'enabled', budget_tokens: budgetTokens }
  : { type: 'disabled' }
// 开启思考时若预算抬升导致 max_tokens 偏小，同步抬高 max_tokens
if (options.thinkingEnabled) requestData.max_tokens = Math.max(maxTokens, budgetTokens + 1)
```

- [ ] **Step 3: SSE 解析以 data 载荷 type 优先**：`_parseStreamLine` 中事件类型取值改为 `const type = parsed.type || state.currentEvent`，switch 用 `type`；`event:` 行仅更新 `state.currentEvent`（作为兜底）
- [ ] **Step 4: data: 前缀容错（client.js 与 anthropic-client.js 同改）**：

```js
if (!line.startsWith('data:')) return null
const data = line.slice(5)
const trimmed = data.startsWith(' ') ? data.slice(1) : data
```

（后续 trim 逻辑保持）
- [ ] **Step 5: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-3): 思考预算动态化、SSE type 优先与前缀容错`

### Task 15: M-8/9/10 base-client 流式框架加固

**Files:**
- Modify: `electron/llm/base-client.js:110-200`

- [ ] **Step 1: 复查** — Read base-client.js 全文（199 行）
- [ ] **Step 2: 修改 chatStream**（目标实现，变量名以现有代码为准）：
  1. 增加状态：`let settled = false`
  2. data 回调整体 try-catch：

```js
response.data.on('data', (chunk) => {
  try {
    // ...现有 lineBuffer / _parseStreamLine / onChunk 逻辑
  } catch (error) {
    if (!settled) { settled = true; response.data.destroy(); reject(this.handleError(error)) }
  }
})
```

  3. done 分支：resolve 前 `settled = true; response.data.destroy()`
  4. 'end' 与 'error' 处理器开头加 `if (settled) return`，error 时也置 settled
  5. abort 监听器保存引用并在 'end'/'error'/resolve 后 `signal.removeEventListener('abort', onAbort)`
- [ ] **Step 3: handleError 消费流式错误响应**：

```js
async handleError(error) { // 若现同步则改 async，调用点加 await（复查调用点数量）
  if (error.response && error.response.data && typeof error.response.data.on === 'function') {
    try {
      const body = await new Promise((resolve) => {
        let text = ''
        error.response.data.setEncoding('utf8')
        error.response.data.on('data', (c) => { text += c })
        error.response.data.on('end', () => resolve(text))
        error.response.data.on('error', () => resolve(''))
      })
      try {
        const parsed = JSON.parse(body)
        const serverMsg = parsed?.error?.message || parsed?.error || parsed?.message
        if (serverMsg) error = Object.assign(new Error(serverMsg), { status: error.status, response: error.response })
      } catch { /* 非 JSON 错误体，保持原 error */ }
    } catch { /* 忽略读取失败 */ }
  }
  // ...现有 statusMap / message 组装逻辑
}
```

（若 handleError 被多处同步调用不便改 async，则改为：在 chatStream/chat 的 catch 中先 `await consumeErrorStream(error)` 再 `reject(this.handleError(error))`，handleError 保持同步——二选一，以改动最小为准）
- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-3): 流式框架异常防护、流销毁与错误体解析`

### Task 16: M-7/M-12/M-13 Ollama signal+usage、streamEnabled 生效、空内容放宽

**Files:**
- Modify: `electron/llm/ollama-client.js:40-145`
- Modify: `electron/llm/client.js:115-125,175-185`

- [ ] **Step 1: 复查** — Read 两文件相关区域
- [ ] **Step 2: ollama-client.js**：`chat()` 流式分支改 `this.chatStream(requestData, options.onChunk, options.signal)`；非流式 `this.client.post('/api/chat', requestData, { signal: options.signal })`；catch 补：

```js
if (error.name === 'AbortError' || error.code === 'ERR_CANCELED' || options.signal?.aborted) {
  return { success: false, aborted: true, error: '已取消' }
}
```

`_parseStreamLine` 的 done 分支先提取用量：

```js
if (parsed.done) {
  if (typeof parsed.prompt_eval_count === 'number' || typeof parsed.eval_count === 'number') {
    state.usage = { prompt_tokens: parsed.prompt_eval_count ?? 0, completion_tokens: parsed.eval_count ?? 0 }
  }
  return { done: true }
}
```

- [ ] **Step 3: client.js**：`useStreaming` 死变量删除，改：

```js
const isStreaming = typeof options.onChunk === 'function' && this.streamEnabled !== false
```

非流式空 content 放宽：

```js
if (!content && !reasoningContent) return { success: false, error: 'API 返回的内容为空' }
```

- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-3): Ollama 取消与用量统计、streamEnabled 生效、空内容放宽`

### Task 17: 死代码清理 + profileId 回退 + $ 替换

**Files:**
- Modify: `electron/preload.js:55-65`（移除 getModels 暴露）
- Modify: `electron/llm/client.js:230-245`、`electron/llm/ollama-client.js:170-195`（删除 getModels 方法）
- Modify: `src/stores/config.js`（复查全局代理 proxyConfig 残留链路，仅删除无渲染的 UI 文案/无效存储说明——存储保留以兼容旧数据）
- Modify: `src/components/config/LLMProfileForm.vue:249` 附近（系统代理文案改为"使用环境变量 HTTP_PROXY/HTTPS_PROXY 中配置的代理"）
- Modify: `electron/ipc/handlers/llm.js:30-40,295-335`（profileId 显式未命中报错；$ 替换改函数）
- Modify: `electron/ipc/handlers/llm-client-factory.js:9-10,54`（log 声明移到 import 后；剔除 useNativeApi 无效传参）

- [ ] **Step 1: 复查** — `grep -rn "getModels" electron/ src/`；Read 各文件相关行
- [ ] **Step 2: 修改**：
  1. preload 移除 `getModels: () => ipcRenderer.invoke('llm:getModels')`；client.js/ollama-client.js 删除 getModels 方法
  2. llm.js `callLLMForJSON` 中 `|| llmProfiles[0]` 改：

```js
let profile = llmProfiles.find(p => p.id === profileId)
if (!profile) {
  if (profileId) return { success: false, error: '指定的 LLM 配置不存在，请重新选择' }
  profile = llmProfiles[0]
}
```

  3. 两处 `.replace('{hint}', hint)` / `.replace('{description}', ...)` 改函数替换 `.replace('{hint}', () => hint)`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `chore(batch-3): LLM 层死代码清理与回退语义修正`

---

## Batch 4：前端竞态

### Task 18: M-35 防重复提交锁（5 个对话框）

**Files:**
- Modify: `src/components/config/LLMProfileForm.vue:480-505`（改为父组件驱动复位）
- Modify: `src/components/config/LLMConfigPanel.vue:263-290`（接收 submit 结果驱动）
- Modify: `src/components/config/LLMProfileDialog.vue:150-165`
- Modify: `src/components/config/CreateGroupDialog.vue:200-225`
- Modify: `src/components/config/CreateCharacterDialog.vue:40-55`
- Modify: `src/components/config/CharacterGachaDialog.vue:235-260`

**Interfaces:**
- Produces: LLMProfileForm 新增 prop `submitting: Boolean`；其余对话框各自内部 `submitting` ref

- [ ] **Step 1: 复查** — Read 各对话框提交函数与按钮绑定
- [ ] **Step 2: 统一模式**（CreateGroup/CreateCharacter/Gacha/GroupSettings 四处同型）：

```js
const submitting = ref(false)
async function handleCreate() {
  if (submitting.value) return
  submitting.value = true
  try {
    // ...现有逻辑
  } finally {
    submitting.value = false
  }
}
```

对应按钮 `:disabled="!canCreate || submitting"`（适配各按钮现有 disabled 条件）；Gacha 的 handleConfirm 成功后额外 `saved.value = true` 并用 `v-if="generatedCharacter && !saved"` 隐藏按钮
- [ ] **Step 3: LLMProfileForm 双向协议**——删除内部 submitting 的 try/finally 复位，改：新增 `props: { submitting: Boolean }`，按钮 `:disabled="submitting || !isFormValid"`；父组件（LLMConfigPanel.handleFormSubmit / LLMProfileDialog.handleFormSubmit）改为：

```js
formSubmitting.value = true
try {
  await window.electronAPI.config.llmProfile.update(...) // 现有调用
  // 成功关闭对话框等现有逻辑
} finally {
  formSubmitting.value = false
}
```

并 `<LLMProfileForm :submitting="formSubmitting" ...>`（父组件加 `const formSubmitting = ref(false)`；若父组件现不 await IPC 调用，改为 await）
- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-4): 对话框防重复提交锁`

### Task 19: H-12/H-13/H-14 messages store 竞态与监听器

**Files:**
- Modify: `src/stores/messages.js:20-230`
- Modify: `src/components/chat/ChatWindow.vue:595-620`（onUnmounted 调用 cleanup）

**Interfaces:**
- Produces: messages store 新增导出 `cleanup()`（清理 message:new + 流式监听器）；`appendMessage(message)` 内置 groupId 守卫

- [ ] **Step 1: 复查** — Read messages.js 全文（354 行）与 ChatWindow.vue:485-620
- [ ] **Step 2: 修改**：
  1. 防重复注册修复：

```js
function setupMessageListener(callback) {
  if (messageListener) messageListener() // 移除旧监听器（原代码注册 no-op 再清理自己，无效）
  messageListener = window.electronAPI.message.onNewMessage(callback)
}
```

  2. store 新增 `cleanup()`：调用 `messageListener?.()`、`_cleanupStreamListeners()`（复查现有清理函数名），导出并在 ChatWindow `onUnmounted` 中调用
  3. 加载竞态（loadMessages）：

```js
let loadSeq = 0
async function loadMessages(groupId) {
  const seq = ++loadSeq
  loading.value = true
  try {
    const result = await load(() => window.electronAPI.message.getByGroupId(groupId))
    if (seq !== loadSeq) return // 已有更新的加载请求，丢弃过期响应
    if (result) messages.value = result.data
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}
```

  4. 事件 groupId 守卫（onUserMessageSaved / onStreamStart / onStreamEnd / aftermath push 共 4 处回调入口，`data.groupId` 字段名以 preload 事件负载为准）：

```js
if (data.groupId && data.groupId !== useGroupsStore().currentGroupId) return
```

  5. `appendMessage(message)` 开头同样守卫（`message.group_id`）
- [ ] **Step 3: characters store 与 narrative fetchEmotions 同型请求序号**（src/stores/characters.js:17-21、src/stores/narrative.js:14-17，各自加 `loadSeq` 判断）
- [ ] **Step 4: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-4): 消息加载与流式事件的群组竞态防护`

### Task 20: H-11 虚拟列表 key + ChatWindow 杂项

**Files:**
- Modify: `src/components/chat/ChatWindow.vue:230-245`（useVirtualizer 加 getItemKey）、`:541-561`（高亮 timeout、rAF/displayMode）

- [ ] **Step 1: 复查** — Read ChatWindow.vue:225-245、535-565
- [ ] **Step 2: 修改**：
  1. `useVirtualizer({ ... })` options 增加：

```js
getItemKey: (index) => messagesStore.messages[index]?.id ?? index,
```

  2. 高亮 timeout 句柄管理：

```js
let highlightTimer = null
// watch 内：
if (highlightTimer) clearTimeout(highlightTimer)
highlightTimer = setTimeout(() => messagesStore.clearHighlight(), 3000)
// onUnmounted：
if (highlightTimer) clearTimeout(highlightTimer)
```

  3. streamingTick 滚动 watcher 开头加 `if (displayMode.value !== 'bubble') return`；rAF 句柄保存并在 onUnmounted `cancelAnimationFrame`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-4): 虚拟列表稳定 key 与定时器/动画帧清理`

### Task 21: M-32/33/34 EmotionTag 泄漏、EventPanel 并发、流式消息防护

**Files:**
- Modify: `src/components/chat/EmotionTag.vue:70-115`
- Modify: `src/components/chat/EventPanel.vue:10-75`
- Modify: `src/components/chat/ChatWindow.vue:455-470`（handleEventTriggered sending 短路）
- Modify: `src/components/chat/MessageBubble.vue:245-350`

- [ ] **Step 1: 复查** — Read 各文件相关区域
- [ ] **Step 2: 修改**：
  1. EmotionTag onMounted：`document.addEventListener('click', handleClickOutside)` 移到 `await` 之前（IPC await 之后仅赋值 emotionOptions）
  2. EventPanel 事件卡片 `:disabled="messagesStore.sending"`（样式补 disabled 态：`opacity: .5; pointer-events: none`）；`handleTrigger` 与 ChatWindow `handleEventTriggered` 开头 `if (messagesStore.sending) return`，handleTrigger 包 try/catch + toast.error
  3. MessageBubble：`startEdit` 开头 `if (props.message.isStreaming) return`；删除/重发按钮 `v-if="!message.isStreaming"`（复查现有按钮渲染条件合并）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-4): 监听器泄漏、事件并发与流式消息操作防护`

### Task 22: 前端低优先级（useApi 计数器、validators、deleteGroup 回退、App.vue）

**Files:**
- Modify: `src/composables/useApi.js`
- Modify: `src/utils/validators.js:5-15`
- Modify: `src/stores/groups.js:35-42`
- Modify: `src/App.vue`（100vw → 100%）

- [ ] **Step 1: 复查** — Read 四个文件
- [ ] **Step 2: 修改**：
  1. useApi loading 改计数器：`const loadingCount = ref(0)`、`const loading = computed(() => loadingCount.value > 0)`；load/call 的 try/finally 中 `++/--`（复查现有 loading 赋值点全部替换）
  2. validators：`maxLength`/`minLength` 入口 `const s = v == null ? '' : String(v)` 后用 s 判断
  3. deleteGroup 成功后：`currentGroupId.value = groups.value[0]?.id ?? null`（过滤已删群后）
  4. App.vue `width: 100vw` → `width: 100%`（同 height）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-4): 前端低优先级修复（loading 计数器/校验器/群组回退）`

---

## Batch 5：LLM 处理层

### Task 23: H-7 生成防重入（AbortController）+ safeSend

**Files:**
- Modify: `electron/ipc/handlers/llm.js:145-270`
- Modify: `electron/ipc/handlers/llm-response-handler.js:20-190`

**Interfaces:**
- Produces: `generateCharacterResponse` options 增加 `signal`；`safeSend(event, channel, payload)`（llm-response-handler.js 导出）

- [ ] **Step 1: 复查** — Read llm.js:140-270 与 llm-response-handler.js 全文（195 行），确认 generateCharacterResponse 签名与 client.chat 调用点
- [ ] **Step 2: llm.js 防重入**（模块级）：

```js
const activeGenerations = new Map() // groupId -> AbortController

// llm:generate handler 内，进入生成前：
const previous = activeGenerations.get(groupId)
if (previous) previous.abort()
const controller = new AbortController()
activeGenerations.set(groupId, controller)
try {
  // ...现有生成流程，把 controller.signal 放进传给 generateCharacterResponse 的 options
} finally {
  if (activeGenerations.get(groupId) === controller) activeGenerations.delete(groupId)
}
```

  顺序与并行两条路径的 options 均带 `signal: controller.signal`；`llm:generateCharacterCommand` 同样纳入该 Map
- [ ] **Step 3: signal 贯通**：llm-response-handler 的 `generateCharacterResponse` 把 `options.signal` 传给 `client.chat(requestData, { onChunk, signal: options.signal })`；收到 `{ success: false, aborted: true }` 时不写库、不推送、返回 aborted 结果（llm.js 收到 aborted 时跳过后续角色/注入 history）
- [ ] **Step 4: safeSend**（llm-response-handler.js 顶部）并替换 5 处裸 `event.sender.send`：

```js
function safeSend(event, channel, payload) {
  try {
    if (event?.sender && !event.sender.isDestroyed()) event.sender.send(channel, payload)
  } catch (error) {
    // 渲染进程已销毁：通知失败不影响业务结果
  }
}
```

`stream:end` 通知失败不再让已入库消息改判失败（safeSend 不抛错即达成）
- [ ] **Step 5: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-5): 生成防重入与取消、sender 存活防护`

### Task 24: M-19/M-20 用户消息丢失与先校验后写库

**Files:**
- Modify: `electron/ipc/handlers/llm-context-builder.js:145-160`
- Modify: `electron/ipc/handlers/llm.js:270-285`

- [ ] **Step 1: 复查** — Read 两处现状
- [ ] **Step 2: 修改**：
  1. buildContextMessages：删除"最后一条是否 user"的条件判断，无条件 `messages.push({ role: 'user', content: userContent })`，加注释说明历史查询发生在保存用户消息之前、不会重复
  2. generateCharacterCommand：把角色查询与校验移到 `saveUserMessage` 之前，查询加 `AND group_id = ?`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-5): 修复用户消息丢失与指令先校验后写库`

### Task 25: M-21 上下文 token 截断（TDD）

**Files:**
- Create: `electron/utils/context-budget.js`
- Create: `tests/context-truncate.test.js`
- Modify: `electron/ipc/handlers/llm-context-builder.js:85-160`

**Interfaces:**
- Produces: `DEFAULT_CONTEXT_BUDGET_CHARS = 24000`、`sumChars(parts: string[]): number`、`truncateMessagesToBudget(messages: Array<{content}>, budgetChars): Array`（保最新丢最旧）

- [ ] **Step 1: 写失败测试**

```js
// tests/context-truncate.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { truncateMessagesToBudget, sumChars } from '../electron/utils/context-budget.js'

test('预算内全保留', () => {
  const msgs = [{ content: 'a'.repeat(10) }, { content: 'b'.repeat(10) }]
  assert.equal(truncateMessagesToBudget(msgs, 100).length, 2)
})
test('超预算时从最旧开始丢弃', () => {
  const msgs = [{ content: 'old'.repeat(10) }, { content: 'mid'.repeat(10) }, { content: 'new'.repeat(10) }]
  const out = truncateMessagesToBudget(msgs, 40)
  assert.equal(out.length, 2)
  assert.equal(out[0].content.startsWith('mid'), true)
})
test('sumChars 累加长度', () => {
  assert.equal(sumChars(['ab', 'cde', '']), 5)
  assert.equal(sumChars([null, undefined]), 0)
})
```

- [ ] **Step 2: 确认失败 → 实现**

```js
// electron/utils/context-budget.js
export const DEFAULT_CONTEXT_BUDGET_CHARS = 24000
export const sumChars = (parts) => parts.reduce((n, s) => n + String(s ?? '').length, 0)
export function truncateMessagesToBudget(messages, budgetChars = DEFAULT_CONTEXT_BUDGET_CHARS) {
  let total = sumChars(messages.map(m => m.content))
  const out = [...messages]
  while (total > budgetChars && out.length > 1) { // 至少保留最新一条
    total -= String(out.shift().content ?? '').length
  }
  return out
}
```

- [ ] **Step 3: 接入 context-builder**：系统段（群 systemPrompt + background + 人设 + narrative）先 `sumChars` 得 `reserved`；记忆注入上限 20 条（`memories.slice(0, 20)`）；历史消息用 `truncateMessagesToBudget(roleMessages, DEFAULT_CONTEXT_BUDGET_CHARS - reserved)`
- [ ] **Step 4: `pnpm test && pnpm lint && pnpm build` 通过后提交** — `fix(batch-5): 上下文字符预算截断`

### Task 26: H-8/M-15 导出 ZIP 修复

**Files:**
- Modify: `electron/ipc/handlers/message.js:105-215`

- [ ] **Step 1: 复查** — Read message.js:100-215（exportToZip 全函数）
- [ ] **Step 2: 修改**：临时文件改 `copyFile`；输出流监听 error；`await archive.finalize()`；整个 handler 改走 `createHandler`（复查 createHandler 是否支持访问 dialog/event——包装方式参考同文件其他 handler；若 createHandler 签名是 (fn, label) 直接包函数体）：

```js
output.on('error', reject)
archive.on('error', reject)
archive.pipe(output)
archive.file(jsonFilePath, { name: jsonFileName })
await archive.finalize()
await new Promise((resolve, reject) => {
  output.on('close', resolve)
  output.on('error', reject)
})
// 跨盘移动：copyFile + 清理临时文件（Windows rename 跨卷抛 EXDEV）
await fs.promises.copyFile(tempZipPath, savePath)
await fs.promises.unlink(tempZipPath).catch(() => {})
```

（结构调整为：finalize 与 close 等待合并进现有 Promise 或按现有结构最小改动；临时 JSON 文件的清理保持现有逻辑）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-5): 导出 ZIP 跨盘修复与流错误处理`

### Task 27: M-17 消息分页（IPC + 前端加载更早）

**Files:**
- Modify: `electron/ipc/handlers/message.js:17-31`（getByGroupId）
- Modify: `src/stores/messages.js`（loadMessages 参数化 + loadEarlier）
- Modify: `src/components/chat/ChatWindow.vue`（顶部加载按钮 + 滚动锚定）
- Modify: `electron/preload.js`（若 getByGroupId 透传 options 则无需改，复查签名）

**Interfaces:**
- Produces: `message:getByGroupId(event, groupId, options?)`，options `{ limit?: number, beforeId?: string }`；返回 `{ success, data: messages, hasMore: boolean }`

- [ ] **Step 1: 复查** — Read message.js getByGroupId、messages store loadMessages、ChatWindow 消息区模板与滚动容器 ref
- [ ] **Step 2: IPC 改造**：

```js
ipcMain.handle('message:getByGroupId', createHandler(async (event, groupId, options = {}) => {
  const db = dbManager.getGroupDB(groupId)
  const limit = Math.min(Math.max(parseInt(options.limit, 10) || 300, 1), 1000)
  const baseSelect = `SELECT m.*, c.name AS character_name FROM messages m LEFT JOIN characters c ON c.id = m.character_id WHERE m.group_id = ?`
  // （列名以复查到的现有 SELECT 为准）
  let rows
  if (options.beforeId) {
    const anchor = db.prepare('SELECT timestamp, rowid AS rid FROM messages WHERE group_id = ? AND id = ?').get(groupId, options.beforeId)
    if (!anchor) return { success: true, data: [], hasMore: false }
    rows = db.prepare(`${baseSelect} AND (m.timestamp < ? OR (m.timestamp = ? AND m.rowid < ?)) ORDER BY m.timestamp DESC, m.rowid DESC LIMIT ?`)
      .all(groupId, anchor.timestamp, anchor.timestamp, anchor.rid, limit + 1)
  } else {
    rows = db.prepare(`${baseSelect} ORDER BY m.timestamp DESC, m.rowid DESC LIMIT ?`).all(groupId, limit + 1)
  }
  const hasMore = rows.length > limit
  return { success: true, data: rows.slice(0, limit).reverse(), hasMore }
}, 'Message:getByGroupId'))
```

  注意现有返回是 `{success, data}` 直接给 `messages.value = result.data` —— 前端改造后取 `result.data`（数组）+ `result.hasMore`
- [ ] **Step 3: messages store**：`hasMore` ref；`loadMessages(groupId)` 记录 hasMore；新增：

```js
async function loadEarlierMessages(groupId) {
  const first = messages.value[0]
  if (!first) return false
  const result = await load(() => window.electronAPI.message.getByGroupId(groupId, { beforeId: first.id }))
  if (result?.data?.length) messages.value = [...result.data, ...messages.value]
  hasMore.value = result?.hasMore ?? false
  return (result?.data?.length || 0) > 0
}
```

- [ ] **Step 4: ChatWindow**：消息列表顶部（虚拟列表容器上方）加 `v-if="messagesStore.hasMore"` 的"加载更早的消息"按钮；点击前记录 `el.scrollHeight`，prepend 后 `el.scrollTop += el.scrollHeight - prev`（滚动容器 ref 以现有 messagesContainer 为准；切换群组时 store 重置 hasMore）
- [ ] **Step 5: `pnpm lint && pnpm build` 通过后提交** — `feat(batch-5): 消息分页加载`

### Task 28: 处理层低优先级（校验/私有方法/channels 残留等）

**Files:**
- Modify: `electron/ipc/handlers/memory.js:12-20`（add 校验）
- Modify: `electron/ipc/handlers/global-character.js:70-160,265-285`（null.trim 修复 + importToGroup 按 id 防重）
- Modify: `electron/ipc/handlers/narrative.js`（`_getGroupDB` → 公开方法，12 处）
- Modify: `electron/narrative/engine.js`（暴露 `getGroupDB(groupId)` 公开方法，内部委托 `_getGroupDB`）
- Modify: `electron/ipc/handlers/character.js:165-175`（reorder 事务）
- Modify: `electron/ipc/handlers/search.js:95-105`（修正 setImmediate 注释）

- [ ] **Step 1: 复查** — Read 各文件相关行
- [ ] **Step 2: 修改**：
  1. memory:add 开头：

```js
if (typeof characterName !== 'string' || !characterName.trim() || typeof content !== 'string' || !content.trim()) {
  return { success: false, error: '角色名与记忆内容不能为空' }
}
```

  2. null 防御（update 与 updateTag 同型）：`if (data.name !== undefined && data.name !== null && !String(data.name).trim())`
  3. importToGroup 防重：

```js
const exists = db.prepare('SELECT id FROM characters WHERE group_id = ? AND id = ?').get(groupId, characterId)
if (exists) return { success: false, error: '该角色已导入该群组' }
```

（保留原同名检查作为第二道）
  4. engine.js 加 `getGroupDB(groupId) { return this._getGroupDB(groupId) }`；narrative.js 12 处 `_getGroupDB` 改 `getGroupDB`
  5. reorder 批量更新包 `db.transaction(() => { ... })()`
  6. search.js setImmediate 注释改为如实说明：`// 注意：better-sqlite3 为同步驱动，单群大库扫描仍会短暂阻塞主进程；群组间让出事件循环仅为避免连续占用`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-5): 处理层输入校验与封装修正`

---

## Batch 6：叙事引擎与工具

### Task 29: H-9/H-10/M-29 json-extractor ESM + logger 轮转（TDD）

**Files:**
- Create: `tests/json-extractor.test.js`、`tests/logger.test.js`、`tests/statement-cache.test.js`、`tests/stream-batcher.test.js`
- Modify: `electron/utils/json-extractor.js:129`
- Modify: `electron/utils/logger.js:100-130`

- [ ] **Step 1: 写失败测试**（json-extractor 的 ESM 具名导入本身即测试）：

```js
// tests/json-extractor.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractJSON } from '../electron/utils/json-extractor.js'

test('提取 markdown 代码块中的 JSON', () => {
  assert.deepEqual(extractJSON('前言```json\n{"a":1}\n```后记'), { a: 1 })
})
test('容错：前后杂文字与首尾花括号', () => {
  assert.deepEqual(extractJSON('xx {"b":2} yy'), { b: 2 })
})
test('容错：截断 JSON 修复', () => {
  const r = extractJSON('```json\n{"name":"小美","tags":["a"')
  assert.equal(r.name, '小美')
})
test('完全非法输入返回 null', () => {
  assert.equal(extractJSON('no json here'), null)
})
```

```js
// tests/logger.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { createLogger } from '../electron/utils/logger.js'

test('超过大小阈值触发轮转且不中断写入', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'log-test-'))
  const file = path.join(dir, 'app.log')
  const log = createLogger('T', file, { maxSize: 200 }) // 复查 createLogger 签名，支持显式 filePath 与阈值注入；不支持则先改造签名
  for (let i = 0; i < 50; i++) log.info('x'.repeat(20))
  assert.ok(fs.existsSync(file))
  assert.ok(fs.existsSync(file.replace('.log', '.old.log')))
  log.info('after-rotate')
  assert.ok(fs.readFileSync(file, 'utf8').includes('after-rotate'))
  fs.rmSync(dir, { recursive: true, force: true })
})
```

（若 logger 现签名不接收 filePath/阈值：本任务内改造——`createLogger(name, filePath?, options?)`，filePath 缺省时维持现有 electron app 路径逻辑；**logger.js 顶部若 import electron 则需惰性获取 app**，确保纯 Node 可 import，复查后适配）
```js
// tests/statement-cache.test.js / tests/stream-batcher.test.js
// 冒烟：prepareCached(db, sql) 同 SQL 返回同实例（用 better-sqlite3 :memory: 库）；
// StreamBatcher：注入 fake sender（计数回调），写 3 次 chunk，flush 后收到合并负载，destroy 后定时器清理（unref 语义不直接断言，断言 flush 幂等）
```

- [ ] **Step 2: 确认失败** — json-extractor 测试因 CJS 导出报 `SyntaxError: does not provide an export named 'extractJSON'`
- [ ] **Step 3: 修改 json-extractor.js**：末行 `module.exports = { extractJSON }` 删除，函数声明改 `export function extractJSON(raw)`（或文件尾 `export { extractJSON }`）
- [ ] **Step 4: logger.js 轮转重写**：字节计数 + end 回调内轮转：

```js
// _getSharedStream 创建流时记录起始大小；_write 中 this._bytesWritten += Buffer.byteLength(line)
// 超过阈值时：
_rotate() {
  const stream = this._sharedStream
  this._sharedStream = null
  this._bytesWritten = 0
  if (!stream) return
  stream.end(() => {
    try {
      const backupPath = this.filePath.replace(/\.log$/, '.old.log')
      if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath)
      fs.renameSync(this.filePath, backupPath) // 已关闭，Windows 可 rename
    } catch { try { fs.truncateSync(this.filePath, 0) } catch { /* 放弃本次轮转 */ } }
  })
}
// statSync 仅在流创建时执行一次（消除每条日志 statSync）
```

- [ ] **Step 5: `pnpm test && pnpm lint && pnpm build` 通过后提交** — `fix(batch-6): json-extractor ESM 导出与日志轮转可靠性`

### Task 30: M-24/25/26/27/28 叙事引擎修复（TDD）

**Files:**
- Create: `tests/narrative-parsing.test.js`
- Modify: `electron/utils/text.js`（追加 escapeRegExp、stripMentionPunctuation）
- Modify: `electron/narrative/engine.js:165-300`
- Modify: `electron/narrative/prompt-builder.js:25-60`
- Modify: `electron/narrative/relationship-manager.js:85-120`
- Modify: `electron/narrative/event-trigger.js:100-110,150-160`
- Modify: `electron/narrative/emotion-manager.js:105-125,175-185`
- Modify: `electron/narrative/constants.js:10-25,65-70`

**Interfaces:**
- Produces: `escapeRegExp(s)`、`stripMentionPunctuation(s)`（electron/utils/text.js 导出，供引擎层复用）

- [ ] **Step 1: 写失败测试**

```js
// tests/narrative-parsing.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escapeRegExp, stripMentionPunctuation } from '../electron/utils/text.js'

test('escapeRegExp 特殊字符全部转义', () => {
  assert.equal(escapeRegExp('A+B('), 'A\\+B\\(')
  assert.ok(new RegExp(`^${escapeRegExp('小美(')}[：:]`).test('小美：hi') === false)
  assert.ok(() => new RegExp(`^${escapeRegExp('小美(')}x`)).not.toThrow
})
test('@提及剥离尾部标点', () => {
  assert.equal(stripMentionPunctuation('张三，你觉得呢'), '张三')
  assert.equal(stripMentionPunctuation('李四!'), '李四')
  assert.equal(stripMentionPunctuation('王五'), '王五')
})
```

（最后一行 assert 语法按 node:assert/strict 实际能力调整，用 try/finally 包裹 `new RegExp` 验证不抛即可）
- [ ] **Step 2: 实现 text.js 追加**

```js
export const escapeRegExp = (s) => String(s ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
export function stripMentionPunctuation(s) {
  return String(s ?? '').replace(/[，。！？,.!?:：;；、~—…\s]+$/, '')
}
```

- [ ] **Step 3: 引擎修改**：
  1. prompt-builder/engine 余波查询改 JOIN：`SELECT m.*, c.name AS character_name FROM messages m LEFT JOIN characters c ON c.id = m.character_id WHERE m.group_id = ? ...`；`m.character_name || '角色'` 逻辑保留（现在有真值）
  2. engine.js:281 正则：`new RegExp('^' + escapeRegExp(triggerChar.name) + '[：:，,]\\s*')`（删除 emotion-manager 内私有 escapeRegExp，统一 import）
  3. relationship-manager @提及：捕获后 `const mentionedId = characterNameMap.get(stripMentionPunctuation(mentionedName))`；反向更新取整 `Math.trunc(totalChange * 0.5)`
  4. "平静"事件：constants.js EVENT_EMOTION_MAP 删除 `'平静'` 映射；emotion-manager updateFromEvent 开头 `if (standardEmotion === '平静') { this._saveEmotion(db, characterId, '平静', 0, 'event'); return }`
  5. updateFromLLM 校验：

```js
updateFromLLM(db, characterId, emotion, intensity) {
  if (!emotion || !this.keywords[emotion] || !Number.isFinite(intensity)) return
  this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'llm')
}
```

  6. engine `_selectAftermathTrigger`：`const emotionMap = this.emotion.getEmotionsBatch(db, eligibleChars.map(c => c.id))`，循环内 `emotionMap.get(char.id)`
  7. 死参数接线：engine.js preGenerate 内（调用 shouldInferFromLLM 处）先查发送者好感度传入第四参：

```js
const senderFavorability = senderCharacterId
  ? (this.relationship.getFavorability(db, senderCharacterId, characterId) ?? 0)
  : null
if (this.shouldInferFromLLM(db, characterId, userContent, senderFavorability)) { ... }
```

（复查 relationship-manager 现有查询好感度方法名，getFavorability 不存在则用实际名）
  8. event-trigger：`sort(() => Math.random() - 0.5)` 改 Fisher-Yates：

```js
const shuffled = [...available]
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(Math.random() * (i + 1))
  ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
}
```

  9. event-trigger 全部 `db.prepare` 改 `prepareCached`（import 与其他 narrative 文件一致）
  10. prompt-builder 空数组防护：`if (characterIds.length === 0) return ''`（或复用 engine 的 buildInClause）
  11. constants.js 词表：'悲伤' 词表删 '算了'（保留在 '无奈'）；'尴尬' 词表删 '不是'；'好奇' 词表删裸 '为什么'（保留 '为什么呀'）
- [ ] **Step 4: `pnpm test && pnpm lint && pnpm build` 通过后提交** — `fix(batch-6): 叙事引擎余波/提及/情绪/事件修复`

### Task 31: M-4 记忆改名迁移 + uuid.js

**Files:**
- Modify: `electron/database/memory-manager.js`（新增 renameCharacter）
- Modify: `electron/ipc/handlers/global-character.js`（update 成功后调用）
- Modify: `electron/utils/uuid.js`

- [ ] **Step 1: 复查** — Read global-character.js update handler 与 memory-manager 现有方法
- [ ] **Step 2: 修改**：
  1. memory-manager：

```js
// 设计约定：记忆按角色姓名全局关联（同名即同一人）——见代码审查 M-4
renameCharacter(oldName, newName) {
  if (!oldName || !newName || oldName === newName) return
  this.getDB().prepare('UPDATE character_memories SET character_name = ?, updated_at = CURRENT_TIMESTAMP WHERE character_name = ?').run(newName, oldName)
}
```

  2. global-character update handler：name 变更且更新成功后 `memoryManager.renameCharacter(oldChar.name, data.name)`（manager 惰性获取方式以现有代码为准）
  3. uuid.js 整体替换：

```js
import { randomUUID } from 'node:crypto'
export function generateUUID() {
  return randomUUID()
}
```

- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-6): 角色改名迁移记忆与 crypto.randomUUID`

---

## Batch 7：配置组件与公共层

### Task 32: H-15/H-16 凭据预填 + thinking 字段统一

**Files:**
- Modify: `src/components/config/LLMConfigPanel.vue:190-200,250-270`
- Modify: `src/components/config/LLMProfileDialog.vue:105-165`
- Modify: `electron/config/llm-profiles.js`（读取时归一化 thinkingEnabled）

- [ ] **Step 1: 复查** — Read 三处相关代码
- [ ] **Step 2: 修改**：
  1. LLMConfigPanel handleAddModelToProvider：

```js
const sameProviderProfile = profiles.value?.find(p => p.provider === providerId)
const defaultApiKey = sameProviderProfile?.apiKey || ''
const defaultBaseURL = sameProviderProfile?.baseURL ||
  (useNative ? providerConfig.nativeBaseURL : providerConfig.baseURL) || ''
```

  2. 字段统一驼峰：llm-profiles.js 读取归一（getLLMProfiles 中每个 profile 映射 `thinkingEnabled: p.thinkingEnabled ?? (p.thinking_enabled === 1 || p.thinking_enabled === true) ? ... `——精确实现：

```js
profiles = profiles.map(p => {
  if (p.thinkingEnabled === undefined && p.thinking_enabled !== undefined) {
    p.thinkingEnabled = p.thinking_enabled === 1 || p.thinking_enabled === true
  }
  delete p.thinking_enabled
  return p
})
```

；LLMConfigPanel 模板 `:checked="profile.thinkingEnabled"`、提交 `thinkingEnabled: rawData.thinkingEnabled`；LLMProfileDialog 已用驼峰，保持
  3. LLMConfigPanel 表单遮罩：`@click.self="closeFormDialog"` 移除（改为不响应遮罩点击），与 LLMProfileDialog 行为一致
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-7): 凭据预填按供应商与思考模式字段统一`

### Task 33: M-30 narrative store 封装 + M-36 GroupSettings 防护

**Files:**
- Modify: `src/stores/narrative.js:20-65`
- Modify: `src/stores/global-characters.js:40-46`
- Modify: `src/components/config/GroupSettingsDialog.vue:80-195`

- [ ] **Step 1: 复查** — Read 三文件；确认 useApi().call 的签名与用法（参考其他 store 的 call 用法）
- [ ] **Step 2: 修改**：
  1. narrative store 四个写操作（setRelationship/removeRelationship/triggerEvent/deleteEvent）包进 `call`（失败 toast 由 useApi 统一或调用方处理，与 characters store 写操作风格一致）；global-characters 的 getCharacterTags 纳入同一风格
  2. GroupSettingsDialog：模板最外层内容包 `v-if="group"`（保留遮罩结构）；handleSave 开头 `if (!form.value.name.trim()) { toast.error('群组名称不能为空'); return }`；加 submitting 锁（Task 18 模式）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-7): narrative store 错误封装与群设置防护`

### Task 34: M-31 可访问性最小集

**Files:**
- Modify: `src/components/common/TagFilter.vue`、`TagSelector.vue`、`BaseDialog.vue`、`ConfirmDialog.vue`、`Toast.vue`

- [ ] **Step 1: 复查** — Read 五个组件模板
- [ ] **Step 2: 修改**（统一模式，每个可点击 span 加）：

```html
<span class="tag-item" role="button" tabindex="0"
  @click="toggle(tag)" @keydown.enter.prevent="toggle(tag)" @keydown.space.prevent="toggle(tag)">
```

（TagFilter 的 tag-item 与 clear-btn、TagSelector 的标签项同型处理；函数名以现有为准）
BaseDialog 根节点加 `role="dialog" aria-modal="true"`，关闭按钮加 `aria-label="关闭"`，onMounted 挂 `document.addEventListener('keydown', onEsc)`（Esc → emit close）、onUnmounted 移除；ConfirmDialog 同型（Esc → 取消语义的现有取消函数）；Toast 容器加 `aria-live="polite"`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-7): 公共组件键盘可访问性与 ARIA`

### Task 35: 配置组件低优先级清理（A 组）

**Files:**
- Modify: `src/components/config/CharacterGachaDialog.vue:180-190`（canGenerate 恒真删除）
- Modify: `src/components/layout/CharacterLibrary.vue:185-225,270-290`（分页校正 + 按 id 判重）
- Modify: `src/components/config/QuickGroupDialog.vue:100-115,360-370,445-490`（稳定 key、统计口径、回滚）
- Modify: `src/components/config/CreateGroupDialog.vue:175-190`（模板应用后清空选中）

- [ ] **Step 1: 复查** — Read 各文件相关区域
- [ ] **Step 2: 修改**：
  1. canGenerate computed 与按钮 `:disabled="!canGenerate"` 引用一并删除
  2. CharacterLibrary handleDelete 成功后 `currentPage.value = Math.min(currentPage.value, totalPages.value)`；`isCharacterInGroup(character)` 改 `characters.value.some(c => c.id === character.id)`（importToGroup 复用全局库 id，天然可判——Task 28 已确保不撞主键）
  3. QuickGroup：AI 生成结果落地时 `preview.characters.forEach(c => { c._key = crypto.randomUUID() })`，模板 `:key="c._key"`；handleConfirm 成功 toast 数量改 `preview.characters.length - failedChars`；saveToLibrary 分支中 importToGroup 失败时回滚 `await globalCharsStore.deleteCharacter(createdId)`（复查 createCharacter 返回值拿 id）
  4. applyTemplates 末尾 `selectedTemplateIds.value = []`
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-7): 配置组件边界修复（判重/分页/统计/回滚）`

### Task 36: 配置组件低优先级清理（B 组）

**Files:**
- Modify: `src/components/config/QuickGroupDialog.vue:130-140`、`GlobalCharacterDialog.vue:45-60`（年龄校验）
- Modify: `src/components/chat/CharacterPanel.vue:15-30,570-625,680-705`（maxHistory NaN + command 本地化）
- Modify: `src/components/chat/MessageInput.vue:55-70`（restore 暴露）+ `ChatWindow.vue:405-425`（失败回填）
- Modify: `src/components/common/FormGroup.vue:7`（死分支删除）
- Modify: `src/styles/variables.scss` + `BaseDialog.vue/ConfirmDialog.vue/Toast.vue`（z-index token）
- Modify: `src/composables/useDialog.js:40-47`（延迟移除容器）
- Modify: `src/components/chat/RelationshipPanel.vue:100-120`（校验提示 + 删除确认）

- [ ] **Step 1: 复查** — Read 各文件相关区域
- [ ] **Step 2: 修改**：
  1. 年龄提交校验：`if (form.age !== null && form.age !== '' && !(Number.isInteger(Number(form.age)) && Number(form.age) >= 1 && Number(form.age) <= 999)) { toast.error('年龄需为 1-999 的整数'); return }`（两处对话框适配各自表单结构）
  2. CharacterPanel updateMaxHistory：

```js
function updateMaxHistory(event) {
  const v = parseInt(event.target.value, 10)
  if (!Number.isInteger(v) || v < 1 || v > 50) {
    event.target.value = String(props.group?.maxHistory ?? 20)
    toast.error('历史条数需为 1-50')
    return
  }
  // ...现有提交
}
```

  3. char.command 本地化：组件内 `const commandDrafts = reactive(new Map())`，模板 `v-model="commandDrafts.get(char.id)"` 不便——改 `:value="commandDrafts.get(char.id) ?? ''" @input="e => commandDrafts.set(char.id, e.target.value)"`；sendCommand 用本地草稿，删除 store 直改；失败恢复 `commandDrafts.set(char.id, command)` 前判断用户是否已重新输入（若 `commandDrafts.get(char.id)` 非空则不覆盖）
  4. MessageInput `defineExpose({ restore: (text) => { content.value = text } })`；ChatWindow handleSendMessage 的 catch 分支加 `messageInputRef.value?.restore(content)`（复查 ref 名与 catch 现状）
  5. FormGroup 删除 `v-else-if="$slots.default && label === undefined"` 分支行
  6. variables.scss 加：

```scss
$z-index-dialog: 1000;
$z-index-confirm: 10000;
$z-index-toast: 99999;
```

三个组件的 z-index 改引用变量
  7. useDialog cleanup：`app.unmount(); setTimeout(() => container.remove(), 300)`（等离场动画）
  8. RelationshipPanel：校验失败 `toast.error('请选择两个不同的角色')`；handleRemove 包 confirm（复用项目现有确认方式——useDialog/ConfirmDialog，复查同层用法）
- [ ] **Step 3: `pnpm lint && pnpm build` 通过后提交** — `fix(batch-7): 前端低优先级清理 B 组`

---

## Batch 8：验证与记录

### Task 37: 全量验证 + 修复记录文档

**Files:**
- Create: `docs/代码审查/2026-08-15-修复记录.md`
- Modify: `docs/代码审查/2026-08-15-代码审查报告.md`（顶部加修复记录链接）

- [ ] **Step 1: 全量验证** — 依次运行 `pnpm lint`（零错误）、`pnpm build`（成功）、`pnpm test`（全部通过）；任一失败先修复再继续
- [ ] **Step 2: 撰写修复记录**——对照审查报告逐项（S-1…S-2、H-1…H-16、M-1…M-36、低优先级表逐行、§7 架构问题标注"遗留-P3"）标记三种状态之一：**已修复**（附 commit 短哈希）、**复查不成立**（附证据：文件:行 + 说明）、**遗留**（P3/规格 §4 排除项，附原因）。格式：

```markdown
# 2026-08-15 代码审查修复记录
| 编号 | 状态 | Commit | 备注 |
|---|---|---|---|
| S-1 | 已修复 | <hash> | |
| H-5 | 已修复 | <hash> | 引入 socks-proxy-agent@8 |
...
```

- [ ] **Step 3: 报告顶部加链接**：`> 修复情况见 [2026-08-15-修复记录.md](./2026-08-15-修复记录.md)`
- [ ] **Step 4: 提交** — `docs(batch-8): 修复记录与全量验证`

---

## Self-Review 记录

- **规格覆盖**：S-1(T7)/S-2(T2)/H-1(T4)/H-2(T5)/H-3(T3)/H-4(T14)/H-5(T13)/H-6(T8)/H-7(T23)/H-8(T26)/H-9(T29)/H-10(T29)/H-11(T20)/H-12(T19)/H-13(T19)/H-14(T19)/H-15(T32)/H-16(T32)；M-1(T11)/M-2(T10)/M-3(T9)/M-4(T31)/M-5(T11)/M-6(T11)/M-7(T16)/M-8(T15)/M-9(T15)/M-10(T15)/M-11(T14)/M-12(T16)/M-13(T16)/M-14(T6)/M-15(T26)/M-16(T3)/M-17(T27)/M-18(T28-reorder 事务)/M-19(T24)/M-20(T24)/M-21(T25)/M-22(T10)/M-23(T28 注释)/M-24(T30)/M-25(T30)/M-26(T30)/M-27(T30)/M-28(T30)/M-29(T29)/M-30(T33)/M-31(T34)/M-32(T21)/M-33(T21)/M-34(T21)/M-35(T18)/M-36(T33)；低优先级各项分布于 T2/9/10/11/12/17/22/28/29/30/31/35/36；§4 遗留项在 T37 记录。规格 §3 的 8 个测试文件全部落位（html-escape T1、timestamp T8、like-escape T10、context-truncate T25、json-extractor/logger/statement-cache/stream-batcher T29、narrative-parsing T30）。无缺口。
- **占位符扫描**：无 TBD/TODO；所有代码步骤均含目标实现代码；复查类步骤指明读取位置。
- **类型/命名一致性**：`escapeHtml`(T1→T2)、`nowTimestampMs`(T8 内)、`atomicWriteJson`(T9)、`escapeLike/escapeRegExp/stripMentionPunctuation`(T10/T30 同文件追加)、`encryptSecret/decryptSecret`(T5)、`isValidGroupId`(T4)、`safeSend`(T23)、`truncateMessagesToBudget/DEFAULT_CONTEXT_BUDGET_CHARS/sumChars`(T25)、`getItemKey`(T20)、`getGroupDB` 公开方法(T28)、`renameCharacter`(T31)、`restore`(T36)——前后引用一致。
