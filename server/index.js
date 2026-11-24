import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  db,
  DEFAULT_SETTINGS,
  generateInviteCode,
  getSettings,
  mergeSettings,
  nowIso,
  publicUser,
  saveSettings,
  selfDto,
} from './db.js';
import { ApiError } from './errors.js';
import { checkRateLimit, createSessionToken, hashPassword, hashToken, resetRateLimit, verifyPassword } from './security.js';
import {
  ALL_PERMISSIONS,
  DEFAULT_MEMBER_PERMISSIONS,
  PERMISSIONS,
  canActOnMember,
  canGrantPermissions,
  canManageRole,
  getMemberContext,
  getHighestRole,
  has,
} from './permissions.js';
import { deleteUpload, saveImage, UPLOAD_DIR } from './uploads.js';
import {
  dmConversationSummary,
  listDmConversations,
  listServersForUser,
  memberDto,
  serializeDmMessages,
  serializeMessages,
  serverDetail,
  serverSummary,
} from './dto.js';
import {
  SUPPORTED_LANGUAGES,
  bio,
  channelName,
  channelTopic,
  displayName,
  email,
  imageDataUrl,
  inviteCode,
  messageContent,
  password,
  permissions,
  roleColor,
  roleName,
  serverDescription,
  serverName,
  settingsPatch,
  text,
  username,
} from './validation.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(projectRoot, 'dist');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const SESSION_COOKIE = 'datchord_session';
const SESSION_DAYS = 30;
const MAX_BODY_BYTES = 8 * 1024 * 1024;
const STARTED_AT = Date.now();
const ONLINE_WINDOW_MS = 45 * 1000;
const TYPING_TTL_MS = 7 * 1000;

const presence = new Map();
const typingByChannel = new Map();
const typingByConversation = new Map();
const sseClients = new Map();

function touchPresence(userId) {
  const lastSeen = presence.get(userId);
  const wasOnline = typeof lastSeen === 'number' && Date.now() - lastSeen < ONLINE_WINDOW_MS;
  presence.set(userId, Date.now());
  if (!wasOnline) broadcastPresence(userId, true);
}

function isOnline(userId) {
  const lastSeen = presence.get(userId);
  if (typeof lastSeen !== 'number') return false;
  if (Date.now() - lastSeen >= ONLINE_WINDOW_MS) {
    presence.delete(userId);
    broadcastPresence(userId, false);
    return false;
  }
  return true;
}

function clearTyping(channelId, userId) {
  const map = typingByChannel.get(channelId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) typingByChannel.delete(channelId);
}

function listTypingUsers(channelId, serverId, excludeUserId) {
  const map = typingByChannel.get(channelId);
  if (!map) return [];
  const now = Date.now();
  const ids = [];
  for (const [userId, expiresAt] of map) {
    if (expiresAt <= now) map.delete(userId);
    else if (userId !== excludeUserId) ids.push(userId);
  }
  if (map.size === 0) typingByChannel.delete(channelId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(
      `SELECT u.id, COALESCE(sm.nickname, u.display_name) AS display_name
       FROM users u
       LEFT JOIN server_members sm ON sm.user_id = u.id AND sm.server_id = ?
       WHERE u.id IN (${placeholders})`,
    )
    .all(serverId, ...ids);
  return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
}

function clearDmTyping(conversationId, userId) {
  const map = typingByConversation.get(conversationId);
  if (!map) return;
  map.delete(userId);
  if (map.size === 0) typingByConversation.delete(conversationId);
}

function listDmTypingUsers(conversationId, excludeUserId) {
  const map = typingByConversation.get(conversationId);
  if (!map) return [];
  const now = Date.now();
  const ids = [];
  for (const [userId, expiresAt] of map) {
    if (expiresAt <= now) map.delete(userId);
    else if (userId !== excludeUserId) ids.push(userId);
  }
  if (map.size === 0) typingByConversation.delete(conversationId);
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => '?').join(', ');
  const rows = db
    .prepare(`SELECT id, display_name FROM users WHERE id IN (${placeholders})`)
    .all(...ids);
  return rows.map((row) => ({ id: row.id, displayName: row.display_name }));
}

function sseSend(res, payload) {
  if (res.writableEnded) return false;
  try {
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
}

function addSseClient(userId, res) {
  let clients = sseClients.get(userId);
  if (!clients) {
    clients = new Set();
    sseClients.set(userId, clients);
  }
  clients.add(res);
}

function removeSseClient(userId, res) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  clients.delete(res);
  if (clients.size === 0) sseClients.delete(userId);
}

function closeSseForUser(userId) {
  const clients = sseClients.get(userId);
  if (!clients) return;
  for (const res of clients) {
    try {
      res.end();
    } catch {
      /* ignore */
    }
  }
  sseClients.delete(userId);
}

function broadcastToUserIds(userIds, payload) {
  for (const userId of new Set(userIds)) {
    const clients = sseClients.get(userId);
    if (!clients) continue;
    for (const res of [...clients]) {
      if (!sseSend(res, payload)) {
        clients.delete(res);
        if (clients.size === 0) sseClients.delete(userId);
      }
    }
  }
}

function serverAudience(serverId) {
  return db
    .prepare('SELECT user_id FROM server_members WHERE server_id = ?')
    .all(serverId)
    .map((row) => row.user_id);
}

function conversationAudience(conversationId) {
  return db
    .prepare('SELECT user_id FROM dm_participants WHERE conversation_id = ?')
    .all(conversationId)
    .map((row) => row.user_id);
}

function broadcastServer(serverId, payload) {
  broadcastToUserIds(serverAudience(serverId), payload);
}

function broadcastConversation(conversationId, payload) {
  broadcastToUserIds(conversationAudience(conversationId), payload);
}

function presenceAudience(userId) {
  const ids = new Set([userId]);
  const serverIds = db
    .prepare('SELECT server_id FROM server_members WHERE user_id = ?')
    .all(userId)
    .map((row) => row.server_id);
  if (serverIds.length > 0) {
    const placeholders = serverIds.map(() => '?').join(', ');
    const rows = db
      .prepare(`SELECT DISTINCT user_id FROM server_members WHERE server_id IN (${placeholders})`)
      .all(...serverIds);
    for (const row of rows) ids.add(row.user_id);
  }
  const dmRows = db
    .prepare(
      `SELECT DISTINCT p2.user_id FROM dm_participants p1
       JOIN dm_participants p2 ON p2.conversation_id = p1.conversation_id
       WHERE p1.user_id = ?`,
    )
    .all(userId);
  for (const row of dmRows) ids.add(row.user_id);
  return [...ids];
}

function broadcastPresence(userId, online) {
  broadcastToUserIds(presenceAudience(userId), { type: 'presence', userId, online });
}

const presenceSweep = setInterval(() => {
  const now = Date.now();
  for (const [userId, lastSeen] of [...presence]) {
    if (now - lastSeen < ONLINE_WINDOW_MS) continue;
    presence.delete(userId);
    broadcastPresence(userId, false);
  }
}, 30 * 1000);
presenceSweep.unref?.();

const typingSweep = setInterval(() => {
  const now = Date.now();
  for (const map of typingByChannel.values()) {
    for (const [userId, expiresAt] of map) if (expiresAt <= now) map.delete(userId);
  }
  for (const map of typingByConversation.values()) {
    for (const [userId, expiresAt] of map) if (expiresAt <= now) map.delete(userId);
  }
}, 15 * 1000);
typingSweep.unref?.();


const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

function baseHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  );
}

function sendJson(res, status, payload, extraHeaders = {}) {
  if (res.writableEnded) return;
  const body = payload === undefined ? '' : JSON.stringify(payload);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  for (const [key, value] of Object.entries(extraHeaders)) res.setHeader(key, value);
  if (status === 204 || body === '') {
    res.end();
    return;
  }
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}

function readBody(req, limit = MAX_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers['content-length'] || 0);
    if (contentLength > limit) {
      req.resume();
      reject(new ApiError('PAYLOAD_TOO_LARGE', 413));
      return;
    }
    const chunks = [];
    let size = 0;
    let done = false;
    req.on('data', (chunk) => {
      if (done) return;
      size += chunk.length;
      if (size > limit) {
        done = true;
        req.resume();
        reject(new ApiError('PAYLOAD_TOO_LARGE', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (done) return;
      resolve(Buffer.concat(chunks));
    });
    req.on('error', (error) => {
      if (done) return;
      done = true;
      reject(error);
    });
  });
}

async function readJson(req) {
  const raw = await readBody(req);
  if (!raw.length) return {};
  const contentType = String(req.headers['content-type'] || '');
  if (!contentType.includes('application/json')) throw new ApiError('INVALID_CONTENT_TYPE', 415);
  try {
    const parsed = JSON.parse(raw.toString('utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    return parsed;
  } catch {
    throw new ApiError('INVALID_JSON', 400);
  }
}

function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const result = {};
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = decodeURIComponent(value);
  }
  return result;
}

function isSecureRequest(req) {
  if (process.env.COOKIE_SECURE === 'true') return true;
  return String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
}

function setSessionCookie(req, res, token) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_DAYS * 24 * 60 * 60}`,
  ];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function clearSessionCookie(req, res) {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isSecureRequest(req)) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
}

function createSession(req, res, userId) {
  const token = createSessionToken();
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());
  db.prepare('INSERT INTO sessions (id, token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').run(
    randomUUID(),
    hashToken(token),
    userId,
    now.toISOString(),
    expires.toISOString(),
  );
  setSessionCookie(req, res, token);
}

function authenticate(req) {
  if (req._auth !== undefined) return req._auth;
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (!token) {
    req._auth = null;
    return null;
  }
  const row = db
    .prepare(
      `SELECT s.id AS session_id, s.expires_at AS session_expires_at, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
    )
    .get(hashToken(token));
  if (!row) {
    req._auth = null;
    return null;
  }
  if (new Date(row.session_expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(row.session_id);
    req._auth = null;
    return null;
  }
  req._auth = { sessionId: row.session_id, user: row };
  return req._auth;
}

function requireUser(req) {
  const auth = authenticate(req);
  if (!auth) throw new ApiError('UNAUTHORIZED', 401);
  touchPresence(auth.user.id);
  return auth;
}

function getIp(req) {
  // Behind a trusted reverse proxy (Render, Northflank, etc.) the socket
  // address is the proxy, so rate limits would be shared by every visitor.
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = String(req.headers['x-forwarded-for'] || '')
      .split(',')[0]
      .trim();
    if (forwarded) return forwarded;
  }
  return req.socket.remoteAddress || 'unknown';
}

function enforceRateLimit(req, action, max, windowMs, suffix = '') {
  if (!checkRateLimit(`${action}:${getIp(req)}:${suffix}`, max, windowMs)) {
    throw new ApiError('RATE_LIMITED', 429);
  }
}

function memberContextOrThrow(userId, serverId) {
  const context = getMemberContext(db, userId, serverId);
  if (!context) throw new ApiError('SERVER_NOT_FOUND', 404);
  return context;
}

function requirePermission(context, bit) {
  if (!has(context.permissions, bit)) throw new ApiError('FORBIDDEN', 403);
}

function canMentionEveryone(context) {
  return context.isOwner || has(context.permissions, PERMISSIONS.MENTION_EVERYONE);
}

function mentionsEveryone(content) {
  return /(^|\s)@(everyone|here)\b/i.test(content);
}

function requireOwner(context) {
  if (!context.isOwner) throw new ApiError('FORBIDDEN', 403);
}

function transaction(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    try {
      db.exec('ROLLBACK');
    } catch {
      /* ignore rollback issues */
    }
    throw error;
  }
}

function uniqueInviteCode() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const code = generateInviteCode();
    if (!db.prepare('SELECT 1 FROM servers WHERE invite_code = ?').get(code)) return code;
  }
  throw new Error('Unable to generate a unique invite code');
}

function serverChannelOrThrow(channelId) {
  const channel = db
    .prepare(
      `SELECT c.*, s.name AS server_name FROM channels c
       JOIN servers s ON s.id = c.server_id
       WHERE c.id = ?`,
    )
    .get(channelId);
  if (!channel) throw new ApiError('CHANNEL_NOT_FOUND', 404);
  return channel;
}

function messageOrThrow(messageId) {
  const message = db
    .prepare(
      `SELECT m.*, c.server_id, c.name AS channel_name FROM messages m
       JOIN channels c ON c.id = m.channel_id
       WHERE m.id = ?`,
    )
    .get(messageId);
  if (!message) throw new ApiError('MESSAGE_NOT_FOUND', 404);
  return message;
}

function dmConversationOrThrow(conversationId) {
  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
  if (!conversation) throw new ApiError('CONVERSATION_NOT_FOUND', 404);
  return conversation;
}

function requireDmParticipant(conversationId, userId) {
  const conversation = dmConversationOrThrow(conversationId);
  const participant = db
    .prepare('SELECT * FROM dm_participants WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
  if (!participant) throw new ApiError('CONVERSATION_NOT_FOUND', 404);
  return { conversation, participant };
}

function directKey(userA, userB) {
  return [userA, userB].sort().join(':');
}

function cleanGroupName(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ApiError('INVALID_INPUT', 400, 'name');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 64) throw new ApiError('TOO_LONG', 400, 'name');
  return trimmed;
}

function withOnline(conversation) {
  return {
    ...conversation,
    onlineUserIds: conversation.participants.filter((participant) => isOnline(participant.id)).map((participant) => participant.id),
  };
}

function dmMessageOrThrow(messageId) {
  const message = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(messageId);
  if (!message) throw new ApiError('MESSAGE_NOT_FOUND', 404);
  return message;
}

function validatePermissionsSubset(context, permissionBits) {
  if ((permissionBits & ~ALL_PERMISSIONS) !== 0) throw new ApiError('INVALID_PERMISSIONS', 400, 'permissions');
  if (!canGrantPermissions(context, permissionBits)) throw new ApiError('PERMISSION_GRANT', 403);
}

function defaultRole(serverId) {
  return db.prepare('SELECT * FROM roles WHERE server_id = ? AND is_default = 1').get(serverId);
}

function addMemberToServer(serverId, userId) {
  const joinedAt = nowIso();
  db.prepare('INSERT OR IGNORE INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)').run(serverId, userId, joinedAt);
  const role = defaultRole(serverId);
  if (role) {
    db.prepare('INSERT OR IGNORE INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)').run(serverId, userId, role.id);
  }
  return joinedAt;
}

function originAllowed(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  try {
    const parsed = new URL(origin);
    if (parsed.host === req.headers.host) return true;
    const configured = String(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (configured.includes(origin)) return true;
    if (process.env.NODE_ENV !== 'production' && (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const routes = [];

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function route(method, pattern, handler) {
  const keys = [];
  let source = '';
  let lastIndex = 0;
  const matcher = /:([A-Za-z]+)/g;
  let match;
  while ((match = matcher.exec(pattern))) {
    source += escapeRegExp(pattern.slice(lastIndex, match.index));
    source += '([^/]+)';
    keys.push(match[1]);
    lastIndex = match.index + match[0].length;
  }
  source += escapeRegExp(pattern.slice(lastIndex));
  routes.push({ method, regex: new RegExp(`^${source}$`), keys, handler });
}

function findRoute(method, pathname) {
  for (const candidate of routes) {
    if (candidate.method !== method) continue;
    const match = candidate.regex.exec(pathname);
    if (!match) continue;
    const params = {};
    candidate.keys.forEach((key, index) => {
      params[key] = decodeURIComponent(match[index + 1]);
    });
    return { route: candidate, params };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

route('POST', '/api/auth/register', async ({ req, res, body }) => {
  enforceRateLimit(req, 'register', 8, 60 * 60 * 1000);
  const cleanUsername = username(body.username);
  const cleanEmail = email(body.email);
  const cleanPassword = password(body.password);
  const cleanDisplayName = body.displayName ? displayName(body.displayName) : cleanUsername;
  const cleanLanguage = body.language && SUPPORTED_LANGUAGES.includes(body.language) ? body.language : 'en';
  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(cleanEmail)) throw new ApiError('EMAIL_TAKEN', 409, 'email');
  if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(cleanUsername)) throw new ApiError('USERNAME_TAKEN', 409, 'username');
  const id = randomUUID();
  const timestamp = nowIso();
  try {
    db.prepare(
      `INSERT INTO users (id, username, email, display_name, password_hash, avatar_url, bio, language, settings_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NULL, '', ?, ?, ?, ?)`,
    ).run(id, cleanUsername, cleanEmail, cleanDisplayName, hashPassword(cleanPassword), cleanLanguage, JSON.stringify(DEFAULT_SETTINGS), timestamp, timestamp);
  } catch (error) {
    if (String(error.message).includes('UNIQUE')) throw new ApiError('USERNAME_TAKEN', 409);
    throw error;
  }
  resetRateLimit(`login:${getIp(req)}:${cleanEmail}`);
  createSession(req, res, id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return { status: 201, body: { user: selfDto(user), servers: [] } };
});

route('POST', '/api/auth/login', async ({ req, res, body }) => {
  enforceRateLimit(req, 'login-ip', 40, 15 * 60 * 1000);
  const cleanEmail = email(body.email);
  enforceRateLimit(req, 'login', 12, 15 * 60 * 1000, cleanEmail);
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(cleanEmail);
  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  if (!user || !verifyPassword(suppliedPassword, user.password_hash)) {
    throw new ApiError('INVALID_CREDENTIALS', 401);
  }
  resetRateLimit(`login:${getIp(req)}:${cleanEmail}`);
  createSession(req, res, user.id);
  return { status: 200, body: { user: selfDto(user), servers: listServersForUser(db, user.id) } };
});

route('POST', '/api/auth/logout', async ({ req, res }) => {
  const auth = authenticate(req);
  if (auth) {
    db.prepare('DELETE FROM sessions WHERE id = ?').run(auth.sessionId);
    const remaining = db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE user_id = ?').get(auth.user.id).count;
    if (remaining === 0) {
      presence.delete(auth.user.id);
      broadcastPresence(auth.user.id, false);
      closeSseForUser(auth.user.id);
    }
  }
  clearSessionCookie(req, res);
  return { status: 204 };
});

route('GET', '/api/me', async ({ req }) => {
  const { user } = requireUser(req);
  return { status: 200, body: { user: selfDto(user), servers: listServersForUser(db, user.id) } };
});

route('POST', '/api/presence/heartbeat', async ({ req }) => {
  const { user } = requireUser(req);
  touchPresence(user.id);
  return { status: 204 };
});

route('GET', '/api/events', async ({ req, res }) => {
  const { user } = requireUser(req);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders?.();
  addSseClient(user.id, res);
  touchPresence(user.id);
  sseSend(res, { type: 'ready', userId: user.id });
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    removeSseClient(user.id, res);
  };
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        cleanup();
      }
    }
  }, 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
  res.on('close', () => {
    clearInterval(heartbeat);
    cleanup();
  });
  return { status: 200, handled: true };
});

route('GET', '/api/users/search', async ({ req, url }) => {
  const { user } = requireUser(req);
  const query = String(url.searchParams.get('q') || '').trim();
  if (query.length < 2) return { status: 200, body: { users: [] } };
  enforceRateLimit(req, 'user-search', 60, 60 * 1000);
  const like = `%${query}%`;
  const rows = db
    .prepare(
      `SELECT * FROM users
       WHERE id <> ? AND (username LIKE ? COLLATE NOCASE OR display_name LIKE ? COLLATE NOCASE)
       ORDER BY display_name ASC LIMIT 10`,
    )
    .all(user.id, like, like);
  return { status: 200, body: { users: rows.map(publicUser) } };
});

route('PATCH', '/api/me/profile', async ({ req, body }) => {
  const { user } = requireUser(req);
  const cleanDisplayName = body.displayName !== undefined ? displayName(body.displayName) : user.display_name;
  const cleanUsername = body.username !== undefined ? username(body.username) : user.username;
  const cleanBio = body.bio !== undefined ? bio(body.bio) : user.bio;
  const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id <> ?').get(cleanUsername, user.id);
  if (existing) throw new ApiError('USERNAME_TAKEN', 409, 'username');
  db.prepare('UPDATE users SET display_name = ?, username = ?, bio = ?, updated_at = ? WHERE id = ?').run(
    cleanDisplayName,
    cleanUsername,
    cleanBio,
    nowIso(),
    user.id,
  );
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { status: 200, body: { user: selfDto(updated) } };
});

route('PATCH', '/api/me/account', async ({ req, body }) => {
  const { user } = requireUser(req);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  if (!verifyPassword(currentPassword, user.password_hash)) throw new ApiError('INVALID_PASSWORD', 401, 'currentPassword');
  const cleanEmail = email(body.email);
  const existing = db.prepare('SELECT id FROM users WHERE email = ? AND id <> ?').get(cleanEmail, user.id);
  if (existing) throw new ApiError('EMAIL_TAKEN', 409, 'email');
  db.prepare('UPDATE users SET email = ?, updated_at = ? WHERE id = ?').run(cleanEmail, nowIso(), user.id);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { status: 200, body: { user: selfDto(updated) } };
});

route('PATCH', '/api/me/password', async ({ req, body }) => {
  const { user, sessionId } = requireUser(req);
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
  if (!verifyPassword(currentPassword, user.password_hash)) throw new ApiError('INVALID_PASSWORD', 401, 'currentPassword');
  const newPassword = password(body.newPassword);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(hashPassword(newPassword), nowIso(), user.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND id <> ?').run(user.id, sessionId);
  return { status: 200, body: { ok: true } };
});

route('PATCH', '/api/me/settings', async ({ req, body }) => {
  const { user } = requireUser(req);
  const patch = settingsPatch(body.settings || body);
  const current = getSettings(user);
  const merged = mergeSettings(current, patch);
  saveSettings(user.id, merged);
  if (body.language !== undefined) {
    if (!SUPPORTED_LANGUAGES.includes(body.language)) throw new ApiError('INVALID_LANGUAGE', 400, 'language');
    db.prepare('UPDATE users SET language = ?, updated_at = ? WHERE id = ?').run(body.language, nowIso(), user.id);
  }
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { status: 200, body: { user: selfDto(updated) } };
});

route('POST', '/api/me/avatar', async ({ req, body }) => {
  const { user } = requireUser(req);
  const saved = saveImage(imageDataUrl(body.image), 'avatar');
  db.prepare('UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?').run(saved.url, nowIso(), user.id);
  deleteUpload(user.avatar_url);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { status: 200, body: { user: selfDto(updated) } };
});

route('DELETE', '/api/me/avatar', async ({ req }) => {
  const { user } = requireUser(req);
  db.prepare('UPDATE users SET avatar_url = NULL, updated_at = ? WHERE id = ?').run(nowIso(), user.id);
  deleteUpload(user.avatar_url);
  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  return { status: 200, body: { user: selfDto(updated) } };
});

route('DELETE', '/api/me', async ({ req, res, body }) => {
  const { user } = requireUser(req);
  const suppliedPassword = typeof body.password === 'string' ? body.password : '';
  if (!verifyPassword(suppliedPassword, user.password_hash)) throw new ApiError('INVALID_PASSWORD', 401, 'password');
  const owned = db.prepare('SELECT COUNT(*) AS count FROM servers WHERE owner_id = ?').get(user.id).count;
  if (owned > 0) throw new ApiError('OWNS_SERVERS', 409);
  const affectedConversations = db
    .prepare('SELECT conversation_id FROM dm_participants WHERE user_id = ?')
    .all(user.id)
    .map((row) => row.conversation_id)
    .map((id) => ({ id, audience: conversationAudience(id).filter((id) => id !== user.id) }));
  db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
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
  for (const conversation of affectedConversations) {
    if (conversation.audience.length === 0) continue;
    broadcastToUserIds(conversation.audience, {
      type: 'dm-removed',
      conversationId: conversation.id,
    });
  }
  deleteUpload(user.avatar_url);
  presence.delete(user.id);
  broadcastPresence(user.id, false);
  closeSseForUser(user.id);
  clearSessionCookie(req, res);
  return { status: 204 };
});

// ---------------------------------------------------------------------------
// Servers
// ---------------------------------------------------------------------------

route('GET', '/api/servers', async ({ req }) => {
  const { user } = requireUser(req);
  return { status: 200, body: { servers: listServersForUser(db, user.id) } };
});

route('POST', '/api/servers', async ({ req, body }) => {
  const { user } = requireUser(req);
  const cleanName = serverName(body.name);
  const cleanDescription = serverDescription(body.description);
  let saved = null;
  if (body.image) saved = saveImage(imageDataUrl(body.image), 'server');
  try {
    const result = transaction(() => {
      const serverId = randomUUID();
      const channelId = randomUUID();
      const roleId = randomUUID();
      const timestamp = nowIso();
      db.prepare(
        `INSERT INTO servers (id, name, description, icon_url, owner_id, invite_code, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(serverId, cleanName, cleanDescription, saved ? saved.url : null, user.id, uniqueInviteCode(), timestamp, timestamp);
      db.prepare('INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)').run(serverId, user.id, timestamp);
      db.prepare(
        `INSERT INTO roles (id, server_id, name, color, position, permissions, is_default, created_at)
         VALUES (?, ?, 'Member', '#9aa3b5', 0, ?, 1, ?)`,
      ).run(roleId, serverId, DEFAULT_MEMBER_PERMISSIONS, timestamp);
      db.prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)').run(serverId, user.id, roleId);
      db.prepare(
        `INSERT INTO channels (id, server_id, name, topic, position, created_at, updated_at)
         VALUES (?, ?, 'general', '', 0, ?, ?)`,
      ).run(channelId, serverId, timestamp, timestamp);
      return { serverId, channelId };
    });
    const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(result.serverId);
    return { status: 201, body: { server: serverSummary(db, user.id, server), channelId: result.channelId } };
  } catch (error) {
    if (saved) deleteUpload(saved.url);
    throw error;
  }
});

route('POST', '/api/servers/join', async ({ req, body }) => {
  const { user } = requireUser(req);
  enforceRateLimit(req, 'join', 30, 10 * 60 * 1000);
  const cleanCode = inviteCode(body.code);
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ? COLLATE NOCASE').get(cleanCode);
  if (!server) throw new ApiError('INVALID_INVITE', 404);
  const existing = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(server.id, user.id);
  if (!existing) {
    transaction(() => addMemberToServer(server.id, user.id));
    broadcastServer(server.id, { type: 'server', serverId: server.id, scope: 'members' });
    touchPresence(user.id);
  }
  const channel = db
    .prepare('SELECT id FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC LIMIT 1')
    .get(server.id);
  return {
    status: 200,
    body: {
      server: serverSummary(db, user.id, server),
      channelId: channel ? channel.id : null,
      alreadyMember: Boolean(existing),
    },
  };
});

route('GET', '/api/servers/:serverId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const detail = serverDetail(db, user.id, params.serverId);
  if (!detail) throw new ApiError('SERVER_NOT_FOUND', 404);
  return { status: 200, body: { server: detail } };
});

route('GET', '/api/servers/:serverId/presence', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  const memberIds = db
    .prepare('SELECT user_id FROM server_members WHERE server_id = ?')
    .all(context.server.id)
    .map((row) => row.user_id);
  const onlineUserIds = memberIds.filter((id) => isOnline(id));
  return { status: 200, body: { onlineUserIds } };
});

route('POST', '/api/servers/:serverId/invite/rotate', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_INVITES);
  const code = uniqueInviteCode();
  db.prepare('UPDATE servers SET invite_code = ?, updated_at = ? WHERE id = ?').run(code, nowIso(), context.server.id);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id });
  return { status: 200, body: { inviteCode: code } };
});

route('PATCH', '/api/servers/:serverId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_SERVER);
  const cleanName = body.name !== undefined ? serverName(body.name) : context.server.name;
  const cleanDescription = body.description !== undefined ? serverDescription(body.description) : context.server.description;
  db.prepare('UPDATE servers SET name = ?, description = ?, updated_at = ? WHERE id = ?').run(
    cleanName,
    cleanDescription,
    nowIso(),
    context.server.id,
  );
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id });
  return { status: 200, body: { server: serverDetail(db, user.id, context.server.id) } };
});

route('DELETE', '/api/servers/:serverId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requireOwner(context);
  const confirmation = typeof body.confirmName === 'string' ? body.confirmName.trim() : '';
  if (confirmation !== context.server.name) throw new ApiError('CONFIRMATION_MISMATCH', 400, 'confirmName');
  const audience = serverAudience(context.server.id);
  deleteUpload(context.server.icon_url);
  db.prepare('DELETE FROM servers WHERE id = ?').run(context.server.id);
  broadcastToUserIds(audience, { type: 'server-removed', serverId: context.server.id });
  return { status: 200, body: { ok: true } };
});

route('POST', '/api/servers/:serverId/icon', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_SERVER);
  const saved = saveImage(imageDataUrl(body.image), 'server');
  db.prepare('UPDATE servers SET icon_url = ?, updated_at = ? WHERE id = ?').run(saved.url, nowIso(), context.server.id);
  deleteUpload(context.server.icon_url);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id });
  return { status: 200, body: { iconUrl: saved.url } };
});

route('DELETE', '/api/servers/:serverId/icon', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_SERVER);
  db.prepare('UPDATE servers SET icon_url = NULL, updated_at = ? WHERE id = ?').run(nowIso(), context.server.id);
  deleteUpload(context.server.icon_url);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id });
  return { status: 200, body: { iconUrl: null } };
});

route('POST', '/api/servers/:serverId/transfer', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requireOwner(context);
  const targetUserId = typeof body.userId === 'string' ? body.userId : '';
  if (!targetUserId || targetUserId === user.id) throw new ApiError('INVALID_TARGET', 400, 'userId');
  const target = db
    .prepare('SELECT u.* FROM users u JOIN server_members sm ON sm.user_id = u.id WHERE u.id = ? AND sm.server_id = ?')
    .get(targetUserId, context.server.id);
  if (!target) throw new ApiError('MEMBER_NOT_FOUND', 404);
  const confirmation = typeof body.confirmName === 'string' ? body.confirmName.trim() : '';
  if (confirmation !== context.server.name) throw new ApiError('CONFIRMATION_MISMATCH', 400, 'confirmName');
  db.prepare('UPDATE servers SET owner_id = ?, updated_at = ? WHERE id = ?').run(target.id, nowIso(), context.server.id);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'members' });
  return { status: 200, body: { ok: true } };
});

route('POST', '/api/servers/:serverId/leave', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  if (context.isOwner) throw new ApiError('OWNER_CANNOT_LEAVE', 409);
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(context.server.id, user.id);
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(context.server.id, user.id);
  broadcastToUserIds([user.id], { type: 'server-removed', serverId: context.server.id });
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'members' });
  broadcastPresence(user.id, false);
  return { status: 204 };
});

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

route('POST', '/api/servers/:serverId/channels', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_CHANNELS);
  const cleanName = channelName(body.name);
  const cleanTopic = channelTopic(body.topic);
  const existing = db.prepare('SELECT 1 FROM channels WHERE server_id = ? AND name = ?').get(context.server.id, cleanName);
  if (existing) throw new ApiError('CHANNEL_EXISTS', 409, 'name');
  const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS max FROM channels WHERE server_id = ?').get(context.server.id).max;
  const id = randomUUID();
  const timestamp = nowIso();
  db.prepare(
    `INSERT INTO channels (id, server_id, name, topic, position, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, context.server.id, cleanName, cleanTopic, max + 1, timestamp, timestamp);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'channels' });
  return { status: 201, body: { channel: { id, name: cleanName, topic: cleanTopic, position: max + 1, createdAt: timestamp } } };
});

route('PATCH', '/api/servers/:serverId/channels/:channelId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_CHANNELS);
  const channel = serverChannelOrThrow(params.channelId);
  if (channel.server_id !== context.server.id) throw new ApiError('CHANNEL_NOT_FOUND', 404);
  const cleanName = body.name !== undefined ? channelName(body.name) : channel.name;
  const cleanTopic = body.topic !== undefined ? channelTopic(body.topic) : channel.topic;
  const existing = db
    .prepare('SELECT 1 FROM channels WHERE server_id = ? AND name = ? AND id <> ?')
    .get(context.server.id, cleanName, channel.id);
  if (existing) throw new ApiError('CHANNEL_EXISTS', 409, 'name');
  db.prepare('UPDATE channels SET name = ?, topic = ?, updated_at = ? WHERE id = ?').run(cleanName, cleanTopic, nowIso(), channel.id);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'channels' });
  return { status: 200, body: { channel: { ...channel, name: cleanName, topic: cleanTopic } } };
});

route('DELETE', '/api/servers/:serverId/channels/:channelId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_CHANNELS);
  const channel = serverChannelOrThrow(params.channelId);
  if (channel.server_id !== context.server.id) throw new ApiError('CHANNEL_NOT_FOUND', 404);
  const count = db.prepare('SELECT COUNT(*) AS count FROM channels WHERE server_id = ?').get(context.server.id).count;
  if (count <= 1) throw new ApiError('LAST_CHANNEL', 409);
  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'channels' });
  return { status: 200, body: { ok: true } };
});

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

route('POST', '/api/servers/:serverId/roles', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_ROLES);
  const cleanName = roleName(body.name);
  const cleanColor = roleColor(body.color);
  const permissionBits = permissions(body.permissions ?? 0);
  validatePermissionsSubset(context, permissionBits);
  const duplicate = db
    .prepare('SELECT 1 FROM roles WHERE server_id = ? AND lower(name) = lower(?)')
    .get(context.server.id, cleanName);
  if (duplicate) throw new ApiError('ROLE_EXISTS', 409, 'name');
  const max = db.prepare('SELECT COALESCE(MAX(position), 0) AS max FROM roles WHERE server_id = ? AND is_default = 0').get(context.server.id).max;
  let position = max + 10;
  if (!context.isOwner) position = Math.min(position, context.highestPosition - 0.5);
  if (position <= 0) throw new ApiError('ROLE_HIERARCHY', 403);
  const id = randomUUID();
  db.prepare(
    `INSERT INTO roles (id, server_id, name, color, position, permissions, is_default, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
  ).run(id, context.server.id, cleanName, cleanColor, position, permissionBits, nowIso());
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'roles' });
  return {
    status: 201,
    body: {
      role: { id, name: cleanName, color: cleanColor, position, permissions: permissionBits, isDefault: false, memberCount: 0 },
    },
  };
});

route('PATCH', '/api/servers/:serverId/roles/:roleId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_ROLES);
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(params.roleId, context.server.id);
  if (!role) throw new ApiError('ROLE_NOT_FOUND', 404);
  if (!canManageRole(context, role)) throw new ApiError('ROLE_HIERARCHY', 403);
  const isDefault = Boolean(role.is_default);
  const cleanName = !isDefault && body.name !== undefined ? roleName(body.name) : role.name;
  const cleanColor = !isDefault && body.color !== undefined ? roleColor(body.color) : role.color;
  const permissionBits = body.permissions !== undefined ? permissions(body.permissions) : role.permissions;
  validatePermissionsSubset(context, permissionBits);
  if (!isDefault) {
    const duplicate = db
      .prepare('SELECT 1 FROM roles WHERE server_id = ? AND lower(name) = lower(?) AND id <> ?')
      .get(context.server.id, cleanName, role.id);
    if (duplicate) throw new ApiError('ROLE_EXISTS', 409, 'name');
  }
  db.prepare('UPDATE roles SET name = ?, color = ?, permissions = ? WHERE id = ?').run(
    cleanName,
    cleanColor,
    permissionBits,
    role.id,
  );
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'roles' });
  return {
    status: 200,
    body: {
      role: {
        id: role.id,
        name: cleanName,
        color: cleanColor,
        position: role.position,
        permissions: permissionBits,
        isDefault,
        memberCount: role.is_default
          ? db.prepare('SELECT COUNT(*) AS count FROM server_members WHERE server_id = ?').get(context.server.id).count
          : db.prepare('SELECT COUNT(*) AS count FROM member_roles WHERE role_id = ?').get(role.id).count,
      },
    },
  };
});

route('DELETE', '/api/servers/:serverId/roles/:roleId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_ROLES);
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(params.roleId, context.server.id);
  if (!role) throw new ApiError('ROLE_NOT_FOUND', 404);
  if (role.is_default) throw new ApiError('DEFAULT_ROLE_PROTECTED', 409);
  if (!canManageRole(context, role)) throw new ApiError('ROLE_HIERARCHY', 403);
  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id);
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'roles' });
  return { status: 200, body: { ok: true } };
});

route('POST', '/api/servers/:serverId/roles/:roleId/move', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_ROLES);
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(params.roleId, context.server.id);
  if (!role) throw new ApiError('ROLE_NOT_FOUND', 404);
  if (role.is_default) throw new ApiError('DEFAULT_ROLE_PROTECTED', 409);
  if (!canManageRole(context, role)) throw new ApiError('ROLE_HIERARCHY', 403);
  const direction = body.direction === 'up' ? 'up' : body.direction === 'down' ? 'down' : null;
  if (!direction) throw new ApiError('INVALID_INPUT', 400, 'direction');
  const neighbor =
    direction === 'up'
      ? db
          .prepare(
            'SELECT * FROM roles WHERE server_id = ? AND is_default = 0 AND position > ? ORDER BY position ASC, created_at ASC LIMIT 1',
          )
          .get(context.server.id, role.position)
      : db
          .prepare(
            'SELECT * FROM roles WHERE server_id = ? AND is_default = 0 AND position < ? ORDER BY position DESC, created_at DESC LIMIT 1',
          )
          .get(context.server.id, role.position);
  if (!neighbor) return { status: 200, body: { ok: true } };
  if (!canManageRole(context, neighbor)) throw new ApiError('ROLE_HIERARCHY', 403);
  transaction(() => {
    db.prepare('UPDATE roles SET position = ? WHERE id = ?').run(neighbor.position, role.id);
    db.prepare('UPDATE roles SET position = ? WHERE id = ?').run(role.position, neighbor.id);
  });
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'roles' });
  return { status: 200, body: { ok: true } };
});

// ---------------------------------------------------------------------------
// Members
// ---------------------------------------------------------------------------

route('PUT', '/api/servers/:serverId/members/:userId/roles', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_ROLES);
  if (params.userId === user.id) throw new ApiError('SELF_ROLE_CHANGE', 403);
  if (params.userId === context.server.owner_id) throw new ApiError('OWNER_PROTECTED', 403);
  const target = db
    .prepare('SELECT u.*, sm.joined_at FROM users u JOIN server_members sm ON sm.user_id = u.id WHERE u.id = ? AND sm.server_id = ?')
    .get(params.userId, context.server.id);
  if (!target) throw new ApiError('MEMBER_NOT_FOUND', 404);
  const targetHighest = getHighestRole(db, context.server.id, target.id);
  if (!canActOnMember(context, {
    targetIsOwner: false,
    targetHighestPosition: targetHighest ? targetHighest.position : 0,
    targetUserId: target.id,
    actorUserId: user.id,
  })) {
    throw new ApiError('ROLE_HIERARCHY', 403);
  }
  if (!Array.isArray(body.roleIds)) throw new ApiError('INVALID_INPUT', 400, 'roleIds');
  const uniqueRoleIds = [...new Set(body.roleIds.filter((id) => typeof id === 'string'))];
  const selectedRoles = [];
  for (const roleId of uniqueRoleIds) {
    const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(roleId, context.server.id);
    if (!role) throw new ApiError('ROLE_NOT_FOUND', 404);
    if (role.is_default) continue;
    if (!canManageRole(context, role)) throw new ApiError('ROLE_HIERARCHY', 403);
    if (!canGrantPermissions(context, role.permissions)) throw new ApiError('PERMISSION_GRANT', 403);
    selectedRoles.push(role);
  }
  const base = defaultRole(context.server.id);
  transaction(() => {
    db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(context.server.id, target.id);
    if (base) {
      db.prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)').run(context.server.id, target.id, base.id);
    }
    for (const role of selectedRoles) {
      db.prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)').run(context.server.id, target.id, role.id);
    }
  });
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'members' });
  return { status: 200, body: { ok: true } };
});

route('DELETE', '/api/servers/:serverId/members/:userId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  requirePermission(context, PERMISSIONS.MANAGE_MEMBERS);
  if (params.userId === context.server.owner_id) throw new ApiError('OWNER_PROTECTED', 403);
  if (params.userId === user.id) throw new ApiError('CANNOT_KICK_SELF', 403);
  const target = db
    .prepare('SELECT u.* FROM users u JOIN server_members sm ON sm.user_id = u.id WHERE u.id = ? AND sm.server_id = ?')
    .get(params.userId, context.server.id);
  if (!target) throw new ApiError('MEMBER_NOT_FOUND', 404);
  const targetHighest = getHighestRole(db, context.server.id, target.id);
  if (!canActOnMember(context, {
    targetIsOwner: false,
    targetHighestPosition: targetHighest ? targetHighest.position : 0,
    targetUserId: target.id,
    actorUserId: user.id,
  })) {
    throw new ApiError('ROLE_HIERARCHY', 403);
  }
  db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(context.server.id, target.id);
  db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(context.server.id, target.id);
  broadcastToUserIds([target.id], { type: 'server-removed', serverId: context.server.id });
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'members' });
  broadcastPresence(target.id, false);
  return { status: 200, body: { ok: true } };
});

route('PATCH', '/api/servers/:serverId/members/:userId/nickname', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const context = memberContextOrThrow(user.id, params.serverId);
  const target = db
    .prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(context.server.id, params.userId);
  if (!target) throw new ApiError('MEMBER_NOT_FOUND', 404);
  if (params.userId === user.id) {
    requirePermission(context, PERMISSIONS.CHANGE_NICKNAME);
  } else {
    requirePermission(context, PERMISSIONS.MANAGE_NICKNAMES);
    if (params.userId === context.server.owner_id) throw new ApiError('OWNER_PROTECTED', 403);
    const targetHighest = getHighestRole(db, context.server.id, target.user_id);
    if (!canActOnMember(context, {
      targetIsOwner: false,
      targetHighestPosition: targetHighest ? targetHighest.position : 0,
      targetUserId: target.user_id,
      actorUserId: user.id,
    })) {
      throw new ApiError('ROLE_HIERARCHY', 403);
    }
  }
  const raw = body.nickname;
  let nickname = null;
  if (raw !== null && raw !== undefined && String(raw).trim() !== '') {
    nickname = text(String(raw), { min: 1, max: 32, field: 'nickname' });
  }
  db.prepare('UPDATE server_members SET nickname = ? WHERE server_id = ? AND user_id = ?').run(
    nickname,
    context.server.id,
    target.user_id,
  );
  broadcastServer(context.server.id, { type: 'server', serverId: context.server.id, scope: 'members' });
  const updated = db
    .prepare(
      `SELECT u.*, sm.nickname, sm.joined_at FROM users u
       JOIN server_members sm ON sm.user_id = u.id
       WHERE u.id = ? AND sm.server_id = ?`,
    )
    .get(target.user_id, context.server.id);
  return { status: 200, body: { nickname, member: memberDto(db, updated, context, user.id) } };
});

// ---------------------------------------------------------------------------
// Direct messages
// ---------------------------------------------------------------------------

route('GET', '/api/dm/conversations', async ({ req }) => {
  const { user } = requireUser(req);
  return { status: 200, body: { conversations: listDmConversations(db, user.id).map(withOnline) } };
});

route('POST', '/api/dm/conversations', async ({ req, body }) => {
  const { user } = requireUser(req);
  const kind = body.kind === 'group' ? 'group' : 'direct';
  const requested = Array.isArray(body.userIds)
    ? body.userIds.filter((id) => typeof id === 'string' && id !== user.id)
    : [];
  const unique = [...new Set(requested)];
  const timestamp = nowIso();
  if (kind === 'direct') {
    if (unique.length !== 1) throw new ApiError('INVALID_INPUT', 400, 'userIds');
    const other = db.prepare('SELECT * FROM users WHERE id = ?').get(unique[0]);
    if (!other) throw new ApiError('USER_NOT_FOUND', 404);
    const key = directKey(user.id, other.id);
    const existing = db.prepare('SELECT * FROM dm_conversations WHERE direct_key = ?').get(key);
    if (existing) {
      return { status: 200, body: { conversation: withOnline(dmConversationSummary(db, existing.id, user.id)), created: false } };
    }
    const id = randomUUID();
    transaction(() => {
      db.prepare(
        `INSERT INTO dm_conversations (id, kind, name, owner_id, direct_key, created_at, updated_at)
         VALUES (?, 'direct', NULL, NULL, ?, ?, ?)`,
      ).run(id, key, timestamp, timestamp);
      db.prepare('INSERT INTO dm_participants (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)').run(
        id,
        user.id,
        timestamp,
        timestamp,
      );
      db.prepare('INSERT INTO dm_participants (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)').run(
        id,
        other.id,
        timestamp,
        timestamp,
      );
    });
    broadcastToUserIds([user.id, other.id], { type: 'dm-conversation', conversationId: id });
    return { status: 201, body: { conversation: withOnline(dmConversationSummary(db, id, user.id)), created: true } };
  }
  if (unique.length < 2) throw new ApiError('GROUP_TOO_SMALL', 400, 'userIds');
  if (unique.length > 24) throw new ApiError('GROUP_TOO_LARGE', 400, 'userIds');
  const placeholders = unique.map(() => '?').join(', ');
  const found = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).all(...unique);
  if (found.length !== unique.length) throw new ApiError('USER_NOT_FOUND', 404);
  const name = cleanGroupName(body.name);
  const id = randomUUID();
  transaction(() => {
    db.prepare(
      `INSERT INTO dm_conversations (id, kind, name, owner_id, direct_key, created_at, updated_at)
       VALUES (?, 'group', ?, ?, NULL, ?, ?)`,
    ).run(id, name, user.id, timestamp, timestamp);
    for (const participantId of [user.id, ...unique]) {
      db.prepare('INSERT INTO dm_participants (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)').run(
        id,
        participantId,
        timestamp,
        timestamp,
      );
    }
  });
  broadcastToUserIds([user.id, ...unique], { type: 'dm-conversation', conversationId: id });
  return { status: 201, body: { conversation: withOnline(dmConversationSummary(db, id, user.id)), created: true } };
});

route('GET', '/api/dm/conversations/:conversationId', async ({ req, params }) => {
  const { user } = requireUser(req);
  requireDmParticipant(params.conversationId, user.id);
  return { status: 200, body: { conversation: withOnline(dmConversationSummary(db, params.conversationId, user.id)) } };
});

route('GET', '/api/dm/conversations/:conversationId/messages', async ({ req, params, url }) => {
  const { user } = requireUser(req);
  requireDmParticipant(params.conversationId, user.id);
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');
  const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
  let rows;
  let hasMore = false;
  if (before && isValidDate(before)) {
    rows = db
      .prepare('SELECT * FROM dm_messages WHERE conversation_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 51')
      .all(params.conversationId, new Date(before).toISOString());
    hasMore = rows.length > 50;
    if (hasMore) rows = rows.slice(0, 50);
    rows.reverse();
  } else if (after && isValidDate(after)) {
    rows = db
      .prepare('SELECT * FROM dm_messages WHERE conversation_id = ? AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT 100')
      .all(params.conversationId, new Date(after).toISOString());
  } else {
    rows = db
      .prepare('SELECT * FROM dm_messages WHERE conversation_id = ? ORDER BY created_at DESC, id DESC LIMIT 51')
      .all(params.conversationId);
    hasMore = rows.length > 50;
    if (hasMore) rows = rows.slice(0, 50);
    rows.reverse();
  }
  const messages = serializeDmMessages(db, rows, user.id);
  const conversation = withOnline(dmConversationSummary(db, params.conversationId, user.id));
  const latestAt = messages.length ? messages[messages.length - 1].createdAt : null;
  return {
    status: 200,
    body: {
      conversation,
      messages,
      hasMore,
      latestAt,
      typing: listDmTypingUsers(params.conversationId, user.id),
    },
  };
});

route('POST', '/api/dm/conversations/:conversationId/messages', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  const content = messageContent(body.content);
  clearDmTyping(conversation.id, user.id);
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare(
    'INSERT INTO dm_messages (id, conversation_id, author_id, content, created_at, edited_at) VALUES (?, ?, ?, ?, ?, NULL)',
  ).run(id, conversation.id, user.id, content, createdAt);
  db.prepare('UPDATE dm_conversations SET updated_at = ? WHERE id = ?').run(createdAt, conversation.id);
  db.prepare('UPDATE dm_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    createdAt,
    conversation.id,
    user.id,
  );
  const row = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(id);
  const message = serializeDmMessages(db, [row], user.id)[0];
  broadcastConversation(conversation.id, {
    type: 'dm-message',
    action: 'created',
    conversationId: conversation.id,
    messageId: id,
  });
  return { status: 201, body: { message } };
});

route('POST', '/api/dm/conversations/:conversationId/typing', async ({ req, params }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  let map = typingByConversation.get(conversation.id);
  if (!map) {
    map = new Map();
    typingByConversation.set(conversation.id, map);
  }
  map.set(user.id, Date.now() + TYPING_TTL_MS);
  broadcastConversation(conversation.id, {
    type: 'dm-typing',
    conversationId: conversation.id,
    userId: user.id,
    displayName: user.display_name,
  });
  return { status: 204 };
});

route('POST', '/api/dm/conversations/:conversationId/read', async ({ req, params }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  db.prepare('UPDATE dm_participants SET last_read_at = ? WHERE conversation_id = ? AND user_id = ?').run(
    nowIso(),
    conversation.id,
    user.id,
  );
  return { status: 204 };
});

route('PATCH', '/api/dm/conversations/:conversationId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  if (conversation.kind !== 'group') throw new ApiError('INVALID_INPUT', 400, 'name');
  if (conversation.owner_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  const name = cleanGroupName(body.name);
  if (!name) throw new ApiError('FIELD_REQUIRED', 400, 'name');
  db.prepare('UPDATE dm_conversations SET name = ?, updated_at = ? WHERE id = ?').run(name, nowIso(), conversation.id);
  broadcastConversation(conversation.id, { type: 'dm-conversation', conversationId: conversation.id });
  return { status: 200, body: { conversation: withOnline(dmConversationSummary(db, conversation.id, user.id)) } };
});

route('POST', '/api/dm/conversations/:conversationId/participants', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  if (conversation.kind !== 'group') throw new ApiError('INVALID_INPUT', 400, 'userIds');
  if (conversation.owner_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  const requested = Array.isArray(body.userIds) ? body.userIds.filter((id) => typeof id === 'string') : [];
  const existingIds = new Set(conversationAudience(conversation.id));
  const additions = [...new Set(requested.filter((id) => !existingIds.has(id)))];
  if (additions.length === 0) return { status: 200, body: { conversation: withOnline(dmConversationSummary(db, conversation.id, user.id)) } };
  if (existingIds.size + additions.length > 25) throw new ApiError('GROUP_TOO_LARGE', 400, 'userIds');
  const placeholders = additions.map(() => '?').join(', ');
  const found = db.prepare(`SELECT id FROM users WHERE id IN (${placeholders})`).all(...additions);
  if (found.length !== additions.length) throw new ApiError('USER_NOT_FOUND', 404);
  const timestamp = nowIso();
  for (const participantId of additions) {
    db.prepare('INSERT OR IGNORE INTO dm_participants (conversation_id, user_id, joined_at, last_read_at) VALUES (?, ?, ?, ?)').run(
      conversation.id,
      participantId,
      timestamp,
      timestamp,
    );
  }
  db.prepare('UPDATE dm_conversations SET updated_at = ? WHERE id = ?').run(timestamp, conversation.id);
  broadcastConversation(conversation.id, { type: 'dm-conversation', conversationId: conversation.id });
  return { status: 200, body: { conversation: withOnline(dmConversationSummary(db, conversation.id, user.id)) } };
});

route('DELETE', '/api/dm/conversations/:conversationId/participants/:userId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  if (conversation.kind !== 'group') throw new ApiError('INVALID_INPUT', 400, 'userId');
  if (conversation.owner_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  if (params.userId === user.id) throw new ApiError('INVALID_TARGET', 400, 'userId');
  if (!conversationAudience(conversation.id).includes(params.userId)) throw new ApiError('MEMBER_NOT_FOUND', 404);
  db.prepare('DELETE FROM dm_participants WHERE conversation_id = ? AND user_id = ?').run(conversation.id, params.userId);
  broadcastToUserIds([params.userId], { type: 'dm-removed', conversationId: conversation.id });
  broadcastConversation(conversation.id, { type: 'dm-conversation', conversationId: conversation.id });
  return { status: 200, body: { ok: true } };
});

route('DELETE', '/api/dm/conversations/:conversationId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const { conversation } = requireDmParticipant(params.conversationId, user.id);
  const audience = conversationAudience(conversation.id);
  if (conversation.kind === 'direct' || audience.length <= 2) {
    db.prepare('DELETE FROM dm_conversations WHERE id = ?').run(conversation.id);
    broadcastToUserIds(audience, { type: 'dm-removed', conversationId: conversation.id });
    return { status: 200, body: { ok: true } };
  }
  db.prepare('DELETE FROM dm_participants WHERE conversation_id = ? AND user_id = ?').run(conversation.id, user.id);
  if (conversation.owner_id === user.id) {
    const nextOwner = conversationAudience(conversation.id).sort()[0];
    db.prepare('UPDATE dm_conversations SET owner_id = ? WHERE id = ?').run(nextOwner || null, conversation.id);
  }
  broadcastToUserIds([user.id], { type: 'dm-removed', conversationId: conversation.id });
  broadcastConversation(conversation.id, { type: 'dm-conversation', conversationId: conversation.id });
  return { status: 200, body: { ok: true } };
});

route('PATCH', '/api/dm/messages/:messageId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const existing = dmMessageOrThrow(params.messageId);
  requireDmParticipant(existing.conversation_id, user.id);
  if (existing.author_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  const content = messageContent(body.content);
  const editedAt = nowIso();
  db.prepare('UPDATE dm_messages SET content = ?, edited_at = ? WHERE id = ?').run(content, editedAt, existing.id);
  const row = db.prepare('SELECT * FROM dm_messages WHERE id = ?').get(existing.id);
  const message = serializeDmMessages(db, [row], user.id)[0];
  broadcastConversation(existing.conversation_id, {
    type: 'dm-message',
    action: 'updated',
    conversationId: existing.conversation_id,
    messageId: existing.id,
  });
  return { status: 200, body: { message } };
});

route('DELETE', '/api/dm/messages/:messageId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const existing = dmMessageOrThrow(params.messageId);
  requireDmParticipant(existing.conversation_id, user.id);
  if (existing.author_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  db.prepare('DELETE FROM dm_messages WHERE id = ?').run(existing.id);
  broadcastConversation(existing.conversation_id, {
    type: 'dm-message',
    action: 'deleted',
    conversationId: existing.conversation_id,
    messageId: existing.id,
  });
  return { status: 200, body: { ok: true } };
});

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

route('GET', '/api/channels/:channelId/messages', async ({ req, params, url }) => {
  const { user } = requireUser(req);
  const channel = serverChannelOrThrow(params.channelId);
  const context = memberContextOrThrow(user.id, channel.server_id);
  const before = url.searchParams.get('before');
  const after = url.searchParams.get('after');
  const isValidDate = (value) => typeof value === 'string' && !Number.isNaN(new Date(value).getTime());
  let rows;
  let hasMore = false;
  if (before && isValidDate(before)) {
    rows = db
      .prepare('SELECT * FROM messages WHERE channel_id = ? AND created_at < ? ORDER BY created_at DESC, id DESC LIMIT 51')
      .all(channel.id, new Date(before).toISOString());
    hasMore = rows.length > 50;
    if (hasMore) rows = rows.slice(0, 50);
    rows.reverse();
  } else if (after && isValidDate(after)) {
    rows = db
      .prepare('SELECT * FROM messages WHERE channel_id = ? AND created_at > ? ORDER BY created_at ASC, id ASC LIMIT 100')
      .all(channel.id, new Date(after).toISOString());
  } else {
    rows = db
      .prepare('SELECT * FROM messages WHERE channel_id = ? ORDER BY created_at DESC, id DESC LIMIT 51')
      .all(channel.id);
    hasMore = rows.length > 50;
    if (hasMore) rows = rows.slice(0, 50);
    rows.reverse();
  }
  const messages = serializeMessages(db, rows, context, user.id);
  const latestAt = messages.length ? messages[messages.length - 1].createdAt : null;
  return {
    status: 200,
    body: {
      channel: {
        id: channel.id,
        name: channel.name,
        topic: channel.topic,
        serverId: channel.server_id,
        serverName: channel.server_name,
      },
      messages,
      hasMore,
      permissions: context.permissions,
      latestAt,
      typing: listTypingUsers(channel.id, channel.server_id, user.id),
    },
  };
});

route('POST', '/api/channels/:channelId/typing', async ({ req, params }) => {
  const { user } = requireUser(req);
  const channel = serverChannelOrThrow(params.channelId);
  memberContextOrThrow(user.id, channel.server_id);
  let map = typingByChannel.get(channel.id);
  if (!map) {
    map = new Map();
    typingByChannel.set(channel.id, map);
  }
  map.set(user.id, Date.now() + TYPING_TTL_MS);
  const typingUser = db
    .prepare(
      `SELECT COALESCE(sm.nickname, u.display_name) AS display_name
       FROM users u
       LEFT JOIN server_members sm ON sm.user_id = u.id AND sm.server_id = ?
       WHERE u.id = ?`,
    )
    .get(channel.server_id, user.id);
  broadcastServer(channel.server_id, {
    type: 'typing',
    channelId: channel.id,
    userId: user.id,
    displayName: typingUser ? typingUser.display_name : user.display_name,
  });
  return { status: 204 };
});

route('POST', '/api/channels/:channelId/messages', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const channel = serverChannelOrThrow(params.channelId);
  const context = memberContextOrThrow(user.id, channel.server_id);
  const content = messageContent(body.content);
  if (mentionsEveryone(content) && !canMentionEveryone(context)) throw new ApiError('MENTION_EVERYONE', 403);
  clearTyping(channel.id, user.id);
  const id = randomUUID();
  const createdAt = nowIso();
  db.prepare('INSERT INTO messages (id, channel_id, author_id, content, created_at, edited_at) VALUES (?, ?, ?, ?, ?, NULL)').run(
    id,
    channel.id,
    user.id,
    content,
    createdAt,
  );
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
  const message = serializeMessages(db, [row], context, user.id)[0];
  broadcastServer(channel.server_id, {
    type: 'message',
    action: 'created',
    channelId: channel.id,
    messageId: id,
  });
  return { status: 201, body: { message } };
});

route('PATCH', '/api/messages/:messageId', async ({ req, params, body }) => {
  const { user } = requireUser(req);
  const existing = messageOrThrow(params.messageId);
  const context = memberContextOrThrow(user.id, existing.server_id);
  if (existing.author_id !== user.id) throw new ApiError('FORBIDDEN', 403);
  const content = messageContent(body.content);
  if (mentionsEveryone(content) && !canMentionEveryone(context)) throw new ApiError('MENTION_EVERYONE', 403);
  const editedAt = nowIso();
  db.prepare('UPDATE messages SET content = ?, edited_at = ? WHERE id = ?').run(content, editedAt, existing.id);
  const row = db.prepare('SELECT * FROM messages WHERE id = ?').get(existing.id);
  const message = serializeMessages(db, [row], context, user.id)[0];
  broadcastServer(existing.server_id, {
    type: 'message',
    action: 'updated',
    channelId: existing.channel_id,
    messageId: existing.id,
  });
  return { status: 200, body: { message } };
});

route('DELETE', '/api/messages/:messageId', async ({ req, params }) => {
  const { user } = requireUser(req);
  const existing = messageOrThrow(params.messageId);
  const context = memberContextOrThrow(user.id, existing.server_id);
  const canDelete = existing.author_id === user.id || has(context.permissions, PERMISSIONS.MANAGE_MESSAGES);
  if (!canDelete) throw new ApiError('FORBIDDEN', 403);
  db.prepare('DELETE FROM messages WHERE id = ?').run(existing.id);
  broadcastServer(existing.server_id, {
    type: 'message',
    action: 'deleted',
    channelId: existing.channel_id,
    messageId: existing.id,
  });
  return { status: 200, body: { ok: true } };
});

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

route('GET', '/api/health', async () => ({
  status: 200,
  body: { ok: true, uptime: Math.round((Date.now() - STARTED_AT) / 1000), language: 'en' },
}));

function serveFile(req, res, filePath, { immutable = false } = {}) {
  if (!existsSync(filePath)) return false;
  const stat = statSync(filePath);
  if (!stat.isFile()) return false;
  res.statusCode = 200;
  res.setHeader('Content-Type', CONTENT_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', stat.size);
  res.setHeader(
    'Cache-Control',
    immutable ? 'public, max-age=31536000, immutable' : 'no-cache, no-store, must-revalidate',
  );
  if (req.method === 'HEAD') {
    res.end();
    return true;
  }
  const stream = createReadStream(filePath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end('Unable to read file');
    } else {
      res.destroy();
    }
  });
  stream.pipe(res);
  return true;
}

function serveStatic(req, res, pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    res.statusCode = 400;
    res.end('Bad request');
    return;
  }
  if (decoded.startsWith('/uploads/')) {
    const filename = decoded.slice('/uploads/'.length);
    if (!/^[a-z0-9-]+\.(?:png|jpg|webp)$/i.test(filename)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    const filePath = path.join(UPLOAD_DIR, filename);
    if (!filePath.startsWith(UPLOAD_DIR)) {
      res.statusCode = 404;
      res.end('Not found');
      return;
    }
    if (!serveFile(req, res, filePath, { immutable: true })) {
      res.statusCode = 404;
      res.end('Not found');
    }
    return;
  }
  const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/+/, '');
  const candidate = path.resolve(DIST_DIR, relative);
  if (!candidate.startsWith(DIST_DIR)) {
    res.statusCode = 404;
    res.end('Not found');
    return;
  }
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    const immutable = relative.startsWith('assets/');
    if (serveFile(req, res, candidate, { immutable })) return;
  }
  const index = path.join(DIST_DIR, 'index.html');
  if (existsSync(index)) {
    serveFile(req, res, index);
    return;
  }
  res.statusCode = 503;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(
    '<!doctype html><html><body style="font-family:system-ui;padding:40px;max-width:640px;margin:auto"><h1>Datchord</h1><p>The web client has not been built yet.</p><p>Run <code>npm run build</code>, then restart the server. For development, run <code>npm run dev</code>.</p></body></html>',
  );
}

const server = http.createServer(async (req, res) => {
  const started = Date.now();
  baseHeaders(res);
  const requestUrl = req.url || '/';
  let statusForLog = 500;
  try {
    const url = new URL(requestUrl, `http://${req.headers.host || 'localhost'}`);
    const isApi = url.pathname.startsWith('/api/');
    if (isApi) {
      if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        statusForLog = 204;
        return;
      }
      if (!['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
        throw new ApiError('METHOD_NOT_ALLOWED', 405);
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req)) {
        throw new ApiError('INVALID_ORIGIN', 403);
      }
      const found = findRoute(req.method === 'HEAD' ? 'GET' : req.method, url.pathname);
      if (!found) throw new ApiError('NOT_FOUND', 404);
      const needsBody = ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method);
      const body = needsBody ? await readJson(req) : {};
      const result = await found.route.handler({
        req,
        res,
        url,
        body,
        params: found.params,
      });
      statusForLog = result.status || 200;
      if (result.handled) return;
      sendJson(res, result.status || 200, result.body);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      res.statusCode = 405;
      res.setHeader('Allow', 'GET, HEAD');
      res.end('Method not allowed');
      statusForLog = 405;
      return;
    }
    statusForLog = 200;
    serveStatic(req, res, url.pathname);
  } catch (error) {
    if (error instanceof ApiError) {
      statusForLog = error.status;
      const payload = { error: error.code };
      if (error.field) payload.field = error.field;
      if (error.params) payload.params = error.params;
      sendJson(res, error.status, payload);
    } else {
      statusForLog = 500;
      console.error(`[datchord] ${req.method} ${requestUrl} failed:`, error);
      sendJson(res, 500, { error: 'INTERNAL' });
    }
  } finally {
    if (process.env.LOG_REQUESTS !== 'false') {
      const duration = Date.now() - started;
      console.log(`${req.method} ${requestUrl.split('?')[0]} ${statusForLog} ${duration}ms`);
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Datchord API listening on http://localhost:${PORT}`);
});

function shutdown() {
  server.close(() => {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
