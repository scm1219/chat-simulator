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
  background TEXT,
  system_prompt TEXT,
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
`

export class DatabaseManager {
  constructor() {
    // 缓存所有数据库连接
    this.connections = new Map()

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
    console.log(`[Database] 开始检查群组 ${groupId} 的数据库迁移...`)

    // 检查 messages 表是否有 reasoning_content 字段
    const tableInfo = db.pragma('table_info(messages)')
    const hasReasoningContent = tableInfo.some(col => col.name === 'reasoning_content')

    if (!hasReasoningContent) {
      console.log(`[Database][${groupId}] 执行迁移：添加 messages.reasoning_content 字段`)
      db.exec('ALTER TABLE messages ADD COLUMN reasoning_content TEXT')
      console.log(`[Database][${groupId}] 迁移完成：reasoning_content 字段已添加`)
    }

    // 检查 characters 表是否有 position 字段
    const charTableInfo = db.pragma('table_info(characters)')
    const hasPosition = charTableInfo.some(col => col.name === 'position')

    if (!hasPosition) {
      console.log(`[Database][${groupId}] 执行迁移：添加 characters.position 字段`)
      db.exec('ALTER TABLE characters ADD COLUMN position INTEGER DEFAULT 0')

      // 为当前群组的已有 AI 角色设置 position（按创建时间排序，排除用户角色）
      const aiCharacters = db.prepare(
        'SELECT id FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY created_at'
      ).all(groupId)

      console.log(`[Database][${groupId}] 为 ${aiCharacters.length} 个 AI 角色设置 position 值`)

      aiCharacters.forEach((char, index) => {
        db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(index, char.id)
      })

      console.log(`[Database][${groupId}] 迁移完成：position 字段已添加并初始化`)
    } else {
      // position 字段已存在，检查是否需要规范化当前群组的角色
      console.log(`[Database][${groupId}] 检查 position 字段是否需要规范化...`)

      // 检查当前群组的 AI 角色是否有重复的 position 值或不连续的情况
      const aiCharacters = db.prepare(
        'SELECT id, position FROM characters WHERE group_id = ? AND is_user = 0 ORDER BY position ASC, created_at ASC'
      ).all(groupId)

      console.log(`[Database][${groupId}] 当前群组有 ${aiCharacters.length} 个 AI 角色`)

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
        console.log(`[Database][${groupId}] 检测到 position 值不连续或有重复，开始规范化...`)
        // 重新规范化当前群组所有 AI 角色的 position 值
        aiCharacters.forEach((char, index) => {
          db.prepare('UPDATE characters SET position = ? WHERE id = ?').run(index, char.id)
        })
        console.log(`[Database][${groupId}] 规范化完成`)
      } else {
        console.log(`[Database][${groupId}] position 字段正常，无需规范化`)
      }
    }

    // 检查 characters 表是否有 thinking_enabled 字段
    const hasThinkingEnabled = charTableInfo.some(col => col.name === 'thinking_enabled')

    if (!hasThinkingEnabled) {
      console.log(`[Database][${groupId}] 执行迁移：添加 characters.thinking_enabled 字段`)
      db.exec('ALTER TABLE characters ADD COLUMN thinking_enabled INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移完成：thinking_enabled 字段已添加`)
    }

    // 检查 groups 表是否有 random_order 字段
    const groupsTableInfo = db.pragma('table_info(groups)')
    const hasRandomOrder = groupsTableInfo.some(col => col.name === 'random_order')

    if (!hasRandomOrder) {
      console.log(`[Database][${groupId}] 执行迁移：添加 groups.random_order 字段`)
      db.exec('ALTER TABLE groups ADD COLUMN random_order INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移完成：random_order 字段已添加`)
    }

    // 检查 messages 表是否有 prompt_tokens 字段
    const hasPromptTokens = tableInfo.some(col => col.name === 'prompt_tokens')
    if (!hasPromptTokens) {
      console.log(`[Database][${groupId}] 执行迁移：添加 messages.prompt_tokens / completion_tokens 字段`)
      db.exec('ALTER TABLE messages ADD COLUMN prompt_tokens INTEGER')
      db.exec('ALTER TABLE messages ADD COLUMN completion_tokens INTEGER')
      console.log(`[Database][${groupId}] 迁移完成：token 字段已添加`)
    }

    // 检查 groups 表是否有 auto_memory_extract 字段
    const hasAutoMemoryExtract = groupsTableInfo.some(col => col.name === 'auto_memory_extract')
    if (!hasAutoMemoryExtract) {
      console.log(`[Database][${groupId}] 执行迁移：添加 groups.auto_memory_extract 字段`)
      db.exec('ALTER TABLE groups ADD COLUMN auto_memory_extract INTEGER DEFAULT 0')
      console.log(`[Database][${groupId}] 迁移完成: auto_memory_extract 字段已添加`)
    }

    console.log(`[Database] 群组 ${groupId} 的数据库迁移检查完成`)
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
}
