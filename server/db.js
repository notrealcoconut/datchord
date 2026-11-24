import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DATA_DIR } from './uploads.js';
import { DEFAULT_MEMBER_PERMISSIONS } from './permissions.js';

export const DEFAULT_SETTINGS = {
  privacy: { showBio: true, showMemberSince: true },
  notifications: { level: 'mentions', sound: true, desktop: false },
  appearance: { theme: 'system', accent: 'tangerine', density: 'cozy', reduceMotion: false },
};

export function normalizeSettings(raw) {
  let parsed = {};
  if (raw && typeof raw === 'object') parsed = raw;
  else if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = {};
    }
  }
  return {
    privacy: { ...DEFAULT_SETTINGS.privacy, ...(parsed.privacy || {}) },
    notifications: { ...DEFAULT_SETTINGS.notifications, ...(parsed.notifications || {}) },
    appearance: { ...DEFAULT_SETTINGS.appearance, ...(parsed.appearance || {}) },
  };
}

export function mergeSettings(current, patch) {
  return {
    privacy: { ...current.privacy, ...(patch.privacy || {}) },
    notifications: { ...current.notifications, ...(patch.notifications || {}) },
    appearance: { ...current.appearance, ...(patch.appearance || {}) },
  };
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
const dbPath = process.env.DATABASE_PATH ? path.resolve(process.env.DATABASE_PATH) : path.join(DATA_DIR, 'datchord.db');

export const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    avatar_url TEXT,
    bio TEXT NOT NULL DEFAULT '',
    language TEXT NOT NULL DEFAULT 'en',
    settings_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    icon_url TEXT,
    owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    invite_code TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS server_members (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    nickname TEXT,
    joined_at TEXT NOT NULL,
    PRIMARY KEY (server_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT NOT NULL DEFAULT '#9aa3b5',
    position REAL NOT NULL DEFAULT 0,
    permissions INTEGER NOT NULL DEFAULT 0,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS member_roles (
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    PRIMARY KEY (server_id, user_id, role_id)
  );

  CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY,
    server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    topic TEXT NOT NULL DEFAULT '',
    position INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at TEXT
  );

  CREATE TABLE IF NOT EXISTS dm_conversations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL DEFAULT 'direct',
    name TEXT,
    owner_id TEXT REFERENCES users(id) ON DELETE SET NULL,
    direct_key TEXT UNIQUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dm_participants (
    conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    joined_at TEXT NOT NULL,
    last_read_at TEXT,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS dm_messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES dm_conversations(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    edited_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_members_user ON server_members(user_id);
  CREATE INDEX IF NOT EXISTS idx_roles_server ON roles(server_id);
  CREATE INDEX IF NOT EXISTS idx_member_roles_member ON member_roles(server_id, user_id);
  CREATE INDEX IF NOT EXISTS idx_channels_server ON channels(server_id, position);
  CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_participants_user ON dm_participants(user_id);
  CREATE INDEX IF NOT EXISTS idx_dm_messages_conversation ON dm_messages(conversation_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_dm_conversations_updated ON dm_conversations(updated_at);
`);

function ensureColumn(table, column, definition) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn('server_members', 'nickname', 'TEXT');

// New permissions are additive, so existing default roles can safely receive
// the bits that used to be implicit for every member.
db.prepare(
  `UPDATE roles SET permissions = permissions | ?
   WHERE is_default = 1 AND (permissions & ?) <> ?`,
).run(DEFAULT_MEMBER_PERMISSIONS, DEFAULT_MEMBER_PERMISSIONS, DEFAULT_MEMBER_PERMISSIONS);

// Remove conversations left behind by deleted accounts.
db.prepare(
  `DELETE FROM dm_conversations
   WHERE kind = 'direct'
     AND (SELECT COUNT(*) FROM dm_participants p WHERE p.conversation_id = dm_conversations.id) < 2`,
).run();
db.prepare(
  `DELETE FROM dm_conversations
   WHERE kind = 'group'
     AND NOT EXISTS (SELECT 1 FROM dm_participants p WHERE p.conversation_id = dm_conversations.id)`,
).run();

export function nowIso() {
  return new Date().toISOString();
}

export function getSettings(userRow) {
  return normalizeSettings(userRow?.settings_json);
}

export function saveSettings(userId, settings) {
  db.prepare('UPDATE users SET settings_json = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(settings), nowIso(), userId);
}

export function selfDto(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    email: user.email,
    avatarUrl: user.avatar_url || null,
    bio: user.bio || '',
    language: user.language,
    createdAt: user.created_at,
    settings: getSettings(user),
  };
}

export function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    avatarUrl: user.avatar_url || null,
  };
}

export function generateInviteCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i += 1) code += alphabet[Math.floor(Math.random() * alphabet.length)];
  return code;
}
