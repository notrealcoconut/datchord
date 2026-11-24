import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';

export interface FieldProps {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  required?: boolean;
  optionalLabel?: string;
  children: ReactNode;
  className?: string;
  labelAction?: ReactNode;
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  optionalLabel,
  children,
  className,
  labelAction,
}: FieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cx('field', error && 'field-invalid', className)}>
      <div className="field-label-row">
        <label className="field-label" htmlFor={id}>
          {label}
          {required && <span className="field-required" aria-hidden="true"> *</span>}
          {!required && optionalLabel && <span className="field-optional">{optionalLabel}</span>}
        </label>
        {labelAction}
      </div>
      {children}
      {hint && !error && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

interface BaseProps {
  label: string;
  hint?: string;
  error?: string | null;
  optionalLabel?: string;
  fieldClassName?: string;
  labelAction?: ReactNode;
}

export interface TextInputProps extends BaseProps, Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  id?: string;
  rightSlot?: ReactNode;
}

export function TextInput({
  label,
  hint,
  error,
  optionalLabel,
  fieldClassName,
  id: providedId,
  className,
  required,
  rightSlot,
  labelAction,
  ...rest
}: TextInputProps) {
  const generated = useId();
  const id = providedId ?? generated;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  const input = (
    <input
      id={id}
      className={cx('input', className)}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      required={required}
      {...rest}
    />
  );
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      className={fieldClassName}
      labelAction={labelAction}
    >
      {rightSlot ? <div className="input-affix">{input}{rightSlot}</div> : input}
    </Field>
  );
}

export interface TextAreaProps extends BaseProps, Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  id?: string;
}

export function TextArea({
  label,
  hint,
  error,
  optionalLabel,
  fieldClassName,
  id: providedId,
  className,
  required,
  labelAction,
  ...rest
}: TextAreaProps) {
  const generated = useId();
  const id = providedId ?? generated;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      className={fieldClassName}
      labelAction={labelAction}
    >
      <textarea
        id={id}
        className={cx('input textarea', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      />
    </Field>
  );
}

export interface SelectInputProps extends BaseProps, Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  id?: string;
}

export function SelectInput({
  label,
  hint,
  error,
  optionalLabel,
  fieldClassName,
  id: providedId,
  className,
  required,
  children,
  labelAction,
  ...rest
}: SelectInputProps) {
  const generated = useId();
  const id = providedId ?? generated;
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <Field
      id={id}
      label={label}
      hint={hint}
      error={error}
      required={required}
      optionalLabel={optionalLabel}
      className={fieldClassName}
      labelAction={labelAction}
    >
      <select
        id={id}
        className={cx('input select', className)}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        required={required}
        {...rest}
      >
        {children}
      </select>
    </Field>
  );
}
