import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { api, ApiError } from '../lib/api';
import { fieldErrorFor, translateError } from '../lib/errors';
import { PERMISSION_LIST, canGrantPermissions } from '../lib/permissions';
import { useToast } from '../contexts/ToastContext';
import { ADMINISTRATOR } from '../types';
import type { Role, ServerDetail } from '../types';
import { Button } from './ui/Button';
import { TextInput } from './ui/Field';
import { Modal } from './ui/Modal';

const COLORS = ['#ff7a59', '#ffb56b', '#8bf0cf', '#42c8a7', '#a78bfa', '#f2779a', '#7dd3fc', '#fcd34d', '#9aa3b5'];

export interface RoleDialogProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  detail: ServerDetail;
  role?: Role | null;
  onSaved: (role: Role) => void;
}

export function RoleDialog({ open, onClose, serverId, detail, role, onSaved }: RoleDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const editing = Boolean(role);
  const isDefault = Boolean(role?.isDefault);
  const [name, setName] = useState('');
  const [color, setColor] = useState(COLORS[0]);
  const [permissions, setPermissions] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<{ name?: string; color?: string }>({});

  useEffect(() => {
    if (open) {
      setName(role?.isDefault ? t('roles.defaultName') : role?.name ?? '');
      setColor(role?.color ?? COLORS[0]);
      setPermissions(role?.permissions ?? 0);
      setBusy(false);
      setError(null);
      setFieldErrors({});
    }
  }, [open, role, t]);

  const grantable = useMemo(() => {
    const set = new Set<number>();
    for (const permission of PERMISSION_LIST) {
      if (canGrantPermissions(detail, permission.bit)) set.add(permission.bit);
    }
    return set;
  }, [detail]);

  const togglePermission = (bit: number) => {
    if (!grantable.has(bit)) return;
    setPermissions((current) => (current & bit ? current & ~bit : current | bit));
  };

  const risky = (permissions & (4 | 8)) !== 0;
  const hasAdministrator = (permissions & ADMINISTRATOR) === ADMINISTRATOR;

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (busy) return;
    if (!isDefault) {
      const errors: { name?: string } = {};
      if (!name.trim() || name.trim().length > 32) errors.name = t('validation.roleName');
      setFieldErrors(errors);
      if (Object.keys(errors).length > 0) return;
    }

    setBusy(true);
    setError(null);
    try {
      let saved: Role;
      if (editing && role) {
        const payload = isDefault
          ? { permissions }
          : { name: name.trim(), color, permissions };
        const result = await api.roles.update(serverId, role.id, payload);
        saved = result.role;
        toast.success(t('servers.roleUpdatedToast'));
      } else {
        const result = await api.roles.create(serverId, { name: name.trim(), color, permissions });
        saved = result.role;
        toast.success(t('servers.roleCreatedToast'));
      }
      onSaved(saved);
      onClose();
    } catch (caught) {
      if (caught instanceof ApiError) {
        setFieldErrors({
          name: fieldErrorFor(t, caught, 'name') ?? undefined,
          color: fieldErrorFor(t, caught, 'color') ?? undefined,
        });
      }
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        editing && role
          ? isDefault
            ? t('roles.defaultName')
            : t('servers.roleEditTitle', { name: role.name })
          : t('servers.roleCreateTitle')
      }
      description={editing ? t('servers.roleEditSubtitle') : t('servers.roleCreateSubtitle')}
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button
            variant="primary"
            type="submit"
            form="role-form"
            loading={busy}
            icon={<ShieldCheck className="icon" aria-hidden="true" />}
          >
            {busy ? t('common.saving') : t('servers.roleSave')}
          </Button>
        </>
      }
    >
      <form id="role-form" className="form-stack" onSubmit={handleSubmit}>
        {isDefault && (
          <p className="form-note">
            <ShieldCheck className="icon" aria-hidden="true" />
            {t('servers.roleDefaultNote')}
          </p>
        )}
        {!isDefault && (
          <div className="role-identity-grid">
            <TextInput
              id="role-name"
              label={t('servers.roleName')}
              placeholder={t('servers.roleNamePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
              error={fieldErrors.name}
              maxLength={32}
              required
              data-autofocus
              disabled={busy}
            />
            <div className="field">
              <span className="field-label">{t('servers.roleColor')}</span>
              <div className="color-picker-row">
                <input
                  type="color"
                  className="color-input"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                  aria-label={t('servers.roleColor')}
                  disabled={busy}
                />
                <code className="color-value">{color}</code>
              </div>
              <div className="color-swatches" role="group" aria-label={t('servers.roleColor')}>
                {COLORS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="color-swatch"
                    style={{ background: preset }}
                    aria-label={t('a11y.roleColor', { color: preset })}
                    aria-pressed={color === preset}
                    onClick={() => setColor(preset)}
                    disabled={busy}
                  />
                ))}
              </div>
              {fieldErrors.color && <p className="field-error">{fieldErrors.color}</p>}
            </div>
          </div>
        )}

        <div className="field">
          <span className="field-label">{t('servers.rolePermissions')}</span>
          <p className="field-hint">{t('servers.rolePermissionsHint')}</p>
          <div className="permission-list">
            {PERMISSION_LIST.map((permission) => {
              const checked = (permissions & permission.bit) === permission.bit;
              const disabled = !grantable.has(permission.bit) || busy;
              return (
                <label
                  key={permission.key}
                  className={`permission-row${disabled ? ' is-disabled' : ''}`}
                  title={disabled ? t('servers.roleCannotGrant') : undefined}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(permission.bit)}
                    disabled={disabled}
                  />
                  <span className="permission-copy">
                    <span className="permission-name">{t(`roles.${permission.key}`)}</span>
                    <span className="permission-description">{t(`roles.${permission.key}Desc`)}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </div>

        {hasAdministrator && <p className="form-warning">{t('servers.roleAdminWarning')}</p>}
        {risky && <p className="form-warning">{t('servers.roleGrantWarning')}</p>}
        {Boolean(error) && !fieldErrors.name && !fieldErrors.color && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}

export interface MemberRolesDialogProps {
  open: boolean;
  onClose: () => void;
  serverId: string;
  detail: ServerDetail;
  memberId: string | null;
  onSaved: () => void;
}

export function MemberRolesDialog({ open, onClose, serverId, detail, memberId, onSaved }: MemberRolesDialogProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const member = detail.members.find((item) => item.id === memberId) ?? null;
  const defaultRole = detail.roles.find((role) => role.isDefault) ?? null;
  const assignable = detail.roles
    .filter((role) => !role.isDefault)
    .filter((role) => {
      if (!canGrantPermissions(detail, role.permissions)) return false;
      if (detail.isOwner) return true;
      return role.position < (detail.myHighestPosition ?? 0);
    })
    .sort((a, b) => b.position - a.position);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open && member) {
      setSelected(member.roleIds.filter((id) => id !== defaultRole?.id));
      setBusy(false);
      setError(null);
    }
  }, [open, member, defaultRole?.id]);

  const toggle = (roleId: string) => {
    setSelected((current) =>
      current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId],
    );
  };

  const handleSubmit = async (event?: FormEvent) => {
    event?.preventDefault();
    if (!member || busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.members.setRoles(serverId, member.id, selected);
      toast.success(t('servers.rolesAssigned'));
      onSaved();
      onClose();
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t('servers.manageRolesTitle', { name: member?.displayName ?? '' })}
      description={t('servers.manageRolesSubtitle')}
      size="sm"
      dismissible={!busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            {t('common.cancel')}
          </Button>
          <Button variant="primary" type="submit" form="member-roles-form" loading={busy}>
            {busy ? t('common.saving') : t('servers.assignRoles')}
          </Button>
        </>
      }
    >
      <form id="member-roles-form" className="form-stack" onSubmit={handleSubmit}>
        {defaultRole && (
          <div className="locked-role">
            <span className="role-dot" style={{ background: defaultRole.color }} aria-hidden="true" />
            <span>{t('roles.defaultName')}</span>
            <span className="chip chip-quiet">{t('common.required')}</span>
          </div>
        )}
        {assignable.length === 0 ? (
          <p className="form-note">{t('servers.noAssignableRoles')}</p>
        ) : (
          <div className="permission-list">
            {assignable.map((role) => {
              const checked = selected.includes(role.id);
              return (
                <label key={role.id} className="permission-row role-check-row">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(role.id)}
                    disabled={busy}
                  />
                  <span className="role-dot" style={{ background: role.color }} aria-hidden="true" />
                  <span className="permission-copy">
                    <span className="permission-name">{role.name}</span>
                    <span className="permission-description">
                      {t('common.memberCount', { count: role.memberCount })}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {Boolean(error) && (
          <p className="form-error" role="alert">
            {translateError(t, error)}
          </p>
        )}
      </form>
    </Modal>
  );
}
