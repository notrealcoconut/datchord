import { useMemo } from 'react';
import { Crown, UserPlus, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import type { Member, ServerDetail } from '../../types';
import { Avatar } from '../ui/Avatar';
import { IconButton } from '../ui/Button';

export interface MemberPanelProps {
  detail: ServerDetail;
  onlineUserIds?: string[];
  onMemberClick: (member: Member) => void;
  onInvite: () => void;
  onClose?: () => void;
  className?: string;
}

function sortMembers(members: Member[]): Member[] {
  return [...members].sort((a, b) => {
    if (a.isOwner !== b.isOwner) return a.isOwner ? -1 : 1;
    if (a.highestRolePosition !== b.highestRolePosition) {
      return b.highestRolePosition - a.highestRolePosition;
    }
    return a.displayName.localeCompare(b.displayName);
  });
}

export function MemberPanel({
  detail,
  onlineUserIds = [],
  onMemberClick,
  onInvite,
  onClose,
  className,
}: MemberPanelProps) {
  const { t } = useTranslation();
  const onlineSet = useMemo(() => new Set(onlineUserIds), [onlineUserIds]);
  const { online, offline } = useMemo(() => {
    const groups: { online: Member[]; offline: Member[] } = { online: [], offline: [] };
    for (const member of detail.members) {
      (onlineSet.has(member.id) ? groups.online : groups.offline).push(member);
    }
    return { online: sortMembers(groups.online), offline: sortMembers(groups.offline) };
  }, [detail.members, onlineSet]);

  const renderMember = (member: Member) => {
    const showRole = !member.isOwner && member.highestRoleName && !member.highestRoleIsDefault;
    const online = onlineSet.has(member.id);
    return (
      <li key={member.id}>
        <button type="button" className="member-row" onClick={() => onMemberClick(member)}>
          <span className="member-avatar-wrap">
            <Avatar name={member.displayName} src={member.avatarUrl} size={34} />
            <span
              className={cx('presence-dot', online ? 'is-online' : 'is-offline')}
              role="img"
              aria-label={online ? t('presence.online') : t('presence.offline')}
            />
          </span>
          <span className="member-row-copy">
            <span className={cx('member-row-name', !online && 'is-offline')}>
              {member.displayName}
              {member.isOwner && (
                <Crown className="icon member-owner" aria-label={t('servers.ownerChip')} />
              )}
            </span>
            {showRole ? (
              <span className="member-row-role" style={{ color: member.highestRoleColor ?? undefined }}>
                <span
                  className="role-dot"
                  style={{ background: member.highestRoleColor ?? undefined }}
                  aria-hidden="true"
                />
                {member.highestRoleName}
              </span>
            ) : (
              <span className="member-row-handle">@{member.username}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <aside className={cx('member-panel', className)} aria-label={t('a11y.memberList')}>
      <div className="member-panel-head">
        <h2 className="member-panel-title">
          <Users className="icon" aria-hidden="true" />
          {t('common.members')}
          <span className="member-panel-count">{detail.members.length}</span>
        </h2>
        <div className="member-panel-actions">
          <IconButton label={t('nav.invitePeople')} size="sm" onClick={onInvite}>
            <UserPlus className="icon" aria-hidden="true" />
          </IconButton>
          {onClose && (
            <IconButton label={t('a11y.closeMembers')} size="sm" onClick={onClose}>
              <X className="icon" aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>
      <div className="member-scroll">
        {online.length > 0 && (
          <section className="member-group" aria-labelledby="members-online">
            <h3 className="member-group-head" id="members-online">
              {t('presence.online')} — {online.length}
            </h3>
            <ul className="member-list">{online.map(renderMember)}</ul>
          </section>
        )}
        {offline.length > 0 && (
          <section className="member-group" aria-labelledby="members-offline">
            <h3 className="member-group-head" id="members-offline">
              {t('presence.offline')} — {offline.length}
            </h3>
            <ul className="member-list">{offline.map(renderMember)}</ul>
          </section>
        )}
      </div>
    </aside>
  );
}
