import { cx } from '../../lib/cx';

export interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
  className?: string;
  id?: string;
}

export function Switch({ checked, onChange, label, disabled = false, className, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      className={cx('switch', checked && 'is-on', className)}
      onClick={() => onChange(!checked)}
      disabled={disabled}
    >
      <span className="switch-thumb" aria-hidden="true" />
    </button>
  );
}
