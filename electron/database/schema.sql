-- ============================================================
-- 数据库 Schema（参考用）
-- 权威来源：electron/database/manager.js 中的 SCHEMA_SQL 常量
-- 本文件仅用于文档参考，实际建表以 manager.js 为准
-- ============================================================

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
  model TEXT,
  is_aftermath INTEGER NOT NULL DEFAULT 0,
  message_type TEXT NOT NULL DEFAULT 'normal',
  event_impact TEXT,
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
