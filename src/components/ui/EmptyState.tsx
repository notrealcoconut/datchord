import type { ReactNode } from 'react';
import { cx } from '../../lib/cx';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
  className?: string;
  tone?: 'default' | 'compact';
}

export function EmptyState({ icon, title, body, action, className, tone = 'default' }: EmptyStateProps) {
  return (
    <div className={cx('empty-state', `empty-${tone}`, className)}>
      {icon && <span className="empty-icon" aria-hidden="true">{icon}</span>}
      <h3 className="empty-title">{title}</h3>
      {body && <p className="empty-body">{body}</p>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  );
}
