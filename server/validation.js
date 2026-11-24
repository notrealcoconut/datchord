import { ApiError } from './errors.js';

export const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'ar', 'pt-BR'];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;
const ROLE_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function text(value, { min = 0, max = 1000, field = 'value', allowNewlines = false } = {}) {
  if (typeof value !== 'string') throw new ApiError('INVALID_INPUT', 400, field);
  let cleaned = value
    .replace(/\r\n/g, '\n')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (!allowNewlines) cleaned = cleaned.replace(/[\n\t]/g, ' ');
  cleaned = cleaned.trim();
  if (cleaned.length < min) {
    throw new ApiError(min <= 1 ? 'FIELD_REQUIRED' : 'TOO_SHORT', 400, field, { min });
  }
  if (cleaned.length > max) throw new ApiError('TOO_LONG', 400, field, { max });
  return cleaned;
}

export function email(value) {
  const cleaned = text(value, { min: 3, max: 254, field: 'email' }).toLowerCase();
  if (!EMAIL_PATTERN.test(cleaned)) throw new ApiError('INVALID_EMAIL', 400, 'email');
  return cleaned;
}

export function username(value) {
  const cleaned = text(value, { min: 3, max: 24, field: 'username' }).toLowerCase();
  if (!USERNAME_PATTERN.test(cleaned)) throw new ApiError('INVALID_USERNAME', 400, 'username');
  return cleaned;
}

export function displayName(value) {
  return text(value, { min: 1, max: 40, field: 'displayName' });
}

export function password(value) {
  if (typeof value !== 'string') throw new ApiError('FIELD_REQUIRED', 400, 'password');
  if (value.length < 8) throw new ApiError('PASSWORD_SHORT', 400, 'password', { min: 8 });
  if (value.length > 128) throw new ApiError('PASSWORD_LONG', 400, 'password', { max: 128 });
  return value;
}

export function bio(value) {
  if (value === null || value === undefined) return '';
  return text(value, { min: 0, max: 190, field: 'bio', allowNewlines: true });
}

export function language(value, fallback = 'en') {
  if (value === null || value === undefined || value === '') return fallback;
  return SUPPORTED_LANGUAGES.includes(value) ? value : fallback;
}

export function serverName(value) {
  return text(value, { min: 2, max: 48, field: 'name' });
}

export function serverDescription(value) {
  if (value === null || value === undefined) return '';
  return text(value, { min: 0, max: 200, field: 'description' });
}

export function channelName(value) {
  if (typeof value !== 'string') throw new ApiError('INVALID_CHANNEL_NAME', 400, 'name');
  const slug = value
    .toLowerCase()
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s_-]/gu, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
  if (!slug) throw new ApiError('INVALID_CHANNEL_NAME', 400, 'name');
  return slug;
}

export function channelTopic(value) {
  if (value === null || value === undefined) return '';
  return text(value, { min: 0, max: 120, field: 'topic' });
}

export function roleName(value) {
  return text(value, { min: 1, max: 32, field: 'name' });
}

export function roleColor(value) {
  if (typeof value !== 'string' || !ROLE_COLOR_PATTERN.test(value)) {
    throw new ApiError('INVALID_COLOR', 400, 'color');
  }
  return value.toLowerCase();
}

export function permissions(value) {
  if (!Number.isInteger(value) || value < 0) throw new ApiError('INVALID_PERMISSIONS', 400, 'permissions');
  return value;
}

export function messageContent(value) {
  return text(value, { min: 1, max: 2000, field: 'content', allowNewlines: true });
}

export function inviteCode(value) {
  return text(value, { min: 4, max: 32, field: 'code' }).toUpperCase();
}

export function imageDataUrl(value) {
  if (typeof value !== 'string') throw new ApiError('INVALID_IMAGE', 400, 'image');
  if (value.length > 4_000_000) throw new ApiError('IMAGE_TOO_LARGE', 413, 'image');
  return value;
}

export function settingsPatch(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError('INVALID_INPUT', 400, 'settings');
  }
  const patch = {};
  if ('privacy' in value) {
    const privacy = value.privacy;
    if (!privacy || typeof privacy !== 'object') throw new ApiError('INVALID_INPUT', 400, 'privacy');
    patch.privacy = {};
    if ('showBio' in privacy) patch.privacy.showBio = Boolean(privacy.showBio);
    if ('showMemberSince' in privacy) patch.privacy.showMemberSince = Boolean(privacy.showMemberSince);
  }
  if ('notifications' in value) {
    const notifications = value.notifications;
    if (!notifications || typeof notifications !== 'object') throw new ApiError('INVALID_INPUT', 400, 'notifications');
    patch.notifications = {};
    if ('level' in notifications) {
      if (!['all', 'mentions', 'none'].includes(notifications.level)) {
        throw new ApiError('INVALID_INPUT', 400, 'notifications.level');
      }
      patch.notifications.level = notifications.level;
    }
    if ('sound' in notifications) patch.notifications.sound = Boolean(notifications.sound);
    if ('desktop' in notifications) patch.notifications.desktop = Boolean(notifications.desktop);
  }
  if ('appearance' in value) {
    const appearance = value.appearance;
    if (!appearance || typeof appearance !== 'object') throw new ApiError('INVALID_INPUT', 400, 'appearance');
    patch.appearance = {};
    if ('theme' in appearance) {
      if (!['light', 'dark', 'system'].includes(appearance.theme)) {
        throw new ApiError('INVALID_INPUT', 400, 'appearance.theme');
      }
      patch.appearance.theme = appearance.theme;
    }
    if ('accent' in appearance) {
      if (!['tangerine', 'mint', 'iris', 'rose'].includes(appearance.accent)) {
        throw new ApiError('INVALID_INPUT', 400, 'appearance.accent');
      }
      patch.appearance.accent = appearance.accent;
    }
    if ('density' in appearance) {
      if (!['cozy', 'compact'].includes(appearance.density)) {
        throw new ApiError('INVALID_INPUT', 400, 'appearance.density');
      }
      patch.appearance.density = appearance.density;
    }
    if ('reduceMotion' in appearance) patch.appearance.reduceMotion = Boolean(appearance.reduceMotion);
  }
  return patch;
}
