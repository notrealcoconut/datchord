import { getMemberContext, getHighestRole, has, PERMISSIONS } from './permissions.js';
import { getSettings, publicUser } from './db.js';

export function serverSummary(db, userId, server) {
  const context = getMemberContext(db, userId, server.id);
  if (!context) return null;
  const memberCount = db.prepare('SELECT COUNT(*) AS count FROM server_members WHERE server_id = ?').get(server.id).count;
  const firstChannel = db
    .prepare('SELECT id FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC LIMIT 1')
    .get(server.id);
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    iconUrl: server.icon_url || null,
    ownerId: server.owner_id,
    inviteCode: server.invite_code,
    memberCount,
    defaultChannelId: firstChannel ? firstChannel.id : null,
    permissions: context.permissions,
    isOwner: context.isOwner,
  };
}

export function listServersForUser(db, userId) {
  const rows = db
    .prepare(
      `SELECT s.* FROM servers s
       JOIN server_members sm ON sm.server_id = s.id
       WHERE sm.user_id = ?
       ORDER BY sm.joined_at ASC, s.name ASC`,
    )
    .all(userId);
  return rows.map((server) => serverSummary(db, userId, server)).filter(Boolean);
}

export function memberDto(db, member, context, requesterId) {
  const roleRows = db
    .prepare(
      `SELECT r.* FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       WHERE mr.server_id = ? AND mr.user_id = ?
       ORDER BY r.position DESC`,
    )
    .all(context.server.id, member.id);
  const highest = roleRows[0] || null;
  const isOwner = context.server.owner_id === member.id;
  const memberSettings = getSettings(member);
  const showDetails = member.id === requesterId || memberSettings.privacy.showBio;
  const showSince = member.id === requesterId || memberSettings.privacy.showMemberSince;
  return {
    id: member.id,
    username: member.username,
    displayName: member.nickname || member.display_name,
    nickname: member.nickname || null,
    avatarUrl: member.avatar_url || null,
    bio: showDetails ? member.bio || '' : null,
    joinedAt: showSince ? member.joined_at : null,
    isOwner,
    roleIds: roleRows.map((role) => role.id),
    highestRoleId: highest ? highest.id : null,
    highestRoleName: highest ? highest.name : null,
    highestRoleColor: highest ? highest.color : null,
    highestRolePosition: highest ? highest.position : 0,
    highestRoleIsDefault: highest ? Boolean(highest.is_default) : false,
  };
}

export function serverDetail(db, userId, serverId) {
  const context = getMemberContext(db, userId, serverId);
  if (!context) return null;
  const server = context.server;
  const owner = db.prepare('SELECT * FROM users WHERE id = ?').get(server.owner_id);
  const channels = db
    .prepare('SELECT id, name, topic, position, created_at FROM channels WHERE server_id = ? ORDER BY position ASC, created_at ASC')
    .all(serverId)
    .map((channel) => ({
      id: channel.id,
      name: channel.name,
      topic: channel.topic,
      position: channel.position,
      createdAt: channel.created_at,
    }));
  const memberRows = db
    .prepare(
      `SELECT u.*, sm.joined_at, sm.nickname FROM server_members sm
       JOIN users u ON u.id = sm.user_id
       WHERE sm.server_id = ?
       ORDER BY sm.joined_at ASC`,
    )
    .all(serverId);
  const members = memberRows.map((member) => memberDto(db, member, context, userId));
  const roles = db
    .prepare(
      `SELECT r.*,
        (SELECT COUNT(*) FROM member_roles mr WHERE mr.role_id = r.id) AS assigned_count
       FROM roles r WHERE r.server_id = ?
       ORDER BY r.position DESC, r.created_at ASC`,
    )
    .all(serverId)
    .map((role) => ({
      id: role.id,
      name: role.name,
      color: role.color,
      position: role.position,
      permissions: role.permissions,
      isDefault: Boolean(role.is_default),
      memberCount: role.is_default ? memberRows.length : role.assigned_count,
    }));
  return {
    id: server.id,
    name: server.name,
    description: server.description,
    iconUrl: server.icon_url || null,
    ownerId: server.owner_id,
    owner: publicUser(owner),
    inviteCode: server.invite_code,
    createdAt: server.created_at,
    permissions: context.permissions,
    isOwner: context.isOwner,
    myRoleIds: context.roleIds,
    myHighestPosition: context.isOwner ? null : context.highestPosition,
    channels,
    roles,
    members,
  };
}

function messageAuthor(db, serverId, user, serverOwnerId) {
  const isOwner = user.id === serverOwnerId;
  const role = isOwner ? null : getHighestRole(db, serverId, user.id);
  const membership = db
    .prepare('SELECT nickname FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, user.id);
  const context = getMemberContext(db, user.id, serverId);
  return {
    id: user.id,
    username: user.username,
    displayName: membership?.nickname || user.display_name,
    avatarUrl: user.avatar_url || null,
    isOwner,
    roleName: role && !role.is_default ? role.name : null,
    roleColor: role && !role.is_default ? role.color : null,
    roleIsDefault: role ? Boolean(role.is_default) : false,
    canMentionEveryone: Boolean(
      context && (context.isOwner || has(context.permissions, PERMISSIONS.MENTION_EVERYONE)),
    ),
  };
}

export function serializeMessages(db, rows, context, viewerId) {
  const authors = new Map();
  const canManageMessages = (context.permissions & PERMISSIONS.MANAGE_MESSAGES) === PERMISSIONS.MANAGE_MESSAGES;
  return rows.map((row) => {
    let author = authors.get(row.author_id);
    if (!author) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.author_id);
      author = messageAuthor(db, context.server.id, user, context.server.owner_id);
      authors.set(row.author_id, author);
    }
    return {
      id: row.id,
      channelId: row.channel_id,
      content: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at || null,
      author,
      canEdit: row.author_id === viewerId,
      canDelete: row.author_id === viewerId || canManageMessages,
    };
  });
}

export function dmConversationSummary(db, conversationId, viewerId) {
  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
  if (!conversation) return null;
  const membership = db
    .prepare('SELECT * FROM dm_participants WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, viewerId);
  if (!membership) return null;
  const participants = db
    .prepare(
      `SELECT u.* FROM users u
       JOIN dm_participants p ON p.user_id = u.id
       WHERE p.conversation_id = ?
       ORDER BY p.joined_at ASC`,
    )
    .all(conversationId)
    .map(publicUser);
  const others = participants.filter((participant) => participant.id !== viewerId);
  const last = db
    .prepare(
      `SELECT m.*, u.display_name AS author_name
       FROM dm_messages m JOIN users u ON u.id = m.author_id
       WHERE m.conversation_id = ?
       ORDER BY m.created_at DESC, m.id DESC LIMIT 1`,
    )
    .get(conversationId);
  const unreadCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM dm_messages
       WHERE conversation_id = ? AND author_id <> ? AND created_at > ?`,
    )
    .get(conversationId, viewerId, membership.last_read_at || '').count;
  const displayName =
    conversation.kind === 'direct'
      ? others[0]?.displayName || 'Direct message'
      : conversation.name || others.map((participant) => participant.displayName).join(', ') || 'Group message';
  return {
    id: conversation.id,
    kind: conversation.kind,
    name: conversation.name || null,
    ownerId: conversation.owner_id || null,
    displayName,
    avatarUrl: conversation.kind === 'direct' ? others[0]?.avatarUrl || null : null,
    participants,
    lastMessage: last
      ? {
          id: last.id,
          authorId: last.author_id,
          authorName: last.author_name,
          content: last.content,
          createdAt: last.created_at,
        }
      : null,
    unreadCount,
    createdAt: conversation.created_at,
    updatedAt: conversation.updated_at,
  };
}

export function listDmConversations(db, userId) {
  const rows = db
    .prepare(
      `SELECT c.id FROM dm_conversations c
       JOIN dm_participants p ON p.conversation_id = c.id
       WHERE p.user_id = ?
       ORDER BY c.updated_at DESC, c.created_at DESC`,
    )
    .all(userId);
  return rows.map((row) => dmConversationSummary(db, row.id, userId)).filter(Boolean);
}

export function serializeDmMessages(db, rows, viewerId) {
  const authors = new Map();
  return rows.map((row) => {
    let author = authors.get(row.author_id);
    if (!author) {
      const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.author_id);
      author = publicUser(user);
      authors.set(row.author_id, author);
    }
    return {
      id: row.id,
      conversationId: row.conversation_id,
      content: row.content,
      createdAt: row.created_at,
      editedAt: row.edited_at || null,
      author,
      canEdit: row.author_id === viewerId,
      canDelete: row.author_id === viewerId,
    };
  });
}
