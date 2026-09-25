import type { ComponentProps, ReactNode } from "react";

export function Card({ className = "", children, ...rest }: ComponentProps<"section">) {
  return (
    <section className={`rounded-card border border-line bg-surface ${className}`} {...rest}>
      {children}
    </section>
  );
}

/** Card header row: title (h2 by default) with optional description and trailing actions. */
export function CardHeader({
  title,
  description,
  actions,
  as: Heading = "h2",
  id,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  as?: "h2" | "h3";
  id?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-4 ${className}`}>
      <div className="min-w-0">
        <Heading id={id} className="text-base font-semibold leading-snug">
          {title}
        </Heading>
        {description && <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function CardBody({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`px-5 py-4 ${className}`}>{children}</div>;
}

/** Page-level heading block used at the top of each screen. */
export function PageHeading({ title, description, actions }: { title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="max-w-3xl">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
        {description && <p className="mt-2 text-base leading-relaxed text-ink-muted text-pretty">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
