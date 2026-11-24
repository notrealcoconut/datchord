import { useEffect, useRef, useState } from 'react';
import { LoaderCircle, Search, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';
import { Avatar } from '../ui/Avatar';
import type { PublicUser } from '../../types';

export interface UserSearchProps {
  selectedIds?: Set<string>;
  onSelect: (user: PublicUser) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
}

export function UserSearch({
  selectedIds,
  onSelect,
  placeholder,
  autoFocus = false,
  disabled = false,
}: UserSearchProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    controllerRef.current?.abort();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(false);
      return;
    }
    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(false);
      api.users
        .search(trimmed, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) setResults(result.users);
        })
        .catch((caught: unknown) => {
          if (caught instanceof DOMException && caught.name === 'AbortError') return;
          if (!controller.signal.aborted) setError(true);
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  return (
    <div className="user-search">
      <div className="user-search-input">
        <Search className="icon search-icon" aria-hidden="true" />
        <input
          type="search"
          className="input search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={placeholder ?? t('dms.searchPeople')}
          aria-label={placeholder ?? t('dms.searchPeople')}
          autoFocus={autoFocus}
          disabled={disabled}
        />
        {query && (
          <button
            type="button"
            className="user-search-clear"
            onClick={() => setQuery('')}
            aria-label={t('common.clear')}
            disabled={disabled}
          >
            <X className="icon" aria-hidden="true" />
          </button>
        )}
      </div>
      {loading && (
        <p className="user-search-status">
          <LoaderCircle className="icon spin" aria-hidden="true" />
          {t('common.loading')}
        </p>
      )}
      {!loading && error && <p className="user-search-status is-error">{t('errors.generic')}</p>}
      {!loading && !error && query.trim().length >= 2 && results.length === 0 && (
        <p className="user-search-status">{t('dms.noPeople')}</p>
      )}
      {results.length > 0 && (
        <ul className="user-search-results">
          {results.map((person) => {
            const selected = selectedIds?.has(person.id) ?? false;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  className="user-search-option"
                  onClick={() => onSelect(person)}
                  disabled={disabled || selected}
                  aria-pressed={selected}
                >
                  <Avatar name={person.displayName} src={person.avatarUrl} size={32} />
                  <span className="user-search-copy">
                    <span className="user-search-name">{person.displayName}</span>
                    <span className="user-search-handle">@{person.username}</span>
                  </span>
                  {selected && <span className="chip chip-quiet">{t('dms.selected')}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
