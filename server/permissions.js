export const PERMISSIONS = {
  MANAGE_SERVER: 1,
  MANAGE_CHANNELS: 2,
  MANAGE_ROLES: 4,
  MANAGE_MEMBERS: 8,
  MANAGE_MESSAGES: 16,
  ADMINISTRATOR: 32,
  MANAGE_INVITES: 64,
  MANAGE_NICKNAMES: 128,
  CHANGE_NICKNAME: 256,
  MENTION_EVERYONE: 512,
};

export const ALL_PERMISSIONS = Object.values(PERMISSIONS).reduce((sum, bit) => sum | bit, 0);

export const DEFAULT_MEMBER_PERMISSIONS = PERMISSIONS.CHANGE_NICKNAME;

export const PERMISSION_LIST = [
  {
    key: 'manageServer',
    bit: PERMISSIONS.MANAGE_SERVER,
  },
  {
    key: 'manageChannels',
    bit: PERMISSIONS.MANAGE_CHANNELS,
  },
  {
    key: 'manageRoles',
    bit: PERMISSIONS.MANAGE_ROLES,
  },
  {
    key: 'manageMembers',
    bit: PERMISSIONS.MANAGE_MEMBERS,
  },
  {
    key: 'manageMessages',
    bit: PERMISSIONS.MANAGE_MESSAGES,
  },
  {
    key: 'administrator',
    bit: PERMISSIONS.ADMINISTRATOR,
  },
  {
    key: 'manageInvites',
    bit: PERMISSIONS.MANAGE_INVITES,
  },
  {
    key: 'manageNicknames',
    bit: PERMISSIONS.MANAGE_NICKNAMES,
  },
  {
    key: 'changeNickname',
    bit: PERMISSIONS.CHANGE_NICKNAME,
  },
  {
    key: 'mentionEveryone',
    bit: PERMISSIONS.MENTION_EVERYONE,
  },
];

export function has(permissions, bit) {
  return (permissions & bit) === bit;
}

export function getMemberContext(db, userId, serverId) {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  if (!server) return null;
  const membership = db
    .prepare('SELECT * FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, userId);
  if (!membership) return null;
  const roles = db
    .prepare(
      `SELECT r.* FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       WHERE r.server_id = ? AND mr.user_id = ?
       ORDER BY r.position DESC`,
    )
    .all(serverId, userId);
  const isOwner = server.owner_id === userId;
  const isAdministrator = roles.some((role) => has(role.permissions, PERMISSIONS.ADMINISTRATOR));
  let permissions = 0;
  for (const role of roles) permissions |= role.permissions;
  if (isOwner || isAdministrator) permissions = ALL_PERMISSIONS;
  const highestPosition = isOwner ? Number.MAX_SAFE_INTEGER : roles.length ? Math.max(...roles.map((role) => role.position)) : 0;
  return {
    server,
    membership,
    roles,
    roleIds: roles.map((role) => role.id),
    isOwner,
    isAdministrator,
    permissions,
    highestPosition,
  };
}

export function canManageRole(context, role) {
  if (!context) return false;
  if (context.isOwner) return true;
  if (!has(context.permissions, PERMISSIONS.MANAGE_ROLES)) return false;
  return role.position < context.highestPosition;
}

export function canGrantPermissions(context, permissions) {
  if (!context) return false;
  if (context.isOwner) return true;
  return (permissions & ~context.permissions) === 0;
}

export function canActOnMember(context, { targetIsOwner, targetHighestPosition, targetUserId, actorUserId }) {
  if (!context || targetIsOwner || targetUserId === actorUserId) return false;
  if (context.isOwner) return true;
  return context.highestPosition > targetHighestPosition;
}

export function getHighestRole(db, serverId, userId) {
  return db
    .prepare(
      `SELECT r.* FROM roles r
       JOIN member_roles mr ON mr.role_id = r.id
       WHERE r.server_id = ? AND mr.user_id = ?
       ORDER BY r.position DESC LIMIT 1`,
    )
    .get(serverId, userId);
}
