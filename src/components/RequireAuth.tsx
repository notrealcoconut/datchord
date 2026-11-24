import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { LoadingPane } from '../components/ui/Spinner';
import { EmptyState } from '../components/ui/EmptyState';
import { Button } from '../components/ui/Button';
import { WifiOff } from 'lucide-react';

export function RequireAuth() {
  const { user, loading, initialError, refresh } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();

  if (loading) {
    return (
      <div className="boot-screen">
        <LoadingPane label={t('status.loadingApp')} />
      </div>
    );
  }

  if (!user) {
    if (initialError) {
      return (
        <div className="boot-screen">
          <EmptyState
            icon={<WifiOff className="icon" />}
            title={t('status.loadErrorTitle')}
            body={initialError}
            action={
              <Button variant="primary" onClick={() => void refresh()}>
                {t('common.retry')}
              </Button>
            }
          />
        </div>
      );
    }
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />;
  }

  return <Outlet />;
}
