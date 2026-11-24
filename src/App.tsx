import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { PreferencesProvider } from './contexts/PreferencesContext';
import { ToastProvider } from './contexts/ToastContext';
import { AuthProvider } from './contexts/AuthContext';
import { RealtimeProvider } from './contexts/RealtimeContext';
import { AppErrorBoundary } from './components/AppErrorBoundary';
import { RequireAuth } from './components/RequireAuth';
import { AuthPage } from './pages/AuthPage';
import { MessagesPage } from './pages/MessagesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ServerSettingsPage } from './pages/ServerSettingsPage';
import { UserSettingsPage } from './pages/UserSettingsPage';
import { WorkspacePage } from './pages/WorkspacePage';

export function App() {
  return (
    <AppErrorBoundary>
      <PreferencesProvider>
        <ToastProvider>
          <AuthProvider>
            <RealtimeProvider>
              <BrowserRouter>
                <Routes>
                  <Route path="/" element={<Navigate to="/app" replace />} />
                  <Route path="/login" element={<AuthPage mode="login" />} />
                  <Route path="/register" element={<AuthPage mode="register" />} />

                  <Route element={<RequireAuth />}>
                    <Route path="/app" element={<MessagesPage />} />
                    <Route path="/app/dms" element={<Navigate to="/app" replace />} />
                    <Route path="/app/dms/:conversationId" element={<MessagesPage />} />
                    <Route path="/app/s/:serverId" element={<WorkspacePage />} />
                    <Route path="/app/s/:serverId/c/:channelId" element={<WorkspacePage />} />
                    <Route path="/settings" element={<Navigate to="/settings/profile" replace />} />
                    <Route path="/settings/:section" element={<UserSettingsPage />} />
                    <Route path="/servers/:serverId/settings/:tab" element={<ServerSettingsPage />} />
                  </Route>

                  <Route path="*" element={<NotFoundPage />} />
                </Routes>
              </BrowserRouter>
            </RealtimeProvider>
          </AuthProvider>
        </ToastProvider>
      </PreferencesProvider>
    </AppErrorBoundary>
  );
}
