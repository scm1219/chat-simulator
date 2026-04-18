/**
 * 全局角色库数据库管理器
 * 使用独立的 SQLite 数据库存储全局角色
 */
import Database from 'better-sqlite3'
import { app } from 'electron'
import path from 'path'
import fs from 'fs'
import { generateUUID } from '../utils/uuid.js'
import { buildDynamicUpdate } from '../ipc/handler-wrapper.js'

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

-- ============ 标签表 ============
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  color TEXT DEFAULT '#07c160',
  is_default INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============ 角色-标签关联表 ============
CREATE TABLE IF NOT EXISTS character_tags (
  character_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (character_id, tag_id),
  FOREIGN KEY (character_id) REFERENCES global_characters(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

-- ============ 索引 ============
CREATE INDEX IF NOT EXISTS idx_global_characters_name ON global_characters(name);
CREATE INDEX IF NOT EXISTS idx_global_characters_created_at ON global_characters(created_at);
CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
CREATE INDEX IF NOT EXISTS idx_character_tags_character ON character_tags(character_id);
CREATE INDEX IF NOT EXISTS idx_character_tags_tag ON character_tags(tag_id);

-- ============ 触发器：自动更新 updated_at ============
CREATE TRIGGER IF NOT EXISTS update_global_characters_timestamp
AFTER UPDATE ON global_characters
BEGIN
  UPDATE global_characters SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
`

// 默认标签数据
const DEFAULT_TAGS = [
  { id: 'tag-modern', name: '现代', color: '#07c160', is_default: 1 },
  { id: 'tag-ancient', name: '古代', color: '#8b4513', is_default: 1 },
  { id: 'tag-scifi', name: '科幻', color: '#4169e1', is_default: 1 },
  { id: 'tag-fantasy', name: '奇幻', color: '#9932cc', is_default: 1 },
  { id: 'tag-historical', name: '历史', color: '#cd853f', is_default: 1 },
  { id: 'tag-anime', name: '动漫', color: '#ff69b4', is_default: 1 },
  { id: 'tag-game', name: '游戏', color: '#00ced1', is_default: 1 },
  { id: 'tag-novel', name: '小说', color: '#ffa500', is_default: 1 },
  { id: 'tag-movie', name: '影视', color: '#dc143c', is_default: 1 },
  { id: 'tag-original', name: '原创', color: '#32cd32', is_default: 1 }
]

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
    this.initDefaultTags()
  }

  /**
   * 初始化默认标签（仅在首次运行时插入）
   */
  initDefaultTags() {
    // 检查是否已有标签
    const count = this.db.prepare('SELECT COUNT(*) as count FROM tags').get()
    if (count.count === 0) {
      const insert = this.db.prepare(`
        INSERT INTO tags (id, name, color, is_default)
        VALUES (@id, @name, @color, @is_default)
      `)

      for (const tag of DEFAULT_TAGS) {
        insert.run(tag)
      }
      console.log('[GlobalCharacterManager] 默认标签初始化完成')
    }
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
    buildDynamicUpdate(this.db, 'global_characters', data, [
      ['name', 'name'],
      ['gender', 'gender'],
      ['age', 'age'],
      ['systemPrompt', 'system_prompt']
    ], id)

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

  // ============ 标签管理方法 ============

  /**
   * 获取所有标签
   * @returns {Array} 标签列表
   */
  getAllTags() {
    return this.db.prepare(`
      SELECT * FROM tags ORDER BY is_default DESC, name ASC
    `).all()
  }

  /**
   * 创建自定义标签
   * @param {Object} data - 标签数据
   * @param {string} data.name - 标签名称
   * @param {string} data.color - 标签颜色
   * @returns {Object} 创建的标签
   */
  createTag(data) {
    const id = generateUUID()
    const { name, color } = data

    this.db.prepare(`
      INSERT INTO tags (id, name, color, is_default)
      VALUES (?, ?, ?, 0)
    `).run(id, name.trim(), color || '#07c160')

    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
  }

  /**
   * 更新标签
   * @param {string} id - 标签 ID
   * @param {Object} data - 更新数据
   * @returns {Object|null} 更新后的标签
   */
  updateTag(id, data) {
    buildDynamicUpdate(this.db, 'tags', data, [
      ['name', 'name', (val) => val.trim()],
      ['color', 'color']
    ], id)

    return this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
  }

  /**
   * 删除标签（仅允许删除非默认标签）
   * @param {string} id - 标签 ID
   * @returns {Object} { success: boolean, error?: string }
   */
  deleteTag(id) {
    const tag = this.db.prepare('SELECT * FROM tags WHERE id = ?').get(id)
    if (!tag) {
      return { success: false, error: '标签不存在' }
    }
    if (tag.is_default === 1) {
      return { success: false, error: '系统默认标签不可删除' }
    }

    // 删除角色-标签关联
    this.db.prepare('DELETE FROM character_tags WHERE tag_id = ?').run(id)
    // 删除标签
    this.db.prepare('DELETE FROM tags WHERE id = ?').run(id)

    return { success: true }
  }

  /**
   * 获取角色的标签
   * @param {string} characterId - 角色 ID
   * @returns {Array} 标签列表
   */
  getCharacterTags(characterId) {
    return this.db.prepare(`
      SELECT t.* FROM tags t
      INNER JOIN character_tags ct ON t.id = ct.tag_id
      WHERE ct.character_id = ?
      ORDER BY t.name ASC
    `).all(characterId)
  }

  /**
   * 设置角色的标签
   * @param {string} characterId - 角色 ID
   * @param {Array<string>} tagIds - 标签 ID 数组
   */
  setCharacterTags(characterId, tagIds) {
    // 先删除原有标签
    this.db.prepare('DELETE FROM character_tags WHERE character_id = ?').run(characterId)

    // 插入新标签
    if (tagIds && tagIds.length > 0) {
      const insert = this.db.prepare(`
        INSERT INTO character_tags (character_id, tag_id)
        VALUES (?, ?)
      `)
      for (const tagId of tagIds) {
        insert.run(characterId, tagId)
      }
    }
  }

  /**
   * 根据标签筛选角色
   * @param {Array<string>} tagIds - 标签 ID 数组
   * @returns {Array} 角色列表
   */
  getCharactersByTags(tagIds) {
    if (!tagIds || tagIds.length === 0) {
      return this.getAll()
    }

    const placeholders = tagIds.map(() => '?').join(',')
    const characters = this.db.prepare(`
      SELECT DISTINCT gc.* FROM global_characters gc
      INNER JOIN character_tags ct ON gc.id = ct.character_id
      WHERE ct.tag_id IN (${placeholders})
      ORDER BY gc.updated_at DESC
    `).all(...tagIds)

    return characters
  }

  /**
   * 获取所有角色（含标签）
   * @returns {Array} 角色列表（每个角色包含 tags 字段）
   */
  getAllWithTags() {
    const characters = this.getAll()

    // 为每个角色获取标签
    for (const character of characters) {
      character.tags = this.getCharacterTags(character.id)
    }

    return characters
  }

  /**
   * 搜索角色（支持标签筛选）
   * @param {string} keyword - 搜索关键词
   * @param {Array<string>} tagIds - 标签 ID 数组（可选）
   * @returns {Array} 匹配的角色列表
   */
  searchWithTags(keyword, tagIds) {
    let characters

    // 先按标签筛选
    if (tagIds && tagIds.length > 0) {
      characters = this.getCharactersByTags(tagIds)
    } else {
      characters = this.getAll()
    }

    // 再按关键词筛选
    if (keyword && keyword.trim()) {
      const searchTerm = keyword.trim().toLowerCase()
      characters = characters.filter(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.system_prompt.toLowerCase().includes(searchTerm)
      )
    }

    // 为每个角色获取标签
    for (const character of characters) {
      character.tags = this.getCharacterTags(character.id)
    }

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
