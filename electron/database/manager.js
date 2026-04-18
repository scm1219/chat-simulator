/**
 * SQLite 数据库管理器
 * 负责管理所有群组的数据库连接
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'

// 数据库 Schema（内联以避免打包后路径问题）
const SCHEMA_SQL = `
-- ============ 群信息表 ============
CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  llm_provider TEXT NOT NULL,
  llm_model TEXT NOT NULL,
  llm_api_key TEXT,
  llm_base_url TEXT,
  max_history INTEGER DEFAULT 20,
  response_mode TEXT DEFAULT 'sequential',
  use_global_api_key INTEGER DEFAULT 1,
  thinking_enabled INTEGER DEFAULT 0,
  random_order INTEGER DEFAULT 0,
  background TEXT,
  system_prompt TEXT,
  auto_memory_extract INTEGER DEFAULT 0,
  narrative_enabled INTEGER NOT NULL DEFAULT 1,
  aftermath_enabled INTEGER NOT NULL DEFAULT 1,
  event_scene_type TEXT DEFAULT 'general',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 角色表 ============
CREATE TABLE IF NOT EXISTS characters (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  name TEXT NOT NULL,
  system_prompt TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  is_user INTEGER DEFAULT 0,
  position INTEGER DEFAULT 0,
  thinking_enabled INTEGER DEFAULT 0,
  custom_llm_profile_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

-- ============ 消息表 ============
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  group_id TEXT NOT NULL,
  character_id TEXT,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  reasoning_content TEXT,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE,
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE SET NULL
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_group_id ON messages(group_id);
CREATE INDEX IF NOT EXISTS idx_characters_group_id ON characters(group_id);
CREATE INDEX IF NOT EXISTS idx_narrative_events_group_id ON narrative_events(group_id);

-- ============ 触发器：自动更新 updated_at ============
CREATE TRIGGER IF NOT EXISTS update_groups_timestamp
AFTER UPDATE ON groups
BEGIN
  UPDATE groups SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- ============ 角色情绪表 ============
CREATE TABLE IF NOT EXISTS character_emotions (
  character_id TEXT PRIMARY KEY,
  emotion TEXT NOT NULL DEFAULT '平静',
  intensity REAL NOT NULL DEFAULT 0.0,
  decay_rate REAL NOT NULL DEFAULT 0.1,
  source TEXT NOT NULL DEFAULT 'keyword',
  updated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

-- ============ 角色关系表 ============
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

-- ============ 叙事事件记录表 ============
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
`

export class DatabaseManager {
  constructor() {
    // 缓存所有数据库连接
    this.connections = new Map()

    // 角色 ID → 群组 ID 索引缓存（避免跨群组全表扫描）
    this._characterGroupIndex = new Map()

    // 数据库存储目录
    this.dataDir = path.join(app.getPath('userData'), 'data', 'groups')

    // 初始化目录
    this.initDataDir()
  }

  /**
   * 初始化数据目录
   */
  initDataDir() {
    if (!fs.existsSync(this.dataDir)) {
      fs.mkdirSync(this.dataDir, { recursive: true })
    }
  }

  /**
   * 获取群组的数据库连接
   * @param {string} groupId - 群组 ID
   * @returns {Database} SQLite 数据库实例
   */
  getGroupDB(groupId) {
    // 如果连接已存在，直接返回
    if (this.connections.has(groupId)) {
      return this.connections.get(groupId)
    }

    // 创建新的数据库连接
    const dbPath = path.join(this.dataDir, `group_${groupId}.sqlite`)
    const db = new Database(dbPath)

    // 启用外键约束
    db.pragma('foreign_keys = ON')

    // 初始化表结构，传入群组 ID
    this.initSchema(db, groupId)

    // 缓存连接
    this.connections.set(groupId, db)

    // 填充角色索引缓存
    this._indexGroupCharacters(db, groupId)

    return db
  }

  /**
   * 初始化数据库表结构
   */
  initSchema(db, groupId) {
    db.exec(SCHEMA_SQL)

    // 执行数据库迁移，传入群组 ID
    this.runMigrations(db, groupId)
  }

  /**
   * 执行数据库迁移
   * @param {Database} db - 数据库连接
   * @param {string} groupId - 群组 ID
   */
  runMigrations(db, groupId) {
    // 检查 messages 表是否有 reasoning_content 字段
    const tableInfo = db.pragma('table_info(messages)')
    const hasReasoningContent = tableInfo.some(col => col.name === 'reasoning_content')

    if (!hasReasoningContent) {
      console.log(`[Database][${groupId}] 迁移：添加 messages.reasoning_content`)
      db.exec('ALTER TABLE messages ADD COLUMN reasoning_content TEXT')
    }

    // 检查 characters 表是否有 position 字段
    const charTableInfo = db.pragma('table_info(characters)')
    const hasPosition = charTableInfo.some(col => col.name === 'position')

    if (!hasPosition) {
      console.log(`[Database][${groupId}] 迁移：添加 characters.position`)
      db.exec('ALTER TABLE characters ADD COLUMN position INTEGER DEFAULT 0')

      // 为当前群组的已有 AI 角色设置 position（按创建时间排序，排除用户角色）
      const aiCharacters = db.prepare(
        'SELECT id FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY created_at'
      ).all(groupId)

      aiCharacters.forEach((char, index) => {
        db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(index, char.id)
      })
    } else {
      // position 字段已存在，检查是否需要规范化当前群组的角色
      const aiCharacters = db.prepare(
        'SELECT id, position FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY position ASC, created_at ASC'
      ).all(groupId)

      let needsNormalize = false
      const seenPositions = new Set()

      for (const char of aiCharacters) {
        if (seenPositions.has(char.position)) {
          console.log(`[Database][${groupId}] 检测到重复的 position 值: ${char.position}`)
          needsNormalize = true
          break
        }
        seenPositions.add(char.position)
      }

      if (needsNormalize) {
        aiCharacters.forEach((char, index) => {
          db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(index, char.id)
        })
        console.log(`[Database][${groupId}] 迁移：规范化 characters.position`)
      }
    }

    // 检查 characters 表是否有 thinking_enabled 字段
    const hasThinkingEnabled = charTableInfo.some(col => col.name === 'thinking_enabled')

    if (!hasThinkingEnabled) {
      db.exec('ALTER TABLE characters ADD COLUMN thinking_enabled INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移：添加 characters.thinking_enabled`)
    }

    // 检查 groups 表是否有 random_order 字段
    const groupsTableInfo = db.pragma('table_info(groups)')
    const hasRandomOrder = groupsTableInfo.some(col => col.name === 'random_order')

    if (!hasRandomOrder) {
      db.exec('ALTER TABLE groups ADD COLUMN random_order INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移：添加 groups.random_order`)
    }

    // 检查 messages 表是否有 prompt_tokens 字段
    const hasPromptTokens = tableInfo.some(col => col.name === 'prompt_tokens')
    if (!hasPromptTokens) {
      db.exec('ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER')
      db.exec('ALTER TABLE messages ADD COLUMN completion_tokens INTEGER')
      console.log(`[Database][${groupId}] 迁移：添加 messages.prompt_tokens/completion_tokens`)
    }

    // 检查 characters 表是否有 custom_llm_profile_id 字段
    const hasCustomLLMProfileId = charTableInfo.some(col => col.name === 'custom_llm_profile_id')
    if (!hasCustomLLMProfileId) {
      db.exec('ALTER TABLE characters ADD COLUMN custom_llm_profile_id TEXT')
      console.log(`[Database][${groupId}] 迁移：添加 characters.custom_llm_profile_id`)
    }

    // 检查 messages 表是否有 model 字段
    const hasModel = tableInfo.some(col => col.name === 'model')
    if (!hasModel) {
      db.exec('ALTER TABLE messages ADD COLUMN model TEXT')
      console.log(`[Database][${groupId}] 迁移：添加 messages.model`)
    }

    // 检查 groups 表是否有 auto_memory_extract 字段
    const hasAutoMemoryExtract = groupsTableInfo.some(col => col.name === 'auto_memory_extract')
    if (!hasAutoMemoryExtract) {
      db.exec('ALTER TABLE groups ADD COLUMN auto_memory_extract INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移：添加 groups.auto_memory_extract`)
    }

    // --- 叙事引擎相关迁移 ---

    // 添加 narrative_enabled 字段
    const hasNarrativeEnabled = groupsTableInfo.some(col => col.name === 'narrative_enabled')
    if (!hasNarrativeEnabled) {
      db.exec('ALTER TABLE groups ADD COLUMN narrative_enabled INTEGER NOT NULL DEFAULT 1')
      console.log(`[Database][${groupId}] 迁移：添加 groups.narrative_enabled`)
    }

    // 添加 aftermath_enabled 字段
    const hasAftermathEnabled = groupsTableInfo.some(col => col.name === 'aftermath_enabled')
    if (!hasAftermathEnabled) {
      db.exec('ALTER TABLE groups ADD COLUMN aftermath_enabled INTEGER NOT NULL DEFAULT 1')
      console.log(`[Database][${groupId}] 迁移：添加 groups.aftermath_enabled`)
    }

    // 添加 event_scene_type 字段
    const hasEventSceneType = groupsTableInfo.some(col => col.name === 'event_scene_type')
    if (!hasEventSceneType) {
      db.exec("ALTER TABLE groups ADD COLUMN event_scene_type TEXT DEFAULT 'general'")
      console.log(`[Database][${groupId}] 迁移：添加 groups.event_scene_type`)
    }

    // --- messages 表迁移 ---

    // 添加 is_aftermath 字段（标记余波消息）
    const messagesTableInfo = db.pragma('table_info(messages)')
    const hasIsAftermath = messagesTableInfo.some(col => col.name === 'is_aftermath')
    if (!hasIsAftermath) {
      db.exec('ALTER TABLE messages ADD COLUMN is_aftermath INTEGER NOT NULL DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移：添加 messages.is_aftermath`)
    }

    // 添加 message_type 字段（区分 normal/event/aftermath）
    const hasMessageType = messagesTableInfo.some(col => col.name === 'message_type')
    if (!hasMessageType) {
      db.exec("ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'normal'")
      db.exec("UPDATE messages SET message_type = 'aftermath' WHERE is_aftermath = 1")
      console.log(`[Database][${groupId}] 迁移：添加 messages.message_type`)
    }

    // 添加 event_impact 字段（事件影响标签，如"惊慌"、"欢乐"）
    const hasEventImpact = messagesTableInfo.some(col => col.name === 'event_impact')
    if (!hasEventImpact) {
      db.exec('ALTER TABLE messages ADD COLUMN event_impact TEXT')
      console.log(`[Database][${groupId}] 迁移：添加 messages.event_impact`)
    }
  }

  /**
   * 关闭群组数据库连接
   * @param {string} groupId - 群组 ID
   */
  closeGroupDB(groupId) {
    if (this.connections.has(groupId)) {
      const db = this.connections.get(groupId)
      db.close()
      this.connections.delete(groupId)
    }
  }

  /**
   * 关闭所有数据库连接
   */
  closeAll() {
    for (const [groupId, db] of this.connections.entries()) {
      db.close()
    }
    this.connections.clear()
  }

  /**
   * 删除群组数据库
   * @param {string} groupId - 群组 ID
   */
  deleteGroupDB(groupId) {
    // 清理角色索引
    this._unindexGroup(groupId)

    // 关闭连接
    this.closeGroupDB(groupId)

    // 删除文件
    const dbPath = path.join(this.dataDir, `group_${groupId}.sqlite`)
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath)
    }
  }

  /**
   * 获取所有群组的数据库文件列表
   */
  getGroupDBFiles() {
    const files = fs.readdirSync(this.dataDir)
    return files
      .filter(file => file.endsWith('.sqlite'))
      .map(file => {
        const match = file.match(/group_(.+)\.sqlite/)
        return match ? match[1] : null
      })
      .filter(Boolean)
  }

  // ============ 角色 ID → 群组 ID 索引管理 ============

  /**
   * 填充指定群组的角色索引
   * @param {Database} db - 数据库连接
   * @param {string} groupId - 群组 ID
   */
  _indexGroupCharacters(db, groupId) {
    const characters = db.prepare('SELECT id FROM characters').all()
    for (const char of characters) {
      this._characterGroupIndex.set(char.id, groupId)
    }
  }

  /**
   * 清除指定群组的所有角色索引
   * @param {string} groupId - 群组 ID
   */
  _unindexGroup(groupId) {
    for (const [charId, gId] of this._characterGroupIndex) {
      if (gId === groupId) {
        this._characterGroupIndex.delete(charId)
      }
    }
  }

  /**
   * 索引单个角色（创建时调用）
   * @param {string} characterId - 角色 ID
   * @param {string} groupId - 群组 ID
   */
  indexCharacter(characterId, groupId) {
    this._characterGroupIndex.set(characterId, groupId)
  }

  /**
   * 移除单个角色索引（删除时调用）
   * @param {string} characterId - 角色 ID
   */
  unindexCharacter(characterId) {
    this._characterGroupIndex.delete(characterId)
  }

  /**
   * 查找角色所属的群组 ID
   * @param {string} characterId - 角色 ID
   * @returns {string|null} 群组 ID，未找到返回 null
   */
  findCharacterGroup(characterId) {
    return this._characterGroupIndex.get(characterId) || null
  }
}
