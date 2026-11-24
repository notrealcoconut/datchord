export const MANAGE_SERVER = 1;
export const MANAGE_CHANNELS = 2;
export const MANAGE_ROLES = 4;
export const MANAGE_MEMBERS = 8;
export const MANAGE_MESSAGES = 16;
export const ADMINISTRATOR = 32;
export const MANAGE_INVITES = 64;
export const MANAGE_NICKNAMES = 128;
export const CHANGE_NICKNAME = 256;
export const MENTION_EVERYONE = 512;
export const ALL_PERMISSIONS =
  MANAGE_SERVER |
  MANAGE_CHANNELS |
  MANAGE_ROLES |
  MANAGE_MEMBERS |
  MANAGE_MESSAGES |
  ADMINISTRATOR |
  MANAGE_INVITES |
  MANAGE_NICKNAMES |
  CHANGE_NICKNAME |
  MENTION_EVERYONE;

export type ThemePreference = 'light' | 'dark' | 'system';
export type Accent = 'tangerine' | 'mint' | 'iris' | 'rose';
export type Density = 'cozy' | 'compact';
export type NotificationLevel = 'all' | 'mentions' | 'none';
export type LanguageCode = 'en' | 'es' | 'fr' | 'ar' | 'pt-BR';

export interface Appearance {
  theme: ThemePreference;
  accent: Accent;
  density: Density;
  reduceMotion: boolean;
}

export interface PrivacySettings {
  showBio: boolean;
  showMemberSince: boolean;
}

export interface NotificationSettings {
  level: NotificationLevel;
  sound: boolean;
  desktop: boolean;
}

export interface UserSettings {
  privacy: PrivacySettings;
  notifications: NotificationSettings;
  appearance: Appearance;
}

export interface SelfUser {
  id: string;
  username: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  bio: string;
  language: LanguageCode;
  createdAt: string;
  settings: UserSettings;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface ServerSummary {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  memberCount: number;
  defaultChannelId: string | null;
  permissions: number;
  isOwner: boolean;
}

export interface Channel {
  id: string;
  name: string;
  topic: string;
  position: number;
  createdAt: string;
}

export interface Role {
  id: string;
  name: string;
  color: string;
  position: number;
  permissions: number;
  isDefault: boolean;
  memberCount: number;
}

export interface Member {
  id: string;
  username: string;
  displayName: string;
  nickname: string | null;
  avatarUrl: string | null;
  bio: string | null;
  joinedAt: string | null;
  isOwner: boolean;
  roleIds: string[];
  highestRoleId: string | null;
  highestRoleName: string | null;
  highestRoleColor: string | null;
  highestRolePosition: number;
  highestRoleIsDefault: boolean;
}

export interface ServerDetail {
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  ownerId: string;
  owner: PublicUser;
  inviteCode: string;
  createdAt: string;
  permissions: number;
  isOwner: boolean;
  myRoleIds: string[];
  myHighestPosition: number | null;
  channels: Channel[];
  roles: Role[];
  members: Member[];
}

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
  roleName: string | null;
  roleColor: string | null;
  roleIsDefault: boolean;
  canMentionEveryone: boolean;
}

export interface Message {
  id: string;
  channelId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: MessageAuthor;
  canEdit: boolean;
  canDelete: boolean;
}

export interface TypingUser {
  id: string;
  displayName: string;
}

export interface PresenceResponse {
  onlineUserIds: string[];
}

export interface MessagesResponse {
  channel: {
    id: string;
    name: string;
    topic: string;
    serverId: string;
    serverName: string;
  };
  messages: Message[];
  hasMore: boolean;
  permissions: number;
  latestAt: string | null;
  typing: TypingUser[];
}

export interface PendingMessage {
  id: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

export interface DmLastMessage {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  createdAt: string;
}

export interface DmConversation {
  id: string;
  kind: 'direct' | 'group';
  name: string | null;
  ownerId: string | null;
  displayName: string;
  avatarUrl: string | null;
  participants: PublicUser[];
  onlineUserIds: string[];
  lastMessage: DmLastMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface DmMessage {
  id: string;
  conversationId: string;
  content: string;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
  canEdit: boolean;
  canDelete: boolean;
}

export interface DmMessagesResponse {
  conversation: DmConversation;
  messages: DmMessage[];
  hasMore: boolean;
  latestAt: string | null;
  typing: TypingUser[];
}

export interface DmPendingMessage {
  id: string;
  content: string;
  createdAt: string;
  status: 'sending' | 'failed';
}

export type RealtimeEvent =
  | { type: 'ready'; userId: string }
  | { type: 'presence'; userId: string; online: boolean }
  | { type: 'typing'; channelId: string; userId: string; displayName: string }
  | { type: 'message'; action: 'created' | 'updated' | 'deleted'; channelId: string; messageId: string }
  | { type: 'server'; serverId: string; scope?: string }
  | { type: 'server-removed'; serverId: string }
  | { type: 'dm-conversation'; conversationId: string }
  | {
      type: 'dm-message';
      action: 'created' | 'updated' | 'deleted';
      conversationId: string;
      messageId: string;
    }
  | { type: 'dm-typing'; conversationId: string; userId: string; displayName: string }
  | { type: 'dm-removed'; conversationId: string };

export interface ApiErrorPayload {
  error: string;
  field?: string;
  params?: Record<string, unknown>;
}
