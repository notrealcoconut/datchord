import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Ellipsis,
  Info,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Send,
  Trash2,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { cx } from '../../lib/cx';
import { translateError } from '../../lib/errors';
import { dateKey, dayLabel, formatDateTime, formatTime, truncate } from '../../lib/format';
import { playChime, showDesktopNotification } from '../../lib/notifications';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtime } from '../../contexts/RealtimeContext';
import { useToast } from '../../contexts/ToastContext';
import type {
  DmConversation,
  DmMessage,
  DmPendingMessage,
  PublicUser,
  TypingUser,
} from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { DropdownMenu } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';
import { Skeleton } from '../ui/Spinner';
import { DmProfileDialog } from './DmProfileDialog';
import { GroupDialog } from './GroupDialog';

const GROUP_WINDOW = 5 * 60 * 1000;
const MAX_MESSAGE = 2000;

function mergeMessages(...groups: DmMessage[][]): DmMessage[] {
  const map = new Map<string, DmMessage>();
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
  participants: PublicUser[],
  currentUsername: string,
): ReactNode[] {
  const usernames = new Set(participants.map((participant) => participant.username.toLowerCase()));
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
    if (/^@[a-zA-Z0-9_.]{3,24}$/.test(token) && usernames.has(handle)) {
      return (
        <span key={index} className={cx('mention', handle === currentUsername.toLowerCase() && 'is-self')}>
          {token}
        </span>
      );
    }
    return <span key={index}>{token}</span>;
  });
}

interface DisplayItem {
  message: DmMessage;
  pending?: DmPendingMessage;
}

export interface DmChatProps {
  conversation: DmConversation;
  onBack: () => void;
}

export function DmChat({ conversation, onBack }: DmChatProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { subscribe, refreshConversations } = useRealtime();
  const navigate = useNavigate();
  const toast = useToast();
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [pending, setPending] = useState<DmPendingMessage[]>([]);
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
  const [deleteTarget, setDeleteTarget] = useState<DmMessage | null>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const [onlineIds, setOnlineIds] = useState<string[]>(conversation.onlineUserIds);
  const [groupOpen, setGroupOpen] = useState(false);
  const [profilePerson, setProfilePerson] = useState<PublicUser | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const latestAtRef = useRef<string | null>(null);
  const pollBusyRef = useRef(false);
  const lastTypingSentRef = useRef(0);
  const lastReadRef = useRef(0);
  const atBottomRef = useRef(true);
  const pollRef = useRef<() => void>(() => {});
  const typingTimersRef = useRef(new Map<string, number>());
  const userRef = useRef(user);
  const conversationRef = useRef(conversation);
  const tRef = useRef(t);
  const toastRef = useRef(toast);
  userRef.current = user;
  conversationRef.current = conversation;
  tRef.current = t;
  toastRef.current = toast;

  const otherPerson =
    conversation.kind === 'direct'
      ? conversation.participants.find((participant) => participant.id !== user?.id) ?? null
      : null;
  const onlineSet = useMemo(() => new Set(onlineIds), [onlineIds]);

  useEffect(() => {
    setOnlineIds(conversation.onlineUserIds);
  }, [conversation.id, conversation.onlineUserIds]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior });
    atBottomRef.current = true;
    setAtBottom(true);
    setNewCount(0);
  }, []);

  const markRead = useCallback(() => {
    const now = Date.now();
    if (now - lastReadRef.current < 1500) return;
    lastReadRef.current = now;
    void api.dms
      .read(conversation.id)
      .then(() => refreshConversations())
      .catch(() => {
        /* Read receipts are best-effort. */
      });
  }, [conversation.id, refreshConversations]);

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
    lastReadRef.current = 0;
    atBottomRef.current = true;
    latestAtRef.current = null;

    api.dms
      .messages(conversation.id, { signal: controller.signal })
      .then((result) => {
        setMessages(result.messages);
        setHasMore(result.hasMore);
        setTypingUsers(result.typing ?? []);
        latestAtRef.current = result.latestAt;
        markRead();
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
  }, [conversation.id, reloadToken, markRead, scrollToBottom]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 168)}px`;
  }, [draft]);

  const notifyIncoming = useCallback((incoming: DmMessage[]) => {
    const currentUser = userRef.current;
    if (!currentUser) return;
    const preferences = currentUser.settings.notifications;
    if (preferences.level === 'none') return;
    const relevant = incoming.filter((message) => {
      if (message.author.id === currentUser.id) return false;
      if (preferences.level === 'mentions') {
        return message.content.toLowerCase().includes(`@${currentUser.username.toLowerCase()}`);
      }
      return true;
    });
    if (relevant.length === 0) return;
    if (!document.hidden && atBottomRef.current) return;

    const current = conversationRef.current;
    const last = relevant[relevant.length - 1];
    const title = tRef.current('dms.notificationTitle', { name: current.displayName });
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
        const result = await api.dms.messages(conversation.id, after ? { after } : {});
        if (cancelled) return;
        setTypingUsers(result.typing ?? []);
        if (result.messages.length > 0) {
          setMessages((current) => (after ? mergeMessages(current, result.messages) : result.messages));
          latestAtRef.current = result.latestAt ?? latestAtRef.current;
          notifyIncoming(result.messages);
          markRead();
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
  }, [conversation.id, notifyIncoming, scrollToBottom, markRead]);

  useEffect(
    () =>
      subscribe((event) => {
        if (event.type === 'presence') {
          setOnlineIds((current) => {
            if (event.online) return current.includes(event.userId) ? current : [...current, event.userId];
            return current.filter((id) => id !== event.userId);
          });
          return;
        }
        if (event.type === 'dm-message' && event.conversationId === conversation.id) {
          pollRef.current();
          return;
        }
        if (
          event.type === 'dm-typing' &&
          event.conversationId === conversation.id &&
          event.userId !== user?.id
        ) {
          showTypingUser({ id: event.userId, displayName: event.displayName });
        }
      }),
    [conversation.id, subscribe, showTypingUser, user?.id],
  );

  useEffect(
    () => () => {
      for (const timer of typingTimersRef.current.values()) window.clearTimeout(timer);
      typingTimersRef.current.clear();
    },
    [conversation.id],
  );

  const items = useMemo<DisplayItem[]>(() => {
    const list: DisplayItem[] = messages.map((message) => ({ message }));
    if (user) {
      for (const item of pending) {
        list.push({
          pending: item,
          message: {
            id: item.id,
            conversationId: conversation.id,
            content: item.content,
            createdAt: item.createdAt,
            editedAt: null,
            author: {
              id: user.id,
              username: user.username,
              displayName: user.displayName,
              avatarUrl: user.avatarUrl,
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
  }, [messages, pending, user, conversation.id]);

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
      const result = await api.dms.send(conversation.id, trimmed);
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
      const result = await api.dms.messages(conversation.id, { before: oldest.createdAt });
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

  const startEdit = (message: DmMessage) => {
    setEditingId(message.id);
    setEditDraft(message.content);
  };

  const saveEdit = async (message: DmMessage) => {
    const trimmed = editDraft.trim();
    if (!trimmed) return;
    setEditBusy(true);
    try {
      const result = await api.dms.edit(message.id, trimmed);
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
    await api.dms.remove(deleteTarget.id);
    setMessages((current) => current.filter((item) => item.id !== deleteTarget.id));
    setDeleteTarget(null);
    toast.success(t('chat.messageDeleted'));
  };

  const handleDraftChange = (value: string) => {
    setDraft(value);
    if (!value.trim()) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current < 3000) return;
    lastTypingSentRef.current = now;
    void api.dms.typing(conversation.id).catch(() => {});
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

  const typingLabel = useMemo(() => {
    const names = typingUsers.map((entry) => entry.displayName);
    if (names.length === 0) return null;
    if (names.length === 1) return t('presence.typingOne', { name: names[0] });
    if (names.length === 2) return t('presence.typingTwo', { a: names[0], b: names[1] });
    return t('presence.typingMany', { count: names.length });
  }, [typingUsers, t]);

  const openDirectWith = (person: PublicUser) => {
    setProfilePerson(null);
    if (person.id === user?.id) return;
    void api.dms
      .create({ userIds: [person.id] })
      .then((result) => {
        void refreshConversations();
        navigate(`/app/dms/${result.conversation.id}`);
      })
      .catch((error: unknown) => toast.error(translateError(t, error)));
  };

  if (!user) return null;

  const directOnline = otherPerson ? onlineSet.has(otherPerson.id) : false;

  return (
    <section className="chat-panel dm-chat-panel" aria-label={conversation.displayName}>
      <header className="chat-header dm-chat-header">
        <IconButton label={t('dms.backToList')} className="dm-back-btn" onClick={onBack}>
          <ArrowLeft className="icon" aria-hidden="true" />
        </IconButton>
        <button
          type="button"
          className="dm-chat-heading"
          onClick={() => {
            if (conversation.kind === 'group') setGroupOpen(true);
            else if (otherPerson) setProfilePerson(otherPerson);
          }}
        >
          <span className="dm-header-avatar">
            {conversation.kind === 'direct' ? (
              <Avatar
                name={conversation.displayName}
                src={conversation.avatarUrl}
                size={38}
                decorative
              />
            ) : (
              <span className="dm-group-avatar" aria-hidden="true">
                <Users className="icon" />
              </span>
            )}
            {conversation.kind === 'direct' && (
              <span
                className={cx('presence-dot', directOnline ? 'is-online' : 'is-offline')}
                aria-hidden="true"
              />
            )}
          </span>
          <span className="dm-header-copy">
            <span className="chat-title dm-chat-title">{conversation.displayName}</span>
            <span className="dm-chat-status">
              {conversation.kind === 'direct'
                ? directOnline
                  ? t('presence.online')
                  : t('presence.offline')
                : t('dms.groupStatus', {
                    count: conversation.participants.length,
                    online: onlineIds.filter((id) => conversation.participants.some((p) => p.id === id)).length,
                  })}
            </span>
          </span>
        </button>
        <div className="chat-actions">
          {conversation.kind === 'group' ? (
            <IconButton label={t('dms.groupDetails')} onClick={() => setGroupOpen(true)}>
              <Users className="icon" aria-hidden="true" />
            </IconButton>
          ) : (
            otherPerson && (
              <IconButton label={t('dms.profileTitle')} onClick={() => setProfilePerson(otherPerson)}>
                <Info className="icon" aria-hidden="true" />
              </IconButton>
            )
          )}
        </div>
      </header>

      {conversation.kind === 'group' && conversation.participants.length > 1 && (
        <div className="dm-participant-strip" aria-label={t('common.members')}>
          {conversation.participants.slice(0, 8).map((participant) => (
            <button
              key={participant.id}
              type="button"
              className="dm-participant"
              onClick={() => setProfilePerson(participant)}
              title={participant.displayName}
              aria-label={participant.displayName}
            >
              <Avatar name={participant.displayName} src={participant.avatarUrl} size={26} decorative />
            </button>
          ))}
        </div>
      )}

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
            <div className="channel-welcome dm-welcome">
              <span className="channel-welcome-icon dm-welcome-icon" aria-hidden="true">
                {conversation.kind === 'direct' ? (
                  <Avatar
                    name={conversation.displayName}
                    src={conversation.avatarUrl}
                    size={64}
                    decorative
                  />
                ) : (
                  <span className="dm-group-avatar dm-group-avatar-lg">
                    <Users className="icon" />
                  </span>
                )}
              </span>
              <h2>
                {conversation.kind === 'direct'
                  ? t('dms.welcomeDirect', { name: conversation.displayName })
                  : t('dms.welcomeGroup', { name: conversation.displayName })}
              </h2>
              <p>
                {conversation.kind === 'direct'
                  ? t('dms.welcomeDirectBody', { name: conversation.displayName })
                  : t('dms.welcomeGroupBody', { count: conversation.participants.length })}
              </p>
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
                  body={t('dms.emptyConversation')}
                />
              </div>
            ) : (
              <div className="message-list" role="log" aria-label={t('a11y.messageList')} aria-live="polite">
                {rows.map(({ message, pending: pendingItem, divider, grouped }) => {
                  const editing = editingId === message.id;
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
                          {!grouped ? (
                            <button
                              type="button"
                              className="message-avatar-button"
                              onClick={() => {
                                const person = conversation.participants.find(
                                  (participant) => participant.id === message.author.id,
                                );
                                if (person) setProfilePerson(person);
                              }}
                              aria-label={message.author.displayName}
                            >
                              <Avatar
                                name={message.author.displayName}
                                src={message.author.avatarUrl}
                                size={40}
                                decorative
                              />
                            </button>
                          ) : (
                            <time className="message-hover-time" dateTime={message.createdAt}>
                              {formatTime(message.createdAt, i18n.language)}
                            </time>
                          )}
                        </div>
                        <div className="message-content-wrap">
                          {!grouped && (
                            <div className="message-head">
                              <span className={cx('message-author', message.author.id === user.id && 'is-owner')}>
                                {message.author.displayName}
                              </span>
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
                              {renderContent(message.content, conversation.participants, user.username)}
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
            placeholder={t('dms.messagePlaceholder', { name: conversation.displayName })}
            aria-label={t('dms.messagePlaceholder', { name: conversation.displayName })}
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
        title={t('chat.deleteOwnTitle')}
        body={t('chat.deleteBody')}
        confirmLabel={t('chat.deleteAction')}
        danger
      />

      <GroupDialog
        open={groupOpen}
        onClose={() => setGroupOpen(false)}
        conversation={conversation}
        onUpdated={() => {
          void refreshConversations();
        }}
        onLeft={() => {
          void refreshConversations();
          onBack();
        }}
      />

      <DmProfileDialog
        open={Boolean(profilePerson)}
        onClose={() => setProfilePerson(null)}
        person={profilePerson}
        online={profilePerson ? onlineSet.has(profilePerson.id) : false}
        onMessage={openDirectWith}
        canMessage={Boolean(profilePerson && profilePerson.id !== user.id)}
      />
    </section>
  );
}
