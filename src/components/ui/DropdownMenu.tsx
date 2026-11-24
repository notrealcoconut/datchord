import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../../lib/cx';

export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
}

export interface MenuTriggerProps {
  ref: (node: HTMLButtonElement | null) => void;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  'aria-haspopup': 'menu';
  'aria-expanded': boolean;
  'aria-controls': string;
}

export interface DropdownMenuProps {
  label: string;
  renderTrigger: (props: MenuTriggerProps) => ReactNode;
  items: MenuItem[];
  align?: 'start' | 'end';
  className?: string;
  menuClassName?: string;
}

export function DropdownMenu({
  label,
  renderTrigger,
  items,
  align = 'end',
  className,
  menuClassName,
}: DropdownMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; minWidth: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId().replace(/:/g, '');

  useLayoutEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    const update = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const rect = trigger.getBoundingClientRect();
      const width = menu.offsetWidth || 224;
      const height = menu.offsetHeight || 0;
      const isRtl = document.documentElement.dir === 'rtl';
      let left = align === 'start' ? rect.left : rect.right - width;
      if (isRtl) left = align === 'start' ? rect.right - width : rect.left;
      left = Math.min(Math.max(8, left), Math.max(8, window.innerWidth - width - 8));
      let top = rect.bottom + 8;
      if (height && top + height > window.innerHeight - 8 && rect.top - height - 8 > 8) {
        top = rect.top - height - 8;
      }
      setPosition({ top, left, minWidth: Math.min(rect.width, 260) });
    };
    update();
    const raf = window.requestAnimationFrame(update);
    const close = () => setOpen(false);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, align]);

  useEffect(() => {
    if (!open || !position) return;
    const timer = window.setTimeout(() => {
      const menu = menuRef.current;
      const first = menu?.querySelector<HTMLButtonElement>('button:not([disabled])');
      first?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open, position]);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menu = menuRef.current;
    if (!menu) return;
    const buttons = Array.from(menu.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    if (buttons.length === 0) return;
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      buttons[(index + 1 + buttons.length) % buttons.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      buttons[(index - 1 + buttons.length) % buttons.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      buttons[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      buttons[buttons.length - 1].focus();
    }
  };

  return (
    <div className={cx('menu-root', className)}>
      {renderTrigger({
        ref: (node) => {
          triggerRef.current = node;
        },
        onClick: (event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        },
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': menuId,
      })}
      {open &&
        createPortal(
          <>
            <div className="menu-scrim" onPointerDown={() => setOpen(false)} />
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label={label}
              className={cx('menu-popover', menuClassName)}
              style={{
                top: position?.top ?? 0,
                left: position?.left ?? 0,
                minWidth: position?.minWidth,
                visibility: position ? 'visible' : 'hidden',
              }}
              onKeyDown={handleMenuKeyDown}
            >
              {items.map((item) => (
                <div key={item.id} className="menu-item-wrap">
                  {item.separatorBefore && <div className="menu-separator" role="separator" />}
                  <button
                    type="button"
                    role="menuitem"
                    className={cx('menu-item', item.danger && 'is-danger')}
                    disabled={item.disabled}
                    onClick={() => {
                      setOpen(false);
                      item.onSelect();
                    }}
                  >
                    {item.icon && <span className="menu-icon" aria-hidden="true">{item.icon}</span>}
                    <span>{item.label}</span>
                  </button>
                </div>
              ))}
            </div>
          </>,
          document.body,
        )}
    </div>
  );
}
