# LLM 动态事件推荐 + 事件情绪接线 设计文档

> 日期：2026-10-24
> 状态：待评审
> 范围：小-中型改动（叙事引擎事件子系统）

---

## 1. 概述与动机

当前事件系统的推荐事件来自硬编码静态池（`event-trigger.js` 的 `DEFAULT_EVENT_POOL`，7 场景约 85 条固定文案），选择算法是纯随机洗牌，与群的剧情、角色、关系完全无关——这是"随机事件过于死板"的根因。同时 `EmotionManager.updateFromEvent` 已实现但无任何调用点，事件 impact（如"惊慌"）从未真正写入角色情绪。

本次改动两件事：

1. **LLM 动态生成推荐事件**：事件面板刷新时，由 LLM 根据当前剧情上下文生成 3 个贴合群聊状态的事件；静态池降级为 fallback 与 few-shot 示例来源
2. **事件 → 情绪接线**：事件触发的那轮生成中，将 impact 写入所有启用角色的情绪状态（带随机抖动）

### 设计原则（沿用叙事引擎既有原则）

- LLM 负责表达，引擎负责决策，控制 token 成本
- 失败时静默降级（回退静态池），不影响主对话流程
- 不新增数据库表、不新增 LLM 配置项

---

## 2. 方案选择

| 方案 | 说明 | 取舍 |
|------|------|------|
| **A. 按需生成 + 静态池兜底（选定）** | 面板打开/换一批时一次 LLM 调用生成，失败回退静态池 | 改动集中、成本与实际使用成正比、降级路径干净；代价是刷新有 1~3 秒延迟 |
| B. 后台预生成缓存 | 每轮对话后异步预生成存库，面板秒开 | 需新表+失效逻辑；用户不看面板也付费，成本偏高 |
| C. 混合（A + 缓存） | 按需生成 + 结果缓存，聊天推进后标失效 | 体验最好但缓存一致性复杂度中等 |

已与所有者确认选定 A。

---

## 3. 详细设计

### 3.1 LLM 事件生成（主进程）

**新 IPC 通道**：`narrative:generateEventSuggestions(groupId, sceneType, count)`

注册在 `electron/ipc/handlers/narrative.js`。LLM 客户端创建所需的工具函数（`createLLMClient`、`resolveClientProxy`、`resolveApiKey`）均为模块级导出，直接 import，不改 `main.js` 接线。客户端使用**群组自身的 LLM 配置**（provider/model/baseURL/apiKey），与角色对话同源。

**流程**：

1. 前置校验：群组存在且 `narrative_enabled === 1`；LLM 配置可用（需要 API Key 的供应商无 Key 则直接回退）。`narrative_enabled = 0` 时直接返回静态池结果（现行为）
2. 收集上下文（单次 DB 批量查询）：
   - 群背景 `background`
   - 角色列表：名字 + system_prompt 首行摘要（复用 `buildContextMessages` 的摘要逻辑）
   - 情绪快照：`character_emotions` 中 intensity > 0.1 的记录
   - 关系快照：`character_relationships`（类型 + 好感度等级标签）
   - 最近 10 条对话消息
   - few-shot 示例：静态池中该场景 + general 随机抽 4 条
3. 构建 prompt（新方法 `NarrativePromptBuilder.buildEventSuggestionPrompt(...)`），一次 `client.chat` 调用，`responseFormat: json_object`，`maxTokens: 400`，要求返回：
   ```json
   { "events": [{ "content": "事件描述", "impact": "情绪词" }, ...] }
   ```
   prompt 中明确约束：事件贴合当前剧情与场景、可涉及具体角色名、impact 从标准 15 情绪词中选、每条不超过 40 字、生成 count 条
4. 解析与校验（新方法 `EventTrigger.parseGeneratedEvents(raw, count)`）：
   - `extractJSON` 解析；`events` 必须是非空数组
   - 每条：`content` 为非空字符串且 ≤ 50 字；`impact` 经 `mapEventImpactToEmotion` 归一（未知词映射为"惊讶"，宽松校验）
   - 合成 key：`llm_${Date.now()}_${i}`
5. 任一步失败（LLM 错误/超时/JSON 解析失败/有效事件 0 条）→ 调用现有 `getEventSuggestions` 回退静态池，返回值加 `source: 'fallback'` 标记；成功返回 `source: 'generated'`

**Prompt 位置**：`prompt-builder.js` 新增 `buildEventSuggestionPrompt`，与现有 aftermath prompt 并列。生成逻辑（LLM 调用、降级）放 `engine.js` 新方法 `generateEventSuggestions(db, groupId, sceneType, count)`，IPC handler 只做参数透传。

### 3.2 前端（EventPanel + narrative store）

- `stores/narrative.js`：新增 `generateEventSuggestions(groupId, sceneType)`，调新 IPC，结果写入现有 `eventSuggestions` ref；新增 `eventSuggestionsLoading` ref
- `EventPanel.vue` 的 `refresh()` 改调 `generateEventSuggestions`；`换一批` 按钮触发同一方法
- loading 态：事件卡片区域显示"生成中…"占位，按钮禁用防重复点击
- 触发事件成功后的 `refresh()` 同样走 LLM 生成（对话刚推进一轮，上下文最新，值得这次调用）
- 触发事件（`handleTrigger`）本身流程不变：仍写 `narrative_events` 表 + 以 `messageType='event'` 发起对话

`llm_` 前缀的合成 key 与静态池去重逻辑（`recentBaseKeys`）天然不冲突；`getEventSceneLabel` 对其返回现有 fallback `'自定义'`，无需改动。

### 3.3 事件 → 情绪接线

**位置**：`llm.js` 的 `llm:generate` handler，`saveUserMessage` 之后、角色生成循环之前：

```js
if (messageType === 'event' && eventImpact && narrativeEngine && group.narrative_enabled === 1) {
  for (const char of characters) {  // 启用的非用户角色
    narrativeEngine.emotion.updateFromEvent(db, char.id, eventImpact, 0.2)
  }
}
```

**`updateFromEvent` 增加 jitter 参数**（默认 0，不影响签名兼容）：

```js
updateFromEvent(db, characterId, impact, jitter = 0)
// intensity = base * (1 + (Math.random() * 2 - 1) * jitter)，clamp 到 [0, 1]
```

jitter = 0.2 让全员情绪有 ±20% 强度差异，避免"整齐划一进入惊慌态"。`'平静'` impact 的重置分支不参与抖动。

接线后自然激活的下游链路：语气提示 `TONE_HINTS` 注入 → 余波的高情绪必触发（intensity > 0.7）→ 好感度更新的情绪修正。

**前提（评审发现补充）**：事件轮的 `preGenerate` 需跳过关键词情绪更新（`messageType` 透传判断）。否则关键词通道的无匹配衰减会按角色数逐次削弱刚写入的事件强度（0.768 在 3 角色群 3 次衰减后仅剩 0.468），高情绪必触发链路不可达。

---

## 4. 非目标（本轮不做）

- 导演模式（引擎自动触发事件）
- 事件消息旁白化 / 事件与消息的外键关联（仍按内容+message_type 匹配删除）
- 平淡检测算法改进
- 新增独立"叙事 LLM"配置项

---

## 5. 测试计划

现有 `node --test` 体系，新增测试文件 `tests/narrative-event-generation.test.js`：

- `buildEventSuggestionPrompt`：含情绪/关系/角色/示例时输出各段落（纯函数，直接测）
- `parseGeneratedEvents`：合法输入、事件数不足、超长 content、非法 impact 归一、空数组
- `updateFromEvent` jitter：抖动边界 clamp 到 [0,1]、'平静' 分支不受 jitter 影响
- `generateEventSuggestions` 降级：LLM 失败/解析失败时回退静态池（mock client）

LLM 调用本身不测真实网络，mock `client.chat`。

---

## 6. 待实现时决定（builder 自主）

- prompt 的具体措辞与 few-shot 示例条数（3~4 条内微调）
- loading 占位样式（文案占位 vs 骨架屏）
- 超时依赖 LLM client 现有默认超时，不另加参数
