import { useEffect, useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  Eye,
  EyeOff,
  Globe,
  Hash,
  Languages,
  LogIn,
  Moon,
  Send,
  ShieldCheck,
  Sun,
  UserPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ApiError } from '../lib/api';
import { translateError } from '../lib/errors';
import { resolveTheme } from '../lib/theme';
import { useDocumentTitle } from '../lib/hooks';
import { useAuth } from '../contexts/AuthContext';
import { usePreferences } from '../contexts/PreferencesContext';
import { useToast } from '../contexts/ToastContext';
import { LanguageDialog } from '../components/LanguageDialog';
import { Avatar, ServerIcon } from '../components/ui/Avatar';
import { Button, IconButton } from '../components/ui/Button';
import { TextInput } from '../components/ui/Field';
import { Logo } from '../components/ui/Logo';
import { LoadingPane } from '../components/ui/Spinner';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-z0-9_.]{3,24}$/;

interface AuthPageProps {
  mode: 'login' | 'register';
}

export function AuthPage({ mode }: AuthPageProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading, login, register } = useAuth();
  const { appearance, language, setAppearance, setLanguage } = usePreferences();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [username, setUsername] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [languageOpen, setLanguageOpen] = useState(false);

  useDocumentTitle(mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle'));

  const from = (location.state as { from?: string } | null)?.from ?? '/app';
  const resolvedTheme = resolveTheme(appearance.theme);

  useEffect(() => {
    setFieldErrors({});
    setFormError(null);
    setPassword('');
    setConfirmPassword('');
  }, [mode]);

  if (loading) {
    return (
      <div className="auth-loading">
        <LoadingPane label={t('status.loadingApp')} />
      </div>
    );
  }

  if (user) return <Navigate to={from} replace />;

  const clearError = (field: string) => {
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const next = { ...current };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!EMAIL_PATTERN.test(email.trim())) errors.email = t('validation.email');
    if (password.length < 8) errors.password = t('validation.passwordMin');
    if (mode === 'register') {
      if (!displayName.trim() || displayName.trim().length > 40) errors.displayName = t('validation.displayName');
      if (!USERNAME_PATTERN.test(username.trim())) errors.username = t('validation.username');
      if (confirmPassword !== password) errors.confirmPassword = t('validation.passwordMatch');
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setFormError(null);
    if (!validate()) return;
    setBusy(true);
    try {
      if (mode === 'login') {
        const signedIn = await login(email.trim(), password);
        toast.success(t('auth.welcomeToast', { name: signedIn.displayName }));
      } else {
        const created = await register({
          email: email.trim(),
          username: username.trim(),
          displayName: displayName.trim(),
          password,
          language,
        });
        toast.success(t('auth.accountCreatedToast', { name: created.displayName }));
      }
      navigate(from, { replace: true });
    } catch (caught) {
      if (caught instanceof ApiError && caught.field) {
        setFieldErrors((current) => ({ ...current, [caught.field as string]: translateError(t, caught) }));
      } else {
        setFormError(translateError(t, caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const passwordToggle = (
    <IconButton
      label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
      onClick={() => setShowPassword((value) => !value)}
      size="sm"
      type="button"
      className="input-affix-button"
    >
      {showPassword ? <EyeOff className="icon" aria-hidden="true" /> : <Eye className="icon" aria-hidden="true" />}
    </IconButton>
  );

  return (
    <div className="auth-page">
      <section className="auth-visual" aria-label={t('brand.name')}>
        <div className="auth-visual-glow" aria-hidden="true" />
        <div className="auth-visual-top">
          <Logo size={38} withWordmark />
          <span className="chip chip-glass">{t('auth.heroEyebrow')}</span>
        </div>

        <div className="auth-hero">
          <p className="eyebrow">{t('brand.tagline')}</p>
          <h1 className="auth-hero-title">{t('auth.heroTitle')}</h1>
          <p className="auth-hero-subtitle">{t('auth.heroSubtitle')}</p>
        </div>

        <div className="auth-preview" aria-hidden="true">
          <div className="auth-preview-head">
            <ServerIcon name={t('auth.previewServer')} size={38} decorative />
            <div className="auth-preview-server">
              <strong>{t('auth.previewServer')}</strong>
              <span>{t('auth.previewChannel')}</span>
            </div>
            <span className="auth-preview-dots">
              <i />
              <i />
              <i />
            </span>
          </div>
          <div className="auth-preview-messages">
            <div className="auth-preview-message">
              <Avatar name={t('auth.previewAuthor')} size={32} decorative />
              <div>
                <div className="auth-preview-meta">
                  <strong>{t('auth.previewAuthor')}</strong>
                  <time>{t('auth.previewTime')}</time>
                </div>
                <p>{t('auth.previewMessage')}</p>
              </div>
            </div>
            <div className="auth-preview-message">
              <Avatar name={t('auth.previewReplyAuthor')} size={32} decorative />
              <div>
                <div className="auth-preview-meta">
                  <strong>{t('auth.previewReplyAuthor')}</strong>
                  <time>{t('auth.previewTime')}</time>
                </div>
                <p>{t('auth.previewReply')}</p>
              </div>
            </div>
          </div>
          <div className="auth-preview-composer">
            <span>{t('chat.messagePlaceholder', { channel: 'design-lab' })}</span>
            <span className="auth-preview-send">
              <Send className="icon" />
            </span>
          </div>
        </div>

        <div className="auth-features">
          <span className="auth-feature">
            <Hash className="icon" aria-hidden="true" />
            {t('auth.featureChannels')}
          </span>
          <span className="auth-feature">
            <ShieldCheck className="icon" aria-hidden="true" />
            {t('auth.featureRoles')}
          </span>
          <span className="auth-feature">
            <Languages className="icon" aria-hidden="true" />
            {t('auth.featureLanguages')}
          </span>
        </div>

        <p className="auth-visual-footer">{t('brand.footer')}</p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-top">
          <button type="button" className="auth-lang-button" onClick={() => setLanguageOpen(true)}>
            <Globe className="icon" aria-hidden="true" />
            <span>{t(`language.nativeName.${language}`)}</span>
          </button>
          <IconButton
            label={t('auth.toggleTheme')}
            onClick={() => setAppearance({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
            size="md"
          >
            {resolvedTheme === 'dark' ? (
              <Sun className="icon" aria-hidden="true" />
            ) : (
              <Moon className="icon" aria-hidden="true" />
            )}
          </IconButton>
        </div>

        <div className="auth-card">
          <div className="auth-card-brand">
            <Logo size={42} withWordmark />
          </div>
          <header className="auth-card-head">
            <h2>{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h2>
            <p>{mode === 'login' ? t('auth.loginSubtitle') : t('auth.registerSubtitle')}</p>
          </header>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            {formError && (
              <div className="form-alert" role="alert">
                <AlertTriangle className="icon" aria-hidden="true" />
                <span>{formError}</span>
              </div>
            )}

            {mode === 'register' && (
              <>
                <TextInput
                  id="display-name"
                  label={t('auth.displayName')}
                  placeholder={t('auth.displayNamePlaceholder')}
                  value={displayName}
                  onChange={(event) => {
                    setDisplayName(event.target.value);
                    clearError('displayName');
                  }}
                  error={fieldErrors.displayName}
                  autoComplete="name"
                  maxLength={40}
                  required
                  data-autofocus
                />
                <TextInput
                  id="username"
                  label={t('auth.username')}
                  placeholder={t('auth.usernamePlaceholder')}
                  hint={t('auth.usernameHint')}
                  value={username}
                  onChange={(event) => {
                    setUsername(event.target.value.toLowerCase());
                    clearError('username');
                  }}
                  error={fieldErrors.username}
                  autoComplete="username"
                  maxLength={24}
                  spellCheck={false}
                  required
                />
              </>
            )}

            <TextInput
              id="email"
              type="email"
              label={t('auth.email')}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                clearError('email');
              }}
              error={fieldErrors.email}
              autoComplete="email"
              inputMode="email"
              required
              data-autofocus={mode === 'login' ? true : undefined}
            />

            <TextInput
              id="password"
              type={showPassword ? 'text' : 'password'}
              label={t('auth.password')}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                clearError('password');
              }}
              error={fieldErrors.password}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              required
              rightSlot={passwordToggle}
            />

            {mode === 'register' && (
              <TextInput
                id="confirm-password"
                type={showPassword ? 'text' : 'password'}
                label={t('auth.confirmPassword')}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  clearError('confirmPassword');
                }}
                error={fieldErrors.confirmPassword}
                autoComplete="new-password"
                required
                rightSlot={passwordToggle}
              />
            )}

            <Button
              variant="primary"
              size="lg"
              block
              type="submit"
              loading={busy}
              icon={mode === 'login' ? <LogIn className="icon" aria-hidden="true" /> : <UserPlus className="icon" aria-hidden="true" />}
            >
              {mode === 'login'
                ? busy
                  ? t('auth.signingIn')
                  : t('auth.signIn')
                : busy
                  ? t('auth.creatingAccount')
                  : t('auth.createAccount')}
            </Button>
          </form>

          <p className="auth-switch">
            {mode === 'login' ? t('auth.newHere') : t('auth.haveAccount')}{' '}
            <Link to={mode === 'login' ? '/register' : '/login'} state={location.state}>
              {mode === 'login' ? t('auth.createAccountLink') : t('auth.signInLink')}
            </Link>
          </p>
          <p className="auth-terms">{t('auth.termsNote')}</p>
        </div>
      </section>

      <LanguageDialog
        open={languageOpen}
        onClose={() => setLanguageOpen(false)}
        current={language}
        onSelect={(next) => {
          void setLanguage(next);
        }}
      />
    </div>
  );
}
