const base = process.env.DATCHORD_URL || 'http://localhost:3100';
const suffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const password = 'smoke-test-1234';

async function request(path, options = {}, cookie = '') {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const setCookie = response.headers.getSetCookie?.() || [];
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: response.status, json, setCookie };
}

function assert(condition, message) {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`ok - ${message}`);
}

function cookieFrom(response) {
  return response.setCookie.map((value) => value.split(';')[0]).join('; ');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function openEvents(cookie) {
  const controller = new AbortController();
  const response = await fetch(`${base}/api/events`, {
    headers: { Cookie: cookie, Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (response.status !== 200) throw new Error(`SSE responded with ${response.status}`);
  const events = [];
  const decoder = new TextDecoder();
  let buffer = '';
  const pump = (async () => {
    try {
      for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true });
        let boundary;
        while ((boundary = buffer.indexOf('\n\n')) >= 0) {
          const raw = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const data = raw
            .split('\n')
            .filter((line) => line.startsWith('data:'))
            .map((line) => line.slice(5).trim())
            .join('\n');
          if (!data) continue;
          try {
            events.push(JSON.parse(data));
          } catch {
            /* ignore malformed events */
          }
        }
      }
    } catch {
      /* aborted or closed */
    }
  })();
  return {
    events,
    async waitFor(predicate, label, timeout = 5000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        const found = events.find(predicate);
        if (found) return found;
        await sleep(40);
      }
      throw new Error(`FAIL: timed out waiting for ${label}`);
    },
    async close() {
      controller.abort();
      await pump;
    },
  };
}

async function register(label, language = 'en') {
  const user = {
    email: `smoke-${label}-${suffix}@example.com`,
    username: `smoke_${label}_${suffix}`.slice(0, 24),
    displayName: `Smoke ${label.toUpperCase()}`,
    password,
    language,
  };
  const response = await request('/api/auth/register', { method: 'POST', body: user });
  assert(response.status === 201, `${label} account registers`);
  return { user, response, cookie: cookieFrom(response) };
}

const health = await request('/api/health');
assert(health.status === 200 && health.json?.ok, 'health endpoint responds');

const unauthorized = await request('/api/me');
assert(unauthorized.status === 401, 'private endpoint requires authentication');

const badLogin = await request('/api/auth/login', {
  method: 'POST',
  body: { email: 'nobody@example.com', password: 'wrong-password' },
});
assert(badLogin.status === 401, 'invalid credentials are rejected');

const alpha = await register('a');
const beta = await register('b', 'es');
const gamma = await register('c');
assert(alpha.response.json?.servers?.length === 0, 'new account starts with no servers');
const cookieA = alpha.cookie;
const cookieB = beta.cookie;
const cookieC = gamma.cookie;
const idA = alpha.response.json.user.id;
const idB = beta.response.json.user.id;
const idC = gamma.response.json.user.id;

const heartbeat = await request('/api/presence/heartbeat', { method: 'POST' }, cookieA);
assert(heartbeat.status === 204, 'presence heartbeat succeeds');

const create = await request(
  '/api/servers',
  { method: 'POST', body: { name: `Smoke ${suffix}`, description: 'Temporary test server.' } },
  cookieA,
);
assert(create.status === 201 && create.json?.channelId, 'server creation returns a default channel');
const serverId = create.json.server.id;
const channelId = create.json.channelId;
const originalInvite = create.json.server.inviteCode;

const detail = await request(`/api/servers/${serverId}`, {}, cookieA);
assert(detail.status === 200 && detail.json?.server?.members?.length === 1, 'server detail lists its owner');
assert(
  detail.json.server.roles.some((role) => role.isDefault && (role.permissions & 256) === 256),
  'default role includes the change-nickname permission',
);

const join = await request('/api/servers/join', { method: 'POST', body: { code: originalInvite } }, cookieB);
assert(join.status === 200 && join.json?.server?.id === serverId, 'second account joins with the invite code');

const rotate = await request(`/api/servers/${serverId}/invite/rotate`, { method: 'POST' }, cookieA);
assert(rotate.status === 200 && rotate.json?.inviteCode && rotate.json.inviteCode !== originalInvite, 'owner rotates the invite code');
const rotatedInvite = rotate.json.inviteCode;

const staleJoin = await request('/api/servers/join', { method: 'POST', body: { code: originalInvite } }, cookieC);
assert(staleJoin.status === 400 || staleJoin.status === 404, 'the old invite code no longer works');
const freshJoin = await request('/api/servers/join', { method: 'POST', body: { code: rotatedInvite } }, cookieC);
assert(freshJoin.status === 200 && freshJoin.json?.server?.id === serverId, 'the rotated invite code works');

const unprivilegedRotate = await request(`/api/servers/${serverId}/invite/rotate`, { method: 'POST' }, cookieB);
assert(unprivilegedRotate.status === 403, 'members cannot rotate invites without permission');

const presenceB = await request(`/api/servers/${serverId}/presence`, {}, cookieB);
assert(
  presenceB.status === 200 && presenceB.json.onlineUserIds.includes(idA),
  'presence reports the online owner',
);

const unprivilegedMention = await request(
  `/api/channels/${channelId}/messages`,
  { method: 'POST', body: { content: '@everyone this should be blocked' } },
  cookieB,
);
assert(unprivilegedMention.status === 403 && unprivilegedMention.json?.error === 'MENTION_EVERYONE', 'default members cannot mention everyone');

const typing = await request(`/api/channels/${channelId}/typing`, { method: 'POST' }, cookieA);
assert(typing.status === 204, 'typing signal is accepted');

const messagesB = await request(`/api/channels/${channelId}/messages`, {}, cookieB);
assert(
  messagesB.status === 200 && messagesB.json.typing.some((entry) => entry.id === idA),
  'typing indicator is visible to other members',
);

const events = await openEvents(cookieB);
await events.waitFor((event) => event.type === 'ready', 'the realtime ready event');

const sent = await request(
  `/api/channels/${channelId}/messages`,
  { method: 'POST', body: { content: 'Hello from the smoke test.' } },
  cookieA,
);
assert(sent.status === 201 && sent.json?.message?.content, 'message send succeeds');
await events.waitFor(
  (event) => event.type === 'message' && event.channelId === channelId && event.action === 'created',
  'the realtime message event',
);
assert(true, 'realtime channel messages reach other members');

const afterSend = await request(`/api/channels/${channelId}/messages`, {}, cookieB);
assert(afterSend.json.typing.length === 0, 'sending a message clears the typing indicator');

const search = await request(`/api/users/search?q=${encodeURIComponent(beta.user.username)}`, {}, cookieA);
assert(search.status === 200 && search.json.users.some((person) => person.id === idB), 'user search finds people by username');

// --- Direct messages -------------------------------------------------------
const direct = await request('/api/dm/conversations', { method: 'POST', body: { userIds: [idB] } }, cookieA);
assert(direct.status === 201 && direct.json?.created === true, 'a direct conversation is created');
const directId = direct.json.conversation.id;
assert(direct.json.conversation.kind === 'direct' && direct.json.conversation.participants.length === 2, 'direct conversations have two participants');
assert(direct.json.conversation.displayName === 'Smoke B', 'direct conversations are named after the other person');

const directAgain = await request('/api/dm/conversations', { method: 'POST', body: { userIds: [idB] } }, cookieA);
assert(directAgain.status === 200 && directAgain.json?.created === false && directAgain.json.conversation.id === directId, 'reopening a direct conversation reuses it');

const dmTyping = await request(`/api/dm/conversations/${directId}/typing`, { method: 'POST' }, cookieA);
assert(dmTyping.status === 204, 'direct message typing signal is accepted');
await events.waitFor(
  (event) => event.type === 'dm-typing' && event.conversationId === directId && event.userId === idA,
  'the direct typing event',
);
assert(true, 'realtime direct typing reaches the other person');

const dmSent = await request(
  `/api/dm/conversations/${directId}/messages`,
  { method: 'POST', body: { content: 'A private hello.' } },
  cookieA,
);
assert(dmSent.status === 201 && dmSent.json?.message?.content === 'A private hello.', 'direct message send succeeds');
const directMessageId = dmSent.json.message.id;
await events.waitFor(
  (event) => event.type === 'dm-message' && event.conversationId === directId && event.action === 'created',
  'the realtime direct message event',
);
assert(true, 'realtime direct messages reach the other person');

const dmListB = await request('/api/dm/conversations', {}, cookieB);
const directForB = dmListB.json.conversations.find((conversation) => conversation.id === directId);
assert(Boolean(directForB) && directForB.unreadCount === 1, 'unread direct messages are counted');
assert(directForB.lastMessage?.content === 'A private hello.', 'conversation previews show the latest message');

const dmMessagesB = await request(`/api/dm/conversations/${directId}/messages`, {}, cookieB);
assert(
  dmMessagesB.status === 200 && dmMessagesB.json.messages.some((message) => message.id === directMessageId),
  'the other participant can read direct message history',
);
const readResponse = await request(`/api/dm/conversations/${directId}/read`, { method: 'POST' }, cookieB);
assert(readResponse.status === 204, 'marking a conversation as read succeeds');
const dmListAfterRead = await request('/api/dm/conversations', {}, cookieB);
assert(
  dmListAfterRead.json.conversations.find((conversation) => conversation.id === directId).unreadCount === 0,
  'reading a conversation clears its unread count',
);

const dmReply = await request(
  `/api/dm/conversations/${directId}/messages`,
  { method: 'POST', body: { content: 'A private reply.' } },
  cookieB,
);
assert(dmReply.status === 201, 'the other participant can reply');
const replyId = dmReply.json.message.id;

const editReply = await request(`/api/dm/messages/${replyId}`, { method: 'PATCH', body: { content: 'An edited reply.' } }, cookieB);
assert(editReply.status === 200 && editReply.json.message.editedAt, 'authors can edit their direct messages');
const foreignEdit = await request(`/api/dm/messages/${replyId}`, { method: 'PATCH', body: { content: 'Hijacked.' } }, cookieA);
assert(foreignEdit.status === 403, 'other participants cannot edit a direct message');
const deleteReply = await request(`/api/dm/messages/${replyId}`, { method: 'DELETE' }, cookieB);
assert(deleteReply.status === 200, 'authors can delete their direct messages');

// --- Private groups --------------------------------------------------------
const group = await request(
  '/api/dm/conversations',
  { method: 'POST', body: { kind: 'group', userIds: [idB, idC], name: 'Smoke group' } },
  cookieA,
);
assert(group.status === 201 && group.json?.conversation?.kind === 'group', 'a private group is created');
const groupId = group.json.conversation.id;
assert(group.json.conversation.participants.length === 3 && group.json.conversation.ownerId === idA, 'groups keep their owner and participants');

const foreignRename = await request(`/api/dm/conversations/${groupId}`, { method: 'PATCH', body: { name: 'Not mine' } }, cookieB);
assert(foreignRename.status === 403, 'only the group owner can rename it');
const rename = await request(`/api/dm/conversations/${groupId}`, { method: 'PATCH', body: { name: 'Renamed group' } }, cookieA);
assert(rename.status === 200 && rename.json.conversation.name === 'Renamed group', 'the group owner can rename the group');

const removeC = await request(`/api/dm/conversations/${groupId}/participants/${idC}`, { method: 'DELETE' }, cookieA);
assert(removeC.status === 200, 'the owner can remove a group participant');
const removedAccess = await request(`/api/dm/conversations/${groupId}`, {}, cookieC);
assert(removedAccess.status === 404, 'removed participants lose access');
const addC = await request(`/api/dm/conversations/${groupId}/participants`, { method: 'POST', body: { userIds: [idC] } }, cookieA);
assert(addC.status === 200 && addC.json.conversation.participants.length === 3, 'the owner can add participants back');

const groupMessage = await request(
  `/api/dm/conversations/${groupId}/messages`,
  { method: 'POST', body: { content: 'Group hello.' } },
  cookieB,
);
assert(groupMessage.status === 201, 'group members can send messages');
const groupListC = await request('/api/dm/conversations', {}, cookieC);
assert(
  groupListC.json.conversations.find((conversation) => conversation.id === groupId)?.unreadCount === 1,
  'group unread counts include messages from other members',
);

// --- Nicknames and roles ---------------------------------------------------
const ownNickname = await request(
  `/api/servers/${serverId}/members/${idA}/nickname`,
  { method: 'PATCH', body: { nickname: 'Alpha Nick' } },
  cookieA,
);
assert(ownNickname.status === 200 && ownNickname.json.nickname === 'Alpha Nick', 'members can change their own nickname');
const detailAfterNickname = await request(`/api/servers/${serverId}`, {}, cookieB);
assert(
  detailAfterNickname.json.server.members.find((member) => member.id === idA)?.displayName === 'Alpha Nick',
  'nicknames appear in the member list',
);

const nicknameB = await request(
  `/api/servers/${serverId}/members/${idB}/nickname`,
  { method: 'PATCH', body: { nickname: 'Beta Nick' } },
  cookieA,
);
assert(nicknameB.status === 200, 'owner can change another member nickname');
const clearance = await request(
  `/api/servers/${serverId}/members/${idB}/nickname`,
  { method: 'PATCH', body: { nickname: null } },
  cookieA,
);
assert(clearance.status === 200 && clearance.json.nickname === null, 'nicknames can be cleared');

const unprivilegedNickname = await request(
  `/api/servers/${serverId}/members/${idC}/nickname`,
  { method: 'PATCH', body: { nickname: 'Nope' } },
  cookieB,
);
assert(unprivilegedNickname.status === 403, 'members without permission cannot rename others');

const role = await request(
  `/api/servers/${serverId}/roles`,
  {
    method: 'POST',
    body: {
      name: 'Moderators',
      color: '#42c8a7',
      permissions: 64 | 128 | 512,
    },
  },
  cookieA,
);
assert(role.status === 201 && role.json?.role?.id, 'roles with the new permissions can be created');
const moderatorRoleId = role.json.role.id;
const assignRole = await request(
  `/api/servers/${serverId}/members/${idB}/roles`,
  { method: 'PUT', body: { roleIds: [moderatorRoleId] } },
  cookieA,
);
assert(assignRole.status === 200, 'roles can be assigned to members');

const managedNickname = await request(
  `/api/servers/${serverId}/members/${idC}/nickname`,
  { method: 'PATCH', body: { nickname: 'Gamma Nick' } },
  cookieB,
);
assert(managedNickname.status === 200, 'manage-nicknames lets members rename lower members');

const moderatorRotate = await request(`/api/servers/${serverId}/invite/rotate`, { method: 'POST' }, cookieB);
assert(moderatorRotate.status === 200, 'manage-invites lets members rotate the invite code');

const mentionAllowed = await request(
  `/api/channels/${channelId}/messages`,
  { method: 'POST', body: { content: '@everyone the moderator is here.' } },
  cookieB,
);
assert(mentionAllowed.status === 201, 'mention-everyone permission is enforced');

const adminRole = await request(
  `/api/servers/${serverId}/roles`,
  { method: 'POST', body: { name: 'Admins', color: '#ff6f4e', permissions: 32 } },
  cookieA,
);
assert(adminRole.status === 201, 'administrator roles can be created');
const adminRoleId = adminRole.json.role.id;
const assignAdmin = await request(
  `/api/servers/${serverId}/members/${idC}/roles`,
  { method: 'PUT', body: { roleIds: [adminRoleId] } },
  cookieA,
);
assert(assignAdmin.status === 200, 'administrator roles can be assigned');
const adminRotate = await request(`/api/servers/${serverId}/invite/rotate`, { method: 'POST' }, cookieC);
assert(adminRotate.status === 200, 'administrator grants manage-invites');

// --- Settings, presence and cleanup ---------------------------------------
const settings = await request(
  '/api/me/settings',
  { method: 'PATCH', body: { settings: { appearance: { density: 'compact' } } } },
  cookieA,
);
assert(settings.status === 200, 'settings update succeeds');

await events.close();
assert(true, 'realtime connection closes cleanly');

const logout = await request('/api/auth/logout', { method: 'POST' }, cookieB);
assert(logout.status === 204, 'logout succeeds');

const afterLogout = await request(`/api/servers/${serverId}/presence`, {}, cookieA);
assert(
  afterLogout.status === 200 && !afterLogout.json.onlineUserIds.includes(idB),
  'logging out removes presence',
);

const removeServer = await request(
  `/api/servers/${serverId}`,
  { method: 'DELETE', body: { confirmName: `Smoke ${suffix}` } },
  cookieA,
);
assert(removeServer.status === 200, 'server deletion succeeds');

const deleteA = await request('/api/me', { method: 'DELETE', body: { password } }, cookieA);
assert(deleteA.status === 204, 'first account deletion succeeds');

const loginB = await request('/api/auth/login', { method: 'POST', body: { email: beta.user.email, password } });
const deleteB = await request('/api/me', { method: 'DELETE', body: { password } }, cookieFrom(loginB));
assert(deleteB.status === 204, 'second account deletion succeeds');

const deleteC = await request('/api/me', { method: 'DELETE', body: { password } }, cookieC);
assert(deleteC.status === 204, 'third account deletion succeeds');

console.log('\nAll smoke checks passed.');
