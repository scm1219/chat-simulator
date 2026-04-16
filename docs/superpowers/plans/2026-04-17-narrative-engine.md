# 叙事引擎（Narrative Engine）实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为角色扮演聊天模拟器添加叙事引擎，包含情绪状态机、角色关系图谱、事件触发系统和余波编排机制，让 AI 角色对话更智能自然。

**Architecture:** 在 `electron/narrative/` 下新增叙事引擎模块，包含 5 个核心文件。引擎集成到现有 `llm:generate` 流程中，在每轮对话前后执行叙事逻辑。叙事状态持久化到群组数据库的新增表中，前端通过新增的 Pinia Store 和 Vue 组件展示。

**Tech Stack:** Electron 41, better-sqlite3, Vue 3 Composition API, Pinia, SCSS

---

## 文件结构总览

### 新增文件
| 文件 | 职责 |
|------|------|
| `electron/narrative/engine.js` | 叙事引擎主控，编排所有子系统 |
| `electron/narrative/emotion-manager.js` | 情绪状态机：关键词匹配 + LLM 推断 |
| `electron/narrative/relationship-manager.js` | 角色关系图谱：双向关系 + 好感度 |
| `electron/narrative/event-trigger.js` | 事件触发系统：事件池 + 推荐算法 + 平淡检测 |
| `electron/narrative/prompt-builder.js` | 将叙事状态注入 LLM prompt |
| `electron/ipc/handlers/narrative.js` | 叙事系统 IPC Handler |
| `src/stores/narrative.js` | 叙事状态 Pinia Store |
| `src/components/chat/EmotionTag.vue` | 情绪标签展示组件 |
| `src/components/chat/RelationshipPanel.vue` | 角色关系面板 |
| `src/components/chat/EventPanel.vue` | 事件选择和推荐面板 |
| `src/components/chat/StalenessTip.vue` | 对话平淡提示条 |

### 修改文件
| 文件 | 修改内容 |
|------|---------|
| `electron/database/manager.js` | SCHEMA_SQL 新增 3 张表 + runMigrations 新增字段迁移 |
| `electron/ipc/channels.js` | 新增 NARRATIVE 通道常量 |
| `electron/preload.js` | 新增 narrative API 暴露 |
| `electron/main.js` | 初始化叙事引擎 + 注册 Handler |
| `electron/ipc/handlers/llm.js` | buildContextMessages 注入叙事上下文 + 回复后更新叙事状态 |
| `src/stores/messages.js` | 监听余波消息事件 |
| `src/components/chat/CharacterPanel.vue` | 显示情绪标签 + 关系面板入口 |
| `src/components/chat/ChatWindow.vue` | 集成事件按钮 + 平淡提示 + 余波消息样式 |
| `src/components/config/GroupSettingsDialog.vue` | 新增叙事配置项 |

---

## Task 1: 数据库层 — 叙事表结构与迁移

**Files:**
- Modify: `electron/database/manager.js`

- [ ] **Step 1: 在 SCHEMA_SQL 中新增三张叙事表**

在 `electron/database/manager.js` 的 `SCHEMA_SQL` 常量末尾（现有 `messages` 表之后）追加：

```sql
-- 角色情绪表
CREATE TABLE IF NOT EXISTS character_emotions (
  character_id TEXT PRIMARY KEY,
  emotion TEXT NOT NULL DEFAULT '平静',
  intensity REAL NOT NULL DEFAULT 0.0,
  decay_rate REAL NOT NULL DEFAULT 0.1,
  source TEXT NOT NULL DEFAULT 'keyword',
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- 角色关系表
CREATE TABLE IF NOT EXISTS character_relationships (
  from_id TEXT NOT NULL,
  to_id TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'stranger',
  favorability INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  PRIMARY KEY (from_id, to_id),
  FOREIGN KEY (from_id) REFERENCES characters(id) ON DELETE CASCADE,
  FOREIGN KEY (to_id) REFERENCES characters(id) ON DELETE CASCADE
);

-- 叙事事件记录表
CREATE TABLE IF NOT EXISTS narrative_events (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  event_key TEXT NOT NULL,
  content TEXT NOT NULL,
  impact TEXT,
  event_type TEXT NOT NULL DEFAULT 'user_triggered',
  triggered_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);
```

- [ ] **Step 2: 在 runMigrations() 中添加 groups 表新字段迁移**

在 `runMigrations(db, groupId)` 函数末尾追加以下迁移逻辑：

```javascript
// --- 叙事引擎相关迁移 ---

// 添加 narrative_enabled 字段
const groupsTableInfo = db.pragma('table_info(groups)')
const hasNarrativeEnabled = groupsTableInfo.some(col => col.name === 'narrative_enabled')
if (!hasNarrativeEnabled) {
  db.exec('ALTER TABLE groups ADD COLUMN narrative_enabled INTEGER NOT NULL DEFAULT 1')
}

// 添加 aftermath_enabled 字段
const hasAftermathEnabled = groupsTableInfo.some(col => col.name === 'aftermath_enabled')
if (!hasAftermathEnabled) {
  db.exec('ALTER TABLE groups ADD COLUMN aftermath_enabled INTEGER NOT NULL DEFAULT 1')
}

// 添加 event_scene_type 字段
const hasEventSceneType = groupsTableInfo.some(col => col.name === 'event_scene_type')
if (!hasEventSceneType) {
  db.exec("ALTER TABLE groups ADD COLUMN event_scene_type TEXT DEFAULT 'general'")
}
```

- [ ] **Step 3: 验证迁移**

启动开发模式 `npm run dev`，创建新群组，检查数据库中三张新表和 groups 表新字段是否正确创建。对已有群组，验证迁移字段是否自动添加。

---

## Task 2: 情绪管理器（EmotionManager）

**Files:**
- Create: `electron/narrative/emotion-manager.js`

- [ ] **Step 1: 创建 EmotionManager 类**

```javascript
/**
 * 角色情绪管理器
 * 混合模式：关键词规则快速判断 + LLM 关键节点推断
 */

// 内置情绪词典
const DEFAULT_EMOTION_KEYWORDS = {
  '开心':   { words: ['哈哈', '嘿嘿', '太好了', '棒', '开心', '喜欢', '爱你'], intensity: 0.6 },
  '愤怒':   { words: ['闭嘴', '烦死', '滚', '笨蛋', '混蛋', '气死', '废物'], intensity: 0.8 },
  '尴尬':   { words: ['那个...', '咳', '不是', '误会', '其实不是'], intensity: 0.5 },
  '感动':   { words: ['谢谢', '谢谢你', '太感动', '没想到', '你真好'], intensity: 0.7 },
  '悲伤':   { words: ['难过', '伤心', '不想说', '算了', '无所谓了'], intensity: 0.6 },
  '惊讶':   { words: ['啊？', '什么？', '不会吧', '真的假的', '不可能'], intensity: 0.7 },
  '嫉妒':   { words: ['凭什么', '羡慕', '不公平', '为什么不是我'], intensity: 0.6 },
  '疲惫':   { words: ['累了', '困', '无聊', '不想聊了', '打哈欠'], intensity: 0.4 }
}

export class EmotionManager {
  constructor() {
    this.keywords = { ...DEFAULT_EMOTION_KEYWORDS }
  }

  /**
   * 从消息内容中通过关键词匹配推断情绪
   * @param {string} content - 消息内容
   * @returns {{ emotion: string|null, intensity: number }}
   */
  matchFromContent(content) {
    if (!content) return { emotion: null, intensity: 0 }

    let bestMatch = null
    let bestScore = 0

    for (const [emotion, config] of Object.entries(this.keywords)) {
      for (const word of config.words) {
        if (content.includes(word)) {
          // 同一消息中多次匹配同一情绪，强度叠加
          const count = (content.match(new RegExp(escapeRegExp(word), 'g')) || []).length
          const score = config.intensity * Math.min(count, 3) / 1
          if (score > bestScore) {
            bestScore = score
            bestMatch = { emotion, intensity: Math.min(score, 1.0) }
          }
        }
      }
    }

    return bestMatch || { emotion: null, intensity: 0 }
  }

  /**
   * 更新角色情绪（基于关键词匹配）
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 角色 ID
   * @param {string} content - 收到的消息内容
   * @returns {{ emotion: string, intensity: number, changed: boolean }}
   */
  updateFromMessage(db, characterId, content) {
    const current = this.getEmotion(db, characterId)
    const match = this.matchFromContent(content)

    if (!match.emotion) {
      // 无匹配：当前情绪自然衰减
      if (current.intensity > 0) {
        const newIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))
        if (newIntensity < 0.1) {
          this._saveEmotion(db, characterId, '平静', 0, 'keyword')
          return { emotion: '平静', intensity: 0, changed: true }
        }
        this._saveEmotion(db, characterId, current.emotion, newIntensity, current.source)
        return { emotion: current.emotion, intensity: newIntensity, changed: true }
      }
      return { ...current, changed: false }
    }

    // 有匹配
    if (match.emotion === current.emotion) {
      // 同情绪：强度叠加
      const newIntensity = Math.min(1.0, current.intensity + match.intensity * 0.5)
      this._saveEmotion(db, characterId, match.emotion, newIntensity, 'keyword')
      return { emotion: match.emotion, intensity: newIntensity, changed: true }
    } else {
      // 不同情绪：当前衰减后替换
      const decayedIntensity = Math.max(0, current.intensity - (current.decay_rate || 0.1))
      if (match.intensity > decayedIntensity) {
        this._saveEmotion(db, characterId, match.emotion, match.intensity, 'keyword')
        return { emotion: match.emotion, intensity: match.intensity, changed: true }
      }
      return { ...current, changed: false }
    }
  }

  /**
   * 通过 LLM 推断结果更新角色情绪
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 角色 ID
   * @param {string} emotion - LLM 返回的情绪标签
   * @param {number} intensity - 情绪强度 0-1
   */
  updateFromLLM(db, characterId, emotion, intensity) {
    if (!emotion || typeof intensity !== 'number') return
    this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'llm')
  }

  /**
   * 通过事件更新角色情绪
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 角色 ID
   * @param {string} impact - 事件影响标签（如"惊讶""紧张"）
   */
  updateFromEvent(db, characterId, impact) {
    if (!impact) return
    const config = this.keywords[impact]
    const intensity = config ? config.intensity * 0.8 : 0.6
    this._saveEmotion(db, characterId, impact, intensity, 'event')
  }

  /**
   * 获取角色当前情绪
   */
  getEmotion(db, characterId) {
    const row = db.prepare('SELECT * FROM character_emotions WHERE character_id = ?').get(characterId)
    return row
      ? { emotion: row.emotion, intensity: row.intensity, decay_rate: row.decay_rate, source: row.source }
      : { emotion: '平静', intensity: 0, decay_rate: 0.1, source: 'keyword' }
  }

  /**
   * 获取群内所有角色的当前情绪
   */
  getAllEmotions(db) {
    return db.prepare('SELECT * FROM character_emotions').all()
  }

  /**
   * 手动设置角色情绪（调试用）
   */
  setEmotion(db, characterId, emotion, intensity) {
    this._saveEmotion(db, characterId, emotion, Math.min(1, Math.max(0, intensity)), 'manual')
  }

  /**
   * 检查是否应该触发 LLM 情绪推断
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 角色 ID
   * @param {string} content - 消息内容
   * @param {number|null} senderFavorability - 发送者对该角色的好感度
   * @returns {boolean}
   */
  shouldInferFromLLM(db, characterId, content, senderFavorability = null) {
    // 被 @ 了
    const atMatch = content.match(new RegExp(`@[^\\s\\u3000]+`))
    if (atMatch) return true

    // 来自好感度 < 0 的角色
    if (senderFavorability !== null && senderFavorability < 0) return true

    // 连续 3 轮情绪无变化（需要查历史，此处简化为随机 20%）
    const emotion = this.getEmotion(db, characterId)
    if (emotion.intensity > 0.7) return true

    return false
  }

  // 内部方法
  _saveEmotion(db, characterId, emotion, intensity, source) {
    db.prepare(`
      INSERT INTO character_emotions (character_id, emotion, intensity, decay_rate, source, updated_at)
      VALUES (?, ?, ?, 0.1, ?, datetime('now', 'localtime'))
      ON CONFLICT(character_id) DO UPDATE SET
        emotion = excluded.emotion,
        intensity = excluded.intensity,
        source = excluded.source,
        updated_at = excluded.updated_at
    `).run(characterId, emotion, intensity, source)
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
```

- [ ] **Step 2: 验证模块可导入**

在 `electron/main.js` 中临时添加导入验证（后续 Task 会正式集成）：

```javascript
const { EmotionManager } = await import('./narrative/emotion-manager.js')
console.log('[Narrative] EmotionManager loaded')
```

启动 `npm run dev`，确认控制台输出 `[Narrative] EmotionManager loaded`，无报错。然后移除临时导入。

---

## Task 3: 关系管理器（RelationshipManager）

**Files:**
- Create: `electron/narrative/relationship-manager.js`

- [ ] **Step 1: 创建 RelationshipManager 类**

```javascript
/**
 * 角色关系管理器
 * 双向动态关系 + 好感度系统
 */

const DEFAULT_RELATIONSHIP_TYPES = {
  friend:    { label: '朋友',   defaultFavor: 30,  promptHint: '友好、亲近、会开玩笑' },
  lover:     { label: '恋人',   defaultFavor: 70,  promptHint: '亲密、温柔、关心对方' },
  rival:     { label: '对手',   defaultFavor: -20, promptHint: '竞争、不服气、暗中较劲' },
  mentor:    { label: '师徒',   defaultFavor: 40,  promptHint: '尊重但保持距离、偶尔严厉' },
  colleague: { label: '同事',   defaultFavor: 10,  promptHint: '礼貌、合作、有分寸' },
  family:    { label: '家人',   defaultFavor: 50,  promptHint: '随意、亲密、说话不加修饰' },
  stranger:  { label: '陌生人', defaultFavor: 0,   promptHint: '客气、试探、保持距离' }
}

// 好感度 → 行为描述
const FAVORABILITY_LEVELS = [
  { min: 70,  max: 100, label: '深厚', hint: '无条件信任，会为对方出头' },
  { min: 40,  max: 69,  label: '亲密', hint: '主动分享，会维护对方' },
  { min: 10,  max: 39,  label: '友好', hint: '正常交流，偶尔关心' },
  { min: -10, max: 9,   label: '中立', hint: '礼貌但疏远' },
  { min: -50, max: -11, label: '不满', hint: '带有负面情绪，说话带刺' },
  { min: -100, max: -51, label: '敌对', hint: '极度厌恶，言辞尖锐，可能拒绝交流' }
]

// 互动关键词 → 好感度影响
const INTERACTION_PATTERNS = [
  { type: 'praise',    words: ['你说得对', '谢谢你', '厉害', '不错', '真棒', '佩服'], range: [3, 8] },
  { type: 'criticize', words: ['你错了', '别说了', '无聊', '差劲', '胡说'], range: [-8, -3] },
  { type: 'share',     words: ['我觉得', '我之前', '告诉你', '其实我'], range: [2, 5] },
  { type: 'empathy',   words: ['我也', '同感', '理解', '我也是'], range: [2, 5] }
]

export class RelationshipManager {
  constructor() {
    this.types = { ...DEFAULT_RELATIONSHIP_TYPES }
  }

  /**
   * 获取关系类型配置
   */
  getRelationshipTypes() {
    return this.types
  }

  /**
   * 获取好感度等级描述
   */
  getFavorabilityLevel(favorability) {
    return FAVORABILITY_LEVELS.find(l => favorability >= l.min && favorability <= l.max) || FAVORABILITY_LEVELS[3]
  }

  /**
   * 设置角色关系
   */
  setRelationship(db, fromId, toId, type, description = '') {
    const config = this.types[type] || this.types.stranger
    db.prepare(`
      INSERT INTO character_relationships (from_id, to_id, type, favorability, description, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', 'localtime'))
      ON CONFLICT(from_id, to_id) DO UPDATE SET
        type = excluded.type,
        description = excluded.description,
        updated_at = excluded.updated_at
    `).run(fromId, toId, type, description || config.promptHint)

    return this.getRelationship(db, fromId, toId)
  }

  /**
   * 获取两个角色之间的关系
   */
  getRelationship(db, fromId, toId) {
    return db.prepare('SELECT * FROM character_relationships WHERE from_id = ? AND to_id = ?').get(fromId, toId)
  }

  /**
   * 获取群内所有角色关系
   */
  getAllRelationships(db) {
    return db.prepare('SELECT * FROM character_relationships').all()
  }

  /**
   * 删除角色关系
   */
  removeRelationship(db, fromId, toId) {
    db.prepare('DELETE FROM character_relationships WHERE from_id = ? AND to_id = ?').run(fromId, toId)
  }

  /**
   * 根据消息内容更新好感度
   * @param {object} db - 群组数据库连接
   * @param {string} senderId - 发送者角色 ID
   * @param {string} receiverId - 接收者角色 ID
   * @param {string} content - 消息内容
   * @param {{ emotion: string, intensity: number }} receiverEmotion - 接收者当前情绪
   * @returns {{ favorability: number, change: number, reason: string }}
   */
  updateFavorability(db, senderId, receiverId, content, receiverEmotion = null) {
    let totalChange = 0
    let reason = ''

    // 匹配互动关键词
    for (const pattern of INTERACTION_PATTERNS) {
      for (const word of pattern.words) {
        if (content.includes(word)) {
          let [minChange, maxChange] = pattern.range
          const change = minChange + Math.floor(Math.random() * (maxChange - minChange + 1))

          // 情绪调节：愤怒时被夸赞效果减半，开心时被批评效果加倍
          if (receiverEmotion) {
            if (pattern.type === 'praise' && receiverEmotion.emotion === '愤怒') {
              reason = `${receiverEmotion.emotion}状态下被夸赞，效果减半`
              totalChange += Math.floor(change * 0.5)
            } else if (pattern.type === 'criticize' && receiverEmotion.emotion === '开心') {
              reason = `${receiverEmotion.emotion}状态下被批评，效果加倍`
              totalChange += change * 2
            } else {
              totalChange += change
            }
          } else {
            totalChange += change
          }

          reason = reason || `消息中包含"${word}"`
          break
        }
      }
      if (totalChange !== 0) break
    }

    // 被点名互动
    if (totalChange === 0) {
      const atMatch = content.match(new RegExp(`@[^\\s\\u3000]+`))
      if (atMatch) {
        totalChange = 1 + Math.floor(Math.random() * 3)
        reason = '被点名互动'
      }
    }

    if (totalChange === 0) return { favorability: 0, change: 0, reason: '' }

    // 更新数据库
    const existing = this.getRelationship(db, senderId, receiverId)
    const currentFavor = existing ? existing.favorability : 0
    const newFavor = Math.max(-100, Math.min(100, currentFavor + totalChange))

    if (existing) {
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, senderId, receiverId)
    } else {
      // 自动创建 stranger 类型关系
      this.setRelationship(db, senderId, receiverId, 'stranger', '')
      db.prepare(`
        UPDATE character_relationships SET favorability = ?, updated_at = datetime('now', 'localtime')
        WHERE from_id = ? AND to_id = ?
      `).run(newFavor, senderId, receiverId)
    }

    return { favorability: newFavor, change: totalChange, reason }
  }

  /**
   * 长时间未互动的好感度衰减
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 角色 ID
   * @param {string[]} activeCharacterIds - 本轮发言的角色 ID 列表
   */
  decayInactive(db, characterId, activeCharacterIds) {
    const relationships = db.prepare(
      'SELECT * FROM character_relationships WHERE from_id = ?'
    ).all(characterId)

    for (const rel of relationships) {
      if (!activeCharacterIds.includes(rel.to_id)) {
        db.prepare(`
          UPDATE character_relationships SET favorability = MAX(-100, favorability - 1), updated_at = datetime('now', 'localtime')
          WHERE from_id = ? AND to_id = ?
        `).run(characterId, rel.to_id)
      }
    }
  }
}
```

- [ ] **Step 2: 验证模块可导入**

同 Task 2 方式，临时导入验证无报错后移除。

---

## Task 4: 事件触发系统（EventTrigger）

**Files:**
- Create: `electron/narrative/event-trigger.js`

- [ ] **Step 1: 创建 EventTrigger 类**

```javascript
/**
 * 事件触发系统
 * 预设事件池 + 推荐算法 + 对话平淡检测
 */

import { generateUUID } from '../utils/uuid.js'

const DEFAULT_EVENT_POOL = {
  office: [
    { key: 'meeting_called', content: '老板突然通知全员开会', impact: '紧张' },
    { key: 'fire_alarm', content: '消防警报突然响了', impact: '惊慌' },
    { key: 'new_colleague', content: '部门来了一个新同事', impact: '好奇' },
    { key: 'power_outage', content: '办公室突然停电了', impact: '惊讶' },
    { key: 'deadline_reminder', content: '收到提醒：项目截止日期就在明天', impact: '焦虑' }
  ],
  home: [
    { key: 'door_knock', content: '有人敲门', impact: '好奇' },
    { key: 'package_arrived', content: '快递到了一个神秘包裹', impact: '好奇' },
    { key: 'pet_mischief', content: '宠物把东西打翻了', impact: '无奈' },
    { key: 'phone_rings', content: '一个陌生号码打来电话', impact: '紧张' }
  ],
  school: [
    { key: 'exam_announced', content: '老师宣布明天突击考试', impact: '恐慌' },
    { key: 'transfer_student', content: '班上来了一个转学生', impact: '好奇' },
    { key: 'confiscated', content: '手机被老师没收了', impact: '沮丧' }
  ],
  general: [
    { key: 'breaking_news', content: '手机弹窗推送了一条重大新闻', impact: '惊讶' },
    { key: 'heated_argument', content: '两个人突然吵了起来', impact: '紧张' },
    { key: 'sudden_silence', content: '所有人突然安静了下来', impact: '尴尬' },
    { key: 'rain_start', content: '窗外突然下起了大雨', impact: '平静' }
  ]
}

export class EventTrigger {
  constructor() {
    this.eventPool = { ...DEFAULT_EVENT_POOL }
  }

  /**
   * 获取事件池（按场景筛选）
   */
  getEventPool(sceneType = 'general') {
    const sceneEvents = this.eventPool[sceneType] || []
    const generalEvents = this.eventPool.general || []
    // 合并场景事件和通用事件，去重
    const allKeys = new Set([...sceneEvents.map(e => e.key), ...generalEvents.map(e => e.key)])
    const allEvents = {}
    for (const key of allKeys) {
      const found = sceneEvents.find(e => e.key === key) || generalEvents.find(e => e.key === key)
      if (found) allEvents[key] = found
    }
    return Object.values(allEvents)
  }

  /**
   * 获取所有可用场景
   */
  getAvailableScenes() {
    return Object.keys(this.eventPool)
  }

  /**
   * 手动触发事件
   */
  triggerEvent(db, groupId, eventKey, content, impact, eventSceneType, triggeredBy = 'user') {
    const id = generateUUID()
    db.prepare(`
      INSERT INTO narrative_events (id, group_id, event_key, content, impact, event_type, triggered_by, created_at)
      VALUES (?, ?, ?, ?, ?, 'user_triggered', ?, datetime('now', 'localtime'))
    `).run(id, groupId, eventKey, content, impact, triggeredBy)

    return { id, eventKey, content, impact, eventType: 'user_triggered', triggeredBy }
  }

  /**
   * 获取系统推荐事件
   * @param {object} db - 群组数据库连接
   * @param {string} groupId - 群组 ID
   * @param {string} sceneType - 场景类型
   * @param {number} count - 推荐数量
   * @returns {Array} 推荐事件列表
   */
  getEventSuggestions(db, groupId, sceneType, count = 3) {
    const allEvents = this.getEventPool(sceneType)

    // 获取最近使用的事件（避免重复推荐）
    const recentEvents = db.prepare(`
      SELECT event_key FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(groupId)
    const recentKeys = new Set(recentEvents.map(e => e.event_key))

    // 过滤掉最近使用的事件，随机选取
    const available = allEvents.filter(e => !recentKeys.has(e.key))
    const shuffled = available.sort(() => Math.random() - 0.5)
    return shuffled.slice(0, count)
  }

  /**
   * 检测对话是否平淡
   * @param {object} db - 群组数据库连接
   * @param {string} groupId - 群组 ID
   * @returns {{ stale: boolean, reason: string|null }}
   */
  checkStaleness(db, groupId) {
    // 获取最近 10 条非系统消息
    const recentMessages = db.prepare(`
      SELECT content FROM messages
      WHERE group_id = ? AND role IN ('user', 'assistant')
      ORDER BY timestamp DESC LIMIT 10
    `).all(groupId)

    if (recentMessages.length < 5) return { stale: false, reason: null }

    // 检测 1: 连续 5 轮消息平均长度 < 20 字
    const avgLength = recentMessages.slice(0, 5).reduce((sum, m) => sum + (m.content?.length || 0), 0) / 5
    if (avgLength < 20) {
      return { stale: true, reason: '对话内容较短，可能趋于平淡' }
    }

    // 检测 2: 检查最近 5 条消息是否有 @ 互动
    const hasAtInteraction = recentMessages.slice(0, 5).some(m => /@[^\\s\\u3000]+/.test(m.content || ''))
    if (!hasAtInteraction) {
      return { stale: true, reason: '近期没有角色间互动' }
    }

    return { stale: false, reason: null }
  }

  /**
   * 获取最近事件记录
   */
  getRecentEvents(db, groupId, limit = 10) {
    return db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ? ORDER BY created_at DESC LIMIT ?
    `).all(groupId, limit)
  }
}
```

- [ ] **Step 2: 验证模块可导入**

---

## Task 5: Prompt 构建器（NarrativePromptBuilder）

**Files:**
- Create: `electron/narrative/prompt-builder.js`

- [ ] **Step 1: 创建 NarrativePromptBuilder 类**

```javascript
/**
 * 叙事上下文 Prompt 构建器
 * 将情绪、关系、事件状态注入 LLM system prompt
 */

export class NarrativePromptBuilder {

  /**
   * 构建叙事上下文 system 消息列表
   * @param {object} db - 群组数据库连接
   * @param {string} characterId - 当前回复的角色 ID
   * @param {string} groupId - 群组 ID
   * @param {Array} allCharacters - 所有启用角色列表
   * @returns {Array<{ role: string, content: string }>}
   */
  buildNarrativeContext(db, characterId, groupId, allCharacters) {
    const contextMessages = []

    // 1. 角色情绪状态
    const emotionSection = this._buildEmotionSection(db, allCharacters)
    if (emotionSection) {
      contextMessages.push({ role: 'system', content: emotionSection })
    }

    // 2. 角色关系（只注入与当前角色相关的关系）
    const relationshipSection = this._buildRelationshipSection(db, characterId, allCharacters)
    if (relationshipSection) {
      contextMessages.push({ role: 'system', content: relationshipSection })
    }

    // 3. 当前活跃事件
    const eventSection = this._buildEventSection(db, groupId)
    if (eventSection) {
      contextMessages.push({ role: 'system', content: eventSection })
    }

    return contextMessages
  }

  /**
   * 构建余波（Aftermath）prompt
   */
  buildAftermathPrompt(db, groupId, allCharacters, recentMessages) {
    const emotionSection = this._buildEmotionSection(db, allCharacters)
    const relationshipSection = this._buildRelationshipSectionForAll(db, allCharacters)
    const recentChat = recentMessages.slice(-10).map(m => {
      const prefix = m.role === 'assistant' ? (m.character_name || '角色') : '用户'
      return `${prefix}：${m.content}`
    }).join('\n')

    return `基于以上对话，请生成 1-3 条角色间的简短追评或互动。
要求：
- 只写角色之间的互动，不要回应用户
- 每条不超过 50 字
- 角色语气需符合当前情绪和关系
- 不是每个角色都要发言，只写自然会有反应的角色
- 输出格式：角色名：内容

${emotionSection ? emotionSection + '\n' : ''}${relationshipSection ? relationshipSection + '\n' : ''}
最近对话：
${recentChat}`
  }

  // --- 内部方法 ---

  _buildEmotionSection(db, allCharacters) {
    const emotions = db.prepare('SELECT * FROM character_emotions WHERE intensity > 0.1').all()
    if (emotions.length === 0) return ''

    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = emotions.map(e => {
      const name = characterMap.get(e.character_id) || '未知角色'
      const toneHint = this._getToneHint(e.emotion)
      return `- ${name}（当前情绪：${e.emotion} ${e.intensity.toFixed(1)}）— ${toneHint}`
    })

    return `【角色情绪状态】\n${lines.join('\n')}`
  }

  _buildRelationshipSection(db, characterId, allCharacters) {
    const relationships = db.prepare(
      'SELECT * FROM character_relationships WHERE from_id = ?'
    ).all(characterId)

    if (relationships.length === 0) return ''

    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = relationships.map(r => {
      const toName = characterMap.get(r.to_id) || '未知角色'
      const level = this._getFavorabilityLevel(r.favorability)
      const typeConfig = this._getRelationshipType(r.type)
      return `- ${characterMap.get(characterId) || '你'} → ${toName}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）— ${level.hint}`
    })

    return `【角色关系】\n${lines.join('\n')}`
  }

  _buildRelationshipSectionForAll(db, allCharacters) {
    const relationships = db.prepare('SELECT * FROM character_relationships').all()
    if (relationships.length === 0) return ''

    const characterMap = new Map(allCharacters.map(c => [c.id, c.name]))
    const lines = relationships.map(r => {
      const fromName = characterMap.get(r.from_id) || '未知'
      const toName = characterMap.get(r.to_id) || '未知'
      const level = this._getFavorabilityLevel(r.favorability)
      const typeConfig = this._getRelationshipType(r.type)
      return `- ${fromName} → ${toName}：${typeConfig.label}（好感度 ${r.favorability}，${level.label}）`
    })

    return `【角色关系】\n${lines.join('\n')}`
  }

  _buildEventSection(db, groupId) {
    // 获取最近 1 小时内的事件
    const events = db.prepare(`
      SELECT * FROM narrative_events WHERE group_id = ?
      AND datetime(created_at) > datetime('now', 'localtime', '-1 hour')
      ORDER BY created_at DESC LIMIT 3
    `).all(groupId)

    if (events.length === 0) return ''

    const lines = events.map(e => `[${e.event_type === 'user_triggered' ? '事件' : '自动事件'}] ${e.content}`)
    return `【当前事件】\n${lines.join('\n')}\n（请根据自己的人设、情绪和关系做出反应）`
  }

  _getToneHint(emotion) {
    const hints = {
      '开心': '请用轻快、主动的语气回复',
      '愤怒': '请用带有攻击性、不耐烦的语气回复',
      '尴尬': '请用支支吾吾、回避的语气回复',
      '感动': '请用真诚、柔和的语气回复',
      '悲伤': '请用低沉、沉默的语气回复',
      '惊讶': '请用激动、急促的语气回复',
      '嫉妒': '请用酸溜溜、阴阳怪气的语气回复',
      '疲惫': '请用懒散、敷衍的语气回复',
      '紧张': '请用不安、焦急的语气回复',
      '惊慌': '请用慌乱、急切的语气回复',
      '恐慌': '请用极度不安的语气回复',
      '好奇': '请用好奇、期待的语气回复',
      '无奈': '请用叹气、妥协的语气回复',
      '沮丧': '请用低落、消极的语气回复',
      '焦虑': '请用急躁、担忧的语气回复'
    }
    return hints[emotion] || '请根据情绪调整语气'
  }

  _getFavorabilityLevel(favorability) {
    if (favorability >= 70) return { label: '深厚', hint: '无条件信任，会为对方出头' }
    if (favorability >= 40) return { label: '亲密', hint: '主动分享，会维护对方' }
    if (favorability >= 10) return { label: '友好', hint: '正常交流，偶尔关心' }
    if (favorability >= -10) return { label: '中立', hint: '礼貌但疏远' }
    if (favorability >= -50) return { label: '不满', hint: '带有负面情绪，说话带刺' }
    return { label: '敌对', hint: '极度厌恶，言辞尖锐，可能拒绝交流' }
  }

  _getRelationshipType(type) {
    const types = {
      friend: { label: '朋友' }, lover: { label: '恋人' }, rival: { label: '对手' },
      mentor: { label: '师徒' }, colleague: { label: '同事' }, family: { label: '家人' },
      stranger: { label: '陌生人' }
    }
    return types[type] || { label: type || '陌生人' }
  }
}
```

- [ ] **Step 2: 验证模块可导入**

---

## Task 6: 叙事引擎主控（NarrativeEngine）

**Files:**
- Create: `electron/narrative/engine.js`

- [ ] **Step 1: 创建 NarrativeEngine 类**

```javascript
/**
 * 叙事引擎主控
 * 编排情绪、关系、事件三个子系统，集成到 LLM 对话流程
 */

import { EmotionManager } from './emotion-manager.js'
import { RelationshipManager } from './relationship-manager.js'
import { EventTrigger } from './event-trigger.js'
import { NarrativePromptBuilder } from './prompt-builder.js'
import { extractJSON } from '../utils/json-extractor.js'
import { generateUUID } from '../utils/uuid.js'

export class NarrativeEngine {
  constructor() {
    this.emotion = new EmotionManager()
    this.relationship = new RelationshipManager()
    this.eventTrigger = new EventTrigger()
    this.promptBuilder = new NarrativePromptBuilder()
  }

  /**
   * 对话前：更新情绪 + 构建叙事上下文
   * 在 buildContextMessages 中调用，返回要注入的 system 消息
   */
  preGenerate(db, characterId, groupId, userContent, senderCharacterId, allCharacters) {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
    if (!group || group.narrative_enabled !== 1) return []

    // 1. 关键词快速判断情绪更新（针对所有角色）
    for (const char of allCharacters) {
      if (char.id === characterId) continue // 当前角色不根据用户消息更新
      this.emotion.updateFromMessage(db, char.id, userContent)
    }

    // 2. 构建叙事上下文
    return this.promptBuilder.buildNarrativeContext(db, characterId, groupId, allCharacters)
  }

  /**
   * 对话后：LLM 情绪推断 + 好感度更新 + 余波编排
   * 在每个角色回复完成后调用
   */
  async postCharacterResponse(db, characterId, groupId, userContent, responseContent, allCharacters, createClientForCharacter, group, llmProfiles, apiKey) {
    const group = db.prepare('SELECT * FROM groups WHERE id = ?').get(groupId)
    if (!group || group.narrative_enabled !== 1) return { aftermath: null }

    // 1. 好感度更新
    for (const char of allCharacters) {
      if (char.id === characterId) continue
      const emotion = this.emotion.getEmotion(db, char.id)
      const result = this.relationship.updateFavorability(db, characterId, char.id, responseContent, emotion)
      if (result.change !== 0) {
        console.log(`[Narrative] 好感度变化: ${characterId} → ${char.id} (${result.reason}) ${result.change > 0 ? '+' : ''}${result.change}`)
      }
    }

    // 2. LLM 情绪推断（关键节点）
    const shouldInfer = this.emotion.shouldInferFromLLM(db, characterId, userContent)
    if (shouldInfer) {
      try {
        const { client } = createClientForCharacter(
          allCharacters.find(c => c.id === characterId),
          group, llmProfiles, apiKey
        )
        const inferMessages = [
          {
            role: 'system',
            content: '根据以下对话片段，判断角色当前的情绪。返回 JSON：{"emotion":"情绪词","intensity":0.0-1.0}。只返回 JSON，不要其他内容。'
          },
          {
            role: 'user',
            content: `用户说：${userContent}\n角色回复：${responseContent}`
          }
        ]
        const inferResult = await client.chat(inferMessages, {
          maxTokens: 100,
          thinkingEnabled: false,
          responseFormat: { type: 'json_object' }
        })
        if (inferResult.success && inferResult.content) {
          const parsed = extractJSON(inferResult.content)
          if (parsed.success && parsed.data) {
            this.emotion.updateFromLLM(db, characterId, parsed.data.emotion, parsed.data.intensity)
          }
        }
      } catch (err) {
        console.error('[Narrative] LLM 情绪推断失败，降级为关键词规则:', err.message)
      }
    }

    return { aftermath: null } // 余波在所有角色回复完成后统一编排
  }

  /**
   * 所有角色回复完成后：余波编排
   */
  async generateAftermath(db, groupId, userContent, allResponses, allCharacters, createClientForCharacter, group, llmProfiles, apiKey, event) {
    if (!group || group.narrative_enabled !== 1 || group.aftermath_enabled !== 1) return []

    // 判断是否触发余波
    if (!this._shouldTriggerAftermath(allResponses, allCharacters, db, groupId)) return []

    try {
      const { client } = createClientForCharacter(
        allCharacters[0], group, llmProfiles, apiKey
      )

      // 获取最近消息用于上下文
      const recentMessages = db.prepare(`
        SELECT * FROM messages WHERE group_id = ? ORDER BY timestamp DESC LIMIT 20
      `).all(groupId).reverse()

      const prompt = this.promptBuilder.buildAftermathPrompt(db, groupId, allCharacters, recentMessages)

      const result = await client.chat(
        [{ role: 'user', content: prompt }],
        { maxTokens: 300, thinkingEnabled: false }
      )

      if (!result.success || !result.content) return []

      // 解析余波消息
      const aftermathMessages = this._parseAftermath(result.content, allCharacters, db, groupId)
      return aftermathMessages
    } catch (err) {
      console.error('[Narrative] 余波生成失败:', err.message)
      return []
    }
  }

  /**
   * 检测对话平淡度
   */
  checkStaleness(db, groupId) {
    return this.eventTrigger.checkStaleness(db, groupId)
  }

  /**
   * 获取事件推荐
   */
  getEventSuggestions(db, groupId, sceneType, count = 3) {
    return this.eventTrigger.getEventSuggestions(db, groupId, sceneType, count)
  }

  /**
   * 触发事件
   */
  triggerEvent(db, groupId, eventKey, content, impact, triggeredBy = 'user') {
    return this.eventTrigger.triggerEvent(db, groupId, eventKey, content, impact, triggeredBy)
  }

  /**
   * 判断是否应触发余波
   */
  _shouldTriggerAftermath(responses, allCharacters, db, groupId) {
    // 随机 20% 概率触发
    if (Math.random() < 0.2) return true

    // 某角色情绪强度 > 0.7
    const highEmotions = db.prepare(
      'SELECT COUNT(*) as count FROM character_emotions WHERE intensity > 0.7'
    ).get()
    if (highEmotions.count > 0) return true

    // 某角色回复中提到了其他角色
    const characterNames = allCharacters.map(c => c.name)
    for (const resp of responses) {
      if (!resp.success || !resp.content) continue
      for (const name of characterNames) {
        if (resp.content.includes(name) && resp.characterName !== name) return true
      }
    }

    // 有不满关系（好感度 < -20）的角色参与了对话
    const activeIds = responses.filter(r => r.success).map(r => r.characterId)
    if (activeIds.length > 0) {
      const tenseRels = db.prepare(`
        SELECT COUNT(*) as count FROM character_relationships
        WHERE favorability < -20 AND from_id IN (${activeIds.map(() => '?').join(',')})
      `).get(...activeIds)
      if (tenseRels.count > 0) return true
    }

    return false
  }

  /**
   * 解析余波消息
   */
  _parseAftermath(content, allCharacters, db, groupId) {
    const characterMap = new Map(allCharacters.map(c => [c.name, c.id]))
    const messages = []
    const lines = content.split('\n').filter(l => l.trim())

    for (const line of lines) {
      // 匹配 "角色名：内容" 或 "角色名:内容"
      const match = line.match(/^([^:：]+)[：:](.+)$/)
      if (!match) continue

      const name = match[1].trim()
      const text = match[2].trim()

      if (text.length > 50) continue // 超长消息跳过

      const characterId = characterMap.get(name)
      if (!characterId) continue

      const msgId = generateUUID()
      // 保存为 assistant 消息，标记为 aftermath
      db.prepare(`
        INSERT INTO messages (id, group_id, character_id, role, content)
        VALUES (?, ?, ?, 'assistant', ?)
      `).run(msgId, groupId, characterId, text)

      messages.push({
        id: msgId,
        groupId,
        characterId,
        characterName: name,
        role: 'assistant',
        content: text,
        isAftermath: true,
        timestamp: new Date().toISOString()
      })

      // 更新余波相关角色的情绪
      this.emotion.updateFromMessage(db, characterId, text)
    }

    return messages
  }
}
```

- [ ] **Step 2: 验证模块可导入**

---

## Task 7: IPC 通道常量 + Handler + Preload + main.js 集成

**Files:**
- Modify: `electron/ipc/channels.js`
- Create: `electron/ipc/handlers/narrative.js`
- Modify: `electron/preload.js`
- Modify: `electron/main.js`

- [ ] **Step 1: 在 channels.js 中新增 NARRATIVE 通道**

在 `electron/ipc/channels.js` 的 `IPC_CHANNELS` 对象中追加：

```javascript
// 叙事系统
NARRATIVE_GET_EMOTIONS: 'narrative:getEmotions',
NARRATIVE_GET_EMOTION: 'narrative:getEmotion',
NARRATIVE_SET_EMOTION: 'narrative:setEmotion',
NARRATIVE_GET_RELATIONSHIPS: 'narrative:getRelationships',
NARRATIVE_GET_RELATIONSHIP: 'narrative:getRelationship',
NARRATIVE_SET_RELATIONSHIP: 'narrative:setRelationship',
NARRATIVE_REMOVE_RELATIONSHIP: 'narrative:removeRelationship',
NARRATIVE_GET_RELATIONSHIP_TYPES: 'narrative:getRelationshipTypes',
NARRATIVE_GET_EVENT_POOL: 'narrative:getEventPool',
NARRATIVE_TRIGGER_EVENT: 'narrative:triggerEvent',
NARRATIVE_GET_RECENT_EVENTS: 'narrative:getRecentEvents',
NARRATIVE_GET_EVENT_SUGGESTIONS: 'narrative:getEventSuggestions',
NARRATIVE_CHECK_STALENESS: 'narrative:checkStaleness',
```

- [ ] **Step 2: 创建 narrative.js IPC Handler**

```javascript
/**
 * 叙事系统 IPC 处理器
 */
import { ipcMain } from 'electron'

export function setupNarrativeHandlers(narrativeEngine) {
  // 获取群内所有角色情绪
  ipcMain.handle('narrative:getEmotions', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const emotions = narrativeEngine.emotion.getAllEmotions(db)
      return { success: true, data: emotions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取单个角色情绪
  ipcMain.handle('narrative:getEmotion', async (event, groupId, characterId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const emotion = narrativeEngine.emotion.getEmotion(db, characterId)
      return { success: true, data: emotion }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 手动设置角色情绪
  ipcMain.handle('narrative:setEmotion', async (event, groupId, characterId, emotion, intensity) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      narrativeEngine.emotion.setEmotion(db, characterId, emotion, intensity)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取群内所有角色关系
  ipcMain.handle('narrative:getRelationships', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const relationships = narrativeEngine.relationship.getAllRelationships(db)
      return { success: true, data: relationships }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取两个角色之间的关系
  ipcMain.handle('narrative:getRelationship', async (event, groupId, fromId, toId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const rel = narrativeEngine.relationship.getRelationship(db, fromId, toId)
      return { success: true, data: rel }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 设置角色关系
  ipcMain.handle('narrative:setRelationship', async (event, groupId, fromId, toId, type, description) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const rel = narrativeEngine.relationship.setRelationship(db, fromId, toId, type, description)
      return { success: true, data: rel }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 删除角色关系
  ipcMain.handle('narrative:removeRelationship', async (event, groupId, fromId, toId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      narrativeEngine.relationship.removeRelationship(db, fromId, toId)
      return { success: true }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取预设关系类型
  ipcMain.handle('narrative:getRelationshipTypes', async () => {
    try {
      return { success: true, data: narrativeEngine.relationship.getRelationshipTypes() }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取事件池
  ipcMain.handle('narrative:getEventPool', async (event, sceneType) => {
    try {
      const events = narrativeEngine.eventTrigger.getEventPool(sceneType || 'general')
      return { success: true, data: events }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 手动触发事件
  ipcMain.handle('narrative:triggerEvent', async (event, groupId, eventKey, content, impact) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const result = narrativeEngine.triggerEvent(db, groupId, eventKey, content, impact)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取最近事件
  ipcMain.handle('narrative:getRecentEvents', async (event, groupId, limit) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const events = narrativeEngine.eventTrigger.getRecentEvents(db, groupId, limit || 10)
      return { success: true, data: events }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 获取事件推荐
  ipcMain.handle('narrative:getEventSuggestions', async (event, groupId, sceneType, count) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const suggestions = narrativeEngine.getEventSuggestions(db, groupId, sceneType, count || 3)
      return { success: true, data: suggestions }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 检测对话平淡度
  ipcMain.handle('narrative:checkStaleness', async (event, groupId) => {
    try {
      const db = narrativeEngine._getGroupDB(groupId)
      const result = narrativeEngine.checkStaleness(db, groupId)
      return { success: true, data: result }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })
}
```

注意：NarrativeEngine 需要一个 `_getGroupDB` 方法来获取数据库连接。在 Task 6 的 `NarrativeEngine` 类中添加：

```javascript
/**
 * 设置数据库管理器引用（由 main.js 调用）
 */
setDBManager(dbManager) {
  this._dbManager = dbManager
}

_getGroupDB(groupId) {
  return this._dbManager.getGroupDB(groupId)
}
```

- [ ] **Step 3: 在 preload.js 中暴露叙事 API**

在 `electron/preload.js` 的 `contextBridge.exposeInMainWorld('electronAPI', {` 中，在 `search` 部分之前追加：

```javascript
// ============ 叙事系统 ============
narrative: {
  getEmotions: (groupId) => ipcRenderer.invoke('narrative:getEmotions', groupId),
  getEmotion: (groupId, characterId) => ipcRenderer.invoke('narrative:getEmotion', groupId, characterId),
  setEmotion: (groupId, characterId, emotion, intensity) => ipcRenderer.invoke('narrative:setEmotion', groupId, characterId, emotion, intensity),
  getRelationships: (groupId) => ipcRenderer.invoke('narrative:getRelationships', groupId),
  getRelationship: (groupId, fromId, toId) => ipcRenderer.invoke('narrative:getRelationship', groupId, fromId, toId),
  setRelationship: (groupId, fromId, toId, type, description) => ipcRenderer.invoke('narrative:setRelationship', groupId, fromId, toId, type, description),
  removeRelationship: (groupId, fromId, toId) => ipcRenderer.invoke('narrative:removeRelationship', groupId, fromId, toId),
  getRelationshipTypes: () => ipcRenderer.invoke('narrative:getRelationshipTypes'),
  getEventPool: (sceneType) => ipcRenderer.invoke('narrative:getEventPool', sceneType),
  triggerEvent: (groupId, eventKey, content, impact) => ipcRenderer.invoke('narrative:triggerEvent', groupId, eventKey, content, impact),
  getRecentEvents: (groupId, limit) => ipcRenderer.invoke('narrative:getRecentEvents', groupId, limit),
  getEventSuggestions: (groupId, sceneType, count) => ipcRenderer.invoke('narrative:getEventSuggestions', groupId, sceneType, count),
  checkStaleness: (groupId) => ipcRenderer.invoke('narrative:checkStaleness', groupId),
  // 余波消息事件
  onAftermath: (callback) => {
    const listener = (event, data) => callback(data)
    ipcRenderer.on('narrative:aftermath', listener)
    return () => ipcRenderer.removeListener('narrative:aftermath', listener)
  }
},
```

- [ ] **Step 4: 在 main.js 中初始化叙事引擎**

在 `electron/main.js` 的 `app.whenReady().then(async () => {` 中：

在 `const { setupSearchHandlers } = ...` 之后追加：
```javascript
const { NarrativeEngine } = await import('./narrative/engine.js')
const { setupNarrativeHandlers } = await import('./ipc/handlers/narrative.js')
```

在 `memoryManager = new MemoryManager()` 之后追加：
```javascript
const narrativeEngine = new NarrativeEngine()
narrativeEngine.setDBManager(dbManager)
```

在 `setupSearchHandlers(dbManager)` 之后追加：
```javascript
setupNarrativeHandlers(narrativeEngine)
```

- [ ] **Step 5: 验证 IPC 通信**

启动 `npm run dev`，在 DevTools 控制台执行：
```javascript
window.electronAPI.narrative.getRelationshipTypes()
```
应返回预设关系类型对象。验证其他接口可正常调用。

---

## Task 8: 集成叙事引擎到 LLM 对话流程

**Files:**
- Modify: `electron/ipc/handlers/llm.js`

这是最关键的集成步骤，需要修改 `llm:generate` handler。

- [ ] **Step 1: 修改 setupLLMHandlers 签名，接收 narrativeEngine**

将 `setupLLMHandlers` 函数签名从：
```javascript
export function setupLLMHandlers(dbManager, memoryManager = null) {
```
改为：
```javascript
export function setupLLMHandlers(dbManager, memoryManager = null, narrativeEngine = null) {
```

在 `electron/main.js` 中更新调用：
```javascript
setupLLMHandlers(dbManager, memoryManager, narrativeEngine)
```

- [ ] **Step 2: 修改 buildContextMessages 函数，注入叙事上下文**

在 `buildContextMessages` 函数签名中新增 `narrativeContext = []` 参数：

```javascript
function buildContextMessages(character, history, userContent, background = null, systemPrompt = null, allCharacters = [], memories = [], narrativeContext = []) {
```

在函数中，将 `narrativeContext` 注入到合适位置。在群成员介绍（步骤 3）之后、角色记忆（步骤 4.5）之前插入：

```javascript
// 3.5 注入叙事上下文（情绪、关系、事件）
if (narrativeContext.length > 0) {
  messages.push(...narrativeContext)
}
```

- [ ] **Step 3: 在 llm:generate handler 中调用叙事引擎**

在 `llm:generate` handler 中，获取 `allCharacters` 之后（约第 196 行），为每个角色构建叙事上下文：

在 `generateCharacterResponse` 调用处，传入叙事上下文。需要修改 `generateCharacterResponse` 函数签名，新增 `narrativeContext` 参数。

在调用 `generateCharacterResponse` 之前（顺序模式循环内、并行模式 map 内），构建叙事上下文：

```javascript
// 构建叙事上下文（如果叙事引擎可用）
const narrativeContext = narrativeEngine
  ? narrativeEngine.preGenerate(db, character.id, groupId, userContent, userCharacter?.id, allCharacters)
  : []
```

然后将 `narrativeContext` 传给 `generateCharacterResponse`。

- [ ] **Step 4: 在角色回复完成后更新叙事状态**

在 `generateCharacterResponse` 函数成功后，调用 `postCharacterResponse`：

```javascript
// 在 generateCharacterResponse 返回后
if (narrativeEngine && response.success) {
  await narrativeEngine.postCharacterResponse(
    db, character.id, groupId, userContent, response.content,
    allCharacters, createClientForCharacter, group, llmProfiles, apiKey
  )
}
```

注意：`postCharacterResponse` 中的 LLM 情绪推断是异步的，但不应该阻塞主流程。使用 `Promise.all` 并行处理或在最后统一处理。

- [ ] **Step 5: 在所有角色回复完成后编排余波**

在 `llm:generate` handler 的最后（return 之前），调用余波编排：

```javascript
// 所有角色回复完成后，生成余波
let aftermathMessages = []
if (narrativeEngine) {
  try {
    aftermathMessages = await narrativeEngine.generateAftermath(
      db, groupId, userContent, responses, allCharacters,
      createClientForCharacter, group, llmProfiles, apiKey
    )

    // 通过事件通知前端余波消息
    for (const msg of aftermathMessages) {
      event.sender.send('narrative:aftermath', msg)
    }
  } catch (err) {
    console.error('[Narrative] 余波编排失败:', err.message)
  }
}
```

- [ ] **Step 6: 端到端验证**

启动 `npm run dev`：
1. 创建群组，添加 2-3 个角色
2. 发送消息，观察控制台 `[Narrative]` 日志
3. 验证情绪根据关键词变化
4. 验证余波消息是否生成并通知前端

---

## Task 9: 前端 — Pinia Store

**Files:**
- Create: `src/stores/narrative.js`

- [ ] **Step 1: 创建叙事状态 Store**

```javascript
import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useNarrativeStore = defineStore('narrative', () => {
  const emotions = ref([])
  const relationships = ref([])
  const eventSuggestions = ref([])
  const recentEvents = ref([])
  const staleness = ref({ stale: false, reason: null })
  const aftermathMessages = ref([])

  async function fetchEmotions(groupId) {
    const result = await window.electronAPI.narrative.getEmotions(groupId)
    if (result.success) emotions.value = result.data
  }

  async function fetchRelationships(groupId) {
    const result = await window.electronAPI.narrative.getRelationships(groupId)
    if (result.success) relationships.value = result.data
  }

  async function setRelationship(groupId, fromId, toId, type, description = '') {
    const result = await window.electronAPI.narrative.setRelationship(groupId, fromId, toId, type, description)
    if (result.success) await fetchRelationships(groupId)
    return result
  }

  async function removeRelationship(groupId, fromId, toId) {
    const result = await window.electronAPI.narrative.removeRelationship(groupId, fromId, toId)
    if (result.success) await fetchRelationships(groupId)
    return result
  }

  async function fetchEventSuggestions(groupId, sceneType) {
    const result = await window.electronAPI.narrative.getEventSuggestions(groupId, sceneType)
    if (result.success) eventSuggestions.value = result.data
  }

  async function fetchRecentEvents(groupId) {
    const result = await window.electronAPI.narrative.getRecentEvents(groupId)
    if (result.success) recentEvents.value = result.data
  }

  async function triggerEvent(groupId, eventKey, content, impact) {
    const result = await window.electronAPI.narrative.triggerEvent(groupId, eventKey, content, impact)
    if (result.success) await fetchRecentEvents(groupId)
    return result
  }

  async function checkStaleness(groupId) {
    const result = await window.electronAPI.narrative.checkStaleness(groupId)
    if (result.success) staleness.value = result.data
  }

  function setupAftermathListener() {
    return window.electronAPI.narrative.onAftermath((msg) => {
      aftermathMessages.value.push(msg)
    })
  }

  function clearAftermath() {
    aftermathMessages.value = []
  }

  return {
    emotions, relationships, eventSuggestions, recentEvents,
    staleness, aftermathMessages,
    fetchEmotions, fetchRelationships, setRelationship, removeRelationship,
    fetchEventSuggestions, fetchRecentEvents, triggerEvent,
    checkStaleness, setupAftermathListener, clearAftermath
  }
})
```

---

## Task 10: 前端 — EmotionTag 组件

**Files:**
- Create: `src/components/chat/EmotionTag.vue`

- [ ] **Step 1: 创建情绪标签组件**

```vue
<template>
  <span class="emotion-tag" :class="emotionClass" :title="`${emotion} ${intensity}`">
    {{ emotion }}
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  emotion: { type: String, default: '平静' },
  intensity: { type: Number, default: 0 }
})

const emotionClass = computed(() => {
  const map = {
    '开心': 'emotion-happy',
    '愤怒': 'emotion-angry',
    '尴尬': 'emotion-awkward',
    '感动': 'emotion-moved',
    '悲伤': 'emotion-sad',
    '惊讶': 'emotion-surprised',
    '嫉妒': 'emotion-jealous',
    '疲惫': 'emotion-tired',
    '紧张': 'emotion-nervous',
    '惊慌': 'emotion-panic',
    '恐慌': 'emotion-terror',
    '好奇': 'emotion-curious',
    '无奈': 'emotion-helpless',
    '沮丧': 'emotion-depressed',
    '焦虑': 'emotion-anxious'
  }
  return map[props.emotion] || 'emotion-neutral'
})
</script>

<style lang="scss" scoped>
.emotion-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 11px;
  line-height: 18px;
  white-space: nowrap;
}

.emotion-happy { background: #e8f5e9; color: #2e7d32; }
.emotion-angry { background: #ffebee; color: #c62828; }
.emotion-awkward { background: #fff8e1; color: #f9a825; }
.emotion-moved { background: #fce4ec; color: #ad1457; }
.emotion-sad { background: #e3f2fd; color: #1565c0; }
.emotion-surprised { background: #fff3e0; color: #e65100; }
.emotion-jealous { background: #f3e5f5; color: #6a1b9a; }
.emotion-tired { background: #eceff1; color: #546e7a; }
.emotion-nervous { background: #fff8e1; color: #ff6f00; }
.emotion-panic { background: #ffebee; color: #b71c1c; }
.emotion-terror { background: #ffebee; color: #b71c1c; }
.emotion-curious { background: #e8f5e9; color: #1b5e20; }
.emotion-helpless { background: #eceff1; color: #455a64; }
.emotion-depressed { background: #e3f2fd; color: #0d47a1; }
.emotion-anxious { background: #fff3e0; color: #e65100; }
.emotion-neutral { background: #f5f5f5; color: #757575; }
</style>
```

---

## Task 11: 前端 — RelationshipPanel 组件

**Files:**
- Create: `src/components/chat/RelationshipPanel.vue`

- [ ] **Step 1: 创建角色关系面板组件**

```vue
<template>
  <div class="relationship-panel">
    <div class="panel-header">
      <h4>角色关系</h4>
      <button class="btn-add" @click="showAddDialog = true" title="添加关系">+</button>
    </div>

    <div v-if="relationshipList.length === 0" class="empty-tip">
      暂无角色关系，点击 + 添加
    </div>

    <div v-for="rel in relationshipList" :key=" `${rel.from_id}-${rel.to_id}`" class="relationship-item">
      <div class="rel-info">
        <span class="rel-from">{{ getCharName(rel.from_id) }}</span>
        <span class="rel-arrow" :class="`favor-${getFavorClass(rel.favorability)}`">→</span>
        <span class="rel-to">{{ getCharName(rel.to_id) }}</span>
      </div>
      <div class="rel-meta">
        <span class="rel-type">{{ getTypeLabel(rel.type) }}</span>
        <div class="favor-bar">
          <div class="favor-fill" :style="{ width: getFavorWidth(rel.favorability) + '%' }"></div>
        </div>
        <span class="favor-value" :class="`favor-${getFavorClass(rel.favorability)}`">
          {{ rel.favorability }}
        </span>
      </div>
      <button class="btn-remove" @click="handleRemove(rel.from_id, rel.to_id)" title="删除">×</button>
    </div>

    <!-- 添加关系对话框 -->
    <div v-if="showAddDialog" class="dialog-overlay" @click.self="showAddDialog = false">
      <div class="dialog-content">
        <h4>添加角色关系</h4>
        <div class="form-row">
          <label>从</label>
          <select v-model="form.fromId">
            <option v-for="char in characters" :key="char.id" :value="char.id">{{ char.name }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>到</label>
          <select v-model="form.toId">
            <option v-for="char in characters" :key="char.id" :value="char.id">{{ char.name }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>关系</label>
          <select v-model="form.type">
            <option v-for="(config, key) in relationshipTypes" :key="key" :value="key">{{ config.label }}</option>
          </select>
        </div>
        <div class="form-row">
          <label>描述</label>
          <input v-model="form.description" placeholder="可选" />
        </div>
        <div class="dialog-actions">
          <button @click="showAddDialog = false">取消</button>
          <button class="btn-primary" @click="handleAdd">确定</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const props = defineProps({
  groupId: { type: String, required: true },
  characters: { type: Array, default: () => [] }
})

const narrativeStore = useNarrativeStore()
const showAddDialog = ref(false)
const relationshipTypes = ref({})
const form = ref({ fromId: '', toId: '', type: 'friend', description: '' })

const relationshipList = computed(() => narrativeStore.relationships)

onMounted(async () => {
  const result = await window.electronAPI.narrative.getRelationshipTypes()
  if (result.success) relationshipTypes.value = result.data
  await narrativeStore.fetchRelationships(props.groupId)
})

watch(() => props.groupId, () => {
  narrativeStore.fetchRelationships(props.groupId)
})

const charMap = computed(() => new Map(props.characters.map(c => [c.id, c.name])))

function getCharName(id) { return charMap.value.get(id) || '未知' }
function getTypeLabel(type) { return relationshipTypes.value[type]?.label || type }

function getFavorClass(f) {
  if (f >= 40) return 'good'
  if (f >= 10) return 'ok'
  if (f >= -10) return 'neutral'
  if (f >= -50) return 'bad'
  return 'worst'
}

function getFavorWidth(f) { return Math.max(0, Math.min(100, (f + 100) / 2)) }

async function handleAdd() {
  if (!form.value.fromId || !form.value.toId || form.value.fromId === form.value.toId) return
  await narrativeStore.setRelationship(
    props.groupId, form.value.fromId, form.value.toId,
    form.value.type, form.value.description
  )
  showAddDialog.value = false
  form.value = { fromId: '', toId: '', type: 'friend', description: '' }
}

async function handleRemove(fromId, toId) {
  await narrativeStore.removeRelationship(props.groupId, fromId, toId)
}
</script>

<style lang="scss" scoped>
.relationship-panel { padding: 8px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; h4 { margin: 0; font-size: 13px; } }
.btn-add { background: #07c160; color: #fff; border: none; border-radius: 50%; width: 22px; height: 22px; cursor: pointer; font-size: 14px; }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 16px; }
.relationship-item { background: #f8f8f8; border-radius: 8px; padding: 8px; margin-bottom: 6px; position: relative; }
.rel-info { font-size: 13px; margin-bottom: 4px; }
.rel-arrow { margin: 0 4px; font-weight: bold; }
.rel-meta { display: flex; align-items: center; gap: 8px; font-size: 12px; }
.rel-type { color: #666; min-width: 36px; }
.favor-bar { flex: 1; height: 4px; background: #e0e0e0; border-radius: 2px; overflow: hidden; }
.favor-fill { height: 100%; border-radius: 2px; transition: width 0.3s; }
.favor-good .favor-fill { background: #07c160; }
.favor-ok .favor-fill { background: #8bc34a; }
.favor-neutral .favor-fill { background: #ffc107; }
.favor-bad .favor-fill { background: #ff9800; }
.favor-worst .favor-fill { background: #f44336; }
.favor-value { min-width: 28px; text-align: right; }
.favor-good { color: #07c160; } .favor-ok { color: #8bc34a; } .favor-neutral { color: #ffc107; }
.favor-bad { color: #ff9800; } .favor-worst { color: #f44336; }
.btn-remove { position: absolute; top: 4px; right: 6px; background: none; border: none; cursor: pointer; color: #999; font-size: 16px; &:hover { color: #f44336; } }

.dialog-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; z-index: 1000; }
.dialog-content { background: #fff; border-radius: 12px; padding: 20px; width: 340px; h4 { margin: 0 0 16px; } }
.form-row { margin-bottom: 10px; label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; } select, input { width: 100%; padding: 6px 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; } }
.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; button { padding: 6px 16px; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; } .btn-primary { background: #07c160; color: #fff; border-color: #07c160; } }
</style>
```

---

## Task 12: 前端 — EventPanel 组件

**Files:**
- Create: `src/components/chat/EventPanel.vue`

- [ ] **Step 1: 创建事件面板组件**

```vue
<template>
  <div class="event-panel">
    <div class="panel-header">
      <h4>推荐事件</h4>
      <button class="btn-refresh" @click="refresh" title="换一批">换一批</button>
    </div>

    <div v-if="suggestions.length === 0" class="empty-tip">
      暂无推荐事件
    </div>

    <div v-for="event in suggestions" :key="event.key" class="event-card" @click="handleTrigger(event)">
      <span class="event-impact">{{ event.impact }}</span>
      <span class="event-content">{{ event.content }}</span>
    </div>

    <div class="recent-events" v-if="recentEvents.length > 0">
      <h5>最近事件</h5>
      <div v-for="evt in recentEvents" :key="evt.id" class="recent-event">
        <span class="event-type-badge">{{ evt.event_type === 'user_triggered' ? '手动' : '自动' }}</span>
        <span>{{ evt.content }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, watch } from 'vue'
import { useNarrativeStore } from '../../stores/narrative.js'

const props = defineProps({
  groupId: { type: String, required: true },
  sceneType: { type: String, default: 'general' }
})

const emit = defineEmits(['eventTriggered'])

const narrativeStore = useNarrativeStore()
const suggestions = ref([])
const recentEvents = ref([])

onMounted(() => { refresh() })

watch(() => props.groupId, () => { refresh() })

async function refresh() {
  await narrativeStore.fetchEventSuggestions(props.groupId, props.sceneType)
  suggestions.value = narrativeStore.eventSuggestions
  await narrativeStore.fetchRecentEvents(props.groupId)
  recentEvents.value = narrativeStore.recentEvents
}

async function handleTrigger(event) {
  await narrativeStore.triggerEvent(props.groupId, event.key, event.content, event.impact)
  emit('eventTriggered', event)
  await refresh()
}
</script>

<style lang="scss" scoped>
.event-panel { padding: 8px; }
.panel-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; h4 { margin: 0; font-size: 13px; } }
.btn-refresh { background: none; border: 1px solid #ddd; border-radius: 12px; padding: 2px 10px; font-size: 11px; cursor: pointer; color: #666; &:hover { border-color: #07c160; color: #07c160; } }
.empty-tip { color: #999; font-size: 12px; text-align: center; padding: 12px; }
.event-card { display: flex; align-items: center; gap: 6px; padding: 8px; background: #f8f8f8; border-radius: 8px; margin-bottom: 6px; cursor: pointer; transition: background 0.2s; &:hover { background: #e8f5e9; } }
.event-impact { font-size: 11px; color: #fff; background: #07c160; border-radius: 8px; padding: 1px 6px; white-space: nowrap; }
.event-content { font-size: 12px; color: #333; }
.recent-events { margin-top: 12px; h5 { margin: 0 0 6px; font-size: 12px; color: #666; } }
.recent-event { font-size: 11px; color: #888; padding: 4px 0; display: flex; align-items: center; gap: 4px; }
.event-type-badge { font-size: 10px; background: #e0e0e0; border-radius: 4px; padding: 0 4px; color: #666; }
</style>
```

---

## Task 13: 前端 — StalenessTip 组件

**Files:**
- Create: `src/components/chat/StalenessTip.vue`

- [ ] **Step 1: 创建对话平淡提示组件**

```vue
<template>
  <div v-if="visible" class="staleness-tip">
    <span class="tip-icon">💡</span>
    <span class="tip-text">对话似乎有些平淡，要不要来点转折？</span>
    <button class="tip-btn" @click="$emit('showEvents')">查看推荐事件</button>
    <button class="tip-dismiss" @click="dismiss">忽略</button>
  </div>
</template>

<script setup>
import { ref } from 'vue'

defineProps({ visible: { type: Boolean, default: false } })
defineEmits(['showEvents'])

const emit = defineEmits(['showEvents', 'dismiss'])

function dismiss() { emit('dismiss') }
</script>

<style lang="scss" scoped>
.staleness-tip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #fff8e1;
  border-radius: 8px;
  margin-bottom: 8px;
  font-size: 13px;
}
.tip-icon { font-size: 16px; }
.tip-text { flex: 1; color: #666; }
.tip-btn { background: #07c160; color: #fff; border: none; border-radius: 6px; padding: 4px 12px; font-size: 12px; cursor: pointer; }
.tip-dismiss { background: none; border: none; color: #999; font-size: 12px; cursor: pointer; text-decoration: underline; }
</style>
```

---

## Task 14: 前端 — 集成到 CharacterPanel

**Files:**
- Modify: `src/components/chat/CharacterPanel.vue`

- [ ] **Step 1: 在角色面板中集成情绪标签和关系面板**

需要在角色卡片中显示情绪标签，并添加"关系"Tab 切换到 RelationshipPanel。

具体修改点：
1. 导入 `EmotionTag` 和 `RelationshipPanel`
2. 导入 `useNarrativeStore`
3. 在组件挂载时获取情绪数据
4. 在每个角色卡片中显示 `<EmotionTag>` 组件
5. 在面板顶部添加 Tab 切换（角色列表 / 关系管理）
6. 关系 Tab 中渲染 `<RelationshipPanel>`

> 注意：需要先阅读 `CharacterPanel.vue` 的当前实现，确认具体的插入位置和样式适配。

---

## Task 15: 前端 — 集成到 ChatWindow

**Files:**
- Modify: `src/components/chat/ChatWindow.vue`
- Modify: `src/stores/messages.js`

- [ ] **Step 1: 在 ChatWindow 中集成事件按钮、平淡提示、余波消息**

1. 导入 `EventPanel`、`StalenessTip`、`useNarrativeStore`
2. 在消息输入区域旁添加"事件"按钮，点击弹出 EventPanel（作为侧边抽屉或下拉面板）
3. 在消息列表上方集成 `StalenessTip`，每次发送消息后检查平淡度
4. 监听 `narrative:aftermath` 事件，将余波消息插入消息列表
5. 余波消息使用斜体 + 浅色背景样式区分

在 `messages.js` store 中：
1. 添加 `aftermathMessages` ref
2. 添加 `setupAftermathListener` 方法
3. 在组件挂载时调用监听

> 注意：需要先阅读 `ChatWindow.vue` 和 `messages.js` 的当前实现。

---

## Task 16: 前端 — GroupSettingsDialog 新增叙事配置

**Files:**
- Modify: `src/components/config/GroupSettingsDialog.vue`

- [ ] **Step 1: 在群设置中添加叙事配置项**

在 `GroupSettingsDialog.vue` 的表单中追加以下配置项：

1. **叙事引擎开关**（`narrative_enabled`）— 复选框
2. **余波互动开关**（`aftermath_enabled`）— 复选框
3. **事件场景类型**（`event_scene_type`）— 下拉选择（office/home/school/general）
4. **对话平淡检测开关** — 复选框

具体修改：
1. 在 `form` ref 中新增 `narrativeEnabled`、`aftermathEnabled`、`eventSceneType` 字段
2. 在表单 UI 中添加对应控件
3. 在 `hasChanges` 计算属性中包含新字段
4. 在 `handleSave` 中包含新字段

> 注意：需要先阅读 `GroupSettingsDialog.vue` 的当前实现。

---

## Task 17: CLAUDE.md 文档更新

**Files:**
- Modify: `CLAUDE.md`
- Modify: `electron/CLAUDE.md`
- Modify: `src/CLAUDE.md`

- [ ] **Step 1: 更新根 CLAUDE.md**

在变更记录顶部添加 2026-04-17 条目，记录叙事引擎功能新增。

在架构图、模块结构中添加 `narrative/` 模块。

在数据模型中添加叙事相关三张表说明。

- [ ] **Step 2: 更新 electron/CLAUDE.md**

在变更记录中记录叙事引擎新增。

在对外接口中添加叙事系统 IPC 接口说明。

在相关文件清单中添加叙事模块文件。

- [ ] **Step 3: 更新 src/CLAUDE.md**

在组件清单中添加叙事相关 Vue 组件。

在 Store 清单中添加 `narrative.js`。

---

## 实施顺序建议

```
Task 1 (数据库) ──┬── Task 2 (情绪) ──┬── Task 5 (Prompt) ── Task 6 (引擎) ── Task 7 (IPC) ── Task 8 (集成到LLM)
                  ├── Task 3 (关系) ──┤
                  └── Task 4 (事件) ──┘
                                                                                        │
Task 9 (Store) ── Task 10 (EmotionTag) ── Task 11 (关系面板) ── Task 12 (事件面板) ── Task 13 (平淡提示) ── Task 14 (角色面板集成) ── Task 15 (聊天窗口集成) ── Task 16 (群设置)
                                                                                        │
                                                                                   Task 17 (文档)
```

后端（Task 1-8）和前端（Task 9-16）可并行开发，通过 Task 7 的 IPC 接口解耦。
