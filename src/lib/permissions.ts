import {
  ADMINISTRATOR,
  ALL_PERMISSIONS,
  CHANGE_NICKNAME,
  MANAGE_CHANNELS,
  MANAGE_INVITES,
  MANAGE_MEMBERS,
  MANAGE_MESSAGES,
  MANAGE_NICKNAMES,
  MANAGE_ROLES,
  MANAGE_SERVER,
  MENTION_EVERYONE,
} from '../types';
import type { Member, Role, ServerDetail, ServerSummary } from '../types';

export type PermissionKey =
  | 'manageServer'
  | 'manageChannels'
  | 'manageRoles'
  | 'manageMembers'
  | 'manageMessages'
  | 'administrator'
  | 'manageInvites'
  | 'manageNicknames'
  | 'changeNickname'
  | 'mentionEveryone';

export interface PermissionInfo {
  bit: number;
  key: PermissionKey;
}

export const PERMISSION_LIST: PermissionInfo[] = [
  { bit: MANAGE_SERVER, key: 'manageServer' },
  { bit: MANAGE_CHANNELS, key: 'manageChannels' },
  { bit: MANAGE_ROLES, key: 'manageRoles' },
  { bit: MANAGE_MEMBERS, key: 'manageMembers' },
  { bit: MANAGE_MESSAGES, key: 'manageMessages' },
  { bit: ADMINISTRATOR, key: 'administrator' },
  { bit: MANAGE_INVITES, key: 'manageInvites' },
  { bit: MANAGE_NICKNAMES, key: 'manageNicknames' },
  { bit: CHANGE_NICKNAME, key: 'changeNickname' },
  { bit: MENTION_EVERYONE, key: 'mentionEveryone' },
];

export function can(permissions: number, bit: number): boolean {
  return (permissions & bit) === bit;
}

export function hasAnyManagement(permissions: number): boolean {
  return (permissions & ALL_PERMISSIONS) !== 0;
}

export function isManageableServer(server: ServerSummary): boolean {
  return server.isOwner || hasAnyManagement(server.permissions);
}

export function canManageRole(detail: ServerDetail, role: Role): boolean {
  if (detail.isOwner) return true;
  if (!can(detail.permissions, MANAGE_ROLES)) return false;
  return role.position < (detail.myHighestPosition ?? 0);
}

export function canGrantPermissions(detail: ServerDetail, permissions: number): boolean {
  if (detail.isOwner) return true;
  return (permissions & ~detail.permissions) === 0;
}

export function canActOnMember(detail: ServerDetail, member: Member, actorId: string): boolean {
  if (member.isOwner) return false;
  if (member.id === actorId) return false;
  if (detail.isOwner) return true;
  return (detail.myHighestPosition ?? 0) > member.highestRolePosition;
}

export function canManageMembers(detail: ServerDetail): boolean {
  return detail.isOwner || can(detail.permissions, MANAGE_MEMBERS);
}

export function canManageMessages(permissions: number): boolean {
  return can(permissions, MANAGE_MESSAGES);
}

export function roleLabelKey(isDefault: boolean): string {
  return isDefault ? 'roles.defaultName' : 'role';
}
