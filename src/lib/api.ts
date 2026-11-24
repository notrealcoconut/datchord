import type {
  ApiErrorPayload,
  Appearance,
  DmConversation,
  DmMessagesResponse,
  LanguageCode,
  Member,
  Message,
  MessagesResponse,
  NotificationSettings,
  PresenceResponse,
  PrivacySettings,
  PublicUser,
  Role,
  SelfUser,
  ServerDetail,
  ServerSummary,
  UserSettings,
} from '../types';

export class ApiError extends Error {
  code: string;
  field?: string;
  params?: Record<string, unknown>;
  status: number;

  constructor(payload: ApiErrorPayload, status: number) {
    super(payload.error);
    this.name = 'ApiError';
    this.code = payload.error || 'INTERNAL';
    this.field = payload.field;
    this.params = payload.params;
    this.status = status;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError({ error: 'NETWORK' }, 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const errorPayload =
      payload && typeof payload === 'object' && 'error' in payload
        ? (payload as ApiErrorPayload)
        : ({ error: response.status === 401 ? 'UNAUTHORIZED' : 'INTERNAL' } as ApiErrorPayload);
    if (errorPayload.error === 'UNAUTHORIZED') {
      window.dispatchEvent(new CustomEvent('datchord:unauthorized'));
    }
    throw new ApiError(errorPayload, response.status);
  }

  return payload as T;
}

export type SettingsPatch = {
  privacy?: Partial<PrivacySettings>;
  notifications?: Partial<NotificationSettings>;
  appearance?: Partial<Appearance>;
};

export interface AuthResponse {
  user: SelfUser;
  servers: ServerSummary[];
}

export interface RegisterPayload {
  email: string;
  username: string;
  displayName: string;
  password: string;
  language: LanguageCode;
}

export interface ServerMutationResponse {
  server: ServerSummary;
  channelId: string | null;
  alreadyMember?: boolean;
}

export interface RoleMutationResponse {
  role: Role;
}

export const api = {
  auth: {
    me: (signal?: AbortSignal) => request<AuthResponse>('/api/me', { signal }),
    login: (email: string, password: string) =>
      request<AuthResponse>('/api/auth/login', { method: 'POST', body: { email, password } }),
    register: (payload: RegisterPayload) =>
      request<AuthResponse>('/api/auth/register', { method: 'POST', body: payload }),
    logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  },
  me: {
    updateProfile: (payload: { displayName?: string; username?: string; bio?: string }) =>
      request<{ user: SelfUser }>('/api/me/profile', { method: 'PATCH', body: payload }),
    updateAccount: (payload: { email: string; currentPassword: string }) =>
      request<{ user: SelfUser }>('/api/me/account', { method: 'PATCH', body: payload }),
    updatePassword: (payload: { currentPassword: string; newPassword: string }) =>
      request<{ ok: true }>('/api/me/password', { method: 'PATCH', body: payload }),
    updateSettings: (settings: SettingsPatch, language?: LanguageCode) =>
      request<{ user: SelfUser }>('/api/me/settings', {
        method: 'PATCH',
        body: { settings, ...(language ? { language } : {}) },
      }),
    uploadAvatar: (image: string) =>
      request<{ user: SelfUser }>('/api/me/avatar', { method: 'POST', body: { image } }),
    removeAvatar: () => request<{ user: SelfUser }>('/api/me/avatar', { method: 'DELETE' }),
    deleteAccount: (password: string) =>
      request<void>('/api/me', { method: 'DELETE', body: { password } }),
  },
  servers: {
    list: (signal?: AbortSignal) => request<{ servers: ServerSummary[] }>('/api/servers', { signal }),
    create: (payload: { name: string; description: string; image?: string | null }) =>
      request<{ server: ServerSummary; channelId: string }>('/api/servers', { method: 'POST', body: payload }),
    join: (code: string) =>
      request<ServerMutationResponse>('/api/servers/join', { method: 'POST', body: { code } }),
    get: (serverId: string, signal?: AbortSignal) =>
      request<{ server: ServerDetail }>(`/api/servers/${encodeURIComponent(serverId)}`, { signal }),
    update: (serverId: string, payload: { name?: string; description?: string }) =>
      request<{ server: ServerDetail }>(`/api/servers/${encodeURIComponent(serverId)}`, {
        method: 'PATCH',
        body: payload,
      }),
    remove: (serverId: string, confirmName: string) =>
      request<{ ok: true }>(`/api/servers/${encodeURIComponent(serverId)}`, {
        method: 'DELETE',
        body: { confirmName },
      }),
    uploadIcon: (serverId: string, image: string) =>
      request<{ iconUrl: string }>(`/api/servers/${encodeURIComponent(serverId)}/icon`, {
        method: 'POST',
        body: { image },
      }),
    removeIcon: (serverId: string) =>
      request<{ iconUrl: null }>(`/api/servers/${encodeURIComponent(serverId)}/icon`, {
        method: 'DELETE',
      }),
    transfer: (serverId: string, userId: string, confirmName: string) =>
      request<{ ok: true }>(`/api/servers/${encodeURIComponent(serverId)}/transfer`, {
        method: 'POST',
        body: { userId, confirmName },
      }),
    leave: (serverId: string) =>
      request<void>(`/api/servers/${encodeURIComponent(serverId)}/leave`, { method: 'POST' }),
    presence: (serverId: string) =>
      request<PresenceResponse>(`/api/servers/${encodeURIComponent(serverId)}/presence`),
    rotateInvite: (serverId: string) =>
      request<{ inviteCode: string }>(`/api/servers/${encodeURIComponent(serverId)}/invite/rotate`, {
        method: 'POST',
      }),
  },
  channels: {
    create: (serverId: string, payload: { name: string; topic: string }) =>
      request<{ channel: { id: string; name: string; topic: string; position: number; createdAt: string } }>(
        `/api/servers/${encodeURIComponent(serverId)}/channels`,
        { method: 'POST', body: payload },
      ),
    update: (serverId: string, channelId: string, payload: { name?: string; topic?: string }) =>
      request<{ channel: { id: string; name: string; topic: string } }>(
        `/api/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}`,
        { method: 'PATCH', body: payload },
      ),
    remove: (serverId: string, channelId: string) =>
      request<{ ok: true }>(
        `/api/servers/${encodeURIComponent(serverId)}/channels/${encodeURIComponent(channelId)}`,
        { method: 'DELETE' },
      ),
  },
  roles: {
    create: (
      serverId: string,
      payload: { name: string; color: string; permissions: number },
    ) =>
      request<RoleMutationResponse>(`/api/servers/${encodeURIComponent(serverId)}/roles`, {
        method: 'POST',
        body: payload,
      }),
    update: (
      serverId: string,
      roleId: string,
      payload: { name?: string; color?: string; permissions?: number },
    ) =>
      request<RoleMutationResponse>(
        `/api/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
        { method: 'PATCH', body: payload },
      ),
    remove: (serverId: string, roleId: string) =>
      request<{ ok: true }>(
        `/api/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}`,
        { method: 'DELETE' },
      ),
    move: (serverId: string, roleId: string, direction: 'up' | 'down') =>
      request<{ ok: true }>(
        `/api/servers/${encodeURIComponent(serverId)}/roles/${encodeURIComponent(roleId)}/move`,
        { method: 'POST', body: { direction } },
      ),
  },
  members: {
    setRoles: (serverId: string, userId: string, roleIds: string[]) =>
      request<{ ok: true }>(
        `/api/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}/roles`,
        { method: 'PUT', body: { roleIds } },
      ),
    kick: (serverId: string, userId: string) =>
      request<{ ok: true }>(
        `/api/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      ),
    setNickname: (serverId: string, userId: string, nickname: string | null) =>
      request<{ nickname: string | null; member: Member }>(
        `/api/servers/${encodeURIComponent(serverId)}/members/${encodeURIComponent(userId)}/nickname`,
        { method: 'PATCH', body: { nickname } },
      ),
  },
  users: {
    search: (query: string, signal?: AbortSignal) =>
      request<{ users: PublicUser[] }>(`/api/users/search?q=${encodeURIComponent(query)}`, { signal }),
  },
  dms: {
    list: (signal?: AbortSignal) =>
      request<{ conversations: DmConversation[] }>('/api/dm/conversations', { signal }),
    create: (payload: { kind?: 'direct' | 'group'; userIds: string[]; name?: string | null }) =>
      request<{ conversation: DmConversation; created: boolean }>('/api/dm/conversations', {
        method: 'POST',
        body: payload,
      }),
    get: (conversationId: string, signal?: AbortSignal) =>
      request<{ conversation: DmConversation }>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}`,
        { signal },
      ),
    messages: (
      conversationId: string,
      options: { before?: string; after?: string; signal?: AbortSignal } = {},
    ) => {
      const params = new URLSearchParams();
      if (options.before) params.set('before', options.before);
      if (options.after) params.set('after', options.after);
      const query = params.toString();
      return request<DmMessagesResponse>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}/messages${query ? `?${query}` : ''}`,
        { signal: options.signal },
      );
    },
    send: (conversationId: string, content: string) =>
      request<{ message: DmMessagesResponse['messages'][number] }>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}/messages`,
        { method: 'POST', body: { content } },
      ),
    edit: (messageId: string, content: string) =>
      request<{ message: DmMessagesResponse['messages'][number] }>(
        `/api/dm/messages/${encodeURIComponent(messageId)}`,
        { method: 'PATCH', body: { content } },
      ),
    remove: (messageId: string) =>
      request<{ ok: true }>(`/api/dm/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
    typing: (conversationId: string) =>
      request<void>(`/api/dm/conversations/${encodeURIComponent(conversationId)}/typing`, {
        method: 'POST',
      }),
    read: (conversationId: string) =>
      request<void>(`/api/dm/conversations/${encodeURIComponent(conversationId)}/read`, {
        method: 'POST',
      }),
    rename: (conversationId: string, name: string) =>
      request<{ conversation: DmConversation }>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}`,
        { method: 'PATCH', body: { name } },
      ),
    addParticipants: (conversationId: string, userIds: string[]) =>
      request<{ conversation: DmConversation }>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}/participants`,
        { method: 'POST', body: { userIds } },
      ),
    removeParticipant: (conversationId: string, userId: string) =>
      request<{ ok: true }>(
        `/api/dm/conversations/${encodeURIComponent(conversationId)}/participants/${encodeURIComponent(userId)}`,
        { method: 'DELETE' },
      ),
    leave: (conversationId: string) =>
      request<{ ok: true }>(`/api/dm/conversations/${encodeURIComponent(conversationId)}`, {
        method: 'DELETE',
      }),
  },
  messages: {
    list: (channelId: string, options: { before?: string; after?: string; signal?: AbortSignal } = {}) => {
      const params = new URLSearchParams();
      if (options.before) params.set('before', options.before);
      if (options.after) params.set('after', options.after);
      const query = params.toString();
      return request<MessagesResponse>(
        `/api/channels/${encodeURIComponent(channelId)}/messages${query ? `?${query}` : ''}`,
        { signal: options.signal },
      );
    },
    send: (channelId: string, content: string) =>
      request<{ message: Message }>(`/api/channels/${encodeURIComponent(channelId)}/messages`, {
        method: 'POST',
        body: { content },
      }),
    edit: (messageId: string, content: string) =>
      request<{ message: Message }>(`/api/messages/${encodeURIComponent(messageId)}`, {
        method: 'PATCH',
        body: { content },
      }),
    remove: (messageId: string) =>
      request<{ ok: true }>(`/api/messages/${encodeURIComponent(messageId)}`, { method: 'DELETE' }),
    typing: (channelId: string) =>
      request<void>(`/api/channels/${encodeURIComponent(channelId)}/typing`, { method: 'POST' }),
  },
  presence: {
    heartbeat: () => request<void>('/api/presence/heartbeat', { method: 'POST' }),
  },
};

export type { Member, UserSettings };
