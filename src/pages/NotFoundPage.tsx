import { Link, useLocation } from 'react-router-dom';
import { Compass, Home } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { Logo } from '../components/ui/Logo';
import { useDocumentTitle } from '../lib/hooks';

export function NotFoundPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const location = useLocation();
  useDocumentTitle(t('errors.notFoundTitle'));

  return (
    <div className="notfound-page">
      <div className="notfound-card">
        <Logo size={44} withWordmark />
        <span className="notfound-code" aria-hidden="true">
          404
        </span>
        <h1>{t('errors.notFoundTitle')}</h1>
        <p>{t('errors.notFoundBody')}</p>
        <code className="notfound-path">{location.pathname}</code>
        <div className="notfound-actions">
          <Link to={user ? '/app' : '/login'} className="btn btn-primary btn-md">
            <Home className="icon" aria-hidden="true" />
            <span className="btn-label">{user ? t('nav.home') : t('auth.signIn')}</span>
          </Link>
          {user && (
            <Link to="/settings/profile" className="btn btn-ghost btn-md">
              <Compass className="icon" aria-hidden="true" />
              <span className="btn-label">{t('nav.userSettings')}</span>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
