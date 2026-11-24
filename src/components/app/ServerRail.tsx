import { Link } from 'react-router-dom';
import { Plus, UserPlus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cx } from '../../lib/cx';
import type { ServerSummary } from '../../types';
import { DropdownMenu } from '../ui/DropdownMenu';
import { Logo } from '../ui/Logo';
import { ServerIcon } from '../ui/Avatar';

export interface ServerRailProps {
  servers: ServerSummary[];
  activeServerId?: string;
  activeDms?: boolean;
  dmUnread?: number;
  onCreateServer: () => void;
  onJoinServer: () => void;
  onNavigate?: () => void;
  variant?: 'rail' | 'drawer';
}

function serverPath(server: ServerSummary): string {
  return server.defaultChannelId
    ? `/app/s/${server.id}/c/${server.defaultChannelId}`
    : `/app/s/${server.id}`;
}

export function ServerRail({
  servers,
  activeServerId,
  activeDms = false,
  dmUnread = 0,
  onCreateServer,
  onJoinServer,
  onNavigate,
  variant = 'rail',
}: ServerRailProps) {
  const { t } = useTranslation();
  const homeLabel =
    dmUnread > 0 ? t('dms.railLabelUnread', { count: dmUnread }) : t('nav.home');
  return (
    <nav
      className={cx('server-rail', variant === 'drawer' && 'server-rail-drawer')}
      aria-label={t('a11y.serverNavigation')}
    >
      <Link
        to="/app"
        className={cx('rail-item rail-home', activeDms && 'is-active')}
        onClick={onNavigate}
        aria-label={homeLabel}
        aria-current={activeDms ? 'page' : undefined}
      >
        <span className="rail-dm-icon">
          <Logo size={30} className="rail-home-logo" />
          {dmUnread > 0 && (
            <span className="rail-badge" aria-hidden="true">
              {dmUnread > 99 ? '99+' : dmUnread}
            </span>
          )}
        </span>
        <span className="rail-tooltip">{homeLabel}</span>
      </Link>

      <span className="rail-divider" aria-hidden="true" />

      <ul className="rail-list">
        {servers.map((server) => (
          <li key={server.id}>
            <Link
              to={serverPath(server)}
              className={cx('rail-item', server.id === activeServerId && 'is-active')}
              onClick={onNavigate}
              aria-label={server.name}
              aria-current={server.id === activeServerId ? 'page' : undefined}
            >
              <ServerIcon name={server.name} src={server.iconUrl} size={46} decorative />
              <span className="rail-tooltip">{server.name}</span>
            </Link>
          </li>
        ))}
      </ul>

      <DropdownMenu
        label={t('nav.addServer')}
        align="start"
        renderTrigger={(props) => (
          <button
            type="button"
            className="rail-item rail-add"
            aria-label={t('nav.addServer')}
            {...props}
          >
            <Plus className="icon" aria-hidden="true" />
            <span className="rail-tooltip">{t('nav.addServer')}</span>
          </button>
        )}
        items={[
          {
            id: 'create',
            label: t('nav.createServer'),
            icon: <Plus className="icon" aria-hidden="true" />,
            onSelect: onCreateServer,
          },
          {
            id: 'join',
            label: t('nav.joinServer'),
            icon: <UserPlus className="icon" aria-hidden="true" />,
            onSelect: onJoinServer,
          },
        ]}
      />
    </nav>
  );
}
