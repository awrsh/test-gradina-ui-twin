import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';

// ============================================================================
// ModernButton — Crisp elevated / hairline interactive buttons
// ============================================================================
export type ModernButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning';
export type ModernButtonSize = 'xs' | 'sm' | 'md';

interface ModernButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ModernButtonVariant;
  size?: ModernButtonSize;
  active?: boolean;
}

const VARIANT_CLASSES: Record<ModernButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 text-white border border-sky-600/80 shadow-[0_1px_2px_rgba(2,132,199,0.28),inset_0_1px_0_rgba(255,255,255,0.2)]',
  secondary:
    'bg-white hover:bg-slate-50 dark:bg-slate-900 dark:hover:bg-slate-800/90 text-slate-700 dark:text-slate-200 border border-slate-200/95 dark:border-slate-700/90 shadow-[0_1px_2px_rgba(15,23,42,0.05)]',
  ghost:
    'bg-transparent hover:bg-slate-100/90 dark:hover:bg-slate-800/70 text-slate-600 dark:text-slate-300 border border-transparent',
  danger:
    'bg-gradient-to-b from-red-500 to-red-600 hover:from-red-400 hover:to-red-500 text-white border border-red-600/80 shadow-[0_1px_2px_rgba(220,38,38,0.25),inset_0_1px_0_rgba(255,255,255,0.18)]',
  success:
    'bg-gradient-to-b from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white border border-emerald-600/80 shadow-[0_1px_2px_rgba(5,150,105,0.25),inset_0_1px_0_rgba(255,255,255,0.18)]',
  warning:
    'bg-gradient-to-b from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white border border-amber-600/80 shadow-[0_1px_2px_rgba(217,119,6,0.25),inset_0_1px_0_rgba(255,255,255,0.18)]',
};

const SIZE_CLASSES: Record<ModernButtonSize, string> = {
  xs: 'px-2.5 py-1 text-[11px] rounded-lg gap-1',
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-xs rounded-xl gap-2',
};

export const ModernButton: React.FC<ModernButtonProps> = ({
  variant = 'secondary',
  size = 'sm',
  active = false,
  className = '',
  children,
  type = 'button',
  ...rest
}) => {
  const activeRing = active
    ? 'ring-2 ring-sky-500/35 border-sky-500 dark:border-sky-400 text-sky-700 dark:text-sky-300'
    : '';
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center font-medium transition-all duration-150 ease-[cubic-bezier(0.16,1,0.3,1)] active:scale-[0.98] disabled:opacity-45 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/50 whitespace-nowrap shrink-0 cursor-pointer ${VARIANT_CLASSES[variant]} ${SIZE_CLASSES[size]} ${activeRing} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
};

// ============================================================================
// ModernSelect — Portal-rendered floating dropdown (zero native <select>)
// ============================================================================
export interface ModernSelectOption<T extends string = string> {
  value: T;
  label: string;
  hint?: string;
}

interface ModernSelectProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<ModernSelectOption<T>>;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  size?: 'xs' | 'sm';
  disabled?: boolean;
}

export function ModernSelect<T extends string = string>({
  value,
  onChange,
  options,
  placeholder,
  ariaLabel,
  className = '',
  size = 'sm',
  disabled = false,
}: ModernSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    openUp: boolean;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selectedOpt = options.find((o) => o.value === value);

  const updatePosition = () => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const estMenuH = Math.min(240, options.length * 36 + 12);
    const openUp = spaceBelow < estMenuH && rect.top > spaceBelow;
    const width = Math.max(rect.width, 165);
    const maxLeft = window.innerWidth - width - 12;
    const isRtl = document.documentElement.dir === 'rtl';
    const rawLeft = isRtl ? rect.right - width : rect.left;
    const left = Math.max(12, Math.min(maxLeft, rawLeft));

    setCoords({
      top: openUp ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      openUp,
    });
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onDocPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onScrollOrResize = () => updatePosition();

    document.addEventListener('mousedown', onDocPointer);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', onScrollOrResize);
    window.addEventListener('scroll', onScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onScrollOrResize);
      window.removeEventListener('scroll', onScrollOrResize, true);
    };
  }, [open, options.length]);

  const padCls = size === 'xs' ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (!disabled) setOpen((prev) => !prev);
        }}
        className={`w-full inline-flex items-center justify-between gap-2 bg-white dark:bg-slate-900/95 hover:bg-slate-50 dark:hover:bg-slate-800/90 border transition-all duration-150 rounded-lg text-slate-900 dark:text-slate-100 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40 disabled:opacity-50 cursor-pointer ${
          open
            ? 'border-sky-500 ring-2 ring-sky-500/20'
            : 'border-slate-200/95 dark:border-slate-700/90'
        } ${padCls} ${className}`}
      >
        <span className="truncate text-start font-medium">
          {selectedOpt ? selectedOpt.label : placeholder || ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-150 ${
            open ? 'rotate-180 text-sky-600 dark:text-sky-400' : ''
          }`}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              minWidth: coords.width,
              maxWidth: 'min(340px, calc(100vw - 24px))',
              transform: coords.openUp ? 'translateY(-100%)' : 'none',
            }}
            className="z-[90] max-h-60 overflow-y-auto rounded-xl bg-white dark:bg-[#0D1526] border border-slate-200/95 dark:border-slate-700/90 shadow-[0_18px_42px_-10px_rgba(15,23,42,0.28)] dark:shadow-[0_22px_50px_-10px_rgba(2,6,23,0.9)] p-1 space-y-0.5"
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(opt.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-start text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-sky-500/15 text-sky-700 dark:text-sky-300 font-semibold'
                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{opt.label}</div>
                    {opt.hint && (
                      <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                        {opt.hint}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
}

// ============================================================================
// ModernCheckbox — Animated custom checkbox (zero native checkbox)
// ============================================================================
interface ModernCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}

export const ModernCheckbox: React.FC<ModernCheckboxProps> = ({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="w-full flex items-start gap-2.5 text-start group py-1 cursor-pointer disabled:opacity-50 focus-visible:outline-none"
    >
      <span
        className={`mt-0.5 w-4 h-4 rounded-md border flex items-center justify-center shrink-0 transition-all duration-150 ${
          checked
            ? 'bg-sky-600 border-sky-600 text-white shadow-[0_1px_3px_rgba(2,132,199,0.4)]'
            : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 group-hover:border-sky-500/70'
        }`}
      >
        <Check
          className={`w-3 h-3 stroke-[2.5] transition-transform duration-150 ${
            checked ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
          }`}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium text-slate-800 dark:text-slate-200 leading-snug">
          {label}
        </span>
        {description && (
          <span className="block text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
            {description}
          </span>
        )}
      </span>
    </button>
  );
};

// ============================================================================
// ModernSwitch — Animated RTL/LTR-aware toggle switch
// ============================================================================
interface ModernSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
}

export const ModernSwitch: React.FC<ModernSwitchProps> = ({
  checked,
  onChange,
  label,
  title,
  disabled = false,
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl border text-start transition-all duration-150 cursor-pointer disabled:opacity-50 ${
        checked
          ? 'bg-emerald-50/75 dark:bg-emerald-950/35 border-emerald-300/90 dark:border-emerald-700/70'
          : 'bg-slate-50/85 dark:bg-slate-900/75 border-slate-200/90 dark:border-slate-800/90 hover:border-slate-300 dark:hover:border-slate-700'
      }`}
    >
      <span
        className={`text-[11px] font-medium truncate ${
          checked
            ? 'text-emerald-900 dark:text-emerald-200'
            : 'text-slate-600 dark:text-slate-400'
        }`}
      >
        {label}
      </span>

      <span
        dir="ltr"
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full border transition-colors duration-200 ${
          checked
            ? 'bg-emerald-500 border-emerald-600'
            : 'bg-slate-300 dark:bg-slate-700 border-slate-400/50 dark:border-slate-600'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </span>
    </button>
  );
};

// ============================================================================
// ModernSegmented — Clean multi-option segmented switcher
// ============================================================================
interface ModernSegmentedProps<T extends string = string> {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; icon?: React.ReactNode }>;
  className?: string;
}

export function ModernSegmented<T extends string = string>({
  value,
  onChange,
  options,
  className = '',
}: ModernSegmentedProps<T>) {
  return (
    <div
      className={`inline-flex items-center p-0.5 rounded-xl bg-slate-100 dark:bg-slate-900/90 border border-slate-200/90 dark:border-slate-800/90 gap-0.5 ${className}`}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-150 whitespace-nowrap cursor-pointer ${
              active
                ? 'bg-white dark:bg-slate-800 text-sky-700 dark:text-sky-300 shadow-xs border border-slate-200/70 dark:border-slate-700/80 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
            }`}
          >
            {opt.icon}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// ModernInput — Styled numeric / text input with optional unit suffix
// ============================================================================
interface ModernInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  unit?: string;
}

export const ModernInput: React.FC<ModernInputProps> = ({
  label,
  unit,
  className = '',
  ...rest
}) => {
  return (
    <label className="block space-y-1 text-[11px]">
      {label && (
        <span className="block text-slate-600 dark:text-slate-400 font-medium">{label}</span>
      )}
      <div className="relative flex items-center">
        <input
          className={`w-full bg-white dark:bg-slate-900/95 border border-slate-200/95 dark:border-slate-700/90 focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 focus:outline-none rounded-lg px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100 font-mono-tabular transition-all ${
            unit ? 'pe-10' : ''
          } ${className}`}
          {...rest}
        />
        {unit && (
          <span className="pointer-events-none absolute end-2.5 text-[10px] font-mono-tabular text-slate-400 dark:text-slate-500">
            {unit}
          </span>
        )}
      </div>
    </label>
  );
};
