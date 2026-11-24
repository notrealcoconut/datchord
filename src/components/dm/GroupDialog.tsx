import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Crown, LogOut, UserMinus, UserPlus, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { translateError } from '../../lib/errors';
import { useAuth } from '../../contexts/AuthContext';
import { useRealtime } from '../../contexts/RealtimeContext';
import { useToast } from '../../contexts/ToastContext';
import type { DmConversation, PublicUser } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Button, IconButton } from '../ui/Button';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { TextInput } from '../ui/Field';
import { Modal } from '../ui/Modal';
import { UserSearch } from './UserSearch';

export interface GroupDialogProps {
  open: boolean;
  onClose: () => void;
  conversation: DmConversation | null;
  onUpdated: (conversation: DmConversation) => void;
  onLeft: () => void;
}

export function GroupDialog({ open, onClose, conversation, onUpdated, onLeft }: GroupDialogProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const { refreshConversations } = useRealtime();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [removeTarget, setRemoveTarget] = useState<PublicUser | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  useEffect(() => {
    if (!open || !conversation) return;
    setName(conversation.name ?? '');
    setBusy(false);
    setError(null);
    setRemoveTarget(null);
    setLeaveOpen(false);
  }, [open, conversation]);

  const isOwner = Boolean(user && conversation?.ownerId === user.id);
  const participantIds = useMemo(
    () => new Set(conversation?.participants.map((participant) => participant.id) ?? []),
    [conversation],
  );
  const onlineIds = useMemo(
    () => new Set(conversation?.onlineUserIds ?? []),
    [conversation],
  );

  if (!conversation || conversation.kind !== 'group') return null;

  const refresh = async () => {
    const result = await api.dms.get(conversation.id);
    onUpdated(result.conversation);
    await refreshConversations();
  };

  const handleRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!isOwner || busy) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError(new Error(t('dms.groupNameRequired')));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.dms.rename(conversation.id, trimmed);
      onUpdated(result.conversation);
      await refreshConversations();
      toast.success(t('dms.renamedToast'));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const handleAdd = async (person: PublicUser) => {
    if (busy || participantIds.has(person.id)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.dms.addParticipants(conversation.id, [person.id]);
      onUpdated(result.conversation);
      await refreshConversations();
      toast.success(t('dms.participantAdded', { name: person.displayName }));
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!removeTarget || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.dms.removeParticipant(conversation.id, removeTarget.id);
      toast.success(t('dms.participantRemoved', { name: removeTarget.displayName }));
      setRemoveTarget(null);
      await refresh();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.dms.leave(conversation.id);
      setLeaveOpen(false);
      onClose();
      onLeft();
    } catch (caught) {
      setError(caught);
      setBusy(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('dms.groupDetails')}
        description={t('dms.groupDetailsSubtitle', { count: conversation.participants.length })}
        size="md"
        dismissible={!busy}
      >
        <div className="group-dialog">
          <div className="group-dialog-head">
            <span className="dm-group-avatar dm-group-avatar-lg" aria-hidden="true">
              <Users className="icon" />
            </span>
            <div>
              <h3 className="group-dialog-name">{conversation.name || conversation.displayName}</h3>
              <p className="group-dialog-meta">
                {t('dms.participantCount', { count: conversation.participants.length })}
              </p>
            </div>
          </div>

          {isOwner ? (
            <form className="group-rename" onSubmit={handleRename}>
              <TextInput
                label={t('dms.groupName')}
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={64}
                disabled={busy}
              />
              <Button
                variant="soft"
                type="submit"
                loading={busy}
                disabled={!name.trim() || name.trim() === (conversation.name ?? '')}
              >
                {t('common.save')}
              </Button>
            </form>
          ) : (
            <p className="form-note">{t('dms.ownerOnly')}</p>
          )}

          <section className="group-section">
            <h4 className="group-section-title">{t('common.members')}</h4>
            <ul className="group-member-list">
              {conversation.participants.map((participant) => {
                const participantIsOwner = participant.id === conversation.ownerId;
                const online = onlineIds.has(participant.id);
                return (
                  <li key={participant.id} className="group-member">
                    <Avatar name={participant.displayName} src={participant.avatarUrl} size={34} />
                    <span className="group-member-copy">
                      <span className="group-member-name">
                        {participant.displayName}
                        {participant.id === user?.id && (
                          <span className="chip chip-quiet">{t('common.you')}</span>
                        )}
                        {participantIsOwner && (
                          <span className="chip chip-owner">
                            <Crown className="icon" aria-hidden="true" />
                            {t('roles.owner')}
                          </span>
                        )}
                      </span>
                      <span className="group-member-handle">@{participant.username}</span>
                    </span>
                    <span className={online ? 'presence-label is-online' : 'presence-label is-offline'}>
                      {online ? t('presence.online') : t('presence.offline')}
                    </span>
                    {isOwner && !participantIsOwner && (
                      <IconButton
                        label={t('dms.removeParticipant', { name: participant.displayName })}
                        size="sm"
                        variant="danger"
                        onClick={() => setRemoveTarget(participant)}
                        disabled={busy}
                      >
                        <UserMinus className="icon" aria-hidden="true" />
                      </IconButton>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>

          {isOwner && (
            <section className="group-section">
              <h4 className="group-section-title">
                <UserPlus className="icon" aria-hidden="true" />
                {t('dms.addPeople')}
              </h4>
              <UserSearch
                selectedIds={participantIds}
                onSelect={handleAdd}
                disabled={busy || conversation.participants.length >= 25}
                placeholder={t('dms.addPeoplePlaceholder')}
              />
            </section>
          )}

          {Boolean(error) && (
            <p className="form-error" role="alert">
              {error instanceof Error && !('code' in error) ? error.message : translateError(t, error)}
            </p>
          )}

          <div className="group-danger">
            <Button
              variant="danger"
              onClick={() => setLeaveOpen(true)}
              disabled={busy}
              icon={<LogOut className="icon" aria-hidden="true" />}
            >
              {t('dms.leaveGroup')}
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        onConfirm={handleRemove}
        title={t('dms.removeTitle', { name: removeTarget?.displayName ?? '' })}
        body={t('dms.removeBody')}
        confirmLabel={t('common.remove')}
        danger
      />

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={handleLeave}
        title={t('dms.leaveTitle')}
        body={t('dms.leaveBody')}
        confirmLabel={t('dms.leaveGroup')}
        danger
      />
    </>
  );
}
