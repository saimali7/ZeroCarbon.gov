import type { ReactNode } from "react";
import { Button } from "./button";

export function Skeleton({ className = "" }: { className?: string }) {
  return <span aria-hidden className={`block animate-pulse rounded bg-line-soft motion-reduce:animate-none ${className}`} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className = "",
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-start gap-3 rounded-card border border-dashed border-line-strong bg-surface px-6 py-8 ${className}`}>
      {icon && <div className="grid size-10 place-items-center rounded-full bg-gold-50 text-gold-700">{icon}</div>}
      <div>
        <p className="text-base font-semibold">{title}</p>
        {description && <p className="mt-1 max-w-[60ch] text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  className = "",
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <div role="alert" className={`flex flex-col items-start gap-3 rounded-card border border-bad-200 bg-bad-50 px-5 py-4 ${className}`}>
      <div>
        <p className="text-[15px] font-semibold text-bad-800">{title}</p>
        <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{message}</p>
      </div>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

/** Inline notice for non-blocking messages inside a card. */
export function Notice({ tone = "gold", children, className = "" }: { tone?: "gold" | "ok" | "bad" | "neutral"; children: ReactNode; className?: string }) {
  const tones = {
    gold: "bg-gold-50 text-gold-900 border-gold-200",
    ok: "bg-ok-50 text-ok-700 border-ok-200",
    bad: "bg-bad-50 text-bad-800 border-bad-200",
    neutral: "bg-sunken text-ink-2 border-line",
  };
  return <div className={`rounded-control border px-3.5 py-2.5 text-sm leading-relaxed ${tones[tone]} ${className}`}>{children}</div>;
}
