import type { Appearance } from '../types';

export const DEFAULT_APPEARANCE: Appearance = {
  theme: 'system',
  accent: 'tangerine',
  density: 'cozy',
  reduceMotion: false,
};

export function resolveTheme(preference: Appearance['theme']): 'light' | 'dark' {
  if (preference !== 'system') return preference;
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function readStoredAppearance(): Appearance {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE;
  try {
    const theme = localStorage.getItem('datchord_theme');
    const accent = localStorage.getItem('datchord_accent');
    const density = localStorage.getItem('datchord_density');
    const reduceMotion = localStorage.getItem('datchord_reduce_motion');
    return {
      theme: theme === 'light' || theme === 'dark' || theme === 'system' ? theme : DEFAULT_APPEARANCE.theme,
      accent:
        accent === 'tangerine' || accent === 'mint' || accent === 'iris' || accent === 'rose'
          ? accent
          : DEFAULT_APPEARANCE.accent,
      density: density === 'compact' || density === 'cozy' ? density : DEFAULT_APPEARANCE.density,
      reduceMotion: reduceMotion === 'true',
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function applyAppearance(appearance: Appearance): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const resolved = resolveTheme(appearance.theme);
  root.setAttribute('data-theme', resolved);
  root.setAttribute('data-theme-preference', appearance.theme);
  root.setAttribute('data-accent', appearance.accent);
  root.setAttribute('data-density', appearance.density);
  if (appearance.reduceMotion) root.setAttribute('data-reduce-motion', 'true');
  else root.removeAttribute('data-reduce-motion');
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'light' ? '#f7f2e9' : '#0d1017';
  try {
    localStorage.setItem('datchord_theme', appearance.theme);
    localStorage.setItem('datchord_accent', appearance.accent);
    localStorage.setItem('datchord_density', appearance.density);
    localStorage.setItem('datchord_reduce_motion', String(appearance.reduceMotion));
  } catch {
    /* Appearance still applies for this session. */
  }
}

export function watchSystemTheme(callback: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => undefined;
  const query = window.matchMedia('(prefers-color-scheme: light)');
  const listener = () => callback();
  query.addEventListener('change', listener);
  return () => query.removeEventListener('change', listener);
}
