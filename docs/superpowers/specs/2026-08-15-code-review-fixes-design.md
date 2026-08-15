# 代码审查问题修复设计

- 日期：2026-08-15
- 状态：已批准
- 依据：`docs/代码审查/2026-08-15-代码审查报告.md`（约 99 项：严重 2 / 高 16 / 中 36 / 低 45）
- 范围决定：**全部修复，仅排除 P3 架构重构**（拆分 CharacterPanel、统一对话框体系、usePromptConfig 抽取、getProviderName 收敛等）
- 结构性问题采用**最小方案**；回归验证采用 **lint + build + 定向测试**（Node 内置 test runner，零新增测试框架）
- 唯一新依赖：`socks-proxy-agent`（SOCKS5 代理修复必需，已批准）

## 1. 总体策略

- **按主题分 8 个批次串行修复**，批次顺序按优先级排布。每批次流程：逐项复查（读当前代码确认问题仍存在）→ 修复 → lint/build → 提交一个 conventional commit。
- **复查不成立的项不强行修改**：在修复记录中标注"复查不成立 + 证据"。
- 每个文件只被一个批次触碰（个别跨批次的微小例外在计划中注明）。

## 2. 批次划分与关键设计决策

### 批次 1：安全防线（P0）

| 问题 | 修复设计 |
|---|---|
| S-2 GroupSearch XSS | `highlightKeyword` 先对 text 做 HTML 实体转义（`& < > " '`）再做关键词替换 |
| H-3 CSP/窗口防线 | index.html `<head>` 加 CSP meta（基于原 onHeadersReceived 中的策略，`connect-src` 收紧为 `https://*` + localhost）；删除 main.js 中无效的 onHeadersReceived 代码；`setWindowOpenHandler(() => ({ action: 'deny' }))`；`will-navigate` 白名单拦截（仅允许 devUrl / file: 应用自身路径）；BrowserWindow 显式 `sandbox: true` |
| H-1 groupId 校验 | database/manager.js 入口校验 groupId 为 UUID 格式（`/^[a-f0-9-]{36}$/i`），并校验 `path.resolve` 后路径位于 dataDir 内；查询类 handler 传播校验（不合法直接返回业务错误） |
| H-2 API Key 加密 | 写入 SQLite/JSON 前 `safeStorage.encryptString()`，读取时 `decryptString()`；**旧明文兼容**：解密失败（非 Buffer 或抛错）视为明文返回，下次保存自动升级为密文；`safeStorage.isEncryptionAvailable()` 为 false 时保持明文并在日志警告 |
| M-14 handler-wrapper | label 默认取通道名（必填化），主进程日志记录完整 stack；返回渲染进程前用正则过滤 Windows 绝对路径 |
| M-16 单实例锁 | main.js 启动 `requestSingleInstanceLock`，失败 `app.quit()`；second-instance 聚焦已有窗口（与 CSP 同文件，归本批次） |

### 批次 2：数据完整性（P0）

| 问题 | 修复设计 |
|---|---|
| S-1 syncGroupsProfile 清空 Key | 改用 `updateLLMProfile` 返回的**合并后完整 profile** 同步群组，四字段统一兜底 |
| H-6 秒级时间戳误删 | 消息插入时显式写入**毫秒级 UTC** `YYYY-MM-DD HH:MM:SS.mmm`（空格分隔，与存量秒级数据的字符串排序天然一致，**无需数据迁移**）；`message:deleteFrom` 与 `narrative:deleteEvent` 改为按目标消息 `rowid` 定位 + `(timestamp > ? OR (timestamp = ? AND rowid >= ?))` 复合条件删除；narrative 匹配用户消息时同库同内容取 rowid 最大且附带校验 |
| M-1 DEFAULT_TEMPLATES 污染 | 所有返回处深拷贝 `map(t => ({ ...t }))` |
| M-2 标签写入无事务 | `setCharacterTags` 用 `db.transaction()` 包裹 |
| M-3 配置非原子写 | 三个配置写入点改为：同目录写 `.tmp` → `renameSync` 原子替换 |
| M-5 复制群组丢字段 | GROUP_COLUMNS/mapGroupValues 补 `auto_memory_extract`、`narrative_enabled`、`aftermath_enabled`、`event_scene_type` 四列 |
| M-6 maxHistory 边界 | 0 视为合法（不带历史），负数/NaN 回退默认 20；前端提交前钳制到 [0, 50] |

### 批次 3：LLM 客户端

| 问题 | 修复设计 |
|---|---|
| H-4 budget_tokens 冲突 | `budget_tokens = Math.max(1024, Math.floor(maxTokens * 0.6))` 且强制 `< max_tokens`（不足时抬高 max_tokens） |
| H-5 SOCKS5 | 引入 `socks-proxy-agent`：检测 `proxy.protocol === 'socks5'` 时设置 `httpAgent/httpsAgent = new SocksProxyAgent(url)` 且 `proxy: false` |
| M-7 Ollama signal | chatStream 传第三参 signal；post 传 `{ signal }`；catch 补 AbortError/ERR_CANCELED 分支 |
| M-8 错误响应流 | handleError 检测 `error.response.data` 为流时：`setEncoding('utf8')` 收集完整错误体解析 JSON 后再生成 message，最后 destroy |
| M-9 data 回调防护 | 回调整体 try-catch，catch 中 `destroy()` + `reject(handleError(e))` |
| M-10 DONE 后不销毁 | resolve 前 `response.data.destroy()`；增加 settled 标志丢弃后续 data 事件 |
| M-11 Anthropic SSE | `const type = parsed.type \|\| state.currentEvent`，以 data 载荷 type 为准 |
| M-12 Ollama 流式 usage | done 帧先提取 `prompt_eval_count`/`eval_count` 写入 state.usage 再返回 done |
| M-13 streamEnabled 生效 | `isStreaming = typeof onChunk === 'function' && this.streamEnabled !== false`，删除死变量 |
| 低优先级群 | abort 监听器 end 后移除；`data:` 前缀容错（slice(5) + 去一个前导空格）；空 content 但有 reasoningContent 视为成功；删除 buildAxiosProxyConfig、getModels 死链路（preload 暴露一并移除）、全局代理半废弃链路（保留存储，移除误导 UI 文案改为说明实际行为）；系统代理文案修正；addLLMProfile spread 顺序；profileId 显式传入未命中时报错不回退；`replace('{hint}', () => hint)`；factory 风格修正 |

### 批次 4：前端竞态

| 问题 | 修复设计 |
|---|---|
| H-11 虚拟列表 key | `getItemKey: (i) => messages[i]?.id ?? i` |
| H-12 流式事件串群 | store 层统一守卫：onUserMessageSaved / onStreamStart / onStreamEnd / appendMessage / aftermath push 前比对 `groupId === currentGroupId` |
| H-13 加载竞态 | messages/characters/narrative(情绪) store 引入递增请求序号，过期响应丢弃 |
| H-14 监听器失效 | `messageListener?.()`；store 暴露统一 cleanup；ChatWindow onUnmounted 调用 |
| M-32 EmotionTag 泄漏 | document click addEventListener 移到 await 之前 |
| M-33 EventPanel 并发 | 卡片 `:disabled="messagesStore.sending"`；handleTrigger/handleEventTriggered 补 sending 短路 + try/catch |
| M-35 防重复提交锁 | 5 个对话框（LLMProfileForm/CreateGroup/CreateCharacter/CharacterGacha/GroupSettings）统一 submitting ref 模式：异步完成前禁用按钮；LLMProfileForm 改为由父组件通知结果后复位 |
| 低优先级群 | GroupSearch 定时器清理 + 请求序号；高亮 timeout 句柄管理；rAF 卸载取消 + displayMode 判断；useApi loading 改计数器；validators 入口 String 化；deleteGroup 后回退到第一个群组 |

### 批次 5：LLM 处理层

| 问题 | 修复设计 |
|---|---|
| H-7 无防重入 | llm.js 维护 `Map<groupId, AbortController>`：新请求 abort 旧请求；signal 传递至 client（chat/chatStream 全链路）；abort 后各写库/推送步骤跳过 |
| H-8 EXDEV | exportToZip 改 `copyFile(temp, savePath)` + 成功后 unlink 临时文件 |
| M-15 导出流错误 | output 监听 'error'；`await archive.finalize()`；统一走 createHandler |
| M-17 消息分页 | IPC `message:getByGroupId` 支持 `{ limit, before }`（按 timestamp+rowid 倒序取后反序）；前端首屏加载最近 300 条 + 顶部"加载更早的消息"按钮（每次 +300，prepend 时锚定滚动位置） |
| M-19 用户消息丢失 | buildContextMessages 无条件追加当前 userContent |
| M-20 先写库后校验 | generateCharacterCommand 先校验角色存在（含 `AND group_id = ?`）再写库 |
| M-21 token 截断（最小） | 字符数/2 估算 token；总预算固定 24000 字符（不做群配置扩展，YAGNI）；裁剪顺序：最早的历史消息 → 记忆（注入上限 20 条）→ 背景设定；system prompt/人设不裁 |
| M-22 LIKE 转义 | search.js 与 global-character-manager 统一 `escapeLike()` + `ESCAPE '\'`；角色查询加 LIMIT |
| M-23 setImmediate 误导 | 修正注释与实现说明（最小方案不引入 FTS5，代码注明单群大库仍可能短暂阻塞） |
| 低优先级群 | safeSend 封装（isDestroyed 检查）用于 5 处直发点，stream:end 通知失败不影响返回语义；memory:add 校验非空字符串；null.trim() 修复；importToGroup 防重改按 id；engine 暴露公开 getGroupDB 替代 `_getGroupDB` 12 处调用；reorder 包事务；mapGroupValues snake 分支布尔归一；save handler 失败带 error 字段；dev.js `code ?? 1`；删除 channels.js；config-dir 委托；LRU 上限 10 → 64；deleteGroupDB 顺带清理 -journal/-wal/-shm；deleteTag 简化为级联；模板 id 用 generateUUID；llm-profiles Array.isArray + 迁移写回入队 + 日志文案 |

### 批次 6：叙事引擎与工具

| 问题 | 修复设计 |
|---|---|
| M-24 余波无角色名 | 查询改 `SELECT m.*, c.name AS character_name ... LEFT JOIN characters` |
| M-25 正则未转义 | escapeRegExp 抽为 electron/utils 共享工具（emotion-manager 与 engine 复用） |
| M-26 @提及失效 | 捕获后剥离尾部中英文标点再匹配 |
| M-27 "平静"事件 | mapEventImpactToEmotion 不映射"平静"；updateFromEvent 对"平静"写 intensity 0 |
| M-28 情绪脏数据 | updateFromLLM 加情绪词白名单 + `Number.isFinite(intensity)` |
| M-29 logger statSync | 内存累计写入字节，估算超限才 statSync 校验 |
| H-9 CJS 导出 | json-extractor 改 `export { extractJSON }` |
| H-10 轮转失败 | rename 移入 `stream.end()` 回调；`_cleanOldLogs` 兼容 .old.log |
| 低优先级群 | uuid.js 改 `crypto.randomUUID`；死参数接线（preGenerate 内查 favorability 传入 shouldInferFromLLM，实现"负好感深度推断"设计意图）；Fisher-Yates 洗牌；event-trigger 统一 prepareCached；buildInClause 复用防 `IN ()`；情绪词表去重（"算了"归无奈；删"不是"/裸"为什么"）；Math.trunc 对称取整；N+1 改 getEmotionsBatch |

### 批次 7：配置组件与公共层

| 问题 | 修复设计 |
|---|---|
| H-15 凭据预填错供应商 | `profiles.find(p => p.provider === providerId)`，未命中回退默认 baseURL、Key 留空 |
| H-16 字段双命名 | 统一驼峰 `thinkingEnabled`；读取处兼容旧 `thinking_enabled`（读时合并）；LLMConfigPanel 提交改为驼峰 |
| M-30 narrative store | 四个写操作统一走 useApi.call；getCharacterTags 并入同风格 |
| M-31 可访问性（最小） | 标签项补 role="button" + tabindex + Enter/Space 键盘事件；BaseDialog/ConfirmDialog 补 role="dialog" aria-modal + ESC 关闭；图标按钮 aria-label；Toast aria-live="polite"。**不做 focus trap** |
| M-34 流式消息防护 | 气泡视图 startEdit 加 `if (isStreaming) return`；删除/重发按钮对 isStreaming 禁用 |
| 低优先级群 | canGenerate 恒真删除；删除后分页校正；导入判重改按角色 id（importToGroup 复用全局库 id，天然可判）；QuickGroup 角色卡片稳定 key（生成时 randomUUID）；失败统计口径修正 + importToGroup 失败回滚已建库角色；年龄 JS 校验；LLMConfigPanel 表单遮罩关闭禁用（与 LLMProfileDialog 一致）；模板应用后清空选中；maxHistory NaN 校验回显；MessageInput 暴露 restore(content) 供发送失败回填；FormGroup 死分支删除；z-index 抽 token；useDialog 延迟 removeChild 保留离场动画 + 删冗余 Promise；RelationshipPanel 校验 toast + 删除确认；char.command 移组件本地 Map；App.vue 100vw → 100% |

### 批次 8：清理验证与记录

1. 全量 `pnpm lint` + `pnpm build`。
2. 定向测试汇总运行（见 §3）。
3. `docs/代码审查/2026-08-15-修复记录.md`：逐项标记 **已修复 / 复查不成立（证据）/ 遗留（原因）**；同步在原审查报告顶部加修复记录链接。

## 3. 定向测试（Node 内置 `node --test`，零新框架）

仅覆盖纯逻辑模块（不触碰 Electron/DOM 依赖）：

| 测试文件 | 覆盖 |
|---|---|
| tests/json-extractor.test.js | 五级容错链 + 截断修复 + ESM 具名导入可用 |
| tests/statement-cache.test.js | WeakMap 缓存与释放 |
| tests/stream-batcher.test.js | 批量聚合/flush/destroy 语义 |
| tests/logger.test.js | 字节数计数触发轮转、end 回调后 rename（临时目录内） |
| tests/like-escape.test.js | escapeLike 转义 `%`/`_`/`\` |
| tests/narrative-parsing.test.js | @提及剥离标点、角色名正则转义、情绪白名单校验 |
| tests/context-truncate.test.js | token 截断优先级与预算 |
| tests/timestamp.test.js | 毫秒格式化 + 与秒级存量数据的字典序兼容 |

## 4. 明确不做（遗留项及原因）

- **P3 架构重构**（用户排除）：拆分 CharacterPanel、统一对话框体系、抽取共享 composable、getProviderName 等 6 份收敛。
- **FTS5 全文索引**（最小方案排除）：LIKE + ESCAPE + LIMIT 修复功能性 bug，阻塞问题以注释明示。
- **记忆 schema ID 化迁移**（最小方案排除）：改为**全局角色改名时同步 UPDATE 记忆表的 character_name**（含 handler 与 manager 改动），消除改名失联；同名跨群串扰以代码注释明示当前"同名即同一人"约定。
- **focus trap 完整实现**：可访问性只做最小集。
- **死代码 getModels**：删除而非补全 handler。

## 5. 提交策略

| # | Commit | 类型 |
|---|---|---|
| 0 | 设计文档 + 修复记录骨架 | docs |
| 1-8 | 各批次修复 | fix/perf/chore（按主导性质） |

## 6. 成功标准

1. 报告中除 P3 与 §4 遗留项外，全部问题在修复记录中有"已修复"或"复查不成立"的明确状态。
2. `pnpm lint` 零错误、`pnpm build` 成功。
3. 全部定向测试通过。
4. 每批次独立 commit，可逐批 review。
