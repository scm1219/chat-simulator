/**
 * 全局角色库数据库管理器
 * 使用独立的 SQLite 数据库存储全局角色
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { generateUUID } from '../utils/uuid.js'

// 数据库 Schema
const GLOBAL_CHARACTER_SCHEMA = `
-- ============ 全局角色表 ============
CREATE TABLE IF NOT EXISTS global_characters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gender TEXT,
  age INTEGER,
  system_prompt TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_global_characters_name ON global_characters(name);
CREATE INDEX IF NOT EXISTS idx_global_characters_created_at ON global_characters(created_at);

-- ============ 触发器：自动更新 updated_at ============
CREATE TRIGGER IF NOT EXISTS update_global_characters_timestamp
AFTER UPDATE ON global_characters
BEGIN
  UPDATE global_characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
`

export class GlobalCharacterManager {
  constructor() {
    // 数据库存储目录
    this.dataDir = path.join(app.getPath('userData'), 'data', 'global')

    // 初始化目录
    this.initDataDir()

    // 数据库路径
    this.dbPath = path.join(this.dataDir, 'character-library.sqlite')

    // 创建数据库连接
    this.db = new Database(this.dbPath)

    // 启用外键约束
    this.db.pragma('foreign_keys = ON')

    // 初始化表结构
    this.initSchema()
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
   * 初始化数据库表结构
   */
  initSchema() {
    this.db.exec(GLOBAL_CHARACTER_SCHEMA)
  }

  /**
   * 获取所有全局角色
   * @returns {Array} 角色列表
   */
  getAll() {
    const characters = this.db.prepare(`
      SELECT * FROM global_characters
      ORDER BY updated_at DESC
    `).all()
    return characters
  }

  /**
   * 根据 ID 获取角色
   * @param {string} id - 角色 ID
   * @returns {Object|null} 角色对象
   */
  getById(id) {
    const character = this.db.prepare(`
      SELECT * FROM global_characters WHERE id = ?
    `).get(id)
    return character || null
  }

  /**
   * 创建全局角色
   * @param {Object} data - 角色数据
   * @param {string} data.name - 姓名
   * @param {string} data.gender - 性别 (male/female/other)
   * @param {number} data.age - 年龄
   * @param {string} data.systemPrompt - 人物设定
   * @returns {Object} 创建的角色
   */
  create(data) {
    const id = generateUUID()
    const { name, gender, age, systemPrompt } = data

    this.db.prepare(`
      INSERT INTO global_characters (id, name, gender, age, system_prompt)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name, gender || null, age || null, systemPrompt)

    return this.getById(id)
  }

  /**
   * 更新全局角色
   * @param {string} id - 角色 ID
   * @param {Object} data - 更新数据
   * @returns {Object|null} 更新后的角色
   */
  update(id, data) {
    const updates = []
    const values = []

    if (data.name !== undefined) {
      updates.push('name = ?')
      values.push(data.name)
    }
    if (data.gender !== undefined) {
      updates.push('gender = ?')
      values.push(data.gender)
    }
    if (data.age !== undefined) {
      updates.push('age = ?')
      values.push(data.age)
    }
    if (data.systemPrompt !== undefined) {
      updates.push('system_prompt = ?')
      values.push(data.systemPrompt)
    }

    if (updates.length > 0) {
      values.push(id)
      this.db.prepare(`
        UPDATE global_characters
        SET ${updates.join(', ')}
        WHERE id = ?
      `).run(...values)
    }

    return this.getById(id)
  }

  /**
   * 删除全局角色
   * @param {string} id - 角色 ID
   * @returns {boolean} 是否删除成功
   */
  delete(id) {
    const result = this.db.prepare(`
      DELETE FROM global_characters WHERE id = ?
    `).run(id)

    return result.changes > 0
  }

  /**
   * 搜索全局角色
   * @param {string} keyword - 搜索关键词
   * @returns {Array} 匹配的角色列表
   */
  search(keyword) {
    if (!keyword || !keyword.trim()) {
      return this.getAll()
    }

    const searchTerm = `%${keyword.trim()}%`
    const characters = this.db.prepare(`
      SELECT * FROM global_characters
      WHERE name LIKE ? OR system_prompt LIKE ?
      ORDER BY updated_at DESC
    `).all(searchTerm, searchTerm)

    return characters
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
