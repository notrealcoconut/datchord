import { useEffect, useState, type FormEvent } from 'react';
import { Hash } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { fieldErrorFor, translateError } from '../lib/errors';
import { useToast } from '../contexts/ToastContext';
import type { Channel } from '../types';
import { Button } from './ui/Button';
import { TextArea, TextInput } from './ui/Field';
import { Modal } from './ui/Modal';

export interface ChannelDialogProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  channel?: Channel | null;
  onSaved: (channel: Channel) => void;
}

export function ChannelDialog({ open, onClose, serverId, channel, onSaved }: ChannelDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const editing = Boolean(channel);
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; topic?: string }>({});

  useEffect(() => {
    if (open) {
      setName(channel?.name ?? '');
      setTopic(channel?.topic ?? '');
      setBusy(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, channel]);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const errors: { name?: string; topic?: string } = {};
    if (!name.trim()) errors.name = t('validation.channelName');
    if (topic.trim().length > 120) errors.topic = t('validation.channelTopic');
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setBusy(true);
    setError(null);
    try {
      if (editing && channel) {
        const result = await api.channels.update(serverId, channel.id, {
          name: name.trim(),
          topic: topic.trim(),
        });
        toast.success(t('servers.channelUpdatedToast'));
        onSaved({ ...channel, name: result.channel.name, topic: result.channel.topic });
      } else {
        const result = await api.channels.create(serverId, { name: name.trim(), topic: topic.trim() });
        toast.success(t('servers.channelCreatedToast'));
        onSaved(result.channel);
      }
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors({
          name: fieldErrorFor(t, caught, 'name') ?? undefined,
          topic: fieldErrorFor(t, caught, 'topic') ?? undefined,
        });
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? t('servers.channelEditTitle') : t('servers.channelCreateTitle')}
      description={editing ? t('servers.channelEditSubtitle') : t('servers.channelCreateSubtitle')}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="channel-form"
            loading={busy}
            icon={<Hash className="icon" aria-hidden="true" />}
          >
            {busy
              ? t('common.saving')
              : editing
                ? t('servers.channelSave')
                : t('servers.channelCreate')}
          </Button>
        </>
      }
    >
      <form id="channel-form" className="form-stack" onSubmit={handleSubmit}>
        <TextInput
          id="channel-name"
          label={t('servers.channelName')}
          placeholder={t('servers.channelNamePlaceholder')}
          hint={t('servers.channelNameHint')}
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={fieldErrors.name}
          maxLength={32}
          required
          data-autofocus
          disabled={busy}
          autoComplete="off"
          spellCheck={false}
        />
        <TextArea
          id="channel-topic"
          label={t('servers.channelTopic')}
          placeholder={t('servers.channelTopicPlaceholder')}
          hint={t('servers.channelTopicOptional')}
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          error={fieldErrors.topic}
          maxLength={120}
          rows={3}
          optionalLabel={t('common.optional')}
          disabled={busy}
        />
        {Boolean(error) && !fieldErrors.name && !fieldErrors.topic && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
