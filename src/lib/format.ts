import { formatLocale } from '../i18n';

export function formatDate(
  iso: string,
  language: string,
  options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(formatLocale(language), options).format(date);
}

export function formatTime(iso: string, language: string): string {
  return formatDate(iso, language, { hour: 'numeric', minute: '2-digit' });
}

export function formatDateTime(iso: string, language: string): string {
  return formatDate(iso, language, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

export function formatMonthYear(iso: string, language: string): string {
  return formatDate(iso, language, { month: 'long', year: 'numeric' });
}

export function formatNumber(value: number, language: string): string {
  return new Intl.NumberFormat(formatLocale(language)).format(value);
}

export function formatRelative(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat(formatLocale(language), { numeric: 'auto' });
  const divisions: Array<{ amount: number; unit: Intl.RelativeTimeFormatUnit }> = [
    { amount: 60, unit: 'second' },
    { amount: 60, unit: 'minute' },
    { amount: 24, unit: 'hour' },
    { amount: 7, unit: 'day' },
    { amount: 4.34524, unit: 'week' },
    { amount: 12, unit: 'month' },
    { amount: Number.POSITIVE_INFINITY, unit: 'year' },
  ];
  let duration = seconds;
  for (const division of divisions) {
    if (Math.abs(duration) < division.amount) return formatter.format(Math.round(duration), division.unit);
    duration /= division.amount;
  }
  return formatter.format(Math.round(duration), 'year');
}

export function dateKey(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'invalid';
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

export function isSameDay(a: string, b: string): boolean {
  return dateKey(a) === dateKey(b);
}

export function dayLabel(iso: string, language: string, t: (key: string) => string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (dateKey(iso) === dateKey(now.toISOString())) return t('time.today');
  if (dateKey(iso) === dateKey(yesterday.toISOString())) return t('time.yesterday');
  return formatDate(iso, language, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function truncate(value: string, max = 120): string {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  return `${Array.from(parts[0])[0] ?? ''}${Array.from(parts[parts.length - 1])[0] ?? ''}`.toUpperCase();
}

export function hashString(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}
