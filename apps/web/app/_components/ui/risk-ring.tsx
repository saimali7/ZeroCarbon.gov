import type { RiskBand } from "@zerocarbon/shared";
import { RISK_LABEL, riskBandFor } from "../../_lib/format";

const RING_COLOR: Record<RiskBand, string> = {
  low: "var(--color-ok-600)",
  medium: "var(--color-gold-500)",
  high: "var(--color-bad-500)",
  critical: "var(--color-bad-700)",
};

/**
 * Risk score gauge (0-100). `size="lg"` for the review header, `"sm"` for table rows.
 * The arc animates from empty on first paint (disabled under reduced motion).
 */
export function RiskRing({ score, band, size = "lg" }: { score: number; band?: RiskBand; size?: "sm" | "md" | "lg" }) {
  const resolved = band ?? riskBandFor(score);
  const px = size === "lg" ? 128 : size === "md" ? 72 : 40;
  const stroke = size === "lg" ? 12 : size === "md" ? 8 : 5;
  const r = (px - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div
      role="img"
      aria-label={`Risk score ${Math.round(clamped)} out of 100, ${RISK_LABEL[resolved].toLowerCase()}`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: px, height: px }}
    >
      <svg width={px} height={px} viewBox={`0 0 ${px} ${px}`} className="-rotate-90" aria-hidden>
        <circle cx={px / 2} cy={px / 2} r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth={stroke} />
        <circle
          cx={px / 2}
          cy={px / 2}
          r={r}
          fill="none"
          stroke={RING_COLOR[resolved]}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out starting:[stroke-dashoffset:var(--c)]"
          style={{ ["--c" as string]: `${c}` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center leading-none">
        {size === "lg" ? (
          <div>
            <div className="text-[34px] font-bold tabular-nums tracking-tight">{Math.round(clamped)}</div>
            <div className="mt-1 text-xs text-ink-muted">out of 100</div>
          </div>
        ) : (
          <span className={`font-bold tabular-nums ${size === "md" ? "text-xl" : "text-[13px]"}`}>{Math.round(clamped)}</span>
        )}
      </div>
    </div>
  );
}
