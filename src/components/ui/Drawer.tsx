import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { IconButton } from './Button';

let drawerLocks = 0;
let previousOverflow = '';

function lock() {
  if (drawerLocks === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  drawerLocks += 1;
}

function unlock() {
  drawerLocks = Math.max(0, drawerLocks - 1);
  if (drawerLocks === 0) document.body.style.overflow = previousOverflow;
}

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((element) => element.getClientRects().length > 0);
}

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: 'start' | 'end';
  label: string;
  className?: string;
}

export function Drawer({ open, onClose, children, side = 'start', label, className }: DrawerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    lock();
    const timer = window.setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const preferred = panel.querySelector<HTMLElement>('[data-autofocus]');
      (preferred ?? focusable(panel)[0] ?? panel).focus();
    }, 40);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const elements = focusable(panel);
      if (!elements.length) return;
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
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('keydown', onKey);
      unlock();
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div
      className="drawer-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        className={cx('drawer', `drawer-${side}`, className)}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
      >
        <IconButton
          label={t('a11y.closeSidebar')}
          className="drawer-close"
          onClick={onClose}
          data-autofocus
        >
          <X className="icon" aria-hidden="true" />
        </IconButton>
        {children}
      </div>
    </div>,
    document.body,
  );
}
