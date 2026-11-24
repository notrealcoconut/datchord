import { useDeferredValue, useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SUPPORTED_LANGUAGES, type LanguageInfo } from '../i18n';
import { cx } from '../lib/cx';
import type { LanguageCode } from '../types';
import { Modal } from './ui/Modal';

export interface LanguageDialogProps {
  open: boolean;
  onClose: () => void;
  current: LanguageCode;
  onSelect: (language: LanguageCode) => void;
}

function matches(language: LanguageInfo, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return (
    language.nativeName.toLocaleLowerCase().includes(normalized) ||
    language.englishName.toLocaleLowerCase().includes(normalized) ||
    language.code.toLocaleLowerCase().includes(normalized)
  );
}

export function LanguageDialog({ open, onClose, current, onSelect }: LanguageDialogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const languages = useMemo(
    () => SUPPORTED_LANGUAGES.filter((language) => matches(language, deferredQuery)),
    [deferredQuery],
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('settings.chooseLanguage')}
      description={t('settings.languageNames')}
      size="sm"
      initialFocusSelector="#language-search"
    >
      <div className="language-dialog">
        <div className="search-field">
          <Search className="icon search-icon" aria-hidden="true" />
          <input
            id="language-search"
            type="search"
            className="input search-input"
            placeholder={t('settings.searchLanguages')}
            aria-label={t('settings.searchLanguages')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
        </div>
        {languages.length === 0 ? (
          <p className="language-empty">{t('settings.noLanguages')}</p>
        ) : (
          <ul className="language-list">
            {languages.map((language) => {
              const selected = language.code === current;
              return (
                <li key={language.code}>
                  <button
                    type="button"
                    className={cx('language-option', selected && 'is-selected')}
                    onClick={() => {
                      onSelect(language.code);
                      onClose();
                    }}
                    aria-pressed={selected}
                  >
                    <span className="language-badge" aria-hidden="true">
                      {language.code === 'pt-BR' ? 'PT' : language.code.toUpperCase()}
                    </span>
                    <span className="language-copy">
                      <span className="language-native" lang={language.code} dir={language.dir}>
                        {language.nativeName}
                      </span>
                      <span className="language-english">{language.englishName}</span>
                    </span>
                    {language.dir === 'rtl' && <span className="chip chip-quiet">{t('language.rtlBadge')}</span>}
                    {selected && <Check className="icon language-check" aria-label={t('settings.selectedLanguage')} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}
