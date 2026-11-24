import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import i18n, { changeAppLanguage, detectLanguage, isLanguageCode } from '../i18n';
import { applyAppearance, readStoredAppearance, watchSystemTheme } from '../lib/theme';
import type { Appearance, LanguageCode, SelfUser } from '../types';

interface PreferencesContextValue {
  appearance: Appearance;
  language: LanguageCode;
  setAppearance: (patch: Partial<Appearance>) => void;
  setLanguage: (language: LanguageCode) => Promise<void>;
  syncFromUser: (user: SelfUser) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearanceState] = useState<Appearance>(() => readStoredAppearance());
  const [language, setLanguageState] = useState<LanguageCode>(() => {
    const current = i18n.resolvedLanguage ?? i18n.language;
    return isLanguageCode(current) ? current : detectLanguage();
  });

  useEffect(() => {
    applyAppearance(appearance);
  }, [appearance]);

  useEffect(
    () =>
      watchSystemTheme(() => {
        if (appearance.theme === 'system') applyAppearance(appearance);
      }),
    [appearance],
  );

  const setAppearance = useCallback((patch: Partial<Appearance>) => {
    setAppearanceState((current) => {
      const next = { ...current, ...patch };
      applyAppearance(next);
      return next;
    });
  }, []);

  const setLanguage = useCallback(async (next: LanguageCode) => {
    await changeAppLanguage(next);
    setLanguageState(next);
  }, []);

  const syncFromUser = useCallback(
    (user: SelfUser) => {
      setAppearanceState(user.settings.appearance);
      applyAppearance(user.settings.appearance);
      if (i18n.resolvedLanguage !== user.language) {
        void setLanguage(user.language);
      }
    },
    [setLanguage],
  );

  const value = useMemo(
    () => ({ appearance, language, setAppearance, setLanguage, syncFromUser }),
    [appearance, language, setAppearance, setLanguage, syncFromUser],
  );

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences(): PreferencesContextValue {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider');
  return context;
}
