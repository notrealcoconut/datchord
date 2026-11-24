import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { translateError } from '../../lib/errors';
import { Button } from './Button';
import { Modal } from './Modal';

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  requireText?: boolean;
  requireLabel?: string;
  confirmWord?: string;
  confirmPlaceholder?: string;
  busyLabel?: string;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel,
  cancelLabel,
  danger = false,
  requireText = false,
  requireLabel,
  confirmWord = '',
  confirmPlaceholder,
  busyLabel,
  children,
}: ConfirmDialogProps) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setValue('');
      setError(null);
      setBusy(false);
    }
  }, [open]);

  const matches = !requireText || value.trim() === confirmWord;

  const handleConfirm = async () => {
    if (!matches) {
      setError(t('errors.CONFIRMATION_MISMATCH'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (caught) {
      setError(translateError(t, caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      dismissible={!busy}
      hideClose={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {cancelLabel ?? t('common.cancel')}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            onClick={handleConfirm}
            loading={busy}
            disabled={!matches}
          >
            {busy ? busyLabel ?? t('common.saving') : confirmLabel}
          </Button>
        </>
      }
    >
      <div className={cx('confirm-content', danger && 'is-danger')}>
        {danger && (
          <span className="confirm-icon" aria-hidden="true">
            <AlertTriangle className="icon" />
          </span>
        )}
        <div className="confirm-copy">
          {body && <p className="confirm-body">{body}</p>}
          {children}
          {requireText && (
            <div className="field confirm-field">
              <label className="field-label" htmlFor="confirm-text">
                {requireLabel ?? t('servers.deleteConfirmLabel')}
              </label>
              <input
                id="confirm-text"
                className="input"
                value={value}
                onChange={(event) => setValue(event.target.value)}
                placeholder={confirmPlaceholder ?? confirmWord}
                autoComplete="off"
                spellCheck={false}
                data-autofocus
              />
            </div>
          )}
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}
