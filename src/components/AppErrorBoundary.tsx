import { Component, type ErrorInfo, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface AppErrorBoundaryState {
  hasError: boolean;
}

function ErrorFallback() {
  const { t } = useTranslation();
  return (
    <div className="fatal-error">
      <div className="fatal-error-card">
        <span className="fatal-error-icon" aria-hidden="true">
          <TriangleAlert className="icon" />
        </span>
        <h1>{t('errors.appCrashTitle')}</h1>
        <p>{t('errors.appCrashBody')}</p>
        <button type="button" className="btn btn-primary btn-md" onClick={() => window.location.reload()}>
          <span className="btn-label">{t('common.retry')}</span>
        </button>
      </div>
    </div>
  );
}

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Never surface raw technical details to people using the app.
    console.error('[Datchord] Unhandled UI error', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) return <ErrorFallback />;
    return this.props.children;
  }
}
