import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  Ellipsis,
  Hash,
  LoaderCircle,
  Menu,
  MessageCircle,
  Pencil,
  Send,
  Settings,
  Trash2,
  UserPlus,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { translateError } from '../../lib/errors';
import { dateKey, dayLabel, formatDateTime, formatTime, truncate } from '../../lib/format';
import { playChime, showDesktopNotification } from '../../lib/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtime } from '../../contexts/RealtimeContext';
import { useToast } from '../../contexts/ToastContext';
import { hasAnyManagement } from '../../lib/permissions';
import type { Channel, Member, Message, PendingMessage, ServerDetail, TypingUser } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DropdownMenu } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Spinner';

const GROUP_WINDOW = 5 * 60 * 1000;
const MAX_MESSAGE = 2000;

function mergeMessages(...groups: Message[][]): Message[] {
  const map = new Map<string, Message>();
  for (const group of groups) {
    for (const message of group) map.set(message.id, message);
  }
  return [...map.values()].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return diff !== 0 ? diff : a.id.localeCompare(b.id);
  });
}

function renderContent(
  content: string,
  members: Member[],
  currentUsername: string,
): ReactNode[] {
  const usernames = new Set(members.map((member) => member.username.toLowerCase()));
  const tokens = content.split(/(https?:\/\/[^\s<>]+|@[a-zA-Z0-9_.]{3,24})/g);
  return tokens.map((token, index) => {
    if (/^https?:\/\//.test(token)) {
      return (
        <a key={index} href={token} target="_blank" rel="noopener noreferrer" className="message-link">
          {token}
        </a>
      );
    }
    const handle = token.slice(1).toLowerCase();
    if (/^@(everyone|here)$/i.test(token)) {
      return (
        <span key={index} className="mention mention-everyone">
          {token}
        </span>
      );
    }
    if (/^@[a-zA-Z0-9_.]{3,24}$/.test(token) && usernames.has(handle)) {
      const isSelf = handle === currentUsername.toLowerCase();
      return (
        <span key={index} className={cx('mention', isSelf && 'is-self')}>
          {token}
        </span>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

interface DisplayItem {
  message: Message;
  pending?: PendingMessage;
}

interface ChatViewProps {
  detail: ServerDetail;
  channel: Channel;
  membersOpen: boolean;
  onToggleMembers: () => void;
  onOpenNav: () => void;
  onInvite: () => void;
  onOpenSettings: () => void;
}

export function ChatView({
  detail,
  channel,
  membersOpen,
  onToggleMembers,
  onOpenNav,
  onInvite,
  onOpenSettings,
}: ChatViewProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { subscribe } = useRealtime();
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Message | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestAtRef = useRef<string | null>(null);
  const pollBusyRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const atBottomRef = useRef(true);
  const userRef = useRef(user);
  const channelRef = useRef(channel);
  const tRef = useRef(t);
  const toastRef = useRef(toast);
  const pollRef = useRef<() => void>(() => {});
  const typingTimersRef = useRef(new Map<string, number>());
  userRef.current = user;
  channelRef.current = channel;
  tRef.current = t;
  toastRef.current = toast;

  const canOpenSettings = detail.isOwner || hasAnyManagement(detail.permissions);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setMessages([]);
    setPending([]);
    setHasMore(false);
    setEditingId(null);
    setDraft('');
    setComposerError(null);
    setNewCount(0);
    setAtBottom(true);
    setTypingUsers([]);
    lastTypingSentRef.current = 0;
    atBottomRef.current = true;
    latestAtRef.current = null;

    api.messages
      .list(channel.id, { signal: controller.signal })
      .then((result) => {
        setMessages(result.messages);
        setHasMore(result.hasMore);
        setTypingUsers(result.typing ?? []);
        latestAtRef.current = result.latestAt;
        window.requestAnimationFrame(() => scrollToBottom('auto'));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [channel.id, reloadToken, scrollToBottom]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
  }, [draft]);

  const notifyIncoming = useCallback((incoming: Message[]) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const preferences = currentUser.settings.notifications;
    if (preferences.level === 'none') return;
    const relevant = incoming.filter((message) => {
      if (message.author.id === currentUser.id) return false;
      if (preferences.level === 'mentions') {
        return (
          message.content.toLowerCase().includes(`@${currentUser.username.toLowerCase()}`) ||
          /(^|\s)@(everyone|here)\b/i.test(message.content)
        );
      }
      return true;
    });
    if (relevant.length === 0) return;
    if (!document.hidden && atBottomRef.current) return;

    const currentChannel = channelRef.current;
    const mention = relevant.find(
      (message) =>
        message.content.toLowerCase().includes(`@${currentUser.username.toLowerCase()}`) ||
        /(^|\s)@(everyone|here)\b/i.test(message.content),
    );
    const last = mention ?? relevant[relevant.length - 1];
    const title = mention
      ? tRef.current('chat.mentionNotificationTitle', {
          author: last.author.displayName,
          channel: currentChannel.name,
        })
      : tRef.current('chat.newMessageNotificationTitle', { channel: currentChannel.name });
    const body =
      preferences.level === 'mentions'
        ? truncate(last.content, 150)
        : `${last.author.displayName}: ${truncate(last.content, 150)}`;

    if (preferences.sound) playChime();
    if (preferences.desktop && document.hidden) {
      showDesktopNotification(title, body, last.author.avatarUrl);
    }
    toastRef.current.info(body);
    setNewCount((count) => count + relevant.length);
  }, []);

  const showTypingUser = useCallback((typingUser: TypingUser) => {
    setTypingUsers((current) =>
      current.some((entry) => entry.id === typingUser.id) ? current : [...current, typingUser],
    );
    const existing = typingTimersRef.current.get(typingUser.id);
    if (existing) window.clearTimeout(existing);
    const timer = window.setTimeout(() => {
      typingTimersRef.current.delete(typingUser.id);
      setTypingUsers((current) => current.filter((entry) => entry.id !== typingUser.id));
    }, 7000);
    typingTimersRef.current.set(typingUser.id, timer);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      if (pollBusyRef.current) return;
      pollBusyRef.current = true;
      try {
        const after = latestAtRef.current;
        const result = await api.messages.list(channel.id, after ? { after } : {});
        if (cancelled) return;
        setTypingUsers(result.typing ?? []);
        if (result.messages.length > 0) {
          setMessages((current) => (after ? mergeMessages(current, result.messages) : result.messages));
          latestAtRef.current = result.latestAt ?? latestAtRef.current;
          notifyIncoming(result.messages);
          if (atBottomRef.current) {
            window.requestAnimationFrame(() => scrollToBottom('auto'));
          }
        }
      } catch {
        /* Polling is best-effort; the composer and reload still work. */
      } finally {
        pollBusyRef.current = false;
      }
    };
    const timer = window.setInterval(() => void poll(), 5000);
    const onVisibility = () => {
      if (!document.hidden) void poll();
    };
    pollRef.current = () => void poll();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      pollRef.current = () => {};
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [channel.id, notifyIncoming, scrollToBottom]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'message' && event.channelId === channel.id) {
          pollRef.current();
          return;
        }
        if (event.type === 'typing' && event.channelId === channel.id && event.userId !== user?.id) {
          showTypingUser({ id: event.userId, displayName: event.displayName });
        }
      }),
    [channel.id, subscribe, showTypingUser, user?.id],
  );

  useEffect(
    () => () => {
      for (const timer of typingTimersRef.current.values()) window.clearTimeout(timer);
      typingTimersRef.current.clear();
    },
    [channel.id],
  );

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    void api.messages.typing(channel.id).catch(() => {});
  };

  const typingLabel = useMemo(() => {
    const names = typingUsers.map((entry) => entry.displayName);
    if (names.length === 0) return null;
    if (names.length === 1) return t('presence.typingOne', { name: names[0] });
    if (names.length === 2) return t('presence.typingTwo', { a: names[0], b: names[1] });
    return t('presence.typingMany', { count: names.length });
  }, [typingUsers, t]);

  const items = useMemo<DisplayItem[]>(() => {
    const list: DisplayItem[] = messages.map((message) => ({ message }));
    if (user) {
      for (const item of pending) {
        list.push({
          pending: item,
          message: {
            id: item.id,
            channelId: channel.id,
            content: item.content,
            createdAt: item.createdAt,
            editedAt: null,
            author: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
              isOwner: detail.ownerId === user.id,
              roleName: null,
              roleColor: null,
              roleIsDefault: true,
              canMentionEveryone: false,
            },
            canEdit: false,
            canDelete: false,
          },
        });
      }
    }
    return list.sort((a, b) => {
      const diff = new Date(a.message.createdAt).getTime() - new Date(b.message.createdAt).getTime();
      return diff !== 0 ? diff : a.message.id.localeCompare(b.message.id);
    });
  }, [messages, pending, user, channel.id, detail.ownerId]);

  const rows = useMemo(() => {
    let previousDay = '';
    return items.map((item, index) => {
      const key = dateKey(item.message.createdAt);
      const divider = key !== previousDay ? dayLabel(item.message.createdAt, i18n.language, t) : null;
      previousDay = key;
      const previous = index > 0 ? items[index - 1] : null;
      const grouped = Boolean(
        !divider &&
          previous &&
          previous.message.author.id === item.message.author.id &&
          new Date(item.message.createdAt).getTime() - new Date(previous.message.createdAt).getTime() < GROUP_WINDOW,
      );
      return { ...item, divider, grouped };
    });
  }, [items, i18n.language, t]);

  const submitMessage = async (content: string, existingId?: string) => {
    const trimmed = content.trim();
    if (!trimmed) {
      setComposerError(t('chat.messageEmpty'));
      return;
    }
    if (trimmed.length > MAX_MESSAGE) {
      setComposerError(t('chat.messageTooLong', { max: MAX_MESSAGE }));
      return;
    }
    if (sending) return;

    const tempId = existingId ?? `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setComposerError(null);
    if (existingId) {
      setPending((current) =>
        current.map((item) => (item.id === existingId ? { ...item, status: 'sending' } : item)),
      );
    } else {
      setPending((current) => [
        ...current,
        { id: tempId, content: trimmed, createdAt: new Date().toISOString(), status: 'sending' },
      ]);
      setDraft('');
    }
    setSending(true);
    try {
      const result = await api.messages.send(channel.id, trimmed);
      setPending((current) => current.filter((item) => item.id !== tempId));
      setMessages((current) => mergeMessages(current, [result.message]));
      window.requestAnimationFrame(() => scrollToBottom('smooth'));
    } catch (error) {
      setPending((current) =>
        current.map((item) => (item.id === tempId ? { ...item, status: 'failed' } : item)),
      );
      setComposerError(translateError(t, error));
    } finally {
      setSending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submitMessage(draft);
  };

  const handleLoadEarlier = async () => {
    const oldest = messages[0];
    const element = scrollRef.current;
    if (!oldest || loadingEarlier || !element) return;
    setLoadingEarlier(true);
    const previousHeight = element.scrollHeight;
    try {
      const result = await api.messages.list(channel.id, { before: oldest.createdAt });
      setMessages((current) => mergeMessages(result.messages, current));
      setHasMore(result.hasMore);
      window.requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight - previousHeight;
      });
    } catch (error) {
      toast.error(translateError(t, error));
    } finally {
      setLoadingEarlier(false);
    }
  };

  const startEdit = (message: Message) => {
    setEditingId(message.id);
    setEditDraft(message.content);
  };

  const saveEdit = async (message: Message) => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    setEditBusy(true);
    try {
      const result = await api.messages.edit(message.id, trimmed);
      setMessages((current) => current.map((item) => (item.id === message.id ? result.message : item)));
      setEditingId(null);
      setEditDraft('');
    } catch (error) {
      toast.error(translateError(t, error));
    } finally {
      setEditBusy(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await api.messages.remove(deleteTarget.id);
    setMessages((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success(t('chat.messageDeleted'));
  };

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    const next = distance < 90;
    atBottomRef.current = next;
    setAtBottom(next);
    if (next) setNewCount(0);
  };

  if (!user) return null;

  return (
    <section className="chat-panel" aria-label={`#${channel.name}`}>
      <header className="chat-header">
        <IconButton label={t('a11y.openSidebar')} className="chat-menu-btn" onClick={onOpenNav}>
          <Menu className="icon" aria-hidden="true" />
        </IconButton>
        <div className="chat-heading">
          <span className="chat-hash" aria-hidden="true">
            <Hash className="icon" />
          </span>
          <div className="chat-heading-copy">
            <h1 className="chat-title">{channel.name}</h1>
            {channel.topic && <p className="chat-topic">{channel.topic}</p>}
          </div>
        </div>
        <div className="chat-actions">
          <IconButton
            label={membersOpen ? t('nav.hideMembers') : t('nav.showMembers')}
            onClick={onToggleMembers}
            aria-pressed={membersOpen}
          >
            <Users className="icon" aria-hidden="true" />
          </IconButton>
          <IconButton label={t('nav.invitePeople')} onClick={onInvite}>
            <UserPlus className="icon" aria-hidden="true" />
          </IconButton>
          {canOpenSettings && (
            <IconButton label={t('nav.serverSettings')} onClick={onOpenSettings}>
              <Settings className="icon" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </header>

      <div className="message-scroll" ref={scrollRef} onScroll={handleScroll} tabIndex={-1}>
        {loading ? (
          <div className="message-skeleton" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="skeleton-message">
                <Skeleton className="skeleton-avatar" />
                <div className="skeleton-lines">
                  <Skeleton className="skeleton-name" />
                  <Skeleton className="skeleton-text" />
                  <Skeleton className="skeleton-text short" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="message-state">
            <EmptyState
              icon={<WifiOff className="icon" />}
              title={t('chat.loadErrorTitle')}
              body={t('chat.loadErrorBody')}
              action={
                <Button variant="soft" onClick={() => setReloadToken((value) => value + 1)}>
                  {t('chat.retry')}
                </Button>
              }
            />
          </div>
        ) : (
          <>
            <div className="channel-welcome">
              <span className="channel-welcome-icon" aria-hidden="true">
                <Hash className="icon" />
              </span>
              <h2>{t('chat.welcomeTitle', { channel: channel.name })}</h2>
              <p>{t('chat.welcomeBody')}</p>
            </div>

            {hasMore && (
              <div className="load-earlier">
                <Button variant="ghost" size="sm" onClick={handleLoadEarlier} loading={loadingEarlier}>
                  {loadingEarlier ? t('chat.loadingEarlier') : t('chat.loadEarlier')}
                </Button>
              </div>
            )}

            {items.length === 0 ? (
              <div className="message-state">
                <EmptyState
                  icon={<MessageCircle className="icon" />}
                  title={t('chat.emptyTitle')}
                  body={t('chat.emptyBody')}
                />
              </div>
            ) : (
              <div className="message-list" role="log" aria-label={t('a11y.messageList')} aria-live="polite">
                {rows.map(({ message, pending: pendingItem, divider, grouped }) => {
                  const editing = editingId === message.id;
                  const roleColor = message.author.roleColor;
                  const showRole =
                    !message.author.isOwner && message.author.roleName && !message.author.roleIsDefault;
                  return (
                    <div key={message.id}>
                      {divider && (
                        <div className="day-divider" role="separator">
                          <span>{divider}</span>
                        </div>
                      )}
                      <article
                        className={cx(
                          'message-row',
                          grouped && 'is-grouped',
                          pendingItem && `is-${pendingItem.status}`,
                        )}
                      >
                        <div className="message-gutter">
                          {!grouped && (
                            <Avatar name={message.author.displayName} src={message.author.avatarUrl} size={40} />
                          )}
                          {grouped && (
                            <time className="message-hover-time" dateTime={message.createdAt}>
                              {formatTime(message.createdAt, i18n.language)}
                            </time>
                          )}
                        </div>
                        <div className="message-content-wrap">
                          {!grouped && (
                            <div className="message-head">
                              <span
                                className={cx('message-author', message.author.isOwner && 'is-owner')}
                                style={showRole && roleColor ? { color: roleColor } : undefined}
                              >
                                {message.author.displayName}
                              </span>
                              {message.author.isOwner && (
                                <span className="message-owner-badge">{t('servers.ownerChip')}</span>
                              )}
                              {showRole && (
                                <span className="message-role" style={{ color: roleColor ?? undefined }}>
                                  {message.author.roleName}
                                </span>
                              )}
                              <time className="message-time" dateTime={message.createdAt}>
                                {formatTime(message.createdAt, i18n.language)}
                              </time>
                            </div>
                          )}
                          {editing ? (
                            <div className="message-edit">
                              <textarea
                                className="input textarea"
                                value={editDraft}
                                onChange={(event) => setEditDraft(event.target.value)}
                                maxLength={MAX_MESSAGE}
                                rows={2}
                                aria-label={t('chat.editMessage')}
                                autoFocus
                              />
                              <div className="message-edit-actions">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setEditingId(null);
                                    setEditDraft('');
                                  }}
                                  disabled={editBusy}
                                >
                                  {t('chat.editCancel')}
                                </Button>
                                <Button
                                  variant="primary"
                                  size="sm"
                                  onClick={() => void saveEdit(message)}
                                  loading={editBusy}
                                  disabled={!editDraft.trim()}
                                >
                                  {t('chat.editSave')}
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <p className="message-content">
                              {renderContent(message.content, detail.members, user.username)}
                              {message.editedAt && (
                                <span
                                  className="message-edited"
                                  title={t('chat.editedAt', {
                                    date: formatDateTime(message.editedAt, i18n.language),
                                  })}
                                >
                                  ({t('chat.edited')})
                                </span>
                              )}
                            </p>
                          )}
                          {pendingItem && (
                            <div className={cx('pending-status', pendingItem.status === 'failed' && 'is-error')}>
                              {pendingItem.status === 'sending' ? (
                                <>
                                  <LoaderCircle className="icon spin" aria-hidden="true" />
                                  {t('chat.sending')}
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="icon" aria-hidden="true" />
                                  {t('chat.sendFailed')}
                                  <button type="button" onClick={() => void submitMessage(pendingItem.content, pendingItem.id)}>
                                    {t('chat.retrySend')}
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        {!pendingItem && (message.canEdit || message.canDelete) && !editing && (
                          <div className="message-actions">
                            <DropdownMenu
                              label={t('common.more')}
                              align="end"
                              renderTrigger={(props) => (
                                <button type="button" className="message-actions-trigger" {...props}>
                                  <Ellipsis className="icon" aria-hidden="true" />
                                </button>
                              )}
                              items={[
                                ...(message.canEdit
                                  ? [
                                      {
                                        id: 'edit',
                                        label: t('chat.editMessage'),
                                        icon: <Pencil className="icon" aria-hidden="true" />,
                                        onSelect: () => startEdit(message),
                                      },
                                    ]
                                  : []),
                                ...(message.canDelete
                                  ? [
                                      {
                                        id: 'delete',
                                        label: t('chat.deleteMessage'),
                                        icon: <Trash2 className="icon" aria-hidden="true" />,
                                        onSelect: () => setDeleteTarget(message),
                                        danger: true,
                                        separatorBefore: message.canEdit,
                                      },
                                    ]
                                  : []),
                              ]}
                            />
                          </div>
                        )}
                      </article>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="message-bottom" aria-hidden="true" />
          </>
        )}
      </div>

      {!atBottom && !loading && !loadError && (
        <button type="button" className="jump-latest" onClick={() => scrollToBottom('smooth')}>
          <ArrowDown className="icon" aria-hidden="true" />
          <span>{t('chat.jumpToLatest')}</span>
          {newCount > 0 && <span className="jump-count">{newCount}</span>}
        </button>
      )}

      <div className="typing-bar" aria-live="polite">
        {typingLabel && (
          <>
            <span className="typing-dots" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
            <span className="typing-text">{typingLabel}</span>
          </>
        )}
      </div>

      <form className="composer" onSubmit={handleSubmit}>
        {composerError && (
          <div className="composer-error" role="alert">
            <AlertTriangle className="icon" aria-hidden="true" />
            <span>{composerError}</span>
            <button type="button" onClick={() => setComposerError(null)} aria-label={t('common.dismiss')}>
              <X className="icon" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="composer-box">
          <textarea
            ref={textareaRef}
            className="composer-input"
            value={draft}
            onChange={(event) => handleDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void submitMessage(draft);
              }
            }}
            placeholder={t('chat.messagePlaceholder', { channel: channel.name })}
            aria-label={t('chat.composerLabel', { channel: channel.name })}
            rows={1}
            maxLength={MAX_MESSAGE}
            disabled={loading || Boolean(loadError)}
          />
          <div className="composer-bar">
            <span className="composer-hint">{t('chat.composerHint')}</span>
            {draft.length > 1800 && (
              <span className={cx('composer-count', draft.length >= MAX_MESSAGE && 'is-limit')}>
                {draft.length}/{MAX_MESSAGE}
              </span>
            )}
            <Button
              variant="primary"
              type="submit"
              size="sm"
              loading={sending}
              disabled={!draft.trim() || loading || Boolean(loadError)}
              icon={<Send className="icon" aria-hidden="true" />}
            >
              {sending ? t('chat.sending') : t('chat.send')}
            </Button>
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={
          deleteTarget?.author.id === user.id
            ? t('chat.deleteOwnTitle')
            : t('chat.deleteOtherTitle')
        }
        body={t('chat.deleteBody')}
        confirmLabel={t('chat.deleteAction')}
        danger
      />
    </section>
  );
}
