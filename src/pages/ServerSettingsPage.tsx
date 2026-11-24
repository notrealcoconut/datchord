import { useCallback, useDeferredValue, useEffect, useMemo, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  ArrowUp,
  CalendarDays,
  Copy,
  Crown,
  DoorOpen,
  Ellipsis,
  Hash,
  Pencil,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UserCog,
  UserPlus,
  Users,
  WifiOff,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import { fieldErrorFor, translateError } from '../lib/errors';
import { copyText, useDocumentTitle } from '../lib/hooks';
import { formatDate, formatNumber } from '../lib/format';
import { can, canActOnMember, canManageRole, PERMISSION_LIST } from '../lib/permissions';
import {
  CHANGE_NICKNAME,
  MANAGE_CHANNELS,
  MANAGE_MEMBERS,
  MANAGE_NICKNAMES,
  MANAGE_ROLES,
  MANAGE_SERVER,
} from '../types';
import type { Channel, Member, Role, ServerDetail } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { ChannelDialog } from '../components/ChannelDialog';
import { MemberProfileDialog } from '../components/MemberProfileDialog';
import { NicknameDialog } from '../components/NicknameDialog';
import { MemberRolesDialog, RoleDialog } from '../components/RoleDialogs';
import { Avatar, ServerIcon } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { DropdownMenu } from '../components/ui/DropdownMenu';
import { EmptyState } from '../components/ui/EmptyState';
import { ImageUploadDialog } from '../components/ui/ImageUploadDialog';
import { Logo } from '../components/ui/Logo';
import { LoadingPane } from '../components/ui/Spinner';
import { TextArea, TextInput } from '../components/ui/Field';

const TAB_IDS = ['overview', 'roles', 'members', 'channels', 'danger'] as const;
type TabId = (typeof TAB_IDS)[number];

function Panel({
  title,
  description,
  children,
  footer,
  danger,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={cx('settings-card', danger && 'settings-card-danger')}>
      {(title || description) && (
        <header className="settings-card-head">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </header>
      )}
      <div className="settings-card-body">{children}</div>
      {footer && <footer className="settings-card-footer">{footer}</footer>}
    </section>
  );
}

function roleName(role: Role, t: (key: string) => string): string {
  return role.isDefault ? t('roles.defaultName') : role.name;
}

function OverviewTab({
  detail,
  onRefresh,
  onServerUpdated,
}: {
  detail: ServerDetail;
  onRefresh: () => Promise<void>;
  onServerUpdated: () => Promise<void>;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState(detail.name);
  const [description, setDescription] = useState(detail.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<{ name?: string; description?: string }>({});
  const [iconOpen, setIconOpen] = useState(false);

  useEffect(() => {
    setName(detail.name);
    setDescription(detail.description);
  }, [detail.name, detail.description]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const next: { name?: string; description?: string } = {};
    if (name.trim().length < 2 || name.trim().length > 48) next.name = t('validation.serverName');
    if (description.trim().length > 200) next.description = t('validation.serverDescription');
    setFields(next);
    if (Object.keys(next).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      await api.servers.update(detail.id, { name: name.trim(), description: description.trim() });
      await onRefresh();
      await onServerUpdated();
      toast.success(t('servers.overviewSaved'));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields({
          name: fieldErrorFor(t, caught, 'name') ?? undefined,
          description: fieldErrorFor(t, caught, 'description') ?? undefined,
        });
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const copyInvite = async () => {
    if (await copyText(detail.inviteCode)) toast.success(t('servers.copied'));
  };

  return (
    <div className="settings-stack">
      <Panel title={t('servers.overviewTitle')} description={t('servers.overviewSubtitle')}>
        <div className="server-overview-identity">
          <ServerIcon name={detail.name} src={detail.iconUrl} size={76} />
          <div className="server-overview-identity-copy">
            <span className="server-overview-name">{detail.name}</span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIconOpen(true)}
              icon={<Pencil className="icon" aria-hidden="true" />}
            >
              {t('settings.changeAvatar')}
            </Button>
          </div>
        </div>
        <form id="server-overview-form" className="form-stack" onSubmit={handleSave} noValidate>
          <TextInput
            id="server-settings-name"
            label={t('servers.serverName')}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setError(null);
            }}
            error={fields.name}
            maxLength={48}
            required
          />
          <TextArea
            id="server-settings-description"
            label={t('servers.serverDescription')}
            value={description}
            onChange={(event) => {
              setDescription(event.target.value);
              setError(null);
            }}
            error={fields.description}
            maxLength={200}
            rows={3}
          />
          {Boolean(error) && !fields.name && !fields.description && (
            <p className="form-error" role="alert">
              {translateError(t, error)}
            </p>
          )}
        </form>
        <div className="settings-inline-action">
          <Button type="submit" form="server-overview-form" variant="primary" loading={busy}>
            {busy ? t('servers.savingOverview') : t('servers.saveOverview')}
          </Button>
        </div>
      </Panel>

      <Panel title={t('servers.statsTitle')}>
        <div className="server-stats">
          <div className="server-stat">
            <span className="server-stat-value">{formatNumber(detail.members.length, i18n.language)}</span>
            <span className="server-stat-label">{t('servers.statsMembers')}</span>
          </div>
          <div className="server-stat">
            <span className="server-stat-value">{formatNumber(detail.channels.length, i18n.language)}</span>
            <span className="server-stat-label">{t('servers.statsChannels')}</span>
          </div>
          <div className="server-stat">
            <span className="server-stat-value">{formatNumber(detail.roles.length, i18n.language)}</span>
            <span className="server-stat-label">{t('servers.statsRoles')}</span>
          </div>
          <div className="server-stat">
            <span className="server-stat-value">{formatDate(detail.createdAt, i18n.language, { month: 'short', year: 'numeric' })}</span>
            <span className="server-stat-label">{t('servers.statsCreated')}</span>
          </div>
        </div>
      </Panel>

      <Panel title={t('servers.inviteSectionTitle')} description={t('servers.inviteSectionBody')}>
        <div className="invite-row">
          <code className="invite-code">{detail.inviteCode}</code>
          <Button variant="secondary" onClick={copyInvite} icon={<Copy className="icon" aria-hidden="true" />}>
            {t('servers.copyCode')}
          </Button>
        </div>
        <p className="form-note">{t('servers.shareHint')}</p>
      </Panel>

      <Panel title={t('servers.ownerTitle')} description={t('servers.ownerDescription')}>
        <div className="owner-card">
          <Avatar name={detail.owner.displayName} src={detail.owner.avatarUrl} size={48} />
          <div>
            <span className="owner-card-name">
              {detail.owner.displayName}
              <Crown className="icon" aria-hidden="true" />
            </span>
            <span className="owner-card-handle">@{detail.owner.username}</span>
          </div>
        </div>
      </Panel>

      <ImageUploadDialog
        open={iconOpen}
        onClose={() => setIconOpen(false)}
        kind="server"
        currentUrl={detail.iconUrl}
        name={detail.name}
        onSave={async (dataUrl) => {
          await api.servers.uploadIcon(detail.id, dataUrl);
          await onRefresh();
          await onServerUpdated();
          toast.success(t('image.saved'));
        }}
        onRemove={async () => {
          await api.servers.removeIcon(detail.id);
          await onRefresh();
          await onServerUpdated();
          toast.success(t('image.removed'));
        }}
      />
    </div>
  );
}

function RolesTab({ detail, onRefresh }: { detail: ServerDetail; onRefresh: () => Promise<void> }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; role: Role | null }>({ open: false, role: null });
  const [deleteRole, setDeleteRole] = useState<Role | null>(null);

  const nonDefault = detail.roles.filter((role) => !role.isDefault);

  const handleMove = async (role: Role, direction: 'up' | 'down') => {
    try {
      await api.roles.move(detail.id, role.id, direction);
      await onRefresh();
      toast.success(t('servers.roleMovedToast'));
    } catch (error) {
      toast.error(translateError(t, error));
    }
  };

  const handleDelete = async () => {
    if (!deleteRole) return;
    await api.roles.remove(detail.id, deleteRole.id);
    await onRefresh();
    toast.success(t('servers.roleDeletedToast'));
  };

  return (
    <div className="settings-stack">
      <div className="settings-section-head">
        <div>
          <h2>{t('servers.rolesTitle')}</h2>
          <p>{t('servers.rolesSubtitle')}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setDialog({ open: true, role: null })}
          icon={<Plus className="icon" aria-hidden="true" />}
        >
          {t('servers.createRole')}
        </Button>
      </div>

      <p className="form-note">
        <ShieldCheck className="icon" aria-hidden="true" />
        {t('servers.roleOwnerNote')}
      </p>

      <div className="role-list">
        {detail.roles.map((role) => {
          const index = nonDefault.findIndex((item) => item.id === role.id);
          const manageable = canManageRole(detail, role);
          const permissions = PERMISSION_LIST.filter((permission) => can(role.permissions, permission.bit));
          return (
            <div key={role.id} className={cx('role-card', role.isDefault && 'is-default')}>
              <span className="role-color-bar" style={{ background: role.color }} aria-hidden="true" />
              <div className="role-card-main">
                <div className="role-card-head">
                  <span className="role-dot" style={{ background: role.color }} aria-hidden="true" />
                  <span className="role-card-name">{roleName(role, t)}</span>
                  {role.isDefault && <span className="chip chip-quiet">{t('servers.roleProtected')}</span>}
                  <span className="role-card-count">
                    {role.memberCount > 0
                      ? t('servers.roleMembers', { count: role.memberCount })
                      : t('servers.roleNoMembers')}
                  </span>
                </div>
                <div className="role-permissions">
                  {permissions.length === 0 ? (
                    <span className="chip chip-quiet">{t('common.none')}</span>
                  ) : (
                    permissions.map((permission) => (
                      <span key={permission.key} className="chip chip-quiet">
                        {t(`roles.${permission.key}`)}
                      </span>
                    ))
                  )}
                </div>
                {role.isDefault && <p className="role-card-note">{t('servers.roleDefaultNote')}</p>}
              </div>
              {manageable && (
                <div className="role-card-actions">
                  {!role.isDefault && (
                    <>
                      <IconButton
                        label={t('servers.roleMoveUp', { name: roleName(role, t) })}
                        size="sm"
                        disabled={index <= 0}
                        onClick={() => void handleMove(role, 'up')}
                      >
                        <ArrowUp className="icon" aria-hidden="true" />
                      </IconButton>
                      <IconButton
                        label={t('servers.roleMoveDown', { name: roleName(role, t) })}
                        size="sm"
                        disabled={index < 0 || index >= nonDefault.length - 1}
                        onClick={() => void handleMove(role, 'down')}
                      >
                        <ArrowDown className="icon" aria-hidden="true" />
                      </IconButton>
                    </>
                  )}
                  <IconButton
                    label={t('common.edit')}
                    size="sm"
                    onClick={() => setDialog({ open: true, role })}
                  >
                    <Pencil className="icon" aria-hidden="true" />
                  </IconButton>
                  {!role.isDefault && (
                    <IconButton
                      label={t('common.delete')}
                      size="sm"
                      variant="danger"
                      onClick={() => setDeleteRole(role)}
                    >
                      <Trash2 className="icon" aria-hidden="true" />
                    </IconButton>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <RoleDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, role: null })}
        serverId={detail.id}
        detail={detail}
        role={dialog.role}
        onSaved={() => void onRefresh()}
      />

      <ConfirmDialog
        open={Boolean(deleteRole)}
        onClose={() => setDeleteRole(null)}
        onConfirm={handleDelete}
        title={t('servers.roleDeleteTitle', { name: deleteRole ? roleName(deleteRole, t) : '' })}
        body={t('servers.roleDeleteBody')}
        confirmLabel={t('servers.roleDeleteAction')}
        danger
      />
    </div>
  );
}

function MembersTab({ detail, onRefresh }: { detail: ServerDetail; onRefresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [rolesFor, setRolesFor] = useState<string | null>(null);
  const [kickMember, setKickMember] = useState<Member | null>(null);
  const [profileMember, setProfileMember] = useState<Member | null>(null);
  const [nicknameMember, setNicknameMember] = useState<Member | null>(null);

  const canChangeNicknameFor = (member: Member) => {
    if (member.id === user?.id) {
      return detail.isOwner || can(detail.permissions, CHANGE_NICKNAME);
    }
    return (
      !member.isOwner &&
      (detail.isOwner || can(detail.permissions, MANAGE_NICKNAMES)) &&
      (detail.isOwner || canActOnMember(detail, member, user?.id ?? ''))
    );
  };

  const members = useMemo(() => {
    const normalized = deferredQuery.trim().toLocaleLowerCase();
    return [...detail.members]
      .filter((member) => {
        if (!normalized) return true;
        return (
          member.displayName.toLocaleLowerCase().includes(normalized) ||
          member.username.toLocaleLowerCase().includes(normalized)
        );
      })
      .sort((a, b) => {
        if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
        if (a.highestRolePosition !== b.highestRolePosition) return b.highestRolePosition - a.highestRolePosition;
        return a.displayName.localeCompare(b.displayName);
      });
  }, [detail.members, deferredQuery]);

  const handleKick = async () => {
    if (!kickMember) return;
    await api.members.kick(detail.id, kickMember.id);
    await onRefresh();
    toast.success(t('servers.kickToast', { name: kickMember.displayName }));
  };

  return (
    <div className="settings-stack">
      <div className="settings-section-head">
        <div>
          <h2>{t('servers.membersTitle')}</h2>
          <p>{t('servers.membersSubtitle')}</p>
        </div>
        <span className="chip chip-quiet">{t('servers.membersCount', { count: detail.members.length })}</span>
      </div>

      <div className="search-field member-search">
        <Search className="icon search-icon" aria-hidden="true" />
        <input
          type="search"
          className="input search-input"
          placeholder={t('servers.memberSearch')}
          aria-label={t('a11y.searchMembers')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {members.length === 0 ? (
        <EmptyState icon={<Users className="icon" />} title={t('servers.memberSearchEmpty')} />
      ) : (
        <div className="server-member-list">
          {members.map((member) => {
            const memberRoles = detail.roles.filter(
              (role) => member.roleIds.includes(role.id) && !role.isDefault,
            );
            const canAssign =
              can(detail.permissions, MANAGE_ROLES) && canActOnMember(detail, member, user?.id ?? '');
            const canKick = can(detail.permissions, MANAGE_MEMBERS) && canActOnMember(detail, member, user?.id ?? '');
            const canNickname = canChangeNicknameFor(member);
            return (
              <div key={member.id} className="server-member-row">
                <button
                  type="button"
                  className="server-member-identity"
                  onClick={() => setProfileMember(member)}
                >
                  <Avatar name={member.displayName} src={member.avatarUrl} size={42} />
                  <span className="server-member-copy">
                    <span className="server-member-name">
                      {member.displayName}
                      {member.isOwner && <Crown className="icon" aria-label={t('servers.ownerChip')} />}
                      {member.id === user?.id && <span className="chip chip-quiet">{t('common.you')}</span>}
                    </span>
                    <span className="server-member-handle">@{member.username}</span>
                  </span>
                </button>
                <div className="server-member-roles">
                  {memberRoles.length === 0 ? (
                    <span className="chip chip-quiet">{t('roles.defaultName')}</span>
                  ) : (
                    memberRoles.map((role) => (
                      <span key={role.id} className="role-chip" style={{ '--role-color': role.color } as CSSProperties}>
                        <span className="role-dot" aria-hidden="true" />
                        {role.name}
                      </span>
                    ))
                  )}
                </div>
                <span className="server-member-joined">
                  {member.joinedAt && (
                    <>
                      <CalendarDays className="icon" aria-hidden="true" />
                      {formatDate(member.joinedAt, i18n.language, { month: 'short', year: 'numeric' })}
                    </>
                  )}
                </span>
                {(canAssign || canKick || canNickname) && (
                  <DropdownMenu
                    label={t('common.more')}
                    align="end"
                    renderTrigger={(props) => (
                      <button type="button" className="icon-btn icon-btn-ghost icon-btn-sm" {...props}>
                        <Ellipsis className="icon" aria-hidden="true" />
                      </button>
                    )}
                    items={[
                      ...(canAssign
                        ? [
                            {
                              id: 'roles',
                              label: t('servers.manageRoles'),
                              icon: <UserCog className="icon" aria-hidden="true" />,
                              onSelect: () => setRolesFor(member.id),
                            },
                          ]
                        : []),
                      ...(canNickname
                        ? [
                            {
                              id: 'nickname',
                              label: t('servers.changeNickname'),
                              icon: <Pencil className="icon" aria-hidden="true" />,
                              onSelect: () => setNicknameMember(member),
                            },
                          ]
                        : []),
                      ...(canKick
                        ? [
                            {
                              id: 'kick',
                              label: t('servers.kickAction'),
                              icon: <UserPlus className="icon" aria-hidden="true" />,
                              onSelect: () => setKickMember(member),
                              danger: true,
                              separatorBefore: canAssign || canNickname,
                            },
                          ]
                        : []),
                    ]}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="form-note">{t('servers.ownerProtection')}</p>

      <MemberRolesDialog
        open={Boolean(rolesFor)}
        onClose={() => setRolesFor(null)}
        serverId={detail.id}
        detail={detail}
        memberId={rolesFor}
        onSaved={() => void onRefresh()}
      />

      <ConfirmDialog
        open={Boolean(kickMember)}
        onClose={() => setKickMember(null)}
        onConfirm={handleKick}
        title={t('servers.kickTitle', { name: kickMember?.displayName ?? '' })}
        body={t('servers.kickBody')}
        confirmLabel={t('servers.kickAction')}
        danger
      />

      <MemberProfileDialog
        open={Boolean(profileMember)}
        onClose={() => setProfileMember(null)}
        member={profileMember}
        roles={detail.roles}
        language={i18n.language}
        canChangeNickname={Boolean(profileMember && canChangeNicknameFor(profileMember))}
        onChangeNickname={(member) => {
          setProfileMember(null);
          setNicknameMember(member);
        }}
      />

      <NicknameDialog
        open={Boolean(nicknameMember)}
        onClose={() => setNicknameMember(null)}
        serverId={detail.id}
        member={nicknameMember}
        onSaved={() => void onRefresh()}
      />
    </div>
  );
}

function ChannelsTab({ detail, onRefresh }: { detail: ServerDetail; onRefresh: () => Promise<void> }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [dialog, setDialog] = useState<{ open: boolean; channel: Channel | null }>({ open: false, channel: null });
  const [deleteChannel, setDeleteChannel] = useState<Channel | null>(null);

  const handleDelete = async () => {
    if (!deleteChannel) return;
    await api.channels.remove(detail.id, deleteChannel.id);
    await onRefresh();
    toast.success(t('servers.channelDeletedToast'));
  };

  return (
    <div className="settings-stack">
      <div className="settings-section-head">
        <div>
          <h2>{t('servers.channelsTitle')}</h2>
          <p>{t('servers.channelsSubtitle')}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => setDialog({ open: true, channel: null })}
          icon={<Plus className="icon" aria-hidden="true" />}
        >
          {t('servers.channelCreate')}
        </Button>
      </div>

      {detail.channels.length === 0 ? (
        <EmptyState
          icon={<Hash className="icon" />}
          title={t('home.noChannelsTitle')}
          body={t('servers.channelsEmpty')}
          action={
            <Button variant="primary" onClick={() => setDialog({ open: true, channel: null })}>
              {t('servers.channelCreate')}
            </Button>
          }
        />
      ) : (
        <div className="server-channel-list">
          {[...detail.channels]
            .sort((a, b) => a.position - b.position)
            .map((channel) => (
              <div key={channel.id} className="server-channel-row">
                <span className="server-channel-icon" aria-hidden="true">
                  <Hash className="icon" />
                </span>
                <div className="server-channel-copy">
                  <span className="server-channel-name">{channel.name}</span>
                  <span className="server-channel-topic">{channel.topic || t('chat.noTopic')}</span>
                </div>
                <span className="server-channel-created">
                  {formatDate(channel.createdAt, i18n.language, { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <div className="server-channel-actions">
                  <IconButton
                    label={t('common.edit')}
                    size="sm"
                    onClick={() => setDialog({ open: true, channel })}
                  >
                    <Pencil className="icon" aria-hidden="true" />
                  </IconButton>
                  <IconButton
                    label={t('common.delete')}
                    size="sm"
                    variant="danger"
                    onClick={() => setDeleteChannel(channel)}
                  >
                    <Trash2 className="icon" aria-hidden="true" />
                  </IconButton>
                </div>
              </div>
            ))}
        </div>
      )}

      <ChannelDialog
        open={dialog.open}
        onClose={() => setDialog({ open: false, channel: null })}
        serverId={detail.id}
        channel={dialog.channel}
        onSaved={() => void onRefresh()}
      />

      <ConfirmDialog
        open={Boolean(deleteChannel)}
        onClose={() => setDeleteChannel(null)}
        onConfirm={handleDelete}
        title={t('servers.channelDeleteTitle', { name: deleteChannel?.name ?? '' })}
        body={t('servers.channelDeleteBody')}
        confirmLabel={t('servers.channelDeleteAction')}
        danger
      />
    </div>
  );
}

function DangerTab({ detail, onLeft }: { detail: ServerDetail; onLeft: () => void }) {
  const { t } = useTranslation();
  const { refreshServers } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferTarget, setTransferTarget] = useState('');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const eligible = detail.members.filter((member) => !member.isOwner);

  const openTransfer = () => {
    setTransferTarget(eligible[0]?.id ?? '');
    setTransferOpen(true);
  };

  const handleTransfer = async () => {
    if (!transferTarget) return;
    await api.servers.transfer(detail.id, transferTarget, detail.name);
    await refreshServers();
    toast.success(t('servers.transferToast'));
    navigate(`/app/s/${detail.id}`);
  };

  const handleDelete = async () => {
    await api.servers.remove(detail.id, detail.name);
    await refreshServers();
    toast.success(t('servers.deleteToast'));
    navigate('/app');
  };

  const handleLeave = async () => {
    await api.servers.leave(detail.id);
    await refreshServers();
    toast.success(t('servers.leaveToast', { name: detail.name }));
    onLeft();
  };

  return (
    <div className="settings-stack">
      <div className="settings-section-head">
        <div>
          <h2>{t('servers.dangerTitle')}</h2>
          <p>{t('servers.dangerSubtitle')}</p>
        </div>
        <AlertTriangle className="icon danger-heading-icon" aria-hidden="true" />
      </div>

      {detail.isOwner ? (
        <>
          <Panel
            title={t('servers.transferOwnership')}
            description={t('servers.transferOwnershipDescription')}
            danger
          >
            <div className="danger-action">
              <p>{t('servers.transferBody')}</p>
              <Button
                variant="secondary"
                onClick={openTransfer}
                disabled={eligible.length === 0}
                icon={<ArrowRightLeft className="icon" aria-hidden="true" />}
              >
                {t('servers.transferOwnership')}
              </Button>
            </div>
          </Panel>

          <Panel title={t('servers.deleteServer')} description={t('servers.deleteServerDescription')} danger>
            <div className="danger-action">
              <p>{t('servers.deleteBody', { name: detail.name })}</p>
              <Button
                variant="danger"
                onClick={() => setDeleteOpen(true)}
                icon={<Trash2 className="icon" aria-hidden="true" />}
              >
                {t('servers.deleteServer')}
              </Button>
            </div>
          </Panel>
        </>
      ) : (
        <Panel title={t('nav.leaveServer')} description={t('servers.leaveDescription')} danger>
          <Button variant="danger" onClick={() => setLeaveOpen(true)} icon={<DoorOpen className="icon" aria-hidden="true" />}>
            {t('servers.leaveAction')}
          </Button>
        </Panel>
      )}

      <ConfirmDialog
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        onConfirm={handleTransfer}
        title={t('servers.transferTitle')}
        body={t('servers.transferBody')}
        confirmLabel={t('servers.transferAction')}
        requireText
        requireLabel={t('servers.transferConfirmLabel')}
        confirmWord={detail.name}
        confirmPlaceholder={detail.name}
        danger
      >
        <div className="field">
          <label className="field-label" htmlFor="transfer-target">
            {t('servers.transferSelect')}
          </label>
          <select
            id="transfer-target"
            className="input select"
            value={transferTarget}
            onChange={(event) => setTransferTarget(event.target.value)}
          >
            {eligible.map((member) => (
              <option key={member.id} value={member.id}>
                {member.displayName} (@{member.username})
              </option>
            ))}
          </select>
        </div>
        <p className="form-warning">{t('servers.transferWarning')}</p>
      </ConfirmDialog>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('servers.deleteTitle', { name: detail.name })}
        body={t('servers.deleteBody', { name: detail.name })}
        confirmLabel={t('servers.deleteAction')}
        requireText
        requireLabel={t('servers.deleteConfirmLabel')}
        confirmWord={detail.name}
        confirmPlaceholder={t('servers.deleteConfirmPlaceholder', { name: detail.name })}
        danger
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeave}
        title={t('servers.leaveTitle', { name: detail.name })}
        body={t('servers.leaveBody')}
        confirmLabel={t('servers.leaveAction')}
        danger
      />
    </div>
  );
}

export function ServerSettingsPage() {
  const { t } = useTranslation();
  const { serverId, tab } = useParams();
  const { refreshServers } = useAuth();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<ServerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useDocumentTitle(detail?.name ? `${t('servers.settingsTitle')} · ${detail.name}` : t('servers.settingsTitle'));

  useEffect(() => {
    if (!serverId) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    api.servers
      .get(serverId, controller.signal)
      .then((result) => setDetail(result.server))
      .catch((caught: unknown) => {
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(caught);
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

  const handleServerUpdated = useCallback(async () => {
    await refreshServers();
  }, [refreshServers]);

  const availableTabs = useMemo<TabId[]>(() => {
    if (!detail) return [];
    const tabs: TabId[] = [];
    if (detail.isOwner || can(detail.permissions, MANAGE_SERVER)) tabs.push('overview');
    if (detail.isOwner || can(detail.permissions, MANAGE_ROLES)) tabs.push('roles');
    if (
      detail.isOwner ||
      can(detail.permissions, MANAGE_MEMBERS) ||
      can(detail.permissions, MANAGE_ROLES)
    ) {
      tabs.push('members');
    }
    if (detail.isOwner || can(detail.permissions, MANAGE_CHANNELS)) tabs.push('channels');
    tabs.push('danger');
    return tabs;
  }, [detail]);

  const tabMeta: Record<TabId, { label: string; icon: ReactNode }> = {
    overview: { label: t('servers.overview'), icon: <ShieldCheck className="icon" aria-hidden="true" /> },
    roles: { label: t('servers.rolesTab'), icon: <UserCog className="icon" aria-hidden="true" /> },
    members: { label: t('servers.membersTab'), icon: <Users className="icon" aria-hidden="true" /> },
    channels: { label: t('servers.channelsTab'), icon: <Hash className="icon" aria-hidden="true" /> },
    danger: { label: t('servers.dangerTab'), icon: <AlertTriangle className="icon" aria-hidden="true" /> },
  };

  if (!serverId) return <Navigate to="/app" replace />;

  if (loading) {
    return (
      <div className="settings-shell server-settings-shell">
        <header className="settings-topbar">
          <button type="button" className="settings-back" onClick={() => navigate(`/app/s/${serverId}`)}>
            <ArrowLeft className="icon icon-directional" aria-hidden="true" />
            <span>{t('servers.backToServer')}</span>
          </button>
          <Link to="/app" className="settings-brand" aria-label={t('brand.name')}>
            <Logo size={32} withWordmark />
          </Link>
          <span />
        </header>
        <div className="workspace-state">
          <LoadingPane label={t('status.loadingServer')} />
        </div>
      </div>
    );
  }

  if (!detail || error) {
    return (
      <div className="settings-shell server-settings-shell">
        <header className="settings-topbar">
          <button type="button" className="settings-back" onClick={() => navigate('/app')}>
            <ArrowLeft className="icon icon-directional" aria-hidden="true" />
            <span>{t('settings.backToApp')}</span>
          </button>
          <Link to="/app" className="settings-brand" aria-label={t('brand.name')}>
            <Logo size={32} withWordmark />
          </Link>
          <span />
        </header>
        <div className="workspace-state">
          <EmptyState
            icon={<WifiOff className="icon" />}
            title={t('status.serverLoadErrorTitle')}
            body={error ? translateError(t, error) : t('status.serverLoadErrorBody')}
            action={
              <div className="empty-action-row">
                <Button variant="secondary" onClick={() => setReloadToken((value) => value + 1)}>
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

  const activeTab = TAB_IDS.includes(tab as TabId) ? (tab as TabId) : null;
  if (!activeTab || !availableTabs.includes(activeTab)) {
    return <Navigate to={`/servers/${detail.id}/settings/${availableTabs[0] ?? 'danger'}`} replace />;
  }

  return (
    <div className="settings-shell server-settings-shell">
      <header className="settings-topbar server-settings-topbar">
        <button type="button" className="settings-back" onClick={() => navigate(`/app/s/${detail.id}`)}>
          <ArrowLeft className="icon icon-directional" aria-hidden="true" />
          <span>{t('servers.backToServer')}</span>
        </button>
        <div className="server-settings-identity">
          <ServerIcon name={detail.name} src={detail.iconUrl} size={38} />
          <div>
            <span className="server-settings-name">{detail.name}</span>
            <span className="server-settings-subtitle">{t('servers.settingsTitle')}</span>
          </div>
        </div>
        <div className="settings-top-actions">
          {detail.isOwner && (
            <span className="chip chip-owner">
              <Crown className="icon" aria-hidden="true" />
              {t('servers.ownerChip')}
            </span>
          )}
          <Avatar name={detail.owner.displayName} src={detail.owner.avatarUrl} size={32} />
        </div>
      </header>

      <nav className="server-settings-tabs" aria-label={t('servers.settingsTitle')}>
        {availableTabs.map((item) => {
          const meta = tabMeta[item];
          return (
            <Link
              key={item}
              to={`/servers/${detail.id}/settings/${item}`}
              className={cx('server-settings-tab', item === activeTab && 'is-active')}
              aria-current={item === activeTab ? 'page' : undefined}
            >
              {meta.icon}
              <span>{meta.label}</span>
            </Link>
          );
        })}
      </nav>

      <main className="server-settings-main">
        {activeTab === 'overview' && (
          <OverviewTab detail={detail} onRefresh={refreshDetail} onServerUpdated={handleServerUpdated} />
        )}
        {activeTab === 'roles' && <RolesTab detail={detail} onRefresh={refreshDetail} />}
        {activeTab === 'members' && <MembersTab detail={detail} onRefresh={refreshDetail} />}
        {activeTab === 'channels' && <ChannelsTab detail={detail} onRefresh={refreshDetail} />}
        {activeTab === 'danger' && <DangerTab detail={detail} onLeft={() => navigate('/app')} />}
      </main>
    </div>
  );
}
