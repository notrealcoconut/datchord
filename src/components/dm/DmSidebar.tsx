import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, MessageCircle, Plus, Search, Settings, UserCog, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { truncate } from '../../lib/format';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import type { DmConversation } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { DropdownMenu } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';

export interface DmSidebarProps {
  conversations: DmConversation[];
  activeId?: string;
  onNew: () => void;
  onCreateServer: () => void;
  onJoinServer: () => void;
  onNavigate?: () => void;
  onOpenNav?: () => void;
  className?: string;
}

export function DmSidebar({
  conversations,
  activeId,
  onNew,
  onCreateServer,
  onJoinServer,
  onNavigate,
  onOpenNav,
  className,
}: DmSidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return conversations;
    return conversations.filter((conversation) => {
      if (conversation.displayName.toLocaleLowerCase().includes(normalized)) return true;
      return conversation.participants.some(
        (participant) =>
          participant.displayName.toLocaleLowerCase().includes(normalized) ||
          participant.username.toLocaleLowerCase().includes(normalized),
      );
    });
  }, [conversations, query]);

  if (!user) return null;

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success(t('settings.signedOut'));
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <aside className={cx('channel-sidebar dm-sidebar', className)} aria-label={t('a11y.dmList')}>
      <div className="dm-sidebar-head">
        <div>
          <h2 className="dm-sidebar-title">{t('dms.title')}</h2>
          <p className="dm-sidebar-subtitle">{t('dms.subtitle')}</p>
        </div>
        <div className="dm-sidebar-actions">
          {onOpenNav && (
            <IconButton label={t('a11y.openSidebar')} className="dm-nav-btn" onClick={onOpenNav}>
              <Menu className="icon" aria-hidden="true" />
            </IconButton>
          )}
          <IconButton label={t('dms.new')} onClick={onNew} variant="soft">
            <Plus className="icon" aria-hidden="true" />
          </IconButton>
        </div>
      </div>

      <div className="dm-sidebar-search">
        <Search className="icon search-icon" aria-hidden="true" />
        <input
          type="search"
          className="input search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t('dms.filter')}
          aria-label={t('dms.filter')}
        />
      </div>

      <div className="dm-sidebar-scroll">
        {filtered.length === 0 ? (
          <div className="dm-sidebar-empty">
            <EmptyState
              tone="compact"
              icon={<MessageCircle className="icon" />}
              title={query ? t('dms.noResults') : t('dms.emptyTitle')}
              body={query ? t('dms.noResultsBody') : t('dms.emptyBody')}
              action={
                query ? undefined : (
                  <div className="dm-empty-actions">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={onNew}
                      icon={<Plus className="icon" aria-hidden="true" />}
                    >
                      {t('dms.new')}
                    </Button>
                    <Button variant="soft" size="sm" onClick={onCreateServer}>
                      {t('servers.create')}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={onJoinServer}>
                      {t('servers.join')}
                    </Button>
                  </div>
                )
              }
            />
          </div>
        ) : (
          <ul className="dm-list">
            {filtered.map((conversation) => {
              const direct = conversation.kind === 'direct';
              const online = conversation.onlineUserIds.length > 0;
              return (
                <li key={conversation.id}>
                  <Link
                    to={`/app/dms/${conversation.id}`}
                    className={cx(
                      'dm-list-item',
                      conversation.id === activeId && 'is-active',
                      conversation.unreadCount > 0 && 'has-unread',
                    )}
                    onClick={onNavigate}
                    aria-current={conversation.id === activeId ? 'page' : undefined}
                  >
                    <span className="dm-list-avatar">
                      {direct ? (
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
                      {direct && (
                        <span
                          className={cx('presence-dot', online ? 'is-online' : 'is-offline')}
                          aria-hidden="true"
                        />
                      )}
                    </span>
                    <span className="dm-list-copy">
                      <span className="dm-list-name">
                        {conversation.displayName}
                        {conversation.unreadCount > 0 && (
                          <span className="dm-unread-badge" aria-label={t('dms.unread', { count: conversation.unreadCount })}>
                            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                          </span>
                        )}
                      </span>
                      <span className="dm-list-preview">
                        {conversation.lastMessage
                          ? `${conversation.lastMessage.authorName}: ${truncate(
                              conversation.lastMessage.content,
                              42,
                            )}`
                          : t('dms.noMessagesYet')}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="sidebar-user">
        <DropdownMenu
          label={t('nav.userSettings')}
          align="start"
          menuClassName="user-menu"
          renderTrigger={(props) => (
            <button type="button" className="sidebar-user-trigger" {...props}>
              <Avatar name={user.displayName} src={user.avatarUrl} size={36} />
              <span className="sidebar-user-copy">
                <span className="sidebar-user-name">{user.displayName}</span>
                <span className="sidebar-user-handle">@{user.username}</span>
              </span>
            </button>
          )}
          items={[
            {
              id: 'settings',
              label: t('nav.userSettings'),
              icon: <UserCog className="icon" aria-hidden="true" />,
              onSelect: () => {
                onNavigate?.();
                navigate('/settings/profile');
              },
            },
            {
              id: 'signout',
              label: signingOut ? t('settings.signingOut') : t('nav.signOut'),
              icon: <LogOut className="icon" aria-hidden="true" />,
              onSelect: () => void handleSignOut(),
              danger: true,
              separatorBefore: true,
            },
          ]}
        />
        <IconButton
          label={t('nav.userSettings')}
          size="sm"
          className="sidebar-user-settings"
          onClick={() => {
            onNavigate?.();
            navigate('/settings/profile');
          }}
        >
          <Settings className="icon" aria-hidden="true" />
        </IconButton>
      </div>
    </aside>
  );
}
