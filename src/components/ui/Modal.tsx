import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { IconButton } from './Button';

let scrollLocks = 0;
let previousOverflow = '';

function lockScroll() {
  if (scrollLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  scrollLocks += 1;
}

function unlockScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  if (scrollLocks === 0) document.body.style.overflow = previousOverflow;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  const selector =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter(
    (element) => !element.hasAttribute('hidden') && element.getClientRects().length > 0,
  );
}

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  dismissible?: boolean;
  hideClose?: boolean;
  initialFocusSelector?: string;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  className,
  dismissible = true,
  hideClose = false,
  initialFocusSelector,
}: ModalProps) {
  const { t } = useTranslation();
  const generatedId = useId();
  const titleId = `${generatedId}-title`;
  const descriptionId = `${generatedId}-description`;
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    lockScroll();
    const timer = window.setTimeout(() => {
      const dialog = dialogRef.current;
      if (!dialog) return;
      const preferred = initialFocusSelector
        ? dialog.querySelector<HTMLElement>(initialFocusSelector)
        : dialog.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusableElements(dialog)[0] ?? dialog).focus();
    }, 30);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissible) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const elements = focusableElements(dialog);
      if (elements.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', handleKeyDown);
      unlockScroll();
      previouslyFocused?.focus?.();
    };
  }, [open, dismissible, initialFocusSelector]);

  if (!open) return null;

  return createPortal(
    <div
      className="modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && dismissible) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-describedby={description ? descriptionId : undefined}
        tabIndex={-1}
        className={cx('modal', `modal-${size}`, className)}
      >
        {(title || !hideClose) && (
          <div className="modal-head">
            <div className="modal-heading">
              {title && (
                <h2 id={titleId} className="modal-title">
                  {title}
                </h2>
              )}
              {description && (
                <p id={descriptionId} className="modal-description">
                  {description}
                </p>
              )}
            </div>
            {!hideClose && (
              <IconButton label={t('common.close')} onClick={onClose} size="sm" disabled={!dismissible}>
                <X className="icon" aria-hidden="true" />
              </IconButton>
            )}
          </div>
        )}
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
