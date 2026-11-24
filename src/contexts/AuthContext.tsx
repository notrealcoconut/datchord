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
import { useTranslation } from 'react-i18next';
import { api, ApiError, type RegisterPayload } from '../lib/api';
import { translateError } from '../lib/errors';
import { usePreferences } from './PreferencesContext';
import { useToast } from './ToastContext';
import type { SelfUser, ServerSummary } from '../types';

interface AuthContextValue {
  user: SelfUser | null;
  servers: ServerSummary[];
  loading: boolean;
  initialError: string | null;
  login: (email: string, password: string) => Promise<SelfUser>;
  register: (payload: RegisterPayload) => Promise<SelfUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  refreshServers: () => Promise<ServerSummary[]>;
  setUser: (user: SelfUser | null) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const { syncFromUser } = usePreferences();
  const toast = useToast();
  const [user, setUserState] = useState<SelfUser | null>(null);
  const [servers, setServers] = useState<ServerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState<string | null>(null);
  const userRef = useRef<SelfUser | null>(null);
  const tRef = useRef(t);
  userRef.current = user;
  tRef.current = t;

  const setUser = useCallback((next: SelfUser | null) => {
    setUserState(next);
    if (!next) setServers([]);
  }, []);

  const applySession = useCallback(
    (nextUser: SelfUser, nextServers: ServerSummary[]) => {
      setUserState(nextUser);
      setServers(nextServers);
      syncFromUser(nextUser);
    },
    [syncFromUser],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setInitialError(null);
    try {
      const result = await api.auth.me();
      applySession(result.user, result.servers);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
        setUserState(null);
        setServers([]);
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setInitialError(translateError(tRef.current, error));
      }
    } finally {
      setLoading(false);
    }
  }, [applySession]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setInitialError(null);
    api.auth
      .me(controller.signal)
      .then((result) => applySession(result.user, result.servers))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (error instanceof ApiError && error.code === 'UNAUTHORIZED') {
          setUserState(null);
          setServers([]);
          return;
        }
        setInitialError(translateError(tRef.current, error));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [applySession]);

  useEffect(() => {
    const handleUnauthorized = () => {
      if (!userRef.current) return;
      setUserState(null);
      setServers([]);
      toast.info(t('status.sessionExpired'));
    };
    window.addEventListener('datchord:unauthorized', handleUnauthorized);
    return () => window.removeEventListener('datchord:unauthorized', handleUnauthorized);
  }, [toast, t]);

  const userId = user?.id ?? null;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const beat = () => {
      if (cancelled || document.visibilityState === 'hidden') return;
      void api.presence.heartbeat().catch(() => {});
    };
    beat();
    const interval = window.setInterval(beat, 20000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [userId]);

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await api.auth.login(email, password);
      applySession(result.user, result.servers);
      return result.user;
    },
    [applySession],
  );

  const register = useCallback(
    async (payload: RegisterPayload) => {
      const result = await api.auth.register(payload);
      applySession(result.user, result.servers);
      return result.user;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUserState(null);
      setServers([]);
    }
  }, []);

  const refreshServers = useCallback(async () => {
    const result = await api.servers.list();
    setServers(result.servers);
    return result.servers;
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      servers,
      loading,
      initialError,
      login,
      register,
      logout,
      refresh,
      refreshServers,
      setUser,
    }),
    [user, servers, loading, initialError, login, register, logout, refresh, refreshServers, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}
