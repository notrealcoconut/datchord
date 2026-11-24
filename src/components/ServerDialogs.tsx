import { useEffect, useState, type FormEvent } from 'react';
import { Copy, Plus, RefreshCw, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { fieldErrorFor, translateError } from '../lib/errors';
import { copyText } from '../lib/hooks';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { usePreferences } from '../contexts/PreferencesContext';
import type { ServerSummary } from '../types';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { TextArea, TextInput } from './ui/Field';
import { ImagePicker } from './ui/ImagePicker';
import { Modal } from './ui/Modal';

export interface CreateServerDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (server: ServerSummary, channelId: string) => void;
}

export function CreateServerDialog({ open, onClose, onCreated }: CreateServerDialogProps) {
  const { t } = useTranslation();
  const { refreshServers } = useAuth();
  const { language } = usePreferences();
  const toast = useToast();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; description?: string }>({});

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
      setImage(null);
      setError(null);
      setFieldErrors({});
      setBusy(false);
    }
  }, [open]);

  const validate = () => {
    const errors: { name?: string; description?: string } = {};
    if (name.trim().length < 2 || name.trim().length > 48) errors.name = t('validation.serverName');
    if (description.trim().length > 200) errors.description = t('validation.serverDescription');
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy || !validate()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.servers.create({
        name: name.trim(),
        description: description.trim(),
        image: image || undefined,
      });
      await refreshServers();
      toast.success(t('servers.createdToast', { name: result.server.name }));
      onCreated(result.server, result.channelId);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors({
          name: fieldErrorFor(t, caught, 'name') ?? undefined,
          description: fieldErrorFor(t, caught, 'description') ?? undefined,
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
      title={t('servers.createTitle')}
      description={t('servers.createSubtitle')}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="create-server-form"
            loading={busy}
            icon={<Plus className="icon" aria-hidden="true" />}
          >
            {busy ? t('servers.creating') : t('servers.create')}
          </Button>
        </>
      }
    >
      <form id="create-server-form" className="form-stack" onSubmit={handleSubmit}>
        <div className="form-with-image">
          <ImagePicker value={image} name={name || t('servers.picture')} onChange={setImage} disabled={busy} />
          <div className="form-with-image-fields">
            <TextInput
              id="server-name"
              label={t('servers.name')}
              placeholder={t('servers.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              maxLength={48}
              required
              data-autofocus
              disabled={busy}
            />
            <TextArea
              id="server-description"
              label={t('servers.description')}
              placeholder={t('servers.descriptionPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              error={fieldErrors.description}
              maxLength={200}
              rows={3}
              disabled={busy}
              optionalLabel={t('common.optional')}
            />
          </div>
        </div>
        {Boolean(error) && !fieldErrors.name && !fieldErrors.description && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
        <p className="form-note" lang={language}>
          {t('home.tipBody')}
        </p>
      </form>
    </Modal>
  );
}

export interface JoinServerDialogProps {
  open: boolean;
  onClose: () => void;
  onJoined: (server: ServerSummary, channelId: string | null, alreadyMember: boolean) => void;
}

export function JoinServerDialog({ open, onClose, onJoined }: JoinServerDialogProps) {
  const { t } = useTranslation();
  const { refreshServers } = useAuth();
  const toast = useToast();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    const clean = code.trim();
    if (clean.length < 4 || clean.length > 32) {
      setError(new ApiError({ error: 'INVALID_INVITE', field: 'code' }, 400));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await api.servers.join(clean);
      await refreshServers();
      if (result.alreadyMember) toast.info(t('servers.alreadyMember', { name: result.server.name }));
      else toast.success(t('servers.joinedToast', { name: result.server.name }));
      onJoined(result.server, result.channelId, Boolean(result.alreadyMember));
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
      title={t('servers.joinTitle')}
      description={t('servers.joinSubtitle')}
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
            form="join-server-form"
            loading={busy}
            icon={<UserPlus className="icon" aria-hidden="true" />}
          >
            {busy ? t('servers.joining') : t('servers.join')}
          </Button>
        </>
      }
    >
      <form id="join-server-form" className="form-stack" onSubmit={handleSubmit}>
        <TextInput
          id="invite-code"
          label={t('servers.inviteCode')}
          placeholder={t('servers.inviteCodePlaceholder')}
          hint={t('servers.inviteCodeHint')}
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setError(null);
          }}
          error={error ? fieldErrorFor(t, error, 'code') : null}
          autoComplete="off"
          spellCheck={false}
          maxLength={32}
          required
          data-autofocus
          disabled={busy}
          className="input-code"
        />
        {Boolean(error) && !fieldErrorFor(t, error, 'code') && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

export interface InviteDialogProps {
  open: boolean;
  onClose: () => void;
  serverName: string;
  inviteCode: string;
  serverId?: string;
  canRotate?: boolean;
  onRotated?: (inviteCode: string) => void;
}

export function InviteDialog({
  open,
  onClose,
  serverName,
  inviteCode,
  serverId,
  canRotate = false,
  onRotated,
}: InviteDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState(inviteCode);
  const [rotating, setRotating] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);

  useEffect(() => {
    setCode(inviteCode);
  }, [inviteCode]);

  useEffect(() => {
    if (open) {
      setCopied(false);
      setRotateOpen(false);
    }
  }, [open]);

  const handleCopy = async () => {
    const ok = await copyText(code);
    if (ok) {
      setCopied(true);
      toast.success(t('servers.copied'));
    }
  };

  const handleRotate = async () => {
    if (!serverId || rotating) return;
    setRotating(true);
    try {
      const result = await api.servers.rotateInvite(serverId);
      setCode(result.inviteCode);
      onRotated?.(result.inviteCode);
      setRotateOpen(false);
      setCopied(false);
      toast.success(t('servers.rotateInviteToast'));
    } catch (error) {
      toast.error(translateError(t, error));
    } finally {
      setRotating(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={t('servers.inviteTitle', { name: serverName })}
        description={t('servers.inviteSubtitle')}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
              {t('common.close')}
            </Button>
            <Button variant="primary" onClick={handleCopy} icon={<Copy className="icon" aria-hidden="true" />}>
              {copied ? t('common.copied') : t('servers.copyCode')}
            </Button>
          </>
        }
      >
        <div className="invite-code-box">
          <span className="invite-code-label">{t('servers.inviteCodeLabel')}</span>
          <code className="invite-code" aria-label={t('a11y.copyInviteCode')}>
            {code}
          </code>
        </div>
        <p className="form-note">{t('servers.shareHint')}</p>
        {canRotate && serverId && (
          <div className="invite-rotate">
            <Button
              variant="soft"
              size="sm"
              onClick={() => setRotateOpen(true)}
              loading={rotating}
              icon={<RefreshCw className="icon" aria-hidden="true" />}
            >
              {t('servers.rotateInvite')}
            </Button>
            <p className="form-hint">{t('servers.rotateInviteHint')}</p>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={rotateOpen}
        onClose={() => setRotateOpen(false)}
        onConfirm={handleRotate}
        title={t('servers.rotateInviteTitle')}
        body={t('servers.rotateInviteBody')}
        confirmLabel={t('servers.rotateInvite')}
        danger
      />
    </>
  );
}
