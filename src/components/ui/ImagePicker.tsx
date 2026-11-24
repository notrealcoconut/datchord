import { useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import { ImagePlus, Trash2, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { ImageReadError, readImageFile } from '../../lib/image';
import { Button } from './Button';

export interface ImagePickerProps {
  value: string | null;
  name: string;
  onChange: (value: string | null) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  shape?: 'square' | 'circle';
}

export function ImagePicker({
  value,
  name,
  onChange,
  disabled = false,
  className,
  label,
  shape = 'square',
}: ImagePickerProps) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file || disabled) return;
    setError(null);
    setBusy(true);
    try {
      const dataUrl = await readImageFile(file);
      onChange(dataUrl);
    } catch (caught) {
      if (caught instanceof ImageReadError) {
        setError(
          caught.code === 'invalidType'
            ? t('image.invalidType')
            : caught.code === 'tooLarge'
              ? t('image.tooLarge')
              : t('image.readError'),
        );
      } else {
        setError(t('image.readError'));
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleInput = (event: ChangeEvent<HTMLInputElement>) => {
    void handleFile(event.target.files?.[0]);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    void handleFile(event.dataTransfer.files?.[0]);
  };

  return (
    <div className={cx('image-picker', className)}>
      <div
        className={cx(
          'image-picker-frame',
          shape === 'circle' && 'is-circle',
          dragging && 'is-dragging',
          !value && 'is-empty',
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        {value ? (
          <img src={value} alt={t('image.previewAlt')} />
        ) : (
          <span className="image-picker-placeholder" aria-hidden="true">
            <ImagePlus className="icon" />
          </span>
        )}
        {busy && <span className="image-picker-busy">{t('common.loading')}</span>}
      </div>
      <div className="image-picker-actions">
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={handleInput}
          disabled={disabled || busy}
          tabIndex={-1}
        />
        <Button
          variant="secondary"
          size="sm"
          icon={<Upload className="icon" aria-hidden="true" />}
          onClick={() => inputRef.current?.click()}
          disabled={disabled || busy}
        >
          {label ?? t('image.change')}
        </Button>
        {value && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="icon" aria-hidden="true" />}
            onClick={() => {
              setError(null);
              onChange(null);
            }}
            disabled={disabled || busy}
          >
            {t('image.remove')}
          </Button>
        )}
      </div>
      <p className="image-picker-hint">{t('image.requirements')}</p>
      <p className="image-picker-name">{name}</p>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
