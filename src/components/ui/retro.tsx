"use client";

import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

// Small hand-rolled control kit in the workstation design grammar.
// Beveled, compact, keyboard-reachable. Disabled controls are visibly
// disabled and always explain themselves via `disabledReason`.

function cx(...parts: Array<string | false | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function RetroButton({
  className,
  disabledReason,
  primary,
  children,
  disabled,
  title,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  disabledReason?: string;
  primary?: boolean;
}) {
  return (
    <button
      {...rest}
      disabled={disabled}
      title={disabled && disabledReason ? disabledReason : title}
      className={cx(
        "bevel-out px-3 py-1 text-[12px] select-none",
        primary && "font-bold",
        disabled
          ? "text-ink-dim cursor-not-allowed opacity-70"
          : "cursor-pointer",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function RetroInput({
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...rest}
      className={cx(
        "bevel-in px-2 py-1 text-[12px] outline-none focus:ring-1 focus:ring-accent disabled:opacity-60",
        className,
      )}
    />
  );
}

export function RetroTextarea({
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...rest}
      className={cx(
        "bevel-in px-2 py-1 text-[12px] outline-none focus:ring-1 focus:ring-accent disabled:opacity-60",
        className,
      )}
    />
  );
}

export function RetroSelect({
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cx(
        "bevel-in px-1 py-1 text-[12px] outline-none focus:ring-1 focus:ring-accent disabled:opacity-60",
        className,
      )}
    >
      {children}
    </select>
  );
}

export function RetroCheckbox({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label
      className={cx(
        "flex items-center gap-1.5 text-[12px] select-none",
        rest.disabled ? "text-ink-dim" : "cursor-pointer",
        className,
      )}
    >
      <input type="checkbox" {...rest} className="accent-(--color-accent)" />
      {label}
    </label>
  );
}

export function GroupBox({
  legend,
  children,
  className,
}: {
  legend: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <fieldset className={cx("groupbox px-3 pt-1 pb-2", className)}>
      <legend className="px-1 text-[11px] font-bold tracking-wide uppercase text-ink-dim">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

export function FieldRow({
  label,
  children,
  htmlFor,
}: {
  label: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <label htmlFor={htmlFor} className="w-44 shrink-0 text-[12px]">
        {label}
      </label>
      {children}
    </div>
  );
}

export function TitleBar({
  title,
  right,
  inactive,
}: {
  title: string;
  right?: ReactNode;
  inactive?: boolean;
}) {
  return (
    <div
      className={cx(
        "flex items-center justify-between px-2 py-0.5 text-[12px] font-bold text-titlebar-text",
        inactive ? "bg-titlebar-inactive" : "titlebar-gradient",
      )}
    >
      <span className="truncate">{title}</span>
      {right}
    </div>
  );
}

/** A paneled "window" region of the workbench. */
export function Panel({
  title,
  children,
  className,
  titleRight,
}: {
  title: string;
  children: ReactNode;
  className?: string;
  titleRight?: ReactNode;
}) {
  return (
    <section className={cx("bevel-out flex min-h-0 flex-col p-[3px]", className)}>
      <TitleBar title={title} right={titleRight} />
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}
