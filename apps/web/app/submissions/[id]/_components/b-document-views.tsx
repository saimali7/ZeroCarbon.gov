"use client";

import { Quotes } from "@phosphor-icons/react";
import type { DocumentTextResponse, EvidenceRef } from "@zerocarbon/shared";
import { useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { Pill } from "../../../_components/ui/pill";
import { Skeleton } from "../../../_components/ui/states";
import { formatInt } from "../../../_lib/format";
import { highlight, phrasesPattern, quotePattern } from "./b-highlight";
import type { ViewKind } from "./b-kinds";

/** Fixed top area (cited text, highlight summary) above a scrollable document body. */
export function ViewFrame({ top, scrollRef, children }: { top?: ReactNode; scrollRef?: RefObject<HTMLDivElement | null>; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      {top && <div className="flex shrink-0 flex-col gap-3 border-b border-line px-5 py-4 sm:px-6">{top}</div>}
      <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto">
        {children}
      </div>
    </div>
  );
}

export function CitedText({ quote, notFound }: { quote: string; notFound?: boolean }) {
  return (
    <figure className="rounded-control border border-gold-200 bg-gold-50 px-4 py-3">
      <figcaption className="flex items-center gap-1.5 text-xs font-semibold text-gold-800">
        <Quotes size={14} weight="fill" aria-hidden />
        Cited text
      </figcaption>
      <blockquote className="mt-1 max-h-36 overflow-y-auto text-[15px] leading-relaxed text-ink">&ldquo;{quote}&rdquo;</blockquote>
      {notFound && <p className="mt-1.5 text-xs text-gold-800">Not found word for word in the extracted text. Check the original file.</p>}
    </figure>
  );
}

export function DocumentSkeleton({ view }: { view: ViewKind }) {
  if (view === "csv") {
    return (
      <div aria-hidden className="flex flex-col gap-2 p-5 sm:px-6">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 12 }, (_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>
    );
  }
  return (
    <div aria-hidden className="flex flex-col gap-2.5 p-5 sm:px-6">
      <Skeleton className="mb-2 h-4 w-32" />
      {[92, 100, 86, 97, 74, 100, 90, 64, 95, 82, 100, 58].map((w, i) => (
        <div key={i} style={{ width: `${w}%` }}>
          <Skeleton className="h-3.5 w-full" />
        </div>
      ))}
    </div>
  );
}

/** Scrolls `container` so that `el` sits `offset` px below its top edge (or centred), without moving the page. */
function scrollWithin(container: HTMLElement | null, el: Element | null | undefined, offset: number | "center") {
  if (!container || !el) return;
  const delta = el.getBoundingClientRect().top - container.getBoundingClientRect().top;
  const pad = offset === "center" ? container.clientHeight / 2 - el.getBoundingClientRect().height / 2 : offset;
  container.scrollTop += delta - pad;
}

type ViewProps = { data: DocumentTextResponse; evidence: EvidenceRef };

export function DocumentView({ view, data, evidence }: ViewProps & { view: ViewKind }) {
  if (view === "pdf") return <PdfView data={data} evidence={evidence} />;
  if (view === "csv") return <CsvView data={data} evidence={evidence} />;
  return <TextView data={data} evidence={evidence} />;
}

function PdfView({ data, evidence }: ViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { pattern, match } = useMemo(() => quotePattern(evidence.quote, data.pages.map((p) => p.text).join("\n")), [data, evidence.quote]);
  const total = data.pages.length;

  useEffect(() => {
    const c = scrollRef.current;
    const page = c?.querySelector(`[data-page="${evidence.page}"]`);
    const mark = page?.querySelector("mark") ?? c?.querySelector("mark");
    if (mark) scrollWithin(c, mark, "center");
    else scrollWithin(c, page, 0);
  }, [evidence.page]);

  return (
    <ViewFrame scrollRef={scrollRef} top={evidence.quote && <CitedText quote={evidence.quote} notFound={match === "none"} />}>
      {data.pages.map((p) => {
        const cited = p.page === evidence.page;
        return (
          <section key={p.page} data-page={p.page} aria-label={`Page ${p.page} of ${total}`} className="border-b border-line last:border-b-0">
            <div className="sticky top-0 z-10 flex h-9 items-center justify-between gap-2 border-b border-line-soft bg-sunken px-5 text-xs font-medium text-ink-muted sm:px-6">
              <span className="tabular-nums">
                Page {p.page} of {total}
              </span>
              {cited && (
                <Pill size="sm" tone="gold">
                  Cited page
                </Pill>
              )}
            </div>
            <p
              className={`whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere] sm:px-6 ${cited ? "shadow-[inset_3px_0_0_var(--color-gold-500)]" : ""}`}
            >
              {highlight(p.text, pattern)}
            </p>
          </section>
        );
      })}
    </ViewFrame>
  );
}

/** Minimal RFC 4180 parser: quoted fields, escaped quotes, CRLF. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      if (row.some((c) => c !== "")) rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c !== "")) rows.push(row);
  return rows;
}

/** "2025-06-01..2025-12-31" matches keys in the (string-ordered) range; "SS-01" matches that key. */
function rowMatcher(rows?: string): ((key: string) => boolean) | null {
  if (!rows?.trim()) return null;
  const [a, b] = rows.split("..").map((s) => s.trim());
  return b === undefined ? (key) => key.trim() === a : (key) => key.trim() >= a && key.trim() <= b;
}

function hitSummary(hits: number[]): string {
  if (hits.length === 1) return `Row ${hits[0]} highlighted`;
  const contiguous = hits[hits.length - 1] - hits[0] === hits.length - 1;
  return contiguous ? `Rows ${hits[0]} to ${hits[hits.length - 1]} highlighted (${formatInt(hits.length)} rows)` : `${formatInt(hits.length)} rows highlighted`;
}

const isNumeric = (v: string) => /^-?[\d,]*\.?\d+$/.test(v.trim());

function CsvView({ data, evidence }: ViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = data.pages.map((p) => p.text).join("\n");
  const { header, body } = useMemo(() => {
    const [first = [], ...rest] = parseCsv(text);
    return { header: first, body: rest };
  }, [text]);
  const { pattern, match } = useMemo(() => quotePattern(evidence.quote, text), [text, evidence.quote]);

  const hits = useMemo(() => {
    const matches = rowMatcher(evidence.rows);
    if (!matches) return new Set<number>();
    const byFirst = body.flatMap((r, i) => (matches(r[0] ?? "") ? [i] : []));
    return new Set(byFirst.length ? byFirst : body.flatMap((r, i) => (r.some(matches) ? [i] : [])));
  }, [body, evidence.rows]);

  const column = /column ([\w-]+)/.exec(evidence.locator)?.[1];
  const columnIndex = column ? header.indexOf(column) : -1;
  const numeric = useMemo(() => header.map((_, j) => body.slice(0, 20).filter((r) => r[j]).every((r) => isNumeric(r[j]))), [header, body]);
  const hitRows = [...hits].map((i) => i + 1);

  useEffect(() => {
    const c = scrollRef.current;
    const head = c?.querySelector("thead")?.getBoundingClientRect().height ?? 0;
    const first = c?.querySelector("tr[data-hit]");
    if (first) scrollWithin(c, first, head + 8);
    else scrollWithin(c, c?.querySelector("mark")?.closest("tr"), head + 8);
  }, [evidence.rows]);

  const summary = evidence.rows ? (hitRows.length ? hitSummary(hitRows) : `No rows match ${evidence.rows}`) : `${formatInt(body.length)} rows`;

  return (
    <ViewFrame
      scrollRef={scrollRef}
      top={
        <>
          {evidence.quote && <CitedText quote={evidence.quote} notFound={match === "none"} />}
          <p className="text-[13px] text-ink-muted">
            <span className={hitRows.length ? "font-medium text-ink" : ""}>{summary}</span>
            {columnIndex >= 0 && (
              <>
                {" "}
                · column <span className="font-mono text-xs text-ink-2">{column}</span>
              </>
            )}
          </p>
        </>
      }
    >
      {header.length === 0 ? (
        <p className="p-6 text-sm text-ink-muted">This file has no rows.</p>
      ) : (
        <table className="w-max min-w-full border-separate border-spacing-0 text-[13px] tabular-nums">
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 top-0 z-20 border-b border-r border-line bg-sunken px-3 py-2 text-right text-xs font-medium text-ink-muted">
                <span className="sr-only">Row</span>#
              </th>
              {header.map((h, j) => (
                <th
                  key={j}
                  scope="col"
                  className={`sticky top-0 z-10 whitespace-nowrap border-b border-line px-3 py-2 font-mono text-xs font-medium ${numeric[j] ? "text-right" : "text-left"} ${
                    j === columnIndex ? "bg-gold-100 text-gold-800" : "bg-sunken text-ink-muted"
                  }`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => {
              const hit = hits.has(i);
              return (
                <tr key={i} data-hit={hit || undefined} className={hit ? "bg-gold-50" : ""}>
                  <td
                    className={`sticky left-0 border-b border-r border-line-soft px-3 py-1.5 text-right text-xs text-ink-muted ${
                      hit ? "bg-gold-100 font-medium text-gold-800 shadow-[inset_3px_0_0_var(--color-gold-500)]" : "bg-surface"
                    }`}
                  >
                    {i + 1}
                  </td>
                  {header.map((_, j) => {
                    const v = r[j] ?? "";
                    return (
                      <td
                        key={j}
                        className={`border-b border-line-soft px-3 py-1.5 align-top ${v.length > 40 ? "min-w-64 max-w-md whitespace-normal" : "whitespace-nowrap"} ${
                          numeric[j] ? "text-right" : ""
                        } ${hit && j === columnIndex ? "font-semibold text-ink" : "text-ink-2"}`}
                      >
                        {highlight(v, pattern)}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </ViewFrame>
  );
}

const normalise = (s: string) => s.toLowerCase().replace(/[_\s]+/g, " ").trim();
const HEADING = /^(#{1,3}\s|sheet\s|={3,}|\[.+\]$)/i;

/** Workbook renderings and other text: monospace, with the cited sheet's section (or lines) highlighted. */
function TextView({ data, evidence }: ViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const text = data.pages.map((p) => p.text).join("\n\n");
  const { pattern: quote, match } = useMemo(() => quotePattern(evidence.quote, text), [text, evidence.quote]);
  const pattern = useMemo(
    () => quote ?? (evidence.quote ? null : phrasesPattern((evidence.rows ?? "").split("..").filter((k) => k.trim().length >= 3))),
    [quote, evidence.quote, evidence.rows],
  );

  const blocks = useMemo(() => {
    const out: { heading: boolean; lines: string[] }[] = [];
    for (const line of text.split("\n")) {
      if (HEADING.test(line) || out.length === 0) out.push({ heading: HEADING.test(line), lines: [line] });
      else out[out.length - 1].lines.push(line);
    }
    return out;
  }, [text]);

  const sheet = evidence.sheet ? normalise(evidence.sheet) : "";
  const citedBlock = sheet ? blocks.findIndex((b) => b.heading && normalise(b.lines[0]).includes(sheet)) : -1;
  const lineHit = (line: string) => citedBlock < 0 && sheet !== "" && normalise(line).includes(sheet);
  const sheetFound = !sheet || citedBlock >= 0 || blocks.some((b) => b.lines.some(lineHit));

  useEffect(() => {
    const c = scrollRef.current;
    const cited = c?.querySelector("[data-cited]");
    const mark = cited?.querySelector("mark") ?? c?.querySelector("mark");
    if (mark) scrollWithin(c, mark, "center");
    else scrollWithin(c, cited, 16);
  }, [evidence.sheet, evidence.quote]);

  return (
    <ViewFrame
      scrollRef={scrollRef}
      top={
        (evidence.quote || !sheetFound) && (
          <>
            {evidence.quote && <CitedText quote={evidence.quote} notFound={match === "none"} />}
            {!sheetFound && (
              <p className="text-[13px] text-ink-muted">
                This text rendering does not separate sheets. The cited sheet is <span className="font-mono text-xs text-ink-2">{evidence.sheet}</span>; open the original
                file to see it in place.
              </p>
            )}
          </>
        )
      }
    >
      <pre className="whitespace-pre-wrap px-5 py-4 font-mono text-[12.5px] leading-relaxed text-ink-2 [overflow-wrap:anywhere] sm:px-6">
        {blocks.map((b, i) => (
          <span
            key={i}
            data-cited={i === citedBlock || undefined}
            className={`block ${i === citedBlock ? "-mx-3 rounded-control bg-gold-50 px-3 shadow-[inset_3px_0_0_var(--color-gold-500)]" : ""}`}
          >
            {b.lines.map((line, j) => (
              <span key={j} data-cited={lineHit(line) || undefined} className={`block min-h-[1lh] ${lineHit(line) ? "bg-gold-100" : ""} ${b.heading && j === 0 ? "font-semibold text-ink" : ""}`}>
                {highlight(line, pattern)}
              </span>
            ))}
          </span>
        ))}
      </pre>
    </ViewFrame>
  );
}
