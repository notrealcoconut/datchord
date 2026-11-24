import { useEffect, useState, type FormEvent } from 'react';
import { MessageCircle, UserPlus, Users, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { translateError } from '../../lib/errors';
import { useRealtime } from '../../contexts/RealtimeContext';
import { useToast } from '../../contexts/ToastContext';
import type { DmConversation, PublicUser } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { UserSearch } from './UserSearch';

export interface NewDmDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (conversation: DmConversation) => void;
}

export function NewDmDialog({ open, onClose, onCreated }: NewDmDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { refreshConversations } = useRealtime();
  const [mode, setMode] = useState<'direct' | 'group'>('direct');
  const [selected, setSelected] = useState<PublicUser[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!open) return;
    setMode('direct');
    setSelected([]);
    setName('');
    setBusy(false);
    setError(null);
  }, [open]);

  const selectUser = (person: PublicUser) => {
    setError(null);
    if (mode === 'direct') {
      setSelected([person]);
      return;
    }
    setSelected((current) =>
      current.some((entry) => entry.id === person.id) || current.length >= 24
        ? current
        : [...current, person],
    );
  };

  const removeUser = (userId: string) => {
    setSelected((current) => current.filter((entry) => entry.id !== userId));
  };

  const switchMode = (nextMode: 'direct' | 'group') => {
    setMode(nextMode);
    setSelected([]);
    setName('');
    setError(null);
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (mode === 'direct' && selected.length !== 1) {
      setError(new Error(t('dms.pickOne')));
      return;
    }
    if (mode === 'group' && selected.length < 2) {
      setError(new Error(t('dms.pickTwo')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.dms.create({
        kind: mode,
        userIds: selected.map((entry) => entry.id),
        name: mode === 'group' && name.trim() ? name.trim() : null,
      });
      await refreshConversations();
      toast.success(result.created ? t('dms.createdToast') : t('dms.existingToast'));
      onCreated(result.conversation);
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const selectedIds = new Set(selected.map((entry) => entry.id));

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('dms.newTitle')}
      description={t('dms.newSubtitle')}
      size="md"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="new-dm-form"
            loading={busy}
            disabled={mode === 'direct' ? selected.length !== 1 : selected.length < 2}
            icon={<MessageCircle className="icon" aria-hidden="true" />}
          >
            {t('dms.start')}
          </Button>
        </>
      }
    >
      <form id="new-dm-form" className="form-stack" onSubmit={handleSubmit}>
        <div className="segmented-tabs" role="tablist" aria-label={t('dms.kindLabel')}>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'direct'}
            className={mode === 'direct' ? 'is-active' : undefined}
            onClick={() => switchMode('direct')}
            disabled={busy}
          >
            <MessageCircle className="icon" aria-hidden="true" />
            {t('dms.direct')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'group'}
            className={mode === 'group' ? 'is-active' : undefined}
            onClick={() => switchMode('group')}
            disabled={busy}
          >
            <Users className="icon" aria-hidden="true" />
            {t('dms.group')}
          </button>
        </div>

        {selected.length > 0 && (
          <div className="dm-selected-users">
            {selected.map((person) => (
              <span key={person.id} className="dm-selected-chip">
                <Avatar name={person.displayName} src={person.avatarUrl} size={24} decorative />
                <span>{person.displayName}</span>
                <IconButton
                  label={t('common.remove')}
                  size="sm"
                  onClick={() => removeUser(person.id)}
                  disabled={busy}
                >
                  <X className="icon" aria-hidden="true" />
                </IconButton>
              </span>
            ))}
          </div>
        )}

        {mode === 'group' && (
          <TextInput
            label={t('dms.groupName')}
            placeholder={t('dms.groupNamePlaceholder')}
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={64}
            optionalLabel={t('common.optional')}
            disabled={busy}
          />
        )}

        <UserSearch
          selectedIds={selectedIds}
          onSelect={selectUser}
          disabled={busy}
          autoFocus
          placeholder={mode === 'direct' ? t('dms.searchPerson') : t('dms.searchPeople')}
        />

        <p className="form-hint">
          <UserPlus className="icon" aria-hidden="true" />
          {mode === 'direct' ? t('dms.directHint') : t('dms.groupHint')}
        </p>

        {Boolean(error) && (
          <p className="form-error" role="alert">
            {error instanceof Error && !('code' in error) ? error.message : translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
