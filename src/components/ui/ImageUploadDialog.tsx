import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ImageReadError, readImageFile } from '../../lib/image';
import { translateError } from '../../lib/errors';
import { Button } from './Button';
import { ImagePicker } from './ImagePicker';
import { Modal } from './Modal';

export interface ImageUploadDialogProps {
  open: boolean;
  onClose: () => void;
  kind: 'profile' | 'server';
  currentUrl: string | null;
  name: string;
  onSave: (dataUrl: string) => Promise<void>;
  onRemove?: () => Promise<void>;
}

export function ImageUploadDialog({
  open,
  onClose,
  kind,
  currentUrl,
  name,
  onSave,
  onRemove,
}: ImageUploadDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState<string | null>(currentUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(currentUrl);
      setError(null);
      setBusy(false);
      setConfirmRemove(false);
    }
  }, [open, currentUrl]);

  const handleSave = async () => {
    if (!value || value === currentUrl) return;
    setBusy(true);
    setError(null);
    try {
      await onSave(value);
      onClose();
    } catch (caught) {
      setError(translateError(t, caught));
    } finally {
      setBusy(false);
    }
  };

  const handleRemove = async () => {
    if (!onRemove) return;
    setBusy(true);
    setError(null);
    try {
      await onRemove();
      onClose();
    } catch (caught) {
      setError(translateError(t, caught));
      setConfirmRemove(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={confirmRemove ? t('image.removeTitle') : kind === 'profile' ? t('image.profileTitle') : t('image.serverTitle')}
      description={confirmRemove ? t('image.removeBody') : t('image.previewNote')}
      size="sm"
      dismissible={!busy}
      footer={
        confirmRemove ? (
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button variant="danger" onClick={handleRemove} loading={busy}>
              {t('common.remove')}
            </Button>
          </>
        ) : (
          <>
            {onRemove && currentUrl && (
              <Button
                variant="ghost"
                className="modal-footer-start"
                icon={<Trash2 className="icon" aria-hidden="true" />}
                onClick={() => setConfirmRemove(true)}
                disabled={busy}
              >
                {t('image.remove')}
              </Button>
            )}
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleSave}
              loading={busy}
              disabled={!value || value === currentUrl}
            >
              {busy ? t('image.saving') : t('image.save')}
            </Button>
          </>
        )
      }
    >
      {!confirmRemove && (
        <ImagePicker
          value={value}
          name={name}
          onChange={(next) => {
            setValue(next);
            setError(null);
          }}
          shape={kind === 'profile' ? 'circle' : 'square'}
          disabled={busy}
        />
      )}
      {confirmRemove && currentUrl && (
        <div className="confirm-preview">
          <img src={currentUrl} alt={t('image.currentAlt')} />
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}

export function imageErrorMessage(t: (key: string) => string, error: unknown): string {
  if (error instanceof ImageReadError) {
    return error.code === 'invalidType'
      ? t('image.invalidType')
      : error.code === 'tooLarge'
        ? t('image.tooLarge')
        : t('image.readError');
  }
  return t('image.uploadError');
}

export { readImageFile };
