import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import { hashString, initials } from '../../lib/format';

const GRADIENTS = [
  ['#ff8a66', '#ffb56b'],
  ['#8bf0cf', '#42c8a7'],
  ['#a78bfa', '#7c6cf0'],
  ['#f9a8d4', '#f2779a'],
  ['#7dd3fc', '#38bdf8'],
  ['#fcd34d', '#f59e0b'],
];

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  decorative?: boolean;
}

export function Avatar({ name, src, size = 40, className, decorative = false }: AvatarProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const gradient = GRADIENTS[hashString(name) % GRADIENTS.length];
  return (
    <span
      className={cx('avatar', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(135deg, ${gradient[0]}, ${gradient[1]})`,
        fontSize: Math.max(11, Math.round(size * 0.36)),
      }}
      aria-hidden={decorative || undefined}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={decorative ? '' : t('a11y.avatarAlt', { name })}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="avatar-initials">{initials(name)}</span>
      )}
    </span>
  );
}

export interface ServerIconProps {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
  decorative?: boolean;
}

export function ServerIcon({ name, src, size = 48, className, decorative = false }: ServerIconProps) {
  const { t } = useTranslation();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [src]);

  const gradient = GRADIENTS[(hashString(name) + 2) % GRADIENTS.length];
  return (
    <span
      className={cx('server-icon', className)}
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, ${gradient[0]}, ${gradient[1]})`,
        fontSize: Math.max(11, Math.round(size * 0.32)),
      }}
      aria-hidden={decorative || undefined}
    >
      {src && !failed ? (
        <img
          src={src}
          alt={decorative ? '' : t('a11y.serverIconAlt', { name })}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="server-icon-initials">{initials(name)}</span>
      )}
    </span>
  );
}
