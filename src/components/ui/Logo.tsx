import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';

export function Logo({
  size = 40,
  className,
  withWordmark = false,
}: {
  size?: number;
  className?: string;
  withWordmark?: boolean;
}) {
  const { t } = useTranslation();
  const gradientId = useId().replace(/:/g, '');
  return (
    <span className={cx('logo', className)}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 64 64"
        role="img"
        aria-label={t('brand.name')}
        className="logo-mark"
      >
        <defs>
          <linearGradient id={`logo-warm-${gradientId}`} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#ff6f4e" />
            <stop offset="1" stopColor="#ffb16b" />
          </linearGradient>
          <linearGradient id={`logo-cool-${gradientId}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8bf0cf" />
            <stop offset="1" stopColor="#42c8a7" />
          </linearGradient>
        </defs>
        <rect width="64" height="64" rx="19" className="logo-bg" />
        <path d="M19 46V28" className="logo-bar logo-bar-1" strokeWidth="7" strokeLinecap="round" />
        <path
          d="M32 46V18"
          stroke={`url(#logo-warm-${gradientId})`}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <path
          d="M45 46V24"
          stroke={`url(#logo-cool-${gradientId})`}
          strokeWidth="7"
          strokeLinecap="round"
        />
        <circle cx="45" cy="15" r="3" fill="#ffb16b" />
      </svg>
      {withWordmark && <span className="logo-wordmark">{t('brand.name')}</span>}
    </span>
  );
}
