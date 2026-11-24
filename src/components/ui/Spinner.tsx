import { LoaderCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';

export function Spinner({ label, className }: { label?: string; className?: string }) {
  return (
    <span className={cx('spinner-wrap', className)} role="status">
      <LoaderCircle className="icon spin" aria-hidden="true" />
      {label && <span className="sr-only">{label}</span>}
    </span>
  );
}

export function LoadingPane({ label, className }: { label?: string; className?: string }) {
  const { t } = useTranslation();
  return (
    <div className={cx('loading-pane', className)} role="status" aria-live="polite">
      <span className="loading-orbit" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span className="loading-label">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <span className={cx('skeleton', className)} aria-hidden="true" />;
}
