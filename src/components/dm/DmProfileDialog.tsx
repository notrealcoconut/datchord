import { MessageCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import type { PublicUser } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';

export interface DmProfileDialogProps {
  open: boolean;
  onClose: () => void;
  person: PublicUser | null;
  online?: boolean;
  onMessage?: (person: PublicUser) => void;
  canMessage?: boolean;
}

export function DmProfileDialog({
  open,
  onClose,
  person,
  online = false,
  onMessage,
  canMessage = false,
}: DmProfileDialogProps) {
  const { t } = useTranslation();
  if (!person) return null;
  return (
    <Modal open={open} onClose={onClose} title={t('dms.profileTitle')} size="sm">
      <div className="member-profile">
        <div className="member-profile-head">
          <Avatar name={person.displayName} src={person.avatarUrl} size={80} />
          <div className="member-profile-identity">
            <h3 className="member-profile-name">{person.displayName}</h3>
            <p className="member-profile-username">@{person.username}</p>
            <span className={cx('presence-chip', online ? 'is-online' : 'is-offline')}>
              <span className={cx('presence-dot', online ? 'is-online' : 'is-offline')} aria-hidden="true" />
              {online ? t('presence.online') : t('presence.offline')}
            </span>
          </div>
        </div>
        {canMessage && onMessage && (
          <div className="member-profile-actions">
            <Button
              variant="primary"
              onClick={() => onMessage(person)}
              icon={<MessageCircle className="icon" aria-hidden="true" />}
            >
              {t('dms.sendMessage')}
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
