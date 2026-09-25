"use client";

import { useState } from "react";
import { ChartTooltip, Legend, LegendItem, linear, niceTicks, useSvgId, useWidth } from "./c-chart";

export interface StripPeer {
  id: string;
  facility: string;
  operator: string;
  value: number;
}

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });
const textWidth = (s: string, size = 12) => s.length * size * 0.56;

/** Places dots on rows so close values don't overlap (a one-sided beeswarm). */
function stack(xs: { id: string; x: number }[], gap: number) {
  const rows: number[][] = [];
  const out = new Map<string, number>();
  for (const p of [...xs].sort((a, b) => a.x - b.x)) {
    let row = rows.findIndex((r) => r.every((x) => Math.abs(x - p.x) >= gap));
    if (row === -1) row = rows.push([]) - 1;
    rows[row].push(p.x);
    out.set(p.id, row);
  }
  return { rowOf: out, rows: Math.max(rows.length, 1) };
}

/**
 * Horizontal strip plot: peers as neutral dots (hover or focus for details), the peer median,
 * and this facility's reported value with an optional corrected value and arrow.
 */
export function StripPlot({
  peers,
  median,
  self,
  unit,
  axisLabel,
  ariaLabel,
}: {
  peers: StripPeer[];
  median?: number;
  self: { name: string; value: number; corrected?: number };
  unit: string;
  axisLabel: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const arrowId = useSvgId("strip-arrow");
  const [active, setActive] = useState<string | null>(null);
  const narrow = width < 520;
  const m = { left: 12, right: 12 };

  const values = [...peers.map((p) => p.value), self.value, ...(self.corrected !== undefined ? [self.corrected] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max((hi - lo) * 0.08, hi * 0.02, 0.1);
  const ticks = niceTicks(Math.max(0, lo - pad), hi + pad, narrow ? 4 : 7);
  const x = linear([ticks[0], ticks[ticks.length - 1]], [m.left, width - m.right]);

  const { rowOf, rows } = stack(peers.map((p) => ({ id: p.id, x: x(p.value) })), 13);
  const peerLabelY = 38;
  const peerY = 56;
  const peerBottom = peerY + (rows - 1) * 13;
  const selfLabelY = peerBottom + 32;
  const selfY = selfLabelY + 20;
  const hasCorrected = self.corrected !== undefined && Math.abs(self.corrected - self.value) >= 0.05;

  // Value labels under the facility markers; the second one drops a line if they would collide.
  const labels = [{ key: "reported", x: x(self.value), text: `Reported ${fmt(self.value)}` }];
  if (hasCorrected) labels.push({ key: "corrected", x: x(self.corrected!), text: `Corrected ${fmt(self.corrected!)}` });
  const placed = labels.map((l) => {
    const w = textWidth(l.text, 13);
    return { ...l, w, cx: Math.min(Math.max(l.x, m.left + w / 2), width - m.right - w / 2), dy: 0 };
  });
  if (placed.length === 2 && Math.abs(placed[0].cx - placed[1].cx) < (placed[0].w + placed[1].w) / 2 + 8) placed[1].dy = 16;
  const labelsBottom = selfY + 26 + (placed.some((p) => p.dy) ? 16 : 0);
  const axisY = labelsBottom + 12;
  const H = axisY + 42;

  const medianX = median !== undefined ? x(median) : undefined;
  const medianText = median !== undefined ? `Peer median ${fmt(median)}` : "";
  const medianLabelX = medianX !== undefined ? Math.min(Math.max(medianX, m.left + textWidth(medianText) / 2), width - m.right - textWidth(medianText) / 2) : 0;
  const peerMin = Math.min(...peers.map((p) => p.value));
  const peerMax = Math.max(...peers.map((p) => p.value));
  const activePeer = peers.find((p) => p.id === active);

  return (
    <figure className="flex flex-col gap-3">
      <div ref={ref} className="relative w-full">
        <svg role="img" aria-label={ariaLabel} width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block overflow-visible">
          <defs>
            <marker id={arrowId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" fill="var(--color-gold-700)" />
            </marker>
          </defs>

          {peers.length > 1 && (
            <rect x={x(peerMin) - 10} y={peerY - 11} width={x(peerMax) - x(peerMin) + 20} height={peerBottom - peerY + 22} rx="11" fill="var(--color-line-soft)" />
          )}

          {medianX !== undefined && (
            <g>
              <line x1={medianX} x2={medianX} y1={20} y2={axisY} stroke="var(--color-ink-muted)" strokeWidth="1.25" strokeDasharray="4 3" />
              <text x={medianLabelX} y={14} fontSize="12" fontWeight="500" textAnchor="middle" fill="var(--color-ink-2)">
                {medianText}
              </text>
            </g>
          )}

          <text x={m.left} y={peerLabelY - 6} fontSize="12" fill="var(--color-ink-muted)">
            Peers ({peers.length})
          </text>
          {peers.map((p) => {
            const on = p.id === active;
            return (
              <circle
                key={p.id}
                cx={x(p.value)}
                cy={peerY + (rowOf.get(p.id) ?? 0) * 13}
                r={on ? 7 : 6}
                fill={on ? "var(--color-ink)" : "var(--color-ink-faint)"}
                stroke="var(--color-surface)"
                strokeWidth="1.5"
              />
            );
          })}

          <text x={m.left} y={selfLabelY} fontSize="12" fontWeight="600" fill="var(--color-gold-800)">
            {self.name}
          </text>
          {hasCorrected && (
            <line
              x1={x(self.value) + (self.corrected! > self.value ? 10 : -10)}
              x2={x(self.corrected!) + (self.corrected! > self.value ? -11 : 11)}
              y1={selfY}
              y2={selfY}
              stroke="var(--color-gold-700)"
              strokeWidth="1.75"
              markerEnd={`url(#${arrowId})`}
            />
          )}
          {hasCorrected && <circle cx={x(self.corrected!)} cy={selfY} r="7" fill="var(--color-surface)" stroke="var(--color-gold-700)" strokeWidth="2" />}
          <circle cx={x(self.value)} cy={selfY} r="8" fill="var(--color-gold-600)" stroke="var(--color-surface)" strokeWidth="2" />
          {placed.map((l) => (
            <text key={l.key} x={l.cx} y={selfY + 26 + l.dy} fontSize="13" fontWeight={l.key === "reported" ? 600 : 500} textAnchor="middle" fill={l.key === "reported" ? "var(--color-gold-800)" : "var(--color-ink-2)"} className="tabular-nums">
              {l.text}
            </text>
          ))}

          <line x1={m.left} x2={width - m.right} y1={axisY} y2={axisY} stroke="var(--color-line-strong)" />
          {ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} x2={x(t)} y1={axisY} y2={axisY + 4} stroke="var(--color-line-strong)" />
              <text x={x(t)} y={axisY + 18} fontSize="12" textAnchor="middle" fill="var(--color-ink-muted)" className="tabular-nums">
                {fmt(t)}
              </text>
            </g>
          ))}
          <text x={width / 2} y={axisY + 36} fontSize="12" textAnchor="middle" fill="var(--color-ink-muted)">
            {axisLabel}
          </text>
        </svg>

        {peers.map((p) => (
          <button
            key={p.id}
            type="button"
            aria-label={`${p.facility}, ${p.operator}: ${fmt(p.value)} ${unit}`}
            onMouseEnter={() => setActive(p.id)}
            onMouseLeave={() => setActive((a) => (a === p.id ? null : a))}
            onFocus={() => setActive(p.id)}
            onBlur={() => setActive((a) => (a === p.id ? null : a))}
            style={{ left: x(p.value), top: peerY + (rowOf.get(p.id) ?? 0) * 13 }}
            className="absolute size-8 -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
        ))}
        {activePeer && (
          <ChartTooltip x={x(activePeer.value)} y={peerY + (rowOf.get(activePeer.id) ?? 0) * 13 - 14} width={width}>
            <span className="block font-semibold text-ink">{activePeer.facility}</span>
            <span className="block text-ink-muted">{activePeer.operator}</span>
            <span className="mt-1 block font-medium tabular-nums text-ink">
              {fmt(activePeer.value)} {unit}
            </span>
          </ChartTooltip>
        )}
      </div>
      <figcaption>
        <Legend>
          <LegendItem swatch={<circle cx="9" cy="6" r="5" fill="var(--color-ink-faint)" />}>Peer facility</LegendItem>
          {peers.length > 1 && <LegendItem swatch={<rect x="1" y="2" width="16" height="8" rx="4" fill="var(--color-line-soft)" stroke="var(--color-line)" />}>Peer range</LegendItem>}
          {median !== undefined && <LegendItem swatch={<line x1="9" x2="9" y1="0" y2="12" stroke="var(--color-ink-muted)" strokeWidth="1.5" strokeDasharray="3 2" />}>Peer median</LegendItem>}
          <LegendItem swatch={<circle cx="9" cy="6" r="5.5" fill="var(--color-gold-600)" />}>This facility, reported</LegendItem>
          {hasCorrected && <LegendItem swatch={<circle cx="9" cy="6" r="4.5" fill="var(--color-surface)" stroke="var(--color-gold-700)" strokeWidth="2" />}>Corrected for the findings</LegendItem>}
        </Legend>
      </figcaption>
    </figure>
  );
}
