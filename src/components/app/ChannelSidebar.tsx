import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  DoorOpen,
  Hash,
  LogOut,
  Plus,
  Settings,
  UserCog,
  UserPlus,
  Users,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { can, hasAnyManagement } from '../../lib/permissions';
import { MANAGE_CHANNELS, MANAGE_ROLES, MANAGE_MEMBERS, MANAGE_SERVER } from '../../types';
import type { ServerDetail } from '../../types';
import { Avatar, ServerIcon } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { DropdownMenu } from '../ui/DropdownMenu';
import { EmptyState } from '../ui/EmptyState';

export interface ChannelSidebarProps {
  detail: ServerDetail;
  activeChannelId?: string;
  onInvite: () => void;
  onOpenSettings: () => void;
  onCreateChannel: () => void;
  onLeave: () => void;
  onNavigate?: () => void;
  onCloseNav?: () => void;
  isDrawer?: boolean;
}

export function ChannelSidebar({
  detail,
  activeChannelId,
  onInvite,
  onOpenSettings,
  onCreateChannel,
  onLeave,
  onNavigate,
  isDrawer = false,
}: ChannelSidebarProps) {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [channelsOpen, setChannelsOpen] = useState(true);

  if (!user) return null;

  const canCreateChannel = detail.isOwner || can(detail.permissions, MANAGE_CHANNELS);
  const canOpenSettings =
    detail.isOwner ||
    hasAnyManagement(detail.permissions) ||
    can(detail.permissions, MANAGE_SERVER) ||
    can(detail.permissions, MANAGE_CHANNELS) ||
    can(detail.permissions, MANAGE_ROLES) ||
    can(detail.permissions, MANAGE_MEMBERS);

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
    <div className={cx('channel-sidebar', isDrawer && 'is-drawer')}>
      <DropdownMenu
        label={t('nav.serverMenu')}
        align="start"
        menuClassName="server-menu"
        renderTrigger={(props) => (
          <button type="button" className="channel-server-head" {...props}>
            <ServerIcon name={detail.name} src={detail.iconUrl} size={34} decorative />
            <span className="channel-server-name">{detail.name}</span>
            <ChevronDown className="icon channel-server-chevron" aria-hidden="true" />
          </button>
        )}
        items={[
          {
            id: 'invite',
            label: t('nav.invitePeople'),
            icon: <UserPlus className="icon" aria-hidden="true" />,
            onSelect: onInvite,
          },
          ...(canOpenSettings
            ? [
                {
                  id: 'settings',
                  label: t('nav.serverSettings'),
                  icon: <Settings className="icon" aria-hidden="true" />,
                  onSelect: onOpenSettings,
                },
              ]
            : []),
          ...(!detail.isOwner
            ? [
                {
                  id: 'leave',
                  label: t('nav.leaveServer'),
                  icon: <DoorOpen className="icon" aria-hidden="true" />,
                  onSelect: onLeave,
                  danger: true,
                  separatorBefore: true,
                },
              ]
            : []),
        ]}
      />

      <div className="channel-scroll">
        <div className="channel-section-head">
          <button
            type="button"
            className="channel-section-toggle"
            onClick={() => setChannelsOpen((value) => !value)}
            aria-expanded={channelsOpen}
          >
            <ChevronDown
              className={cx('icon channel-section-chevron', !channelsOpen && 'is-collapsed')}
              aria-hidden="true"
            />
            <span className="channel-section-title">{t('nav.textChannels')}</span>
          </button>
          {canCreateChannel && (
            <IconButton label={t('nav.addChannel')} size="sm" onClick={onCreateChannel}>
              <Plus className="icon" aria-hidden="true" />
            </IconButton>
          )}
        </div>

        {channelsOpen && (detail.channels.length === 0 ? (
          <EmptyState
            tone="compact"
            title={t('home.noChannelsTitle')}
            body={t('home.noChannelsBody')}
            action={
              canCreateChannel ? (
                <Button variant="soft" size="sm" onClick={onCreateChannel} icon={<Plus className="icon" aria-hidden="true" />}>
                  {t('home.createChannel')}
                </Button>
              ) : undefined
            }
          />
        ) : (
          <nav aria-label={t('a11y.channelNavigation')}>
            <ul className="channel-list">
              {detail.channels.map((channel) => (
                <li key={channel.id}>
                  <button
                    type="button"
                    className={cx('channel-link', channel.id === activeChannelId && 'is-active')}
                    onClick={() => {
                      onNavigate?.();
                      navigate(`/app/s/${detail.id}/c/${channel.id}`);
                    }}
                    aria-current={channel.id === activeChannelId ? 'page' : undefined}
                  >
                    <Hash className="icon" aria-hidden="true" />
                    <span className="channel-link-name">{channel.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        <button type="button" className="sidebar-invite" onClick={onInvite}>
          <UserPlus className="icon" aria-hidden="true" />
          <span>{t('nav.invitePeople')}</span>
        </button>
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
              id: 'home',
              label: t('nav.home'),
              icon: <Users className="icon" aria-hidden="true" />,
              onSelect: () => {
                onNavigate?.();
                navigate('/app');
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
    </div>
  );
}
