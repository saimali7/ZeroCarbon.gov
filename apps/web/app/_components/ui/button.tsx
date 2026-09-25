import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const base =
  "inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-control font-medium transition-[background-color,border-color,color,transform] duration-150 ease-out select-none active:translate-y-px disabled:pointer-events-none disabled:opacity-45 aria-disabled:pointer-events-none aria-disabled:opacity-45";

const variants: Record<Variant, string> = {
  primary: "bg-gold-600 text-white hover:bg-gold-700 active:bg-gold-800",
  secondary: "border border-gold-500 bg-surface text-gold-700 hover:bg-gold-50 active:bg-gold-100",
  ghost: "text-ink-muted hover:bg-line-soft hover:text-ink active:bg-line",
  danger: "border border-bad-200 bg-surface text-bad-700 hover:bg-bad-50 active:bg-bad-100",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px]",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-[15px]",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", className = "") {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

type ButtonProps = ComponentProps<"button"> & {
  variant?: Variant;
  size?: Size;
  /** Shows a busy indicator and blocks clicks while keeping the label. */
  busy?: boolean;
  icon?: ReactNode;
};

export function Button({ variant = "primary", size = "md", busy, icon, className = "", children, disabled, type, ...rest }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={buttonClass(variant, size, className)}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...rest}
    >
      {busy ? <Spinner /> : icon}
      {children}
    </button>
  );
}

type ButtonLinkProps = ComponentProps<typeof Link> & { variant?: Variant; size?: Size; icon?: ReactNode };

export function ButtonLink({ variant = "secondary", size = "md", icon, className = "", children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={buttonClass(variant, size, className)} {...rest}>
      {icon}
      {children}
    </Link>
  );
}

export function Spinner({ className = "size-4" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none ${className}`}
    />
  );
}
