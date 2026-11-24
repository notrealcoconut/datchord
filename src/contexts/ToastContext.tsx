import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../lib/cx';

export type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastOptions {
  duration?: number;
}

interface ToastContextValue {
  push: (kind: ToastKind, message: string, options?: ToastOptions) => number;
  success: (message: string, options?: ToastOptions) => number;
  error: (message: string, options?: ToastOptions) => number;
  info: (message: string, options?: ToastOptions) => number;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    (kind: ToastKind, message: string, options: ToastOptions = {}) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((items) => [...items.slice(-3), { id, kind, message }]);
      const duration = options.duration ?? (kind === 'error' ? 7000 : 4800);
      const timer = window.setTimeout(() => dismiss(id), duration);
      timers.current.set(id, timer);
      return id;
    },
    [dismiss],
  );

  useEffect(
    () => () => {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    },
    [],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      push,
      success: (message, options) => push('success', message, options),
      error: (message, options) => push('error', message, options),
      info: (message, options) => push('info', message, options),
      dismiss,
    }),
    [push, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      {createPortal(
        <div className="toast-region" aria-live="polite" aria-atomic="false">
          {toasts.map((toast) => {
            const Icon = ICONS[toast.kind];
            return (
              <div key={toast.id} className={cx('toast', `toast-${toast.kind}`)} role="status">
                <span className="toast-icon" aria-hidden="true">
                  <Icon className="icon" />
                </span>
                <p className="toast-message">{toast.message}</p>
                <button
                  type="button"
                  className="toast-dismiss"
                  aria-label={t('toast.dismiss')}
                  onClick={() => dismiss(toast.id)}
                >
                  <X className="icon" aria-hidden="true" />
                </button>
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
