import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Hash, Menu, Plus, Settings, UserPlus, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { translateError } from '../lib/errors';
import { useAuth } from '../contexts/AuthContext';
import { useRealtime } from '../contexts/RealtimeContext';
import { useToast } from '../contexts/ToastContext';
import { useMediaQuery } from '../lib/hooks';
import { can, canActOnMember, hasAnyManagement } from '../lib/permissions';
import {
  CHANGE_NICKNAME,
  MANAGE_CHANNELS,
  MANAGE_INVITES,
  MANAGE_MEMBERS,
  MANAGE_NICKNAMES,
  MANAGE_ROLES,
  MANAGE_SERVER,
} from '../types';
import type { Channel, Member, ServerDetail } from '../types';
import { ChannelDialog } from '../components/ChannelDialog';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { NicknameDialog } from '../components/NicknameDialog';
import { CreateServerDialog, InviteDialog, JoinServerDialog } from '../components/ServerDialogs';
import { ChatView } from '../components/app/ChatView';
import { ChannelSidebar } from '../components/app/ChannelSidebar';
import { MemberPanel } from '../components/app/MemberPanel';
import { ServerRail } from '../components/app/ServerRail';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { Drawer } from '../components/ui/Drawer';
import { EmptyState } from '../components/ui/EmptyState';
import { Logo } from '../components/ui/Logo';
import { LoadingPane } from '../components/ui/Spinner';

function settingsTabFor(detail: ServerDetail): string {
  if (detail.isOwner || can(detail.permissions, MANAGE_SERVER)) return 'overview';
  if (can(detail.permissions, MANAGE_ROLES)) return 'roles';
  if (can(detail.permissions, MANAGE_MEMBERS)) return 'members';
  if (can(detail.permissions, MANAGE_CHANNELS)) return 'channels';
  return 'danger';
}

export function WorkspacePage() {
  const { t, i18n } = useTranslation();
  const { serverId, channelId } = useParams();
  const navigate = useNavigate();
  const { servers, refreshServers, user } = useAuth();
  const { unreadTotal, subscribe, openDirect } = useRealtime();
  const toast = useToast();
  const isWide = useMediaQuery('(min-width: 1180px)');

  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(Boolean(serverId));
  const [loadError, setLoadError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(isWide);
  const [channelDialog, setChannelDialog] = useState<{ open: boolean; channel: Channel | null }>({
    open: false,
    channel: null,
  });
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [nicknameMember, setNicknameMember] = useState<Member | null>(null);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);

  useEffect(() => {
    setMembersOpen(isWide);
  }, [isWide]);

  useEffect(() => {
    if (!serverId) {
      setDetail(null);
      setLoading(false);
      setLoadError(null);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setLoadError(null);
    setDetail(null);
    api.servers
      .get(serverId, controller.signal)
      .then((result) => setDetail(result.server))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        setLoadError(error);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [serverId, reloadToken]);

  const refreshDetail = useCallback(async () => {
    if (!serverId) return;
    const result = await api.servers.get(serverId);
    setDetail(result.server);
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return;
    return subscribe((event) => {
      if (event.type === 'presence') {
        setOnlineUserIds((current) => {
          if (event.online) return current.includes(event.userId) ? current : [...current, event.userId];
          return current.filter((id) => id !== event.userId);
        });
        return;
      }
      if (event.type === 'server' && event.serverId === serverId) {
        void refreshDetail().catch(() => {
          /* Keep the current snapshot if a background refresh fails. */
        });
        return;
      }
      if (event.type === 'server-removed' && event.serverId === serverId) {
        setDetail(null);
        setOnlineUserIds([]);
        void refreshServers();
        toast.info(t('servers.removedToast'));
        navigate('/app');
      }
    });
  }, [serverId, subscribe, refreshDetail, refreshServers, navigate, toast, t]);

  useEffect(() => {
    if (!serverId) {
      setOnlineUserIds([]);
      return;
    }
    let cancelled = false;
    const loadPresence = async () => {
      try {
        const result = await api.servers.presence(serverId);
        if (!cancelled) setOnlineUserIds(result.onlineUserIds);
      } catch {
        /* Presence is best-effort; keep the previous snapshot on transient errors. */
      }
    };
    void loadPresence();
    const interval = window.setInterval(loadPresence, 20000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [serverId]);

  useEffect(() => {
    if (!serverId) return;
    const refreshMembers = () => {
      api.servers
        .get(serverId)
        .then((result) => setDetail(result.server))
        .catch(() => {
          /* Keep the current snapshot if a background refresh fails. */
        });
    };
    const interval = window.setInterval(refreshMembers, 20000);
    const onVisible = () => {
      if (!document.hidden) refreshMembers();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [serverId]);

  useEffect(() => {
    if (!serverId || !detail) return;
    if (channelId && detail.channels.some((channel) => channel.id === channelId)) return;
    const first = detail.channels[0];
    if (first) navigate(`/app/s/${serverId}/c/${first.id}`, { replace: true });
  }, [serverId, channelId, detail, navigate]);

  const openSettings = () => {
    if (!detail) return;
    navigate(`/servers/${detail.id}/settings/${settingsTabFor(detail)}`);
  };

  const handleChannelSaved = async (saved: Channel) => {
    if (!serverId) return;
    try {
      await refreshDetail();
    } catch {
      /* The new channel still opens; the sidebar will catch up on the next load. */
    }
    setChannelDialog({ open: false, channel: null });
    navigate(`/app/s/${serverId}/c/${saved.id}`);
  };

  const handleLeave = async () => {
    if (!detail) return;
    await api.servers.leave(detail.id);
    await refreshServers();
    toast.success(t('servers.leaveToast', { name: detail.name }));
    setNavOpen(false);
    navigate('/app');
  };

  const handleSendMessage = async (member: Member) => {
    try {
      const conversation = await openDirect(member.id);
      setProfileMember(null);
      navigate(`/app/dms/${conversation.id}`);
    } catch (error) {
      toast.error(translateError(t, error));
    }
  };

  const activeChannel = detail?.channels.find((channel) => channel.id === channelId) ?? null;

  const profileCanChangeNickname = Boolean(
    profileMember &&
      detail &&
      (profileMember.id === user?.id
        ? detail.isOwner || can(detail.permissions, CHANGE_NICKNAME)
        : !profileMember.isOwner &&
          (detail.isOwner || can(detail.permissions, MANAGE_NICKNAMES)) &&
          (detail.isOwner || canActOnMember(detail, profileMember, user?.id ?? ''))),
  );

  const rail = (
    <ServerRail
      servers={servers}
      activeServerId={serverId}
      dmUnread={unreadTotal}
      onCreateServer={() => setCreateOpen(true)}
      onJoinServer={() => setJoinOpen(true)}
    />
  );

  const dialogs = (
    <>
      <CreateServerDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(server, createdChannelId) => {
          navigate(`/app/s/${server.id}/c/${createdChannelId}`);
        }}
      />
      <JoinServerDialog
        open={joinOpen}
        onClose={() => setJoinOpen(false)}
        onJoined={(server, joinedChannelId) => {
          navigate(
            joinedChannelId
              ? `/app/s/${server.id}/c/${joinedChannelId}`
              : `/app/s/${server.id}`,
          );
        }}
      />
      {detail && (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          serverName={detail.name}
          inviteCode={detail.inviteCode}
          serverId={detail.id}
          canRotate={detail.isOwner || can(detail.permissions, MANAGE_INVITES)}
          onRotated={(code) =>
            setDetail((current) => (current ? { ...current, inviteCode: code } : current))
          }
        />
      )}
      {detail && !detail.isOwner && (
        <ConfirmDialog
          open={leaveOpen}
          onClose={() => setLeaveOpen(false)}
          onConfirm={handleLeave}
          title={t('servers.leaveTitle', { name: detail.name })}
          body={t('servers.leaveBody')}
          confirmLabel={t('servers.leaveAction')}
          danger
        />
      )}
      {detail && (
        <ChannelDialog
          open={channelDialog.open}
          onClose={() => setChannelDialog({ open: false, channel: null })}
          serverId={detail.id}
          channel={channelDialog.channel}
          onSaved={handleChannelSaved}
        />
      )}
      <MemberProfileDialog
        open={Boolean(profileMember)}
        onClose={() => setProfileMember(null)}
        member={profileMember}
        roles={detail?.roles ?? []}
        language={i18n.language}
        onSendMessage={handleSendMessage}
        canMessage={Boolean(profileMember && profileMember.id !== user?.id)}
        onChangeNickname={(member) => {
          setProfileMember(null);
          setNicknameMember(member);
        }}
        canChangeNickname={profileCanChangeNickname}
      />
      {detail && (
        <NicknameDialog
          open={Boolean(nicknameMember)}
          onClose={() => setNicknameMember(null)}
          serverId={detail.id}
          member={nicknameMember}
          onSaved={() => {
            void refreshDetail().catch(() => {
              /* The next server event or refresh will catch up. */
            });
          }}
        />
      )}
    </>
  );

  if (!serverId) {
    return <Navigate to="/app" replace />;
  }

  if (loading) {
    return (
      <div className="app-shell app-shell-home">
        {rail}
        <div className="workspace-state">
          <LoadingPane label={t('status.loadingServer')} />
        </div>
      </div>
    );
  }

  if (!detail || loadError) {
    return (
      <div className="app-shell app-shell-home">
        {rail}
        <div className="workspace-state">
          <EmptyState
            icon={<WifiOff className="icon" />}
            title={t('status.serverLoadErrorTitle')}
            body={loadError ? translateError(t, loadError) : t('status.serverLoadErrorBody')}
            action={
              <div className="empty-action-row">
                <Button variant="soft" onClick={() => setReloadToken((value) => value + 1)}>
                  {t('common.retry')}
                </Button>
                <Button variant="ghost" onClick={() => navigate('/app')}>
                  {t('nav.home')}
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const canCreateChannel = detail.isOwner || can(detail.permissions, MANAGE_CHANNELS);
  const canOpenSettings = detail.isOwner || hasAnyManagement(detail.permissions);

  const channelPanel = activeChannel ? (
    <ChatView
      key={activeChannel.id}
      detail={detail}
      channel={activeChannel}
      membersOpen={membersOpen}
      onToggleMembers={() => setMembersOpen((value) => !value)}
      onOpenNav={() => setNavOpen(true)}
      onInvite={() => setInviteOpen(true)}
      onOpenSettings={openSettings}
    />
  ) : (
    <section className="chat-panel" aria-label={detail.name}>
      <header className="chat-header">
        <IconButton label={t('a11y.openSidebar')} className="chat-menu-btn" onClick={() => setNavOpen(true)}>
          <Menu className="icon" aria-hidden="true" />
        </IconButton>
        <div className="chat-heading">
          <span className="chat-hash" aria-hidden="true">
            <Hash className="icon" />
          </span>
          <div className="chat-heading-copy">
            <h1 className="chat-title">{detail.name}</h1>
            <p className="chat-topic">{detail.description}</p>
          </div>
        </div>
        <div className="chat-actions">
          <IconButton label={t('nav.invitePeople')} onClick={() => setInviteOpen(true)}>
            <UserPlus className="icon" aria-hidden="true" />
          </IconButton>
          {canOpenSettings && (
            <IconButton label={t('nav.serverSettings')} onClick={openSettings}>
              <Settings className="icon" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </header>
      <div className="message-scroll">
        <div className="message-state">
          <EmptyState
            icon={<Hash className="icon" />}
            title={t('home.noChannelsTitle')}
            body={t('home.noChannelsBody')}
            action={
              canCreateChannel ? (
                <Button
                  variant="primary"
                  onClick={() => setChannelDialog({ open: true, channel: null })}
                  icon={<Plus className="icon" aria-hidden="true" />}
                >
                  {t('home.createChannel')}
                </Button>
              ) : undefined
            }
          />
        </div>
      </div>
    </section>
  );

  return (
    <div className="app-shell">
      {rail}

      <ChannelSidebar
        detail={detail}
        activeChannelId={activeChannel?.id}
        onInvite={() => setInviteOpen(true)}
        onOpenSettings={openSettings}
        onCreateChannel={() => setChannelDialog({ open: true, channel: null })}
        onLeave={() => setLeaveOpen(true)}
      />

      {channelPanel}

      {membersOpen && isWide && (
        <MemberPanel
          detail={detail}
          onlineUserIds={onlineUserIds}
          onMemberClick={setProfileMember}
          onInvite={() => setInviteOpen(true)}
          onClose={() => setMembersOpen(false)}
        />
      )}

      <Drawer
        open={navOpen}
        onClose={() => setNavOpen(false)}
        label={t('a11y.serverNavigation')}
        side="start"
        className="nav-drawer"
      >
        <Link to="/app" className="drawer-brand" onClick={() => setNavOpen(false)}>
          <Logo size={36} withWordmark />
        </Link>
        <ServerRail
          servers={servers}
          activeServerId={serverId}
          variant="drawer"
          dmUnread={unreadTotal}
          onNavigate={() => setNavOpen(false)}
          onCreateServer={() => {
            setNavOpen(false);
            setCreateOpen(true);
          }}
          onJoinServer={() => {
            setNavOpen(false);
            setJoinOpen(true);
          }}
        />
        <ChannelSidebar
          detail={detail}
          activeChannelId={activeChannel?.id}
          onInvite={() => {
            setNavOpen(false);
            setInviteOpen(true);
          }}
          onOpenSettings={() => {
            setNavOpen(false);
            openSettings();
          }}
          onCreateChannel={() => {
            setNavOpen(false);
            setChannelDialog({ open: true, channel: null });
          }}
          onLeave={() => {
            setNavOpen(false);
            setLeaveOpen(true);
          }}
          onNavigate={() => setNavOpen(false)}
          isDrawer
        />
      </Drawer>

      <Drawer
        open={membersOpen && !isWide}
        onClose={() => setMembersOpen(false)}
        label={t('a11y.memberList')}
        side="end"
        className="members-drawer"
      >
        <MemberPanel
          detail={detail}
          onlineUserIds={onlineUserIds}
          onMemberClick={setProfileMember}
          onInvite={() => {
            setMembersOpen(false);
            setInviteOpen(true);
          }}
          onClose={() => setMembersOpen(false)}
        />
      </Drawer>

      {dialogs}
    </div>
  );
}
