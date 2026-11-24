import { useEffect, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../lib/api';
import { translateError } from '../lib/errors';
import { useToast } from '../contexts/ToastContext';
import type { Member } from '../types';
import { Button } from './ui/Button';
import { TextInput } from './ui/Field';
import { Modal } from './ui/Modal';

export interface NicknameDialogProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  member: Member | null;
  onSaved?: (member: Member) => void;
}

export function NicknameDialog({ open, onClose, serverId, member, onSaved }: NicknameDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setNickname(member?.nickname ?? '');
    setBusy(false);
    setError(null);
  }, [open, member]);

  if (!member) return null;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const trimmed = nickname.trim();
      const result = await api.members.setNickname(serverId, member.id, trimmed || null);
      onSaved?.(result.member);
      toast.success(t('servers.nicknameSaved', { name: result.member.displayName }));
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('servers.nicknameTitle', { name: member.displayName })}
      description={t('servers.nicknameSubtitle')}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="nickname-form" loading={busy}>
            {t('common.save')}
          </Button>
        </>
      }
    >
      <form id="nickname-form" className="form-stack" onSubmit={handleSubmit}>
        <TextInput
          label={t('servers.nicknameLabel')}
          placeholder={member.username}
          value={nickname}
          onChange={(event) => setNickname(event.target.value)}
          hint={t('servers.nicknameHint')}
          maxLength={32}
          autoFocus
          disabled={busy}
        />
        {Boolean(error) && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
