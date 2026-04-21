/**
 * SQLite 数据库管理器
 * 负责管理所有群组的数据库连接
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { createLogger } from '../utils/logger.js'
import { ensureDataDir } from '../utils/config-dir.js'

const log = createLogger('Database')

// 数据库连接缓存上限（LRU 策略）
const MAX_CACHED_CONNECTIONS = 10

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

CREATE INDEX IF NOT EXISTS idx_narrative_events_group_id ON narrative_events(group_id);
`

/**
 * 迁移定义（按版本号顺序）
 * 每个迁移的 up 函数保持幂等：先检查字段是否存在，再执行 ALTER
 */
const MIGRATIONS = [
  {
    version: 1,
    name: 'messages_add_reasoning_content',
    up(db) {
      const cols = db.pragma('table_info(messages)')
      if (!cols.some(c => c.name === 'reasoning_content')) {
        db.exec('ALTER TABLE messages ADD COLUMN reasoning_content TEXT')
      }
    }
  },
  {
    version: 2,
    name: 'characters_add_position',
    up(db, groupId) {
      const cols = db.pragma('table_info(characters)')
      if (!cols.some(c => c.name === 'position')) {
        db.exec('ALTER TABLE characters ADD COLUMN position INTEGER DEFAULT 0')
        const chars = db.prepare(
          'SELECT id FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY created_at'
        ).all(groupId)
        chars.forEach((char, i) => {
          db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(i, char.id)
        })
      } else {
        // 检测并修复重复 position
        const chars = db.prepare(
          'SELECT id, position FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY position ASC, created_at ASC'
        ).all(groupId)
        let needsNormalize = false
        const seen = new Set()
        for (const c of chars) {
          if (seen.has(c.position)) { needsNormalize = true; break }
          seen.add(c.position)
        }
        if (needsNormalize) {
          chars.forEach((c, i) => {
            db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(i, c.id)
          })
        }
      }
    }
  },
  {
    version: 3,
    name: 'characters_add_thinking_enabled',
    up(db) {
      const cols = db.pragma('table_info(characters)')
      if (!cols.some(c => c.name === 'thinking_enabled')) {
        db.exec('ALTER TABLE characters ADD COLUMN thinking_enabled INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 4,
    name: 'groups_add_random_order',
    up(db) {
      const cols = db.pragma('table_info(groups)')
      if (!cols.some(c => c.name === 'random_order')) {
        db.exec('ALTER TABLE groups ADD COLUMN random_order INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 5,
    name: 'messages_add_token_counts',
    up(db) {
      const cols = db.pragma('table_info(messages)')
      if (!cols.some(c => c.name === 'prompt_tokens')) {
        db.exec('ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER')
        db.exec('ALTER TABLE messages ADD COLUMN completion_tokens INTEGER')
      }
    }
  },
  {
    version: 6,
    name: 'characters_add_custom_llm_profile',
    up(db) {
      const cols = db.pragma('table_info(characters)')
      if (!cols.some(c => c.name === 'custom_llm_profile_id')) {
        db.exec('ALTER TABLE characters ADD COLUMN custom_llm_profile_id TEXT')
      }
    }
  },
  {
    version: 7,
    name: 'messages_add_model',
    up(db) {
      const cols = db.pragma('table_info(messages)')
      if (!cols.some(c => c.name === 'model')) {
        db.exec('ALTER TABLE messages ADD COLUMN model TEXT')
      }
    }
  },
  {
    version: 8,
    name: 'groups_add_auto_memory_extract',
    up(db) {
      const cols = db.pragma('table_info(groups)')
      if (!cols.some(c => c.name === 'auto_memory_extract')) {
        db.exec('ALTER TABLE groups ADD COLUMN auto_memory_extract INTEGER DEFAULT 0')
      }
    }
  },
  {
    version: 9,
    name: 'groups_add_narrative_fields',
    up(db) {
      const cols = db.pragma('table_info(groups)')
      if (!cols.some(c => c.name === 'narrative_enabled')) {
        db.exec('ALTER TABLE groups ADD COLUMN narrative_enabled INTEGER NOT NULL DEFAULT 1')
      }
      if (!cols.some(c => c.name === 'aftermath_enabled')) {
        db.exec('ALTER TABLE groups ADD COLUMN aftermath_enabled INTEGER NOT NULL DEFAULT 1')
      }
      if (!cols.some(c => c.name === 'event_scene_type')) {
        db.exec("ALTER TABLE groups ADD COLUMN event_scene_type TEXT DEFAULT 'general'")
      }
    }
  },
  {
    version: 10,
    name: 'messages_add_aftermath_fields',
    up(db) {
      const cols = db.pragma('table_info(messages)')
      if (!cols.some(c => c.name === 'is_aftermath')) {
        db.exec('ALTER TABLE messages ADD COLUMN is_aftermath INTEGER NOT NULL DEFAULT 0')
      }
      if (!cols.some(c => c.name === 'message_type')) {
        db.exec("ALTER TABLE messages ADD COLUMN message_type TEXT NOT NULL DEFAULT 'normal'")
        db.exec("UPDATE messages SET message_type = 'aftermath' WHERE is_aftermath = 1")
      }
      if (!cols.some(c => c.name === 'event_impact')) {
        db.exec('ALTER TABLE messages ADD COLUMN event_impact TEXT')
      }
    }
  }
]

export class DatabaseManager {
  constructor() {
    // 缓存所有数据库连接
    this.connections = new Map()

    // 角色 ID → 群组 ID 索引缓存（避免跨群组全表扫描）
    this._characterGroupIndex = new Map()

    // 数据库存储目录
    this.dataDir = path.join(app.getPath('userData'), 'data', 'groups')

    // 初始化目录
    ensureDataDir(this.dataDir)
  }

  /**
   * 获取群组的数据库连接（LRU 缓存策略）
   * @param {string} groupId - 群组 ID
   * @returns {Database} SQLite 数据库实例
   */
  getGroupDB(groupId) {
    // 如果连接已存在，移到末尾（LRU 标记为最近使用）
    if (this.connections.has(groupId)) {
      const db = this.connections.get(groupId)
      this.connections.delete(groupId)
      this.connections.set(groupId, db)
      return db
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

    // LRU 淘汰：超过上限时关闭最早未使用的连接
    if (this.connections.size > MAX_CACHED_CONNECTIONS) {
      const oldest = this.connections.keys().next().value
      const oldestDb = this.connections.get(oldest)
      oldestDb.close()
      this.connections.delete(oldest)
      log.info(`[LRU] 关闭不活跃连接: ${oldest}`)
    }

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
   * 执行数据库迁移（版本号追踪）
   * 每个迁移通过版本号管理，已应用的迁移跳过，避免重复 PRAGMA 查询
   * @param {Database} db - 数据库连接
   * @param {string} groupId - 群组 ID
   */
  runMigrations(db, groupId) {
    // 创建迁移记录表（幂等）
    db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    )`)

    // 获取已应用的迁移版本（单次查询替代 13+ 次 PRAGMA）
    const applied = new Set(
      db.prepare('SELECT version FROM schema_migrations').all().map(r => r.version)
    )

    // 按版本号顺序执行未应用的迁移（每个迁移用事务包裹）
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue
      const runMigration = db.transaction(() => {
        m.up(db, groupId)
        db.prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(m.version, m.name)
      })
      try {
        runMigration()
        log.info(`[${groupId}] 迁移 v${m.version}: ${m.name}`)
      } catch (err) {
        log.error(`[${groupId}] 迁移 v${m.version} 失败: ${err.message}`)
        throw err
      }
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
