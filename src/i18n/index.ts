import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import ar from './locales/ar.json';
import ptBR from './locales/pt-BR.json';
import type { LanguageCode } from '../types';

export interface LanguageInfo {
  code: LanguageCode;
  nativeName: string;
  englishName: string;
  dir: 'ltr' | 'rtl';
}

export const SUPPORTED_LANGUAGES: LanguageInfo[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl' },
  { code: 'pt-BR', nativeName: 'Português (Brasil)', englishName: 'Portuguese, Brazil', dir: 'ltr' },
];

export const LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((language) => language.code);

export function isLanguageCode(value: unknown): value is LanguageCode {
  return typeof value === 'string' && LANGUAGE_CODES.includes(value as LanguageCode);
}

export function languageInfo(code: LanguageCode): LanguageInfo {
  return SUPPORTED_LANGUAGES.find((language) => language.code === code) ?? SUPPORTED_LANGUAGES[0];
}

export function isRtl(code: string): boolean {
  return languageInfo(code as LanguageCode).dir === 'rtl';
}

function fromNavigator(): LanguageCode {
  if (typeof navigator === 'undefined') return 'en';
  const candidates = navigator.languages?.length ? navigator.languages : [navigator.language || 'en'];
  for (const raw of candidates) {
    if (isLanguageCode(raw)) return raw;
    const base = String(raw).split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (isLanguageCode(base)) return base as LanguageCode;
  }
  return 'en';
}

export function detectLanguage(): LanguageCode {
  try {
    const stored = localStorage.getItem('datchord_lang');
    if (isLanguageCode(stored)) return stored;
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
  return fromNavigator();
}

export function applyDocumentLanguage(code: LanguageCode): void {
  const info = languageInfo(code);
  document.documentElement.lang = code;
  document.documentElement.dir = info.dir;
  try {
    localStorage.setItem('datchord_lang', code);
  } catch {
    /* Language still applies for this session. */
  }
}

export function formatLocale(code: string): string {
  return isLanguageCode(code) ? code : 'en';
}

export async function initI18n(): Promise<typeof i18n> {
  const language = detectLanguage();
  await i18n.use(initReactI18next).init({
    resources: {
      en: { translation: en },
      es: { translation: es },
      fr: { translation: fr },
      ar: { translation: ar },
      'pt-BR': { translation: ptBR },
    },
    lng: language,
    fallbackLng: 'en',
    supportedLngs: LANGUAGE_CODES,
    load: 'currentOnly',
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
    returnEmptyString: false,
    saveMissing: false,
    missingKeyHandler: false,
  });
  applyDocumentLanguage(language);
  return i18n;
}

export async function changeAppLanguage(code: LanguageCode): Promise<void> {
  await i18n.changeLanguage(code);
  applyDocumentLanguage(code);
}

export default i18n;
