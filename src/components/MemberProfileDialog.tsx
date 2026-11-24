import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarDays, Crown, MessageCircle, Pencil, Shield } from 'lucide-react';
import type { Member, Role } from '../types';
import { formatDate } from '../lib/format';
import { Avatar } from './ui/Avatar';
import { Button } from './ui/Button';
import { Modal } from './ui/Modal';

export interface MemberProfileDialogProps {
  open: boolean;
  onClose: () => void;
  member: Member | null;
  roles: Role[];
  language: string;
  onSendMessage?: (member: Member) => void;
  canMessage?: boolean;
  onChangeNickname?: (member: Member) => void;
  canChangeNickname?: boolean;
}

export function MemberProfileDialog({
  open,
  onClose,
  member,
  roles,
  language,
  onSendMessage,
  canMessage = false,
  onChangeNickname,
  canChangeNickname = false,
}: MemberProfileDialogProps) {
  const { t } = useTranslation();
  if (!member) return null;
  const memberRoles = roles
    .filter((role) => member.roleIds.includes(role.id))
    .sort((a, b) => b.position - a.position);
  const roleName = (role: Role) => (role.isDefault ? t('roles.defaultName') : role.name);

  return (
    <Modal open={open} onClose={onClose} title={t('servers.memberProfile')} size="sm">
      <div className="member-profile">
        <div className="member-profile-head">
          <Avatar name={member.displayName} src={member.avatarUrl} size={80} />
          <div className="member-profile-identity">
            <h3 className="member-profile-name">{member.displayName}</h3>
            <p className="member-profile-username">@{member.username}</p>
            {member.isOwner && (
              <span className="chip chip-owner">
                <Crown className="icon" aria-hidden="true" />
                {t('servers.ownerChip')}
              </span>
            )}
          </div>
        </div>

        {memberRoles.length > 0 && (
          <div className="member-profile-roles">
            {memberRoles.map((role) => (
              <span key={role.id} className="role-chip" style={{ '--role-color': role.color } as CSSProperties}>
                <span className="role-dot" aria-hidden="true" />
                {roleName(role)}
              </span>
            ))}
          </div>
        )}

        <section className="member-profile-section">
          <h4 className="member-profile-label">{t('settings.bio')}</h4>
          <p className="member-profile-bio">
            {member.bio === null ? t('servers.memberPrivate') : member.bio || t('servers.memberNoBio')}
          </p>
        </section>

        {member.joinedAt && (
          <p className="member-profile-meta">
            <CalendarDays className="icon" aria-hidden="true" />
            {t('time.memberSince', { date: formatDate(member.joinedAt, language, { month: 'long', year: 'numeric' }) })}
          </p>
        )}

        {member.isOwner ? (
          <p className="member-profile-note">
            <Crown className="icon" aria-hidden="true" />
            {t('servers.ownerDescription')}
          </p>
        ) : (
          member.highestRoleName &&
          !member.highestRoleIsDefault && (
            <p className="member-profile-note">
              <Shield className="icon" aria-hidden="true" />
              {member.highestRoleName}
            </p>
          )
        )}

        {(canMessage && onSendMessage) || (canChangeNickname && onChangeNickname) ? (
          <div className="member-profile-actions">
            {canMessage && onSendMessage && (
              <Button
                variant="primary"
                onClick={() => onSendMessage(member)}
                icon={<MessageCircle className="icon" aria-hidden="true" />}
              >
                {t('dms.sendMessage')}
              </Button>
            )}
            {canChangeNickname && onChangeNickname && (
              <Button
                variant="soft"
                onClick={() => onChangeNickname(member)}
                icon={<Pencil className="icon" aria-hidden="true" />}
              >
                {t('servers.changeNickname')}
              </Button>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
