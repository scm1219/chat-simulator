# 叙事引擎（Narrative Engine）设计文档

> 日期：2026-04-17
> 状态：待评审
> 范围：中度叙事系统

---

## 1. 概述

在现有角色扮演对话系统上叠加叙事层，包含三个核心子系统：情绪状态机、角色关系图谱、事件触发系统，以及一个编排角色间余波互动的机制。目标是让 AI 角色对话更智能、更自然、更有沉浸感。

### 设计原则

- 状态持久化到数据库，可追溯、可调试
- LLM 负责表达，引擎负责决策，控制 token 成本
- 所有叙事功能可按群组独立开关
- 失败时静默降级，不影响主对话流程

---

## 2. 整体架构

### 2.1 新增模块

```
electron/
├── narrative/                    # 新增：叙事引擎
│   ├── engine.js                 # 叙事引擎主控（编排入口）
│   ├── emotion-manager.js        # 情绪状态机
│   ├── relationship-manager.js   # 关系图谱管理
│   ├── event-trigger.js          # 事件触发系统
│   └── prompt-builder.js         # 叙事上下文 prompt 构建器
├── database/
│   └── narrative-schema.sql      # 新增：叙事相关表结构
```

### 2.2 数据粒度

| 数据 | 粒度 | 理由 |
|------|------|------|
| 情绪状态 | 按群独立 | 同一角色在不同群场景不同，情绪应独立 |
| 角色关系 | 按群独立 | 关系只存在于同一群的成员之间 |
| 好感度 | 按群独立 | 同一角色对另一角色的态度可能因群而异 |
| 事件记录 | 按群独立 | 每个群的剧情线独立 |
| 角色人设/记忆 | 全局共享 | 已有机制，保持不变 |

### 2.3 叙事引擎工作流程

```
用户发送消息
    │
    ▼
[1] EmotionManager.updateFromMessage()     ← 关键词规则快速判断情绪
    │
    ▼
[2] NarrativeEngine.buildPromptContext()    ← 注入：当前情绪 + 关系 + 最近事件
    │
    ▼
[3] LLM 生成回复
    │
    ▼
[4] EmotionManager.extractFromLLM()        ← LLM 关键节点推断情绪（可选）
[5] RelationshipManager.updateFavorability() ← 根据对话内容更新好感度
    │
    ▼
[6] NarrativeEngine.generateAftermath()     ← 系统自动编排角色间余波
    │
    ▼
[7] EventTrigger.checkStaleness()          ← 检测对话是否平淡，推荐事件
```

---

## 3. 数据库设计

在群组数据库（`group_{id}.sqlite`）内新增以下表：

### 3.1 character_emotions（角色情绪表）

```sql
CREATE TABLE IF NOT EXISTS character_emotions (
  character_id TEXT PRIMARY KEY,
  emotion TEXT NOT NULL DEFAULT '平静',
  intensity REAL NOT NULL DEFAULT 0.0,
  decay_rate REAL NOT NULL DEFAULT 0.1,
  source TEXT NOT NULL DEFAULT 'keyword',
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

### 3.2 character_relationships（角色关系表）

```sql
CREATE TABLE IF NOT EXISTS character_relationships (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'stranger',
  favorability INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (from_id, to_id),
  FOREIGN KEY (from_id) REFERENCES characters(id),
  FOREIGN KEY (to_id) REFERENCES characters(id)
);
```

### 3.3 narrative_events（事件记录表）

```sql
CREATE TABLE IF NOT EXISTS narrative_events (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  content TEXT NOT NULL,
  impact TEXT,
  event_type TEXT NOT NULL DEFAULT 'user_triggered',
  triggered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (group_id) REFERENCES groups(id)
);
```

### 3.4 群组表新增字段

```sql
ALTER TABLE groups ADD COLUMN narrative_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE groups ADD COLUMN aftermath_enabled INTEGER NOT NULL DEFAULT 1;
ALTER TABLE groups ADD COLUMN event_scene_type TEXT DEFAULT 'general';
```

---

## 4. 情绪状态机

### 4.1 情绪模型

```javascript
{
  emotion: "开心",       // 情绪标签
  intensity: 0.7,        // 强度 0-1
  decay_rate: 0.1,       // 每轮自然衰减速率
  source: "keyword",     // 来源：keyword / llm / event
  updated_at: timestamp
}
```

### 4.2 内置情绪词典

```javascript
const EMOTION_KEYWORDS = {
  "开心":   { words: ["哈哈", "嘿嘿", "太好了", "棒", "开心", "喜欢", "爱你"], intensity: 0.6 },
  "愤怒":   { words: ["闭嘴", "烦死", "滚", "笨蛋", "混蛋", "气死", "废物"], intensity: 0.8 },
  "尴尬":   { words: ["那个...", "咳", "不是", "误会", "其实不是"], intensity: 0.5 },
  "感动":   { words: ["谢谢", "谢谢你", "太感动", "没想到", "你真好"], intensity: 0.7 },
  "悲伤":   { words: ["难过", "伤心", "不想说", "算了", "无所谓了"], intensity: 0.6 },
  "惊讶":   { words: ["啊？", "什么？", "不会吧", "真的假的", "不可能"], intensity: 0.7 },
  "嫉妒":   { words: ["凭什么", "羡慕", "不公平", "为什么不是我"], intensity: 0.6 },
  "疲惫":   { words: ["累了", "困", "无聊", "不想聊了", "打哈欠"], intensity: 0.4 },
}
```

用户可在群设置中自定义情绪词典。

### 4.3 情绪更新流程

**关键词快速判断（每轮必执行）：**

1. 扫描收到的消息内容，匹配情绪词典关键词
2. 新情绪与当前情绪相同 → 强度叠加（上限 1.0）
3. 新情绪与当前情绪不同 → 当前情绪按 `decay_rate` 衰减后，新情绪取而代之
4. 无匹配 → 当前情绪自然衰减（`intensity -= decay_rate`，低于 0.1 归零为"平静"）

**LLM 情绪推断（关键节点触发）：**

触发条件（满足任一）：
- 消息中包含 @ 该角色的内容
- 消息来自好感度 < 0 的角色
- 触发了事件
- 连续 3 轮情绪无变化

LLM 在正常回复末尾额外输出结构化情绪（通过现有 `json-extractor.js` 解析）：
```json
{"emotion": "委屈", "intensity": 0.6}
```

失败时降级为关键词规则，不影响主回复。

### 4.4 Prompt 注入格式

```markdown
## 角色情绪状态
- 张三（当前情绪：开心 0.7）— 请用轻快、主动的语气回复
- 李四（当前情绪：愤怒 0.5）— 请用带有攻击性、不耐烦的语气回复
- 王五（当前情绪：疲惫 0.3）— 请用懒散、敷衍的语气回复
```

### 4.5 前端展示

- 角色面板中显示当前情绪标签和强度条（小圆点 + 颜色）
- 消息气泡可选显示情绪标记
- 情绪变化时有微动画过渡

---

## 5. 角色关系系统

### 5.1 关系模型

```javascript
{
  from_id: "char_001",
  to_id: "char_002",
  type: "friend",
  favorability: 35,
  description: "大学室友，经常互相打趣",
  updated_at: timestamp
}
```

### 5.2 预设关系类型

```javascript
const RELATIONSHIP_TYPES = {
  friend:    { label: "朋友",   defaultFavor: 30,  promptHint: "友好、亲近、会开玩笑" },
  lover:     { label: "恋人",   defaultFavor: 70,  promptHint: "亲密、温柔、关心对方" },
  rival:     { label: "对手",   defaultFavor: -20, promptHint: "竞争、不服气、暗中较劲" },
  mentor:    { label: "师徒",   defaultFavor: 40,  promptHint: "尊重但保持距离、偶尔严厉" },
  colleague: { label: "同事",   defaultFavor: 10,  promptHint: "礼貌、合作、有分寸" },
  family:    { label: "家人",   defaultFavor: 50,  promptHint: "随意、亲密、说话不加修饰" },
  stranger:  { label: "陌生人", defaultFavor: 0,   promptHint: "客气、试探、保持距离" },
}
```

用户可自定义关系类型（名称 + promptHint）。

### 5.3 好感度动态变化

每轮对话后 `RelationshipManager` 根据互动内容调整好感度：

| 互动行为 | 好感度变化 | 示例 |
|---------|-----------|------|
| 被夸赞/感谢 | +3 ~ +8 | "你说得对""谢谢你" |
| 被批评/反驳 | -3 ~ -8 | "你错了""别说了" |
| 被点名(@)互动 | +1 ~ +3 | 主动关注对方 |
| 长时间未互动 | -1 | 超过 5 轮未被提及 |
| 分享私人内容 | +2 ~ +5 | 表达感受、讲述经历 |
| 情绪共鸣 | +2 ~ +5 | 双方情绪相似且正面 |

变化幅度受情绪影响：
- 愤怒状态下被夸赞 → 好感度提升减半
- 开心状态下被批评 → 好感度下降加倍

好感度阈值与行为提示：

```
-100 ~ -50  敌对  → 极度厌恶，言辞尖锐，可能拒绝交流
 -50 ~ -10  不满  → 带有负面情绪，说话带刺
 -10 ~  10  中立  → 礼貌但疏远
  10 ~  40  友好  → 正常交流，偶尔关心
  40 ~  70  亲密  → 主动分享，会维护对方
  70 ~ 100  深厚  → 无条件信任，会为对方出头
```

### 5.4 Prompt 注入格式

```markdown
## 角色关系
- 张三 → 李四：朋友（好感度 45，亲密）— 张三对李四说话友好亲近，会开玩笑
- 李四 → 张三：对手（好感度 -10，不满）— 李四对张三不服气，说话带刺
- 王五 → 张三：陌生人（好感度 5，中立）— 王五对张三客气但保持距离
```

### 5.5 前端展示

- 角色面板中新增"关系"Tab，展示与群内其他角色的关系列表
- 支持手动设置/修改关系类型和描述
- 好感度以进度条 + 颜色渐变展示（红→黄→绿）
- 关系变化时显示小通知

---

## 6. 事件触发系统

### 6.1 事件模型

```javascript
{
  id: "evt_001",
  group_id: "group_001",
  event_key: "power_outage",
  content: "突然停电了，房间里一片漆黑",
  impact: "惊讶",
  event_type: "user_triggered",
  triggered_by: "user_001",
  created_at: timestamp
}
```

### 6.2 预设事件池

```javascript
const EVENT_POOL = {
  office: [
    { key: "meeting_called", content: "老板突然通知全员开会", impact: "紧张" },
    { key: "fire_alarm", content: "消防警报突然响了", impact: "惊慌" },
    { key: "new_colleague", content: "部门来了一个新同事", impact: "好奇" },
    { key: "power_outage", content: "办公室突然停电了", impact: "惊讶" },
    { key: "deadline_reminder", content: "收到提醒：项目截止日期就在明天", impact: "焦虑" },
  ],
  home: [
    { key: "door_knock", content: "有人敲门", impact: "好奇" },
    { key: "package_arrived", content: "快递到了一个神秘包裹", impact: "好奇" },
    { key: "pet_mischief", content: "宠物把东西打翻了", impact: "无奈" },
    { key: "phone_rings", content: "一个陌生号码打来电话", impact: "紧张" },
  ],
  school: [
    { key: "exam_announced", content: "老师宣布明天突击考试", impact: "恐慌" },
    { key: "transfer_student", content: "班上来了一个转学生", impact: "好奇" },
    { key: "confiscated", content: "手机被老师没收了", impact: "沮丧" },
  ],
  general: [
    { key: "breaking_news", content: "手机弹窗推送了一条重大新闻", impact: "惊讶" },
    { key: "heated_argument", content: "两个人突然吵了起来", impact: "紧张" },
    { key: "sudden_silence", content: "所有人突然安静了下来", impact: "尴尬" },
    { key: "rain_start", content: "窗外突然下起了大雨", impact: "平静" },
  ],
}
```

用户可自定义事件，群组通过 `event_scene_type` 字段选择场景。

### 6.3 三种触发模式

**用户手动触发：**
- 聊天输入框旁新增"事件"按钮，点击弹出事件选择面板
- 按场景分类展示可用事件
- 用户点击后事件作为系统消息插入对话

**系统自动推荐（侧边栏）：**
- 根据群背景设定匹配场景类型
- 侧边栏底部展示 2-3 个推荐事件卡片
- 用户点击即触发，或点击"换一批"刷新
- 推荐算法考虑：群背景设定、当前情绪氛围、最近事件不重复

**对话平淡检测 + 温和提示：**
- 检测条件（满足任一）：
  - 连续 5 轮消息平均长度 < 20 字
  - 连续 3 轮没有情绪变化
  - 连续 4 轮没有 @ 互动
- 输入框上方显示温和提示："对话似乎有些平淡，要不要来点转折？" [查看推荐事件] [忽略]
- 点击"忽略"后 10 轮内不再提示

### 6.4 Prompt 注入格式

```markdown
## 当前事件
[系统事件] 突然停电了，房间里一片漆黑
（请各角色根据自己的人设、情绪和关系做出反应）
```

### 6.5 前端展示

- 事件消息以特殊样式展示（带图标系统消息气泡）
- 侧边栏底部"推荐事件"卡片区域（可折叠）
- 对话平淡提示条（输入框上方，可关闭）

---

## 7. 角色间余波编排（Aftermath）

### 7.1 触发条件

每轮主对话结束后判断（满足任一）：
- 某角色在回复中明确提到了另一角色
- 某角色情绪强度 > 0.7
- 某角色好感度 < -20 的对象发言了
- 刚触发了事件
- 随机 20% 概率触发

### 7.2 编排流程

```
主对话结束
    │
    ▼
[1] Engine.scanAftermathTriggers()   ← 扫描触发条件，确定参与者
    │
    ▼
[2] Engine.buildAftermathPrompt()    ← 构建余波 prompt（含情绪+关系）
    │
    ▼
[3] LLM 生成 1-3 条简短余波消息
    │   （限制：每条 ≤ 50 字，纯角色间互动，不回应用户）
    │
    ▼
[4] 消息以特殊样式插入对话
    │
    ▼
[5] 更新相关角色的情绪和好感度
```

### 7.3 余波 Prompt 模板

```markdown
## 余波指令
基于以上对话，请生成 1-3 条角色间的简短追评或互动。
要求：
- 只写角色之间的互动，不要回应用户
- 每条不超过 50 字
- 角色语气需符合当前情绪和关系
- 不是每个角色都要发言，只写自然会有反应的角色
- 输出格式：角色名：内容
```

### 7.4 LLM 调用策略

- 复用群组 LLM 配置
- max_tokens 限制 ~300，控制成本
- 单次调用，不需要流式输出
- 调用失败时静默跳过，不影响主流程

### 7.5 前端展示

- 余波消息以斜体 + 较浅背景色展示
- 消息前缀小标签
- 群设置中可关闭余波功能（`aftermath_enabled`）

---

## 8. 新增 IPC 接口

### 情绪相关

| 通道 | 说明 |
|------|------|
| `narrative:getEmotions` | 获取群内所有角色当前情绪 |
| `narrative:getEmotion` | 获取单个角色情绪 |
| `narrative:setEmotion` | 手动设置角色情绪（调试用） |
| `narrative:updateEmotionKeywords` | 更新群自定义情绪词典 |

### 关系相关

| 通道 | 说明 |
|------|------|
| `narrative:getRelationships` | 获取群内所有角色关系 |
| `narrative:getRelationship` | 获取两个角色之间的关系 |
| `narrative:setRelationship` | 设置/更新角色关系 |
| `narrative:removeRelationship` | 删除角色关系 |
| `narrative:getRelationshipTypes` | 获取预设 + 自定义关系类型 |

### 事件相关

| 通道 | 说明 |
|------|------|
| `narrative:getEventPool` | 获取可用事件池（按场景筛选） |
| `narrative:triggerEvent` | 手动触发事件 |
| `narrative:getRecentEvents` | 获取最近事件记录 |
| `narrative:getEventSuggestions` | 获取系统推荐事件 |

### 叙事引擎控制

| 通道 | 说明 |
|------|------|
| `narrative:getConfig` | 获取群叙事配置 |
| `narrative:updateConfig` | 更新群叙事配置（开关、场景类型等） |

---

## 9. 新增前端组件

| 组件 | 路径 | 职责 |
|------|------|------|
| EmotionTag | `components/common/` | 情绪标签展示组件 |
| RelationshipPanel | `components/chat/` | 角色关系列表和管理面板 |
| EventPanel | `components/chat/` | 事件选择和推荐面板 |
| StalenessTip | `components/chat/` | 对话平淡提示条 |
| NarrativeConfigPanel | `components/config/` | 叙事系统配置面板 |

---

## 10. 群设置扩展

在 `GroupSettingsDialog.vue` 中新增叙事相关配置项：

- 叙事引擎开关（`narrative_enabled`）
- 余波互动开关（`aftermath_enabled`）
- 事件场景类型选择（`event_scene_type`）
- 对话平淡检测开关
- 自定义情绪词典编辑入口
