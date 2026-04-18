# 叙事引擎模块

[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > **narrative**

> 最后更新：2026-04-18

---

## 变更记录 (Changelog)

### 2026-04-18
- 初始化叙事引擎独立模块文档
- 从 `electron/CLAUDE.md` 中拆分叙事引擎详细文档
- 完善情绪系统描述（15 种情绪关键词）、关系系统（6 级好感度 + 4 类互动模式）、事件系统（7 场景约 85 事件）

---

## 模块职责

叙事引擎为多角色对话提供动态叙事增强，负责：
1. **情绪状态机**：通过关键词匹配和 LLM 推断混合模式追踪角色情绪
2. **角色关系图谱**：管理角色间的双向关系和好感度
3. **事件触发系统**：提供预设事件池、推荐算法和对话平淡检测
4. **余波编排**：在对话结束后自动生成角色的追评互动
5. **Prompt 构建**：将情绪、关系、事件状态注入 LLM system prompt

---

## 入口与启动

### 主入口文件
**路径**：`electron/narrative/engine.js`

### 初始化流程
叙事引擎在 `electron/main.js` 中初始化：
```javascript
const { NarrativeEngine } = await import('./narrative/engine.js')
const narrativeEngine = new NarrativeEngine()
narrativeEngine.setDBManager(dbManager)
```

### 内部结构
`NarrativeEngine` 包含四个子系统实例：
- `this.emotion`：`EmotionManager` 实例
- `this.relationship`：`RelationshipManager` 实例
- `this.eventTrigger`：`EventTrigger` 实例
- `this.promptBuilder`：`NarrativePromptBuilder` 实例

---

## 对外接口

### NarrativeEngine 主控接口

#### 对话流程集成
| 方法 | 参数 | 说明 |
|------|------|------|
| `preGenerate(db, characterId, groupId, userContent, senderCharacterId, allCharacters)` | 数据库/角色ID/群组ID/用户内容/发送者ID/所有角色 | 对话前：更新情绪 + 构建叙事上下文 |
| `postCharacterResponse(db, characterId, groupId, userContent, responseContent, allCharacters, createClientForCharacter, group, llmProfiles, apiKey)` | 数据库/角色ID/群组ID/用户内容/回复内容/所有角色/客户端创建函数/群组/Profile列表/API Key | 对话后：更新好感度 + LLM 情绪推断 |
| `generateAftermath(db, groupId, userContent, allResponses, allCharacters, createClientForCharacter, group, llmProfiles, apiKey)` | 数据库/群组ID/用户内容/所有回复/所有角色/客户端创建函数/群组/Profile列表/API Key | 生成余波追评 |

#### 独立调用接口
| 方法 | 参数 | 说明 |
|------|------|------|
| `checkStaleness(db, groupId)` | 数据库/群组ID | 检查对话平淡度 |
| `getEventSuggestions(db, groupId, sceneType, count)` | 数据库/群组ID/场景类型/数量 | 获取推荐事件 |
| `triggerEvent(db, groupId, eventKey, content, impact, triggeredBy)` | 数据库/群组ID/事件键/内容/影响/触发来源 | 触发事件 |
| `deleteEvent(db, eventId)` | 数据库/事件ID | 删除事件 |

### EmotionManager 情绪管理器
| 方法 | 说明 |
|------|------|
| `getEmotion(db, characterId)` | 获取角色当前情绪 |
| `getAllEmotions(db)` | 获取所有角色情绪 |
| `setEmotion(db, characterId, emotion, intensity)` | 手动设置角色情绪 |
| `updateFromMessage(db, characterId, content)` | 从消息内容更新情绪（关键词匹配） |
| `updateFromLLM(db, characterId, emotion, intensity)` | 从 LLM 推断结果更新情绪 |
| `updateFromEvent(db, characterId, impact)` | 从事件影响更新情绪 |
| `shouldInferFromLLM(db, characterId, content, senderFavorability)` | 判断是否需要 LLM 情绪推断 |

### RelationshipManager 关系管理器
| 方法 | 说明 |
|------|------|
| `getRelationshipTypes()` | 获取关系类型列表（7 种） |
| `getFavorabilityLevel(favorability)` | 获取好感度等级描述 |
| `getRelationship(db, fromId, toId)` | 获取角色间关系 |
| `getAllRelationships(db)` | 获取所有关系 |
| `setRelationship(db, fromId, toId, type, description)` | 设置角色关系 |
| `removeRelationship(db, fromId, toId)` | 删除角色关系 |
| `updateFavorability(db, senderId, receiverId, content, receiverEmotion)` | 根据消息内容更新好感度 |
| `decayInactive(db, characterId, activeCharacterIds)` | 非活跃角色好感度衰减 |

### EventTrigger 事件触发器
| 方法 | 说明 |
|------|------|
| `getEventPool(sceneType)` | 获取指定场景的事件池 |
| `getAvailableScenes()` | 获取所有可用场景列表 |
| `triggerEvent(db, groupId, eventKey, content, impact, triggeredBy)` | 触发事件 |
| `getEventSuggestions(db, groupId, sceneType, count)` | 获取推荐事件（去重） |
| `checkStaleness(db, groupId)` | 检查对话平淡度 |
| `getRecentEvents(db, groupId, limit)` | 获取最近事件 |
| `deleteEvent(db, eventId)` | 删除事件记录 |

### IPC 接口（14 个）
通过 `electron/ipc/handlers/narrative.js` 注册，详见 [electron/CLAUDE.md](../CLAUDE.md) 叙事系统部分。

---

## 关键依赖与配置

### 内部依赖
- `EmotionManager` 依赖 `character_emotions` 表
- `RelationshipManager` 依赖 `character_relationships` 表
- `EventTrigger` 依赖 `narrative_events` 表
- `NarrativePromptBuilder` 读取上述三张表构建 prompt

### 外部依赖
- `electron/utils/uuid.js`：事件 ID 生成
- `electron/utils/json-extractor.js`：LLM 情绪推断结果解析

---

## 数据模型

### character_emotions（角色情绪表）
- `character_id`: 角色 ID（主键）
- `emotion`: 当前情绪（默认 '平静'）
- `intensity`: 情绪强度 0.0~1.0
- `decay_rate`: 衰减速率（默认 0.1）
- `source`: 来源（keyword/llm/manual/event）
- `updated_at`: 更新时间

### character_relationships（角色关系表）
- `from_id` + `to_id`: 联合主键
- `type`: 关系类型
- `favorability`: 好感度 -100~100
- `description`: 关系描述
- `updated_at`: 更新时间

### narrative_events（叙事事件记录表）
- `id`: 事件 ID（主键）
- `group_id`: 群组 ID
- `event_key`: 事件标识键
- `content`: 事件内容
- `impact`: 影响情绪类型
- `event_type`: 事件类型
- `triggered_by`: 触发来源
- `created_at`: 创建时间

---

## 情绪系统详解

### 情绪更新策略

**混合模式**（关键词优先，LLM 辅助）：
1. **关键词匹配**（每次对话触发）：扫描消息内容中的情绪关键词
2. **情绪衰减**：未匹配到关键词时，情绪强度按 `decay_rate` 衰减
3. **LLM 推断**（关键节点触发）：当满足以下条件时调用 LLM 判断情绪
   - 消息中包含 @角色名 提及
   - 发送者好感度为负
   - 当前情绪强度 > 0.7
4. **情绪累积**：同种情绪被多次触发时，强度累积（上限 1.0）
5. **情绪替换**：新情绪强度超过衰减后旧情绪时，替换情绪

### 内置情绪词典（15 种）
| 情绪 | 关键词示例 | 默认强度 |
|------|-----------|---------|
| 平静 | （默认/衰减后） | 0 |
| 开心 | 哈哈、嘿嘿、太好了、棒、开心、喜欢、爱你 | 0.6 |
| 愤怒 | 闭嘴、烦死、滚、笨蛋、混蛋、气死、废物 | 0.8 |
| 尴尬 | 那个...、咳、不是、误会、其实不是 | 0.5 |
| 感动 | 谢谢、谢谢你、太感动、没想到、你真好 | 0.7 |
| 悲伤 | 难过、伤心、不想说、算了、无所谓了 | 0.6 |
| 惊讶 | 啊？、什么？、不会吧、真的假的、不可能 | 0.7 |
| 嫉妒 | 凭什么、羡慕、不公平、为什么不是我 | 0.6 |
| 疲惫 | 累了、困、无聊、不想聊了、打哈欠 | 0.4 |
| 紧张 | （LLM 推断/事件触发） | - |
| 惊慌 | （LLM 推断/事件触发） | - |
| 好奇 | （LLM 推断/事件触发） | - |
| 无奈 | （LLM 推断/事件触发） | - |
| 沮丧 | （LLM 推断/事件触发） | - |
| 焦虑 | （LLM 推断/事件触发） | - |

---

## 关系系统详解

### 预设关系类型（7 种）
| 类型 | 标签 | 默认好感度 | Prompt 提示 |
|------|------|-----------|-------------|
| friend | 朋友 | 30 | 友好、亲近、会开玩笑 |
| lover | 恋人 | 70 | 亲密、温柔、关心对方 |
| rival | 对手 | -20 | 竞争、不服气、暗中较劲 |
| mentor | 师徒 | 40 | 尊重但保持距离、偶尔严厉 |
| colleague | 同事 | 10 | 礼貌、合作、有分寸 |
| family | 家人 | 50 | 随意、亲密、说话不加修饰 |
| stranger | 陌生人 | 0 | 客气、试探、保持距离 |

### 好感度等级（6 级）
| 等级 | 范围 | 描述 | 行为提示 |
|------|------|------|---------|
| 深厚 | 70~100 | 无条件信任 | 会为对方出头 |
| 亲密 | 40~69 | 主动分享 | 会维护对方 |
| 友好 | 10~39 | 正常交流 | 偶尔关心 |
| 中立 | -10~9 | 礼貌但疏远 | - |
| 不满 | -50~-11 | 带有负面情绪 | 说话带刺 |
| 敌对 | -100~-51 | 极度厌恶 | 言辞尖锐，可能拒绝交流 |

### 互动模式（4 类）
| 模式 | 关键词 | 好感度变化范围 |
|------|--------|--------------|
| 赞美(praise) | 你说得对、谢谢你、厉害、不错、真棒、佩服 | +3~+8 |
| 批评(criticize) | 你错了、别说了、无聊、差劲、胡说 | -8~-3 |
| 分享(share) | 我觉得、我之前、告诉你、其实我 | +2~+5 |
| 共情(empathy) | 我也、同感、理解、我也是 | +2~+5 |

**特殊规则**：
- 赞美 + 愤怒状态 = 效果减半
- 批评 + 开心状态 = 效果加倍
- @角色名提及 = 好感度 +1~+3
- 非活跃角色好感度自动衰减 -1

---

## 事件系统详解

### 预设场景（7 个）
| 场景 | 事件数量 | 典型事件示例 |
|------|---------|-------------|
| office | 16 | 全员开会、消防警报、新同事、停电、裁员传闻 |
| home | 14 | 有人敲门、神秘包裹、宠物打翻东西、停电、漏水 |
| school | 14 | 突击考试、转学生、手机被没收、作弊被抓、秋游 |
| restaurant | 11 | 上错菜、明星进店、求婚、老鼠、停电、全场免单 |
| travel | 12 | 坐错车、行李丢失、绝美风景、爆胎、钱包不见 |
| party | 12 | 不速之客、霸占麦克风、打翻酒杯、停电、比舞 |
| general | 15 | 重大新闻、争吵、突然安静、大雨、地震、手机没信号 |

### 事件推荐算法
1. 获取指定场景和通用场景的所有事件
2. 查询最近 10 条已触发事件（按 event_key 去重）
3. 过滤掉已触发的事件
4. 随机打乱后返回前 N 个

### 对话平淡检测
检查最近 10 条消息，判断条件：
- 近 5 条消息平均长度 < 20 字 -> 平淡
- 近 5 条消息无 @角色名 互动 -> 平淡

---

## 余波编排详解

### 触发条件
余波在以下条件下必定触发：
1. 任何角色情绪强度 > 0.7
2. 角色回复中提及其他角色名字
3. 活跃角色间存在紧张关系（好感度 < -20）
4. 默认 60% 随机触发

### 生成流程
1. 随机选择一个非用户角色作为触发者
2. 使用该角色的 LLM 配置调用客户端
3. 构建余波 Prompt（含最近 10 条对话 + 情绪/关系上下文）
4. LLM 生成不超过 50 字的追评
5. 追评存入 messages 表（标记 `is_aftermath=1`、`message_type='aftermath'`）
6. 通过 `narrative:aftermath` 事件推送到前端

---

## 测试与质量

### 当前状态
- **无自动化测试**
- **手动测试**：通过对话流程验证情绪变化、关系更新、事件触发

### 推荐测试方案
1. **单元测试**：
   - `EmotionManager`：关键词匹配、情绪累积、情绪衰减、LLM 推断触发条件
   - `RelationshipManager`：好感度更新、互动模式匹配、情绪影响倍率
   - `EventTrigger`：事件去重、推荐算法、平淡检测
   - `NarrativePromptBuilder`：Prompt 片段生成

2. **集成测试**：
   - 完整对话流程：情绪变化 -> 关系更新 -> 事件推荐 -> 余波生成
   - 边界条件：空数据库、无角色、单一角色

---

## 相关文件清单

- `electron/narrative/engine.js`：叙事引擎主控（编排四个子系统）
- `electron/narrative/emotion-manager.js`：情绪状态机（15 种情绪，关键词+LLM 混合模式）
- `electron/narrative/relationship-manager.js`：关系图谱管理（7 种类型，6 级好感度，4 类互动）
- `electron/narrative/event-trigger.js`：事件触发系统（7 场景约 85 事件，推荐算法）
- `electron/narrative/prompt-builder.js`：叙事上下文构建（15 种语气提示）
- `electron/ipc/handlers/narrative.js`：叙事系统 IPC 处理器（14 个接口）
- `electron/ipc/channels.js`：IPC 通道常量（含叙事相关常量）
- `src/stores/narrative.js`：前端叙事状态管理
- `src/components/chat/EmotionTag.vue`：情绪标签组件（15 种情绪选择 + 强度滑块）
- `src/components/chat/RelationshipPanel.vue`：关系图谱面板（可视化 + 添加/删除）
- `src/components/chat/EventPanel.vue`：事件面板（推荐 + 触发 + 删除）
- `src/components/chat/StalenessTip.vue`：平淡提示组件

---

**文档版本**：1.0.0
**维护者**：AI 架构师（自适应版）
