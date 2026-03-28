/**
 * 角色记忆数据库管理器
 * 使用独立的 SQLite 数据库存储角色的记忆信息
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { generateUUID } from '../utils/uuid.js'

// 数据库 Schema
const MEMORY_SCHEMA = `
-- ============ 角色记忆表 ============
CREATE TABLE IF NOT EXISTS character_memories (
  id TEXT PRIMARY KEY,
  character_name TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT DEFAULT 'manual',
  group_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_memories_char_name ON character_memories(character_name);
CREATE INDEX IF NOT EXISTS idx_memories_source ON character_memories(source);

-- ============ 触发器：自动更新 updated_at ============
CREATE TRIGGER IF NOT EXISTS update_memories_timestamp
AFTER UPDATE ON character_memories
BEGIN
  UPDATE character_memories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
`

export class MemoryManager {
  constructor() {
    // 数据库存储目录
    this.dataDir = path.join(app.getPath('userData'), 'data', 'global')

    // 初始化目录
    this.initDataDir()

    // 数据库路径
    this.dbPath = path.join(this.dataDir, 'character-memories.sqlite')

    // 数据库连接（懒加载）
    this.db = null
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
   * 获取数据库连接（懒加载）
   * @returns {Database} 数据库连接
   */
  getDB() {
    if (!this.db) {
      this.db = new Database(this.dbPath)
      this.db.pragma('foreign_keys = ON')
      this.db.exec(MEMORY_SCHEMA)
      console.log('[MemoryManager] 数据库初始化完成')
    }
    return this.db
  }

  /**
   * 按角色名称查询全部记忆
   * @param {string} name - 角色名称
   * @returns {Array} 记忆列表
   */
  getMemoriesByCharacterName(name) {
    const db = this.getDB()
    return db.prepare(`
      SELECT * FROM character_memories
      WHERE character_name = ?
      ORDER BY updated_at DESC
    `).all(name)
  }

  /**
   * 添加记忆
   * @param {Object} data - 记忆数据
   * @param {string} data.characterName - 角色名称
   * @param {string} data.content - 记忆内容
   * @param {string} data.source - 来源 ('manual' | 'auto')
   * @param {string} data.groupId - 来源群组 ID（auto 时记录，manual 时为 null）
   * @returns {Object} 创建的记忆记录
   */
  addMemory({ characterName, content, source = 'manual', groupId = null }) {
    const db = this.getDB()
    const id = generateUUID()

    db.prepare(`
      INSERT INTO character_memories (id, character_name, content, source, group_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, characterName, content, source, groupId)

    return db.prepare('SELECT * FROM character_memories WHERE id = ?').get(id)
  }

  /**
   * 更新记忆内容
   * @param {string} id - 记忆 ID
   * @param {string} content - 新内容
   * @returns {Object|null} 更新后的记忆记录
   */
  updateMemory(id, content) {
    const db = this.getDB()
    const result = db.prepare(`
      UPDATE character_memories SET content = ? WHERE id = ?
    `).run(content, id)

    if (result.changes === 0) {
      return null
    }

    return db.prepare('SELECT * FROM character_memories WHERE id = ?').get(id)
  }

  /**
   * 删除记忆
   * @param {string} id - 记忆 ID
   * @returns {boolean} 是否删除成功
   */
  deleteMemory(id) {
    const db = this.getDB()
    const result = db.prepare(`
      DELETE FROM character_memories WHERE id = ?
    `).run(id)

    return result.changes > 0
  }

  /**
   * 获取某角色的所有 auto 类型记忆内容列表（用于去重）
   * @param {string} name - 角色名称
   * @returns {Array<string>} 记忆内容列表
   */
  getAutoMemoryContents(name) {
    const db = this.getDB()
    const rows = db.prepare(`
      SELECT content FROM character_memories
      WHERE character_name = ? AND source = 'auto'
    `).all(name)

    return rows.map(row => row.content)
  }

  /**
   * 获取某角色的记忆条数
   * @param {string} name - 角色名称
   * @returns {number} 记忆条数
   */
  getMemoryCount(name) {
    const db = this.getDB()
    const result = db.prepare(`
      SELECT COUNT(*) as count FROM character_memories
      WHERE character_name = ?
    `).get(name)

    return result.count
  }

  /**
   * 关闭数据库连接
   */
  close() {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}
