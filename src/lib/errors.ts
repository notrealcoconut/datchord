import type { TFunction } from 'i18next';
import i18n from '../i18n';
import { ApiError } from './api';

export function translateError(t: TFunction, error: unknown): string {
  if (error instanceof ApiError) {
    const key = `errors.${error.code}`;
    if (i18n.exists(key)) {
      return t(key, (error.params ?? {}) as Record<string, unknown>);
    }
  }
  return t('errors.generic');
}

export function fieldErrorFor(t: TFunction, error: unknown, field: string): string | null {
  if (error instanceof ApiError && error.field === field) return translateError(t, error);
  return null;
}

export function isApiErrorCode(error: unknown, code: string): boolean {
  return error instanceof ApiError && error.code === code;
}
