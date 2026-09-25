import type { ReactNode } from "react";
import { formatInt } from "../../_lib/format";

/** "CO₂e" with a real subscript. */
export function Co2e() {
  return (
    <>
      CO<sub className="text-[0.72em]">2</sub>e
    </>
  );
}

/** "274,896 t CO₂e" */
export function Tonnes({ value, unit = true, className = "" }: { value: number | undefined | null; unit?: boolean; className?: string }) {
  return (
    <span className={`tabular-nums ${className}`}>
      {formatInt(value)}
      {unit && value !== undefined && value !== null && (
        <span className="font-normal text-ink-muted">
          {" "}
          t <Co2e />
        </span>
      )}
    </span>
  );
}

/** Labelled figure used in summary strips. */
export function Stat({
  label,
  value,
  sub,
  tone = "default",
  className = "",
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  tone?: "default" | "ok" | "bad" | "gold";
  className?: string;
}) {
  const ink = { default: "text-ink", ok: "text-ok-700", bad: "text-bad-700", gold: "text-gold-700" }[tone];
  return (
    <div className={`flex min-w-0 flex-col gap-1 ${className}`}>
      <span className="text-[13px] text-ink-muted">{label}</span>
      <span className={`text-[22px] font-bold leading-tight tabular-nums tracking-tight ${ink}`}>{value}</span>
      {sub && <span className="text-xs leading-snug text-ink-muted">{sub}</span>}
    </div>
  );
}
