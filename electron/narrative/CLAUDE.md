# 叙事引擎模块

[根目录](../../CLAUDE.md) > [electron](../CLAUDE.md) > **narrative**

> 最后更新：2026-04-18

---

## 变更记录 (Changelog)

### 2026-04-18 (v2)
- **重构**：提取共享常量到 `constants.js`，统一情绪词典、关系类型、好感度等级、互动模式、语气提示、事件-情绪映射
- **修复**：情绪衰减改为每次调用 `updateFromMessage` 时都执行（不再仅在无匹配时衰减）
- **修复**：事件 impact 映射到标准情绪词（通过 `EVENT_EMOTION_MAP` 映射表）
- **修复**：`preGenerate` 中发言角色也参与关键词情绪更新
- **修复**：好感度双向更新（A→B 更新时，B→A 同步变化，幅度减半）
- **修复**：`@角色名` 提及解析具体角色名，只更新被@角色的好感度
- **修复**：互动模式支持多模式匹配（一条消息可同时触发赞美+分享等）
- **修复**：余波字符上限统一为 50 字
- **修复**：余波触发者改为情绪强度加权选择（优先高情绪角色）
- **修复**：`_shouldTriggerAftermath` 添加空数组保护
- **修复**：手动触发事件 key 追加时间戳避免去重误判
- **修复**：Prompt 中情绪查询限定当前群组角色范围
- **修复**：余波 Prompt 只注入触发者自身情绪，减少 token 消耗
- **新增**：`removeCharacter` 方法，角色删除时清理情绪+关系数据
- **新增**：角色删除 Handler 集成叙事数据清理
- **新增**：LLM 情绪推断 Prompt 中列出可选情绪词
- **删除**：`_parseAftermath` 死代码（旧的多角色余波解析）
- **删除**：`prompt-builder.js` 中重复的 `_getFavorabilityLevel`、`_getRelationshipType` 内联实现
- **优化**：情绪更新先执行内存匹配，无匹配且无活跃情绪时跳过数据库操作
- **补充**：7 种情绪新增关键词（紧张、惊慌、好奇、无奈、沮丧、焦虑、恐慌）

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

### 共享常量
所有模块共享 `constants.js` 中的定义：
- `EMOTION_KEYWORDS`：15 种情绪关键词词典
- `RELATIONSHIP_TYPES`：7 种预设关系类型
- `FAVORABILITY_LEVELS`：6 级好感度等级
- `INTERACTION_PATTERNS`：4 类互动模式
- `EVENT_EMOTION_MAP`：事件 impact → 标准情绪映射
- `TONE_HINTS`：15 种语气提示
- `getFavorabilityLevel()`、`getRelationshipType()`、`mapEventImpactToEmotion()` 工具函数

---

## 对外接口

### NarrativeEngine 主控接口

#### 对话流程集成
| 方法 | 参数 | 说明 |
|------|------|------|
| `preGenerate(db, characterId, groupId, userContent, senderCharacterId, allCharacters)` | 数据库/角色ID/群组ID/用户内容/发送者ID/所有角色 | 对话前：更新所有角色情绪（含发言角色）+ 构建叙事上下文 |
| `postCharacterResponse(db, characterId, groupId, userContent, responseContent, allCharacters, createClientForCharacter, group, llmProfiles, apiKey)` | 数据库/角色ID/群组ID/用户内容/回复内容/所有角色/客户端创建函数/群组/Profile列表/API Key | 对话后：双向好感度更新 + LLM 情绪推断 |
| `generateAftermath(db, groupId, userContent, allResponses, allCharacters, createClientForCharacter, group, llmProfiles, apiKey)` | 数据库/群组ID/用户内容/所有回复/所有角色/客户端创建函数/群组/Profile列表/API Key | 生成余波追评（情绪加权选择触发者） |
| `removeCharacter(db, characterId)` | 数据库/角色ID | 清理角色的情绪+双向关系数据 |

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
| `updateFromMessage(db, characterId, content)` | 从消息内容更新情绪（关键词匹配，含衰减） |
| `updateFromLLM(db, characterId, emotion, intensity)` | 从 LLM 推断结果更新情绪 |
| `updateFromEvent(db, characterId, impact)` | 从事件影响更新情绪（含非标准情绪映射） |
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
| `updateFavorability(db, senderId, receiverId, content, receiverEmotion, characterNameMap)` | 根据消息内容更新好感度（双向+@解析+多模式匹配） |
| `decayInactive(db, characterId, activeCharacterIds)` | 非活跃角色好感度衰减 |

### EventTrigger 事件触发器
| 方法 | 说明 |
|------|------|
| `getEventPool(sceneType)` | 获取指定场景的事件池 |
| `getAvailableScenes()` | 获取所有可用场景列表 |
| `triggerEvent(db, groupId, eventKey, content, impact, triggeredBy)` | 触发事件（手动触发追加时间戳） |
| `getEventSuggestions(db, groupId, sceneType, count)` | 获取推荐事件（去重使用基础 key） |
| `checkStaleness(db, groupId)` | 检查对话平淡度 |
| `getRecentEvents(db, groupId, limit)` | 获取最近事件 |
| `deleteEvent(db, eventId)` | 删除事件记录 |

### IPC 接口（14 个）
通过 `electron/ipc/handlers/narrative.js` 注册，详见 [electron/CLAUDE.md](../CLAUDE.md) 叙事系统部分。

---

## 关键依赖与配置

### 内部依赖
- `constants.js`：共享常量定义（情绪词典、关系类型、好感度等级、互动模式、事件映射、语气提示）
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
- `event_key`: 事件标识键（手动触发时含时间戳后缀）
- `content`: 事件内容
- `impact`: 影响情绪类型
- `event_type`: 事件类型
- `triggered_by`: 触发来源
- `created_at`: 创建时间

---

## 情绪系统详解

### 情绪更新策略

**混合模式**（关键词优先，LLM 辅助）：
1. **关键词匹配**（每次对话触发）：扫描消息内容中的情绪关键词，**所有角色（含发言角色）**都参与更新
2. **情绪衰减**：每次 `updateFromMessage` 调用时都执行衰减计算（先衰减旧情绪，再与新匹配比较）
3. **LLM 推断**（关键节点触发）：当满足以下条件时调用 LLM 判断情绪
   - 消息中包含 @角色名 提及
   - 发送者好感度为负
   - 当前情绪强度 > 0.7
4. **情绪累积**：同种情绪被多次触发时，在衰减后强度上累积（上限 1.0）
5. **情绪替换**：新情绪强度超过衰减后旧情绪时，替换情绪
6. **数据库优化**：无匹配且无活跃情绪时跳过数据库操作

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
| 紧张 | 心跳加速、手心出汗、不安、忐忑、紧张、怎么办 | 0.6 |
| 惊慌 | 天哪、救命、快跑、别过来、不要、完了完了 | 0.8 |
| 好奇 | 为什么、怎么回事、真的吗、为什么呀、为什么呢、好想知道 | 0.5 |
| 无奈 | 算了、随便吧、没办法、无所谓、就这样吧、唉 | 0.4 |
| 沮丧 | 又失败了、没希望了、好失望、不可能了、没戏了 | 0.6 |
| 焦虑 | 来不及了、好担心、等不及了、什么时候、急死 | 0.6 |
| 恐慌 | 完蛋了、死定了、糟了、救命啊、完了 | 0.8 |

### 事件-情绪映射
事件池中使用了非标准情绪词，通过 `EVENT_EMOTION_MAP` 映射到标准情绪：
| 事件 impact | 映射到 | 示例事件 |
|-------------|--------|---------|
| 焦急 | 焦虑 | 水管漏水 |
| 窃喜 | 开心 | 老师迟到 |
| 震惊 | 惊讶 | 薪资表曝光 |
| 兴奋 | 开心 | 运动会报名 |
| 满足 | 开心 | 路边摊吃到好面 |
| 痛苦 | 悲伤 | 撞到脚趾 |
| 感慨 | 无奈 | 翻出老照片 |
| 困惑 | 好奇 | 餐厅有空位却排长队 |
| 惊喜 | 开心 | 全场免单 |
| 惊吓 | 惊慌 | 炸雷 |
| 烦躁 | 愤怒 | 邻居大声放音乐 |

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

**更新规则**：
- 一条消息可匹配多种互动模式，好感度累计计算
- A 发送消息时同时更新 A→B 和 B→A 的好感度（B→A 变化减半）
- `@角色名` 提及解析具体角色名，只影响被@的角色
- 赞美 + 愤怒状态 = 效果减半
- 批评 + 开心状态 = 效果加倍
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
2. 查询最近 10 条已触发事件
3. 提取基础 key（去掉手动触发的时间戳后缀）进行去重
4. 过滤掉已触发的事件
5. 随机打乱后返回前 N 个

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

### 触发者选择策略
1. 查询所有非用户角色的情绪强度
2. 优先选择情绪强度 >= 0.5 的角色（最高情绪 = 最有动力发表追评）
3. 情绪都低时回退到随机选择

### 生成流程
1. 选择触发者（情绪加权）
2. 使用该角色的 LLM 配置调用客户端
3. 构建余波 Prompt（含最近 10 条对话 + 仅触发者情绪/关系上下文）
4. LLM 生成不超过 50 字的追评
5. 追评存入 messages 表（标记 `is_aftermath=1`、`message_type='aftermath'`）
6. 通过 `narrative:aftermath` 事件推送到前端

---

## 角色删除清理

当角色从群组删除时，`NarrativeEngine.removeCharacter()` 自动清理：
- `character_emotions` 中该角色的情绪记录
- `character_relationships` 中该角色的双向关系记录（from_id 和 to_id 两个方向）

此清理通过 `character.js` Handler 中的 `narrativeEngine.removeCharacter(db, id)` 调用触发。

---

## 测试与质量

### 当前状态
- **无自动化测试**
- **手动测试**：通过对话流程验证情绪变化、关系更新、事件触发

### 推荐测试方案
1. **单元测试**：
   - `constants.js`：验证映射表完整性
   - `EmotionManager`：关键词匹配、情绪累积、情绪衰减（每次调用都衰减）、LLM 推断触发条件、事件情绪映射
   - `RelationshipManager`：好感度双向更新、@角色名解析、多模式匹配、情绪影响倍率
   - `EventTrigger`：事件去重（基础 key 匹配）、推荐算法、平淡检测
   - `NarrativePromptBuilder`：Prompt 片段生成、情绪查询范围限定

2. **集成测试**：
   - 完整对话流程：情绪变化 -> 关系更新 -> 事件推荐 -> 余波生成
   - 角色删除：验证叙事数据清理
   - 边界条件：空数据库、无角色、单一角色

---

## 相关文件清单

- `electron/narrative/constants.js`：**共享常量**（情绪词典、关系类型、好感度等级、互动模式、事件映射、语气提示）
- `electron/narrative/engine.js`：叙事引擎主控（编排四个子系统 + removeCharacter 清理）
- `electron/narrative/emotion-manager.js`：情绪状态机（15 种情绪，关键词+LLM 混合模式，每次调用衰减）
- `electron/narrative/relationship-manager.js`：关系图谱管理（7 种类型，6 级好感度，4 类互动，双向更新，@解析）
- `electron/narrative/event-trigger.js`：事件触发系统（7 场景约 85 事件，推荐算法，手动触发时间戳）
- `electron/narrative/prompt-builder.js`：叙事上下文构建（15 种语气提示，情绪范围限定）
- `electron/ipc/handlers/narrative.js`：叙事系统 IPC 处理器（14 个接口）
- `electron/ipc/channels.js`：IPC 通道常量（含叙事相关常量）
- `src/stores/narrative.js`：前端叙事状态管理
- `src/components/chat/EmotionTag.vue`：情绪标签组件（15 种情绪选择 + 强度滑块）
- `src/components/chat/RelationshipPanel.vue`：关系图谱面板（可视化 + 添加/删除）
- `src/components/chat/EventPanel.vue`：事件面板（推荐 + 触发 + 删除）
- `src/components/chat/StalenessTip.vue`：平淡提示组件

---

**文档版本**：2.0.0
**维护者**：AI 架构师（自适应版）
