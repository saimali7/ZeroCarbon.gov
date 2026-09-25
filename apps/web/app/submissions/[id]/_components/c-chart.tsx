"use client";

import { CaretRight } from "@phosphor-icons/react";
import type { EvidenceRef, Finding, SubmissionDetail, SubmissionDocument } from "@zerocarbon/shared";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2025-06" → 5 */
export const monthIndex = (month: string) => Number(month.slice(5, 7)) - 1;

/** Tracks the rendered width of an element so SVG charts can draw at 1:1 pixels (text stays legible at any width). */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/** A DOM-safe id for SVG defs (useId output contains characters that break url(#...)). */
export function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}

/** Evenly spaced "nice" ticks covering [min, max]. */
export function niceTicks(min: number, max: number, target = 5): number[] {
  const span = Math.max(max - min, 1e-9);
  const raw = span / Math.max(target, 1);
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 2.5, 5, 10].find((m) => m * pow >= raw) ?? 10) * pow;
  const first = Math.floor(min / step + 1e-9);
  const last = Math.ceil(max / step - 1e-9);
  return Array.from({ length: last - first + 1 }, (_, i) => Number(((first + i) * step).toFixed(10)));
}

/** Linear scale from a numeric domain to a pixel range. */
export function linear([d0, d1]: [number, number], [r0, r1]: [number, number]) {
  return (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0);
}

/** Headline sentence stating what the chart shows. */
export function ChartHeadline({ children, sub, tone = "ink" }: { children: ReactNode; sub?: ReactNode; tone?: "ink" | "bad" | "ok" }) {
  const ink = { ink: "text-ink", bad: "text-bad-800", ok: "text-ok-700" }[tone];
  return (
    <div className="flex flex-col gap-1">
      <p className={`text-[17px] font-semibold leading-snug text-pretty ${ink}`}>{children}</p>
      {sub && <p className="text-sm leading-relaxed text-ink-muted text-pretty">{sub}</p>}
    </div>
  );
}

export function Legend({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <ul className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-ink-2 ${className}`}>{children}</ul>;
}

export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5">
      <svg aria-hidden width="18" height="12" viewBox="0 0 18 12" className="shrink-0">
        {swatch}
      </svg>
      {children}
    </li>
  );
}

export interface TableColumn {
  label: ReactNode;
  numeric?: boolean;
}

/** "Show data table" disclosure with the numbers behind a chart. */
export function DataTable({ caption, columns, rows, label = "Show data table" }: { caption: string; columns: TableColumn[]; rows: ReactNode[][]; label?: string }) {
  return (
    <details className="group">
      <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1.5 rounded-control text-[13px] font-medium text-gold-700 hover:underline [&::-webkit-details-marker]:hidden">
        <CaretRight size={14} weight="bold" aria-hidden className="transition-transform duration-150 group-open:rotate-90" />
        {label}
      </summary>
      <div className="mt-2 overflow-x-auto rounded-control border border-line">
        <table className="w-full min-w-[28rem] text-[13px] tabular-nums">
          <caption className="sr-only">{caption}</caption>
          <thead className="bg-sunken text-ink-muted">
            <tr>
              {columns.map((c, i) => (
                <th key={i} scope="col" className={`whitespace-nowrap border-b border-line px-3 py-2 font-medium ${c.numeric ? "text-right" : "text-left"}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-line-soft last:border-0">
                {row.map((cell, i) =>
                  i === 0 ? (
                    <th key={i} scope="row" className="whitespace-nowrap px-3 py-1.5 text-left font-medium text-ink">
                      {cell}
                    </th>
                  ) : (
                    <td key={i} className={`px-3 py-1.5 text-ink-2 ${columns[i]?.numeric ? "text-right" : "text-left"}`}>
                      {cell}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/** Findings that cite a document, keyed by document id. */
export function citationsByDocument(findings: Finding[]) {
  const map = new Map<string, Set<string>>();
  for (const f of findings) for (const e of f.evidence) map.set(e.documentId, (map.get(e.documentId) ?? new Set()).add(f.id));
  return map;
}

export function findDocument(detail: SubmissionDetail, kind: SubmissionDocument["kind"], id?: string) {
  return detail.documents.find((d) => d.id === id) ?? detail.documents.find((d) => d.kind === kind);
}

/** Drops duplicate evidence refs (same document and locator). */
export function uniqueRefs(refs: EvidenceRef[]) {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.documentId}|${r.locator}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Floating tooltip positioned inside a relative container, clamped to its width. */
export function ChartTooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const w = 220;
  const left = Math.min(Math.max(x - w / 2, 0), Math.max(width - w, 0));
  return (
    <div
      role="tooltip"
      style={{ left, top: y, width: w }}
      className="pointer-events-none absolute z-20 -translate-y-full rounded-control border border-line bg-surface px-3 py-2 text-[13px] leading-snug shadow-overlay"
    >
      {children}
    </div>
  );
}
