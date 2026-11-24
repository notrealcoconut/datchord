import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  BellRing,
  Check,
  ChevronRight,
  Globe,
  KeyRound,
  Languages,
  LogOut,
  Mail,
  Monitor,
  Moon,
  Palette,
  Server,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { cx } from '../lib/cx';
import { fieldErrorFor, translateError } from '../lib/errors';
import { formatDate, formatNumber, formatTime } from '../lib/format';
import { resolveTheme } from '../lib/theme';
import {
  notificationPermission,
  notificationsSupported,
  playChime,
  requestNotificationPermission,
  showDesktopNotification,
} from '../lib/notifications';
import { useDocumentTitle } from '../lib/hooks';
import { can } from '../lib/permissions';
import { MANAGE_CHANNELS, MANAGE_MEMBERS, MANAGE_ROLES, MANAGE_SERVER } from '../types';
import type { Appearance, LanguageCode, NotificationLevel, ServerSummary } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { useToast } from '../contexts/ToastContext';
import { ImageUploadDialog } from '../components/ui/ImageUploadDialog';
import { LanguageDialog } from '../components/LanguageDialog';
import { Avatar, ServerIcon } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';
import { EmptyState } from '../components/ui/EmptyState';
import { Switch } from '../components/ui/Switch';
import { Logo } from '../components/ui/Logo';
import { TextArea, TextInput } from '../components/ui/Field';

const SECTION_IDS = ['account', 'profile', 'privacy', 'notifications', 'appearance', 'language', 'servers'] as const;
type SectionId = (typeof SECTION_IDS)[number];

function SettingsCard({
  title,
  description,
  children,
  footer,
  danger,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  danger?: boolean;
}) {
  return (
    <section className={cx('settings-card', danger && 'settings-card-danger')}>
      {(title || description) && (
        <header className="settings-card-head">
          {title && <h2>{title}</h2>}
          {description && <p>{description}</p>}
        </header>
      )}
      <div className="settings-card-body">{children}</div>
      {footer && <footer className="settings-card-footer">{footer}</footer>}
    </section>
  );
}

function SettingRow({
  title,
  description,
  control,
}: {
  title: string;
  description?: string;
  control: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div className="setting-copy">
        <span className="setting-title">{title}</span>
        {description && <span className="setting-description">{description}</span>}
      </div>
      {control}
    </div>
  );
}

function AccountSection() {
  const { t, i18n } = useTranslation();
  const { user, setUser, logout } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [email, setEmail] = useState(user?.email ?? '');
  const [emailPassword, setEmailPassword] = useState('');
  const [emailBusy, setEmailBusy] = useState(false);
  const [emailError, setEmailError] = useState<unknown>(null);
  const [emailFields, setEmailFields] = useState<{ email?: string; currentPassword?: string }>({});

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [passwordError, setPasswordError] = useState<unknown>(null);
  const [passwordFields, setPasswordFields] = useState<Record<string, string | undefined>>({});
  const [signingOut, setSigningOut] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');

  useEffect(() => {
    if (user) setEmail(user.email);
  }, [user]);

  if (!user) return null;

  const handleEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (emailBusy) return;
    const fields: { email?: string; currentPassword?: string } = {};
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fields.email = t('validation.email');
    if (!emailPassword) fields.currentPassword = t('validation.required');
    setEmailFields(fields);
    if (Object.keys(fields).length > 0) return;
    setEmailBusy(true);
    setEmailError(null);
    try {
      const result = await api.me.updateAccount({ email: email.trim(), currentPassword: emailPassword });
      setUser(result.user);
      setEmailPassword('');
      toast.success(t('settings.emailUpdated'));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setEmailFields({
          email: fieldErrorFor(t, caught, 'email') ?? undefined,
          currentPassword: fieldErrorFor(t, caught, 'currentPassword') ?? undefined,
        });
      }
      setEmailError(caught);
    } finally {
      setEmailBusy(false);
    }
  };

  const handlePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (passwordBusy) return;
    const fields: Record<string, string> = {};
    if (!currentPassword) fields.currentPassword = t('validation.required');
    if (newPassword.length < 8) fields.newPassword = t('validation.passwordMin');
    if (confirmPassword !== newPassword) fields.confirmPassword = t('validation.passwordMatch');
    setPasswordFields(fields);
    if (Object.keys(fields).length > 0) return;
    setPasswordBusy(true);
    setPasswordError(null);
    try {
      await api.me.updatePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.success(t('settings.passwordUpdated'));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setPasswordFields({
          currentPassword: fieldErrorFor(t, caught, 'currentPassword') ?? undefined,
          newPassword: fieldErrorFor(t, caught, 'newPassword') ?? undefined,
        });
      }
      setPasswordError(caught);
    } finally {
      setPasswordBusy(false);
    }
  };

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await logout();
      toast.success(t('settings.signedOut'));
      navigate('/login', { replace: true });
    } finally {
      setSigningOut(false);
    }
  };

  const handleDelete = async () => {
    await api.me.deleteAccount(deletePassword);
    setUser(null);
    setDeleteOpen(false);
    toast.success(t('settings.accountDeleted'));
    navigate('/login', { replace: true });
  };

  return (
    <div className="settings-stack">
      <SettingsCard
        title={t('settings.emailLabel')}
        description={t('settings.emailHint')}
        footer={
          <Button type="submit" form="email-form" variant="primary" loading={emailBusy}>
            {emailBusy ? t('settings.updatingEmail') : t('settings.emailUpdate')}
          </Button>
        }
      >
        <form id="email-form" className="form-stack" onSubmit={handleEmail} noValidate>
          <TextInput
            id="account-email"
            type="email"
            label={t('settings.emailLabel')}
            value={email}
            onChange={(event) => {
              setEmail(event.target.value);
              setEmailError(null);
            }}
            error={emailFields.email}
            autoComplete="email"
            required
          />
          <TextInput
            id="email-password"
            type="password"
            label={t('settings.currentPassword')}
            value={emailPassword}
            onChange={(event) => {
              setEmailPassword(event.target.value);
              setEmailError(null);
            }}
            error={emailFields.currentPassword}
            autoComplete="current-password"
            required
          />
          {Boolean(emailError) && !emailFields.email && !emailFields.currentPassword && (
            <p className="form-error" role="alert">
              {translateError(t, emailError)}
            </p>
          )}
        </form>
      </SettingsCard>

      <SettingsCard
        title={t('settings.passwordTitle')}
        description={t('settings.passwordSubtitle')}
        footer={
          <Button type="submit" form="password-form" variant="primary" loading={passwordBusy}>
            {passwordBusy ? t('settings.updatingPassword') : t('settings.updatePassword')}
          </Button>
        }
      >
        <form id="password-form" className="form-stack" onSubmit={handlePassword} noValidate>
          <TextInput
            id="current-password"
            type="password"
            label={t('settings.currentPassword')}
            value={currentPassword}
            onChange={(event) => {
              setCurrentPassword(event.target.value);
              setPasswordError(null);
            }}
            error={passwordFields.currentPassword}
            autoComplete="current-password"
            required
          />
          <TextInput
            id="new-password"
            type="password"
            label={t('settings.newPassword')}
            value={newPassword}
            onChange={(event) => {
              setNewPassword(event.target.value);
              setPasswordError(null);
            }}
            error={passwordFields.newPassword}
            autoComplete="new-password"
            required
          />
          <TextInput
            id="confirm-new-password"
            type="password"
            label={t('settings.confirmNewPassword')}
            value={confirmPassword}
            onChange={(event) => {
              setConfirmPassword(event.target.value);
              setPasswordError(null);
            }}
            error={passwordFields.confirmPassword}
            autoComplete="new-password"
            required
          />
          {Boolean(passwordError) && Object.keys(passwordFields).length === 0 && (
            <p className="form-error" role="alert">
              {translateError(t, passwordError)}
            </p>
          )}
        </form>
      </SettingsCard>

      <SettingsCard>
        <div className="account-meta">
          <span>
            <Mail className="icon" aria-hidden="true" />
            {t('settings.memberSince', {
              date: formatDate(user.createdAt, i18n.language, { month: 'long', year: 'numeric' }),
            })}
          </span>
          <span>
            <KeyRound className="icon" aria-hidden="true" />
            {t('settings.accountId')}: <code>{user.id}</code>
          </span>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.signOutTitle')} description={t('settings.signOutDescription')}>
        <Button
          variant="secondary"
          onClick={handleSignOut}
          loading={signingOut}
          icon={<LogOut className="icon" aria-hidden="true" />}
        >
          {signingOut ? t('settings.signingOut') : t('settings.signOut')}
        </Button>
      </SettingsCard>

      <SettingsCard
        title={t('settings.dangerTitle')}
        description={t('settings.dangerDescription')}
        danger
      >
        <Button
          variant="danger"
          onClick={() => {
            setDeletePassword('');
            setDeleteOpen(true);
          }}
          icon={<Trash2 className="icon" aria-hidden="true" />}
        >
          {t('settings.deleteAccount')}
        </Button>
      </SettingsCard>

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title={t('settings.deleteAccount')}
        body={t('settings.deleteAccountWarning')}
        confirmLabel={t('settings.deleteAccountAction')}
        busyLabel={t('settings.deletingAccount')}
        danger
      >
        <div className="field">
          <label className="field-label" htmlFor="delete-account-password">
            {t('settings.deleteAccountPassword')}
          </label>
          <input
            id="delete-account-password"
            type="password"
            className="input"
            value={deletePassword}
            onChange={(event) => setDeletePassword(event.target.value)}
            autoComplete="current-password"
            data-autofocus
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function ProfileSection() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<Record<string, string | undefined>>({});
  const [imageOpen, setImageOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    setDisplayName(user.displayName);
    setUsername(user.username);
    setBio(user.bio);
  }, [user]);

  if (!user) return null;

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const nextFields: Record<string, string> = {};
    if (!displayName.trim() || displayName.trim().length > 40) nextFields.displayName = t('validation.displayName');
    if (!/^[a-z0-9_.]{3,24}$/.test(username.trim())) nextFields.username = t('validation.username');
    if (bio.length > 190) nextFields.bio = t('validation.bioMax');
    setFields(nextFields);
    if (Object.keys(nextFields).length > 0) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api.me.updateProfile({
        displayName: displayName.trim(),
        username: username.trim(),
        bio,
      });
      setUser(result.user);
      toast.success(t('settings.profileUpdated'));
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFields({
          displayName: fieldErrorFor(t, caught, 'displayName') ?? undefined,
          username: fieldErrorFor(t, caught, 'username') ?? undefined,
          bio: fieldErrorFor(t, caught, 'bio') ?? undefined,
        });
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-stack">
      <SettingsCard title={t('settings.avatarTitle')} description={t('settings.avatarDescription')}>
        <div className="avatar-setting">
          <Avatar name={user.displayName} src={user.avatarUrl} size={88} />
          <div className="avatar-setting-copy">
            <span className="avatar-setting-name">{user.displayName}</span>
            <span className="avatar-setting-handle">@{user.username}</span>
            <Button variant="secondary" size="sm" onClick={() => setImageOpen(true)}>
              {user.avatarUrl ? t('settings.changeAvatar') : t('image.change')}
            </Button>
          </div>
        </div>
      </SettingsCard>

      <SettingsCard
        title={t('settings.profileTitle')}
        description={t('settings.profileSubtitle')}
        footer={
          <Button type="submit" form="profile-form" variant="primary" loading={busy}>
            {busy ? t('common.saving') : t('settings.saveProfile')}
          </Button>
        }
      >
        <form id="profile-form" className="form-stack" onSubmit={handleSubmit} noValidate>
          <TextInput
            id="profile-display-name"
            label={t('settings.displayName')}
            hint={t('settings.displayNameHint')}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setError(null);
            }}
            error={fields.displayName}
            maxLength={40}
            required
          />
          <TextInput
            id="profile-username"
            label={t('settings.username')}
            hint={t('settings.usernameHint')}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value.toLowerCase());
              setError(null);
            }}
            error={fields.username}
            maxLength={24}
            spellCheck={false}
            required
          />
          <TextArea
            id="profile-bio"
            label={t('settings.bio')}
            hint={t('settings.bioHint')}
            placeholder={t('settings.bioPlaceholder')}
            value={bio}
            onChange={(event) => {
              setBio(event.target.value);
              setError(null);
            }}
            error={fields.bio}
            maxLength={190}
            rows={4}
            labelAction={
              <span className="field-counter">{t('settings.charactersLeft', { count: 190 - bio.length })}</span>
            }
          />
          {Boolean(error) && Object.keys(fields).length === 0 && (
            <p className="form-error" role="alert">
              {translateError(t, error)}
            </p>
          )}
        </form>
      </SettingsCard>

      <ImageUploadDialog
        open={imageOpen}
        onClose={() => setImageOpen(false)}
        kind="profile"
        currentUrl={user.avatarUrl}
        name={user.displayName}
        onSave={async (dataUrl) => {
          const result = await api.me.uploadAvatar(dataUrl);
          setUser(result.user);
          toast.success(t('settings.avatarUpdated'));
        }}
        onRemove={async () => {
          const result = await api.me.removeAvatar();
          setUser(result.user);
          toast.success(t('settings.avatarRemoved'));
        }}
      />
    </div>
  );
}

function PrivacySection() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const toast = useToast();

  if (!user) return null;

  const update = async (patch: { showBio?: boolean; showMemberSince?: boolean }) => {
    const previous = user;
    setUser({
      ...user,
      settings: { ...user.settings, privacy: { ...user.settings.privacy, ...patch } },
    });
    try {
      const result = await api.me.updateSettings({ privacy: patch });
      setUser(result.user);
    } catch (error) {
      setUser(previous);
      toast.error(translateError(t, error));
    }
  };

  return (
    <SettingsCard title={t('settings.privacyTitle')} description={t('settings.privacySubtitle')}>
      <div className="setting-list">
        <SettingRow
          title={t('settings.showBio')}
          description={t('settings.showBioDescription')}
          control={
            <Switch
              checked={user.settings.privacy.showBio}
              onChange={(checked) => void update({ showBio: checked })}
              label={t('settings.showBio')}
            />
          }
        />
        <SettingRow
          title={t('settings.showMemberSince')}
          description={t('settings.showMemberSinceDescription')}
          control={
            <Switch
              checked={user.settings.privacy.showMemberSince}
              onChange={(checked) => void update({ showMemberSince: checked })}
              label={t('settings.showMemberSince')}
            />
          }
        />
      </div>
      <p className="form-note">{t('settings.privacyNote')}</p>
    </SettingsCard>
  );
}

function NotificationsSection() {
  const { t } = useTranslation();
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [permission, setPermission] = useState(notificationPermission());
  const [busy, setBusy] = useState(false);

  if (!user) return null;

  const save = async (patch: {
    level?: NotificationLevel;
    sound?: boolean;
    desktop?: boolean;
  }) => {
    const previous = user;
    setUser({
      ...user,
      settings: { ...user.settings, notifications: { ...user.settings.notifications, ...patch } },
    });
    try {
      const result = await api.me.updateSettings({ notifications: patch });
      setUser(result.user);
      toast.success(t('settings.notificationsSaved'));
    } catch (error) {
      setUser(previous);
      toast.error(translateError(t, error));
    }
  };

  const handleDesktop = async (checked: boolean) => {
    if (busy) return;
    if (checked) {
      if (!notificationsSupported()) {
        toast.error(t('settings.browserUnsupported'));
        return;
      }
      let current = notificationPermission();
      if (current === 'denied') {
        toast.error(t('settings.desktopBlocked'));
        return;
      }
      if (current === 'default') {
        setBusy(true);
        current = await requestNotificationPermission();
        setPermission(current);
        setBusy(false);
        if (current !== 'granted') {
          if (current === 'denied') toast.error(t('settings.desktopBlocked'));
          return;
        }
      }
    }
    await save({ desktop: checked });
  };

  const handleTest = async () => {
    if (!notificationsSupported()) {
      toast.error(t('settings.browserUnsupported'));
      return;
    }
    let current = notificationPermission();
    if (current === 'default') {
      current = await requestNotificationPermission();
      setPermission(current);
    }
    if (current !== 'granted') {
      toast.error(t('settings.desktopBlocked'));
      return;
    }
    showDesktopNotification(t('settings.notificationTestTitle'), t('settings.notificationTestBody'));
    toast.success(t('settings.testNotificationSent'));
  };

  const levels: Array<{ value: NotificationLevel; title: string; description: string }> = [
    { value: 'all', title: t('settings.notifyAll'), description: t('settings.notifyAllDescription') },
    {
      value: 'mentions',
      title: t('settings.notifyMentions'),
      description: t('settings.notifyMentionsDescription', { username: user.username }),
    },
    { value: 'none', title: t('settings.notifyNone'), description: t('settings.notifyNoneDescription') },
  ];

  return (
    <div className="settings-stack">
      <SettingsCard title={t('settings.notificationLevel')}>
        <div className="radio-card-list" role="radiogroup" aria-label={t('settings.notificationLevel')}>
          {levels.map((level) => (
            <label
              key={level.value}
              className={cx('radio-card', user.settings.notifications.level === level.value && 'is-selected')}
            >
              <input
                type="radio"
                name="notification-level"
                value={level.value}
                checked={user.settings.notifications.level === level.value}
                onChange={() => void save({ level: level.value })}
              />
              <span className="radio-card-copy">
                <span className="radio-card-title">{level.title}</span>
                <span className="radio-card-description">{level.description}</span>
              </span>
              <span className="radio-card-check" aria-hidden="true">
                {user.settings.notifications.level === level.value && <Check className="icon" />}
              </span>
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard>
        <div className="setting-list">
          <SettingRow
            title={t('settings.sound')}
            description={t('settings.soundDescription')}
            control={
              <Switch
                checked={user.settings.notifications.sound}
                onChange={(checked) => {
                  if (checked) playChime();
                  void save({ sound: checked });
                }}
                label={t('settings.sound')}
              />
            }
          />
          <SettingRow
            title={t('settings.desktop')}
            description={
              permission === 'denied'
                ? t('settings.desktopBlocked')
                : permission === 'unsupported'
                  ? t('settings.browserUnsupported')
                  : t('settings.desktopDescription')
            }
            control={
              <Switch
                checked={user.settings.notifications.desktop}
                onChange={(checked) => void handleDesktop(checked)}
                label={t('settings.desktop')}
                disabled={permission === 'denied' || permission === 'unsupported' || busy}
              />
            }
          />
        </div>
        <div className="settings-inline-action">
          <Button
            variant="secondary"
            size="sm"
            onClick={handleTest}
            icon={<BellRing className="icon" aria-hidden="true" />}
            disabled={permission === 'unsupported'}
          >
            {t('settings.testNotification')}
          </Button>
        </div>
      </SettingsCard>
    </div>
  );
}

const ACCENTS: Array<{ value: Appearance['accent']; color: string; label: string }> = [
  { value: 'tangerine', color: '#ff6f4e', label: 'settings.accentTangerine' },
  { value: 'mint', color: '#2fb99a', label: 'settings.accentMint' },
  { value: 'iris', color: '#8b7cf6', label: 'settings.accentIris' },
  { value: 'rose', color: '#f2779a', label: 'settings.accentRose' },
];

function AppearanceSection() {
  const { t } = useTranslation();
  const { appearance, setAppearance } = usePreferences();
  const { user, setUser } = useAuth();
  const toast = useToast();

  const update = async (patch: Partial<Appearance>) => {
    const previous = appearance;
    setAppearance(patch);
    try {
      const result = await api.me.updateSettings({ appearance: patch });
      setUser(result.user);
    } catch (error) {
      setAppearance(previous);
      toast.error(translateError(t, error));
    }
  };

  const themes: Array<{ value: Appearance['theme']; icon: ReactNode; title: string; description: string }> = [
    {
      value: 'light',
      icon: <Sun className="icon" aria-hidden="true" />,
      title: t('settings.themeLight'),
      description: t('settings.themeLightDescription'),
    },
    {
      value: 'dark',
      icon: <Moon className="icon" aria-hidden="true" />,
      title: t('settings.themeDark'),
      description: t('settings.themeDarkDescription'),
    },
    {
      value: 'system',
      icon: <Monitor className="icon" aria-hidden="true" />,
      title: t('settings.themeSystem'),
      description: t('settings.themeSystemDescription'),
    },
  ];

  return (
    <div className="settings-stack">
      <SettingsCard title={t('settings.theme')} description={t('settings.appearanceSubtitle')}>
        <div className="theme-grid" role="radiogroup" aria-label={t('settings.theme')}>
          {themes.map((theme) => (
            <label key={theme.value} className={cx('theme-card', appearance.theme === theme.value && 'is-selected')}>
              <input
                type="radio"
                name="theme"
                value={theme.value}
                checked={appearance.theme === theme.value}
                onChange={() => void update({ theme: theme.value })}
              />
              <span className={`theme-swatch theme-swatch-${theme.value}`} aria-hidden="true">
                {theme.icon}
              </span>
              <span className="theme-card-copy">
                <span className="theme-card-title">{theme.title}</span>
                <span className="theme-card-description">{theme.description}</span>
              </span>
              {appearance.theme === theme.value && <Check className="icon theme-check" aria-hidden="true" />}
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.accent')}>
        <div className="accent-grid" role="radiogroup" aria-label={t('settings.accent')}>
          {ACCENTS.map((accent) => (
            <label
              key={accent.value}
              className={cx('accent-card', appearance.accent === accent.value && 'is-selected')}
            >
              <input
                type="radio"
                name="accent"
                value={accent.value}
                checked={appearance.accent === accent.value}
                onChange={() => void update({ accent: accent.value })}
              />
              <span className="accent-dot" style={{ background: accent.color }} aria-hidden="true" />
              <span>{t(accent.label)}</span>
              {appearance.accent === accent.value && <Check className="icon" aria-hidden="true" />}
            </label>
          ))}
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.density')}>
        <div className="density-grid" role="radiogroup" aria-label={t('settings.density')}>
          {(
            [
              { value: 'cozy', title: t('settings.densityCozy'), description: t('settings.densityCozyDescription') },
              {
                value: 'compact',
                title: t('settings.densityCompact'),
                description: t('settings.densityCompactDescription'),
              },
            ] as const
          ).map((density) => (
            <label
              key={density.value}
              className={cx('density-card', appearance.density === density.value && 'is-selected')}
            >
              <input
                type="radio"
                name="density"
                value={density.value}
                checked={appearance.density === density.value}
                onChange={() => void update({ density: density.value })}
              />
              <span className="density-preview" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span className="density-copy">
                <span className="density-title">{density.title}</span>
                <span className="density-description">{density.description}</span>
              </span>
            </label>
          ))}
        </div>
        <SettingRow
          title={t('settings.reduceMotion')}
          description={t('settings.reduceMotionDescription')}
          control={
            <Switch
              checked={appearance.reduceMotion}
              onChange={(checked) => void update({ reduceMotion: checked })}
              label={t('settings.reduceMotion')}
            />
          }
        />
      </SettingsCard>

      <SettingsCard title={t('settings.preview')}>
        <div className="appearance-preview">
          <div className="appearance-preview-head">
            <span className="appearance-preview-dot" aria-hidden="true" />
            <span>{t('settings.previewChannel')}</span>
          </div>
          <div className="appearance-preview-message">
            <Avatar name={user?.displayName ?? 'Datchord'} src={user?.avatarUrl} size={34} />
            <div>
              <span className="appearance-preview-author">{user?.displayName ?? 'Datchord'}</span>
              <p>{t('settings.previewMessage')}</p>
            </div>
          </div>
          <div className="appearance-preview-composer">{t('chat.messagePlaceholder', { channel: 'design-lab' })}</div>
        </div>
        <p className="form-note">{t('settings.autoSaved')}</p>
      </SettingsCard>
    </div>
  );
}

function LanguageSection() {
  const { t } = useTranslation();
  const { language, setLanguage } = usePreferences();
  const { setUser } = useAuth();
  const toast = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const now = new Date().toISOString();

  const selectLanguage = async (next: LanguageCode) => {
    const previous = language;
    await setLanguage(next);
    try {
      const result = await api.me.updateSettings({}, next);
      setUser(result.user);
      toast.success(t('settings.languageUpdated'));
    } catch (error) {
      await setLanguage(previous);
      toast.error(translateError(t, error));
    }
  };

  return (
    <div className="settings-stack">
      <SettingsCard title={t('settings.currentLanguage')} description={t('settings.languageSubtitle')}>
        <div className="current-language">
          <span className="language-badge language-badge-lg" aria-hidden="true">
            {language === 'pt-BR' ? 'PT' : language.toUpperCase()}
          </span>
          <div className="current-language-copy">
            <span className="current-language-name" lang={language} dir={language === 'ar' ? 'rtl' : 'ltr'}>
              {t(`language.nativeName.${language}`)}
            </span>
            <span className="current-language-english">{t(`language.englishName.${language}`)}</span>
          </div>
          {language === 'ar' && <span className="chip chip-quiet">{t('language.rtlBadge')}</span>}
          <Button variant="secondary" onClick={() => setDialogOpen(true)} icon={<Globe className="icon" aria-hidden="true" />}>
            {t('settings.changeLanguage')}
          </Button>
        </div>
      </SettingsCard>

      <SettingsCard title={t('settings.formatPreview')}>
        <div className="format-preview">
          <div>
            <span className="format-label">{t('settings.datePreview')}</span>
            <strong>{formatDate(now, language, { dateStyle: 'long' })}</strong>
          </div>
          <div>
            <span className="format-label">{t('settings.timePreview')}</span>
            <strong>{formatTime(now, language)}</strong>
          </div>
          <div>
            <span className="format-label">{t('settings.numberPreview')}</span>
            <strong>{formatNumber(1234567.89, language)}</strong>
          </div>
          <div>
            <span className="format-label">{t('settings.pluralPreview')}</span>
            <strong>{t('common.memberCount', { count: 3 })}</strong>
          </div>
        </div>
        <p className="form-note">{t('settings.missingFallback')}</p>
      </SettingsCard>

      {language === 'ar' && (
        <SettingsCard title={t('settings.rtl')}>
          <p className="settings-paragraph">{t('settings.rtlNote')}</p>
        </SettingsCard>
      )}

      <LanguageDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        current={language}
        onSelect={(next) => void selectLanguage(next)}
      />
    </div>
  );
}

function settingsTabForSummary(server: ServerSummary): string {
  if (server.isOwner || can(server.permissions, MANAGE_SERVER)) return 'overview';
  if (can(server.permissions, MANAGE_ROLES)) return 'roles';
  if (can(server.permissions, MANAGE_MEMBERS)) return 'members';
  if (can(server.permissions, MANAGE_CHANNELS)) return 'channels';
  return 'danger';
}

function ServersSection() {
  const { t } = useTranslation();
  const { servers } = useAuth();
  const navigate = useNavigate();
  const manageable = servers.filter(
    (server) =>
      server.isOwner ||
      can(server.permissions, MANAGE_SERVER) ||
      can(server.permissions, MANAGE_ROLES) ||
      can(server.permissions, MANAGE_MEMBERS) ||
      can(server.permissions, MANAGE_CHANNELS),
  );

  if (manageable.length === 0) {
    return (
      <EmptyState
        icon={<Server className="icon" />}
        title={t('settings.noManageableServers')}
        body={t('settings.noManageableServersBody')}
      />
    );
  }

  return (
    <div className="manage-server-list">
      {manageable.map((server) => (
        <button
          key={server.id}
          type="button"
          className="manage-server-card"
          onClick={() => navigate(`/servers/${server.id}/settings/${settingsTabForSummary(server)}`)}
        >
          <ServerIcon name={server.name} src={server.iconUrl} size={46} />
          <span className="manage-server-copy">
            <span className="manage-server-name">{server.name}</span>
            <span className="manage-server-meta">
              {server.isOwner ? t('settings.ownerLabel') : t('settings.managerLabel')}
              {' · '}
              {t('common.memberCount', { count: server.memberCount })}
            </span>
          </span>
          <span className="manage-server-action">
            {t('settings.manageServer', { name: server.name })}
            <ChevronRight className="icon icon-directional" aria-hidden="true" />
          </span>
        </button>
      ))}
      <p className="form-note">{t('settings.serverSettingsSubtitle')}</p>
    </div>
  );
}

export function UserSettingsPage() {
  const { t } = useTranslation();
  const { section } = useParams();
  const { user } = useAuth();
  const { appearance, setAppearance } = usePreferences();
  const navigate = useNavigate();
  const resolvedTheme = resolveTheme(appearance.theme);
  useDocumentTitle(t('settings.title'));

  if (!section || !SECTION_IDS.includes(section as SectionId)) {
    return <Navigate to="/settings/profile" replace />;
  }
  if (!user) return null;

  const sections: Array<{ id: SectionId; icon: ReactNode; label: string; description: string }> = [
    {
      id: 'account',
      icon: <KeyRound className="icon" aria-hidden="true" />,
      label: t('settings.account'),
      description: t('settings.accountDescription'),
    },
    {
      id: 'profile',
      icon: <UserRound className="icon" aria-hidden="true" />,
      label: t('settings.profile'),
      description: t('settings.profileDescription'),
    },
    {
      id: 'privacy',
      icon: <ShieldCheck className="icon" aria-hidden="true" />,
      label: t('settings.privacy'),
      description: t('settings.privacyDescription'),
    },
    {
      id: 'notifications',
      icon: <Bell className="icon" aria-hidden="true" />,
      label: t('settings.notifications'),
      description: t('settings.notificationsDescription'),
    },
    {
      id: 'appearance',
      icon: <Palette className="icon" aria-hidden="true" />,
      label: t('settings.appearance'),
      description: t('settings.appearanceDescription'),
    },
    {
      id: 'language',
      icon: <Languages className="icon" aria-hidden="true" />,
      label: t('settings.language'),
      description: t('settings.languageDescription'),
    },
    {
      id: 'servers',
      icon: <Server className="icon" aria-hidden="true" />,
      label: t('settings.serverSettings'),
      description: t('settings.serverSettingsDescription'),
    },
  ];

  const active = sections.find((item) => item.id === section) ?? sections[1];

  return (
    <div className="settings-shell">
      <header className="settings-topbar">
        <button type="button" className="settings-back" onClick={() => navigate('/app')}>
          <ArrowLeft className="icon icon-directional" aria-hidden="true" />
          <span>{t('settings.backToApp')}</span>
        </button>
        <Link to="/app" className="settings-brand" aria-label={t('brand.name')}>
          <Logo size={32} withWordmark />
        </Link>
        <div className="settings-top-actions">
          <IconButton
            label={t('auth.toggleTheme')}
            onClick={() => setAppearance({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="icon" aria-hidden="true" />
            ) : (
              <Moon className="icon" aria-hidden="true" />
            )}
          </IconButton>
          <Avatar name={user.displayName} src={user.avatarUrl} size={32} />
        </div>
      </header>

      <div className="settings-layout">
        <aside className="settings-nav">
          <div className="settings-profile-card">
            <Avatar name={user.displayName} src={user.avatarUrl} size={54} />
            <div>
              <span className="settings-profile-name">{user.displayName}</span>
              <span className="settings-profile-handle">@{user.username}</span>
            </div>
          </div>
          <nav aria-label={t('settings.title')}>
            {sections.map((item) => (
              <Link
                key={item.id}
                to={`/settings/${item.id}`}
                className={cx('settings-nav-item', item.id === active.id && 'is-active')}
                aria-current={item.id === active.id ? 'page' : undefined}
              >
                <span className="settings-nav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                <span className="settings-nav-copy">
                  <span className="settings-nav-label">{item.label}</span>
                  <span className="settings-nav-description">{item.description}</span>
                </span>
              </Link>
            ))}
          </nav>
        </aside>

        <main className="settings-main">
          <header className="settings-main-head">
            <h1>{active.label}</h1>
            <p>{active.description}</p>
          </header>
          {active.id === 'account' && <AccountSection />}
          {active.id === 'profile' && <ProfileSection />}
          {active.id === 'privacy' && <PrivacySection />}
          {active.id === 'notifications' && <NotificationsSection />}
          {active.id === 'appearance' && <AppearanceSection />}
          {active.id === 'language' && <LanguageSection />}
          {active.id === 'servers' && <ServersSection />}
        </main>
      </div>
    </div>
  );
}
