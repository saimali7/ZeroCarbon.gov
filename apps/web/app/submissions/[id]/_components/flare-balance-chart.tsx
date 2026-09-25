"use client";

import type { EvidenceData, EvidenceRef, Finding, Review, SubmissionDetail } from "@zerocarbon/shared";
import { Card, CardBody, CardHeader } from "../../../_components/ui/card";
import { EvidenceChip } from "../../../_components/ui/evidence";
import { Stat } from "../../../_components/ui/figures";
import { SeverityPill } from "../../../_components/ui/pill";
import { formatInt, formatPct } from "../../../_lib/format";
import { ChartHeadline, DataTable, Legend, LegendItem, MONTH_LONG, MONTH_SHORT, findDocument, linear, monthIndex, niceTicks, uniqueRefs, useSvgId, useWidth } from "./c-chart";

interface MonthRow {
  month: string;
  i: number;
  reported: number;
  balance: number;
  days: number;
  estimatedDays: number;
  substitutedDays: number;
  firstEstimate?: string;
  lastEstimate?: string;
}

const ESTIMATE = /estimat/i;
const SUBSTITUTE = /substitut/i;
const SEVERITY_ORDER = ["critical", "high", "medium", "low", "info"];

const sum = (rows: MonthRow[], key: "reported" | "balance") => rows.reduce((t, r) => t + r[key], 0);
const pctDiff = (reported: number, balance: number) => (balance ? ((reported - balance) / balance) * 100 : 0);
const within = (pct: number) => (Math.abs(pct) < 0.1 ? "0.1%" : `${Math.abs(pct).toFixed(1)}%`);
const periodLabel = (rows: MonthRow[]) =>
  rows.length === 1 ? MONTH_LONG[rows[0].i] : `${MONTH_LONG[rows[0].i]} to ${MONTH_LONG[rows[rows.length - 1].i]}`;
const shortPeriod = (rows: MonthRow[]) => (rows.length === 1 ? MONTH_SHORT[rows[0].i] : `${MONTH_SHORT[rows[0].i]} to ${MONTH_SHORT[rows[rows.length - 1].i]}`);

/** Joins reported monthly flare volumes, flare log data sources and the gas balance into one row per month. */
function buildRows(detail: SubmissionDetail, evidence: EvidenceData): MonthRow[] | null {
  const balance = evidence.productionBalance?.months ?? [];
  if (balance.length === 0) return null;
  const flareIds = detail.report?.sourceStreams.filter((s) => /flar/i.test(s.type)).map((s) => s.id) ?? [];
  const streamIds = flareIds.length ? flareIds : ["SS-02", "SS-03"];
  const reportMonthly = new Map((detail.report?.monthly ?? []).map((m) => [m.month, streamIds.reduce((t, id) => t + (m.byStream[id] ?? 0), 0)]));
  const days = evidence.flareLog?.days ?? [];
  if (reportMonthly.size === 0 && days.length === 0) return null;

  return balance
    .map((b) => {
      const inMonth = days.filter((d) => d.date.startsWith(b.month));
      const estimates = inMonth.filter((d) => ESTIMATE.test(d.hpSource) || ESTIMATE.test(d.lpSource));
      const fromLog = inMonth.reduce((t, d) => t + d.hpSm3 + d.lpSm3, 0);
      return {
        month: b.month,
        i: monthIndex(b.month),
        reported: reportMonthly.get(b.month) ?? fromLog,
        balance: b.flaredByBalanceSm3,
        days: inMonth.length || b.days,
        estimatedDays: estimates.length,
        substitutedDays: inMonth.filter((d) => SUBSTITUTE.test(d.hpSource) || SUBSTITUTE.test(d.lpSource)).length,
        firstEstimate: estimates[0]?.date,
        lastEstimate: estimates[estimates.length - 1]?.date,
      };
    })
    .sort((a, b) => a.i - b.i);
}

/** Meter tag named in the metered rows of the flare log column that turned into estimates, e.g. "FT-5101". */
function estimatedMeterTag(evidence: EvidenceData): string | undefined {
  const days = evidence.flareLog?.days ?? [];
  const column = days.some((d) => ESTIMATE.test(d.hpSource)) ? "hpSource" : days.some((d) => ESTIMATE.test(d.lpSource)) ? "lpSource" : undefined;
  if (!column) return undefined;
  for (const d of days) {
    const tag = d[column].match(/\b[A-Z]{1,4}-\d{3,5}[A-Z]?\b/)?.[0];
    if (tag) return tag;
  }
  return undefined;
}

/** Contiguous runs of estimated months. */
function runs(rows: MonthRow[]) {
  const out: MonthRow[][] = [];
  for (const r of rows) {
    if (r.estimatedDays === 0) continue;
    const last = out[out.length - 1];
    if (last && last[last.length - 1].i === r.i - 1) last.push(r);
    else out.push([r]);
  }
  return out;
}

function relatedFindings(review: Review, docIds: string[]): Finding[] {
  return review.findings
    .filter((f) => (f.category === "evidence" || f.category === "data_gap") && f.evidence.some((e) => docIds.includes(e.documentId)))
    .sort((a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity));
}

export function FlareBalanceChart({ detail, review, onOpenEvidence }: { detail: SubmissionDetail; review: Review; onOpenEvidence: (ref: EvidenceRef) => void }) {
  const evidence = detail.evidence;
  const rows = evidence ? buildRows(detail, evidence) : null;
  if (!evidence || !rows) return null;

  const estimatedRuns = runs(rows);
  const estimated = rows.filter((r) => r.estimatedDays > 0);
  const metered = rows.filter((r) => r.estimatedDays === 0);
  const tag = estimatedMeterTag(evidence);
  const flareDoc = findDocument(detail, "flare_log", evidence.flareLog?.documentId);
  const balanceDoc = findDocument(detail, "production_gas_balance", evidence.productionBalance?.documentId);
  const related = relatedFindings(review, [flareDoc?.id, balanceDoc?.id].filter((id): id is string => !!id));
  const gapTco2e = related.map((f) => f.metrics.gapTco2e).find((v): v is number => typeof v === "number");

  const totalDiff = pctDiff(sum(rows, "reported"), sum(rows, "balance"));
  const estDiff = pctDiff(sum(estimated, "reported"), sum(estimated, "balance"));
  const metDiff = pctDiff(sum(metered, "reported"), sum(metered, "balance"));
  const gapSm3 = sum(estimated, "balance") - sum(estimated, "reported");
  const estimateDays = estimated.reduce((t, r) => t + r.estimatedDays, 0);
  const maxMonthly = Math.max(...rows.map((r) => Math.abs(pctDiff(r.reported, r.balance))));
  const direction = (pct: number) => (pct < 0 ? "below" : "above");

  let headline: string;
  let sub: string | undefined;
  let tone: "ink" | "bad" | "ok" = "ink";
  if (estimated.length > 0 && Math.abs(estDiff) >= 10) {
    tone = "bad";
    headline = `From ${MONTH_LONG[estimated[0].i]}, reported flaring is ${Math.round(Math.abs(estDiff))}% ${direction(estDiff)} the company's own gas balance`;
    if (metered.length > 0)
      sub =
        Math.abs(metDiff) < 5
          ? `While ${tag ?? "the meter"} was metering (${periodLabel(metered)}), the two agreed within ${within(metDiff)}. The drop starts when the flare log switches to engineering estimates.`
          : `In the metered months the two differ by ${within(metDiff)}.`;
  } else if (estimated.length > 0) {
    headline = `Estimated months stay within ${within(estDiff)} of the gas balance`;
    sub = `${estimateDays} days in the flare log are engineering estimates.`;
  } else if (Math.abs(totalDiff) < 1) {
    tone = "ok";
    headline = `Reported flaring matches the gas balance within ${within(totalDiff)}`;
    sub = `Month by month the two agree within ${within(maxMonthly)}.`;
  } else {
    tone = Math.abs(totalDiff) >= 10 ? "bad" : "ink";
    headline = `Reported flaring is ${within(totalDiff)} ${direction(totalDiff)} the ${Math.abs(totalDiff) >= 10 ? "company's own " : ""}gas balance`;
  }

  const baseRefs: EvidenceRef[] = [];
  if (flareDoc) {
    const first = estimated[0]?.firstEstimate;
    const last = estimated[estimated.length - 1]?.lastEstimate;
    const days = evidence.flareLog?.days ?? [];
    baseRefs.push(
      first && last
        ? { documentId: flareDoc.id, fileName: flareDoc.fileName, locator: `Rows ${first} to ${last}, engineering estimates`, rows: `${first}..${last}` }
        : { documentId: flareDoc.id, fileName: flareDoc.fileName, locator: "Daily flare volumes", ...(days.length ? { rows: `${days[0].date}..${days[days.length - 1].date}` } : {}) },
    );
  }
  if (balanceDoc) {
    const span = `${rows[0].month}..${rows[rows.length - 1].month}`;
    baseRefs.push({ documentId: balanceDoc.id, fileName: balanceDoc.fileName, locator: `Rows ${rows[0].month} to ${rows[rows.length - 1].month}, column flared_by_balance_sm3`, rows: span });
  }
  const findingRefs = (f: Finding) => uniqueRefs(f.evidence).filter((e) => !baseRefs.some((b) => b.documentId === e.documentId && b.locator === e.locator));

  const bandLabel = tag ? `${tag} out of service` : "Not metered";
  const ariaLabel = `Bar chart of monthly flare gas in ${detail.reportingYear}: reported volumes against the volume flared by the gas balance. ${headline}.${
    estimated.length ? ` ${periodLabel(estimated)}: ${formatInt(sum(estimated, "reported"))} Sm3 reported against ${formatInt(sum(estimated, "balance"))} Sm3 by balance.` : ""
  }`;

  return (
    <Card aria-labelledby="flare-balance-title">
      <CardHeader
        id="flare-balance-title"
        title="Flaring: reported vs gas balance"
        description="Monthly flare gas in the report against the volume the operator's own production gas balance says was flared."
      />
      <CardBody className="flex flex-col gap-5">
        <ChartHeadline tone={tone} sub={sub}>
          {headline}
        </ChartHeadline>

        {estimated.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Stat label={`Reported, ${shortPeriod(estimated)}`} value={`${formatInt(sum(estimated, "reported"))} Sm³`} sub={`${estimateDays} days of engineering estimates`} />
            <Stat label={`Gas balance, ${shortPeriod(estimated)}`} value={`${formatInt(sum(estimated, "balance"))} Sm³`} sub="Flared by difference" />
            <Stat
              label="Gap"
              tone={Math.abs(estDiff) >= 10 ? "bad" : "default"}
              value={`${formatInt(gapSm3)} Sm³`}
              sub={gapTco2e !== undefined ? <>About {formatInt(gapTco2e)} t CO₂e not reported</> : `${formatPct(estDiff)} against the balance`}
            />
            {metered.length > 0 && <Stat label={`Metered, ${shortPeriod(metered)}`} value={formatPct(metDiff)} sub="Reported against gas balance" tone={Math.abs(metDiff) < 5 ? "ok" : "default"} />}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Stat label="Reported, full year" value={`${formatInt(sum(rows, "reported"))} Sm³`} />
            <Stat label="Gas balance, full year" value={`${formatInt(sum(rows, "balance"))} Sm³`} sub="Flared by difference" />
            <Stat label="Difference" value={formatPct(totalDiff, Math.abs(totalDiff) < 1 ? 2 : 1)} tone={Math.abs(totalDiff) < 1 ? "ok" : Math.abs(totalDiff) >= 10 ? "bad" : "default"} />
          </div>
        )}

        <figure className="flex flex-col gap-3">
          <FlareSvg rows={rows} runs={estimatedRuns} bandLabel={bandLabel} gapSm3={estimated.length && Math.abs(estDiff) >= 10 ? gapSm3 : undefined} ariaLabel={ariaLabel} />
          <figcaption>
            <Legend>
              <LegendItem swatch={<rect x="3" y="1" width="12" height="10" rx="1.5" fill="var(--color-gold-500)" />}>Reported, metered</LegendItem>
              {estimated.length > 0 && (
                <LegendItem swatch={<rect x="3" y="1" width="12" height="10" rx="1.5" fill="var(--color-gold-100)" stroke="var(--color-gold-500)" strokeDasharray="2 1.5" />}>
                  Reported, engineering estimate
                </LegendItem>
              )}
              <LegendItem
                swatch={
                  <>
                    <line x1="1" y1="6" x2="17" y2="6" stroke="var(--color-ink)" strokeWidth="2" />
                    <circle cx="9" cy="6" r="3" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.5" />
                  </>
                }
              >
                Gas balance (flared by difference)
              </LegendItem>
              {estimated.length > 0 && Math.abs(estDiff) >= 10 && (
                <LegendItem swatch={<rect x="3" y="1" width="12" height="10" fill="var(--color-bad-100)" stroke="var(--color-bad-500)" strokeDasharray="2 1.5" />}>
                  Gap to the balance
                </LegendItem>
              )}
            </Legend>
          </figcaption>
        </figure>

        <DataTable
          caption={`Monthly flare gas ${detail.reportingYear}, reported and by gas balance, in Sm3`}
          columns={[{ label: "Month" }, { label: "Reported (Sm³)", numeric: true }, { label: "Gas balance (Sm³)", numeric: true }, { label: "Difference", numeric: true }, { label: "Flare log data source" }]}
          rows={[
            ...rows.map((r) => [
              `${MONTH_SHORT[r.i]} ${r.month.slice(0, 4)}`,
              formatInt(r.reported),
              formatInt(r.balance),
              formatPct(pctDiff(r.reported, r.balance)),
              r.estimatedDays ? `Engineering estimate, ${r.estimatedDays} of ${r.days} days` : r.substitutedDays ? `Metered, ${r.substitutedDays} days substituted` : evidence.flareLog ? "Metered" : "-",
            ]),
            ["Year", formatInt(sum(rows, "reported")), formatInt(sum(rows, "balance")), formatPct(totalDiff), estimateDays ? `${estimateDays} days estimated` : ""],
          ]}
        />

        {(baseRefs.length > 0 || related.length > 0) && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {baseRefs.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[13px] font-medium text-ink-muted">Source data</h3>
                <div className="flex flex-wrap gap-2">
                  {baseRefs.map((ref) => (
                    <EvidenceChip key={ref.documentId} evidence={ref} onOpen={onOpenEvidence} />
                  ))}
                </div>
              </div>
            )}
            {related.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-[13px] font-medium text-ink-muted">{related.length === 1 ? "Related finding" : "Related findings"}</h3>
                <ul className="flex flex-col gap-3">
                  {related.map((f) => (
                    <li key={f.id} className="flex flex-col gap-2">
                      <p className="flex flex-wrap items-center gap-2 text-sm">
                        <SeverityPill severity={f.severity} />
                        <span className="font-mono text-[13px] text-ink-muted">{f.id}</span>
                        <span className="font-medium text-ink">{f.title}</span>
                      </p>
                      {findingRefs(f).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {findingRefs(f).map((ref) => (
                            <EvidenceChip key={`${ref.documentId}|${ref.locator}`} evidence={ref} onOpen={onOpenEvidence} />
                          ))}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/** Bars for reported volumes, a line for the gas balance, shaded bands for estimated months. */
function FlareSvg({ rows, runs, bandLabel, gapSm3, ariaLabel }: { rows: MonthRow[]; runs: MonthRow[][]; bandLabel: string; gapSm3?: number; ariaLabel: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const hatch = useSvgId("flare-hatch");
  const narrow = width < 520;
  const H = narrow ? 250 : 290;
  const m = { top: runs.length ? 50 : 26, right: 6, bottom: 26, left: 36 };
  const slot = (width - m.left - m.right) / 12;
  const barW = Math.min(slot * 0.56, 30);
  const ticks = niceTicks(0, Math.max(...rows.flatMap((r) => [r.reported, r.balance])) * 1.04, narrow ? 4 : 5);
  const y = linear([0, ticks[ticks.length - 1]], [H - m.bottom, m.top]);
  const cx = (i: number) => m.left + slot * (i + 0.5);
  const balancePath = rows.map((r, k) => `${k ? "L" : "M"}${cx(r.i).toFixed(1)},${y(r.balance).toFixed(1)}`).join(" ");
  const millions = (v: number) => (v / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 });
  const mainRun = runs.reduce<MonthRow[] | undefined>((best, r) => (!best || r.length > best.length ? r : best), undefined);

  return (
    <div ref={ref} className="w-full">
      <svg role="img" aria-label={ariaLabel} width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block overflow-visible">
        <defs>
          <pattern id={hatch} patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--color-gold-100)" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="var(--color-gold-500)" strokeWidth="2.5" />
          </pattern>
        </defs>

        {runs.map((run) => {
          const x0 = m.left + slot * run[0].i;
          const x1 = m.left + slot * (run[run.length - 1].i + 1);
          const showLabel = run === mainRun;
          return (
            <g key={run[0].month}>
              <rect x={x0} y={0} width={x1 - x0} height={H - m.bottom} fill="var(--color-line-soft)" opacity="0.75" />
              <line x1={x0} x2={x0} y1={0} y2={H - m.bottom} stroke="var(--color-line-strong)" strokeDasharray="3 3" />
              {showLabel && (
                <text x={x0 + 8} y={16} fontSize="12" fill="var(--color-ink-2)">
                  <tspan fontWeight="600">{bandLabel}</tspan>
                  <tspan x={x0 + 8} dy="15" fill="var(--color-ink-muted)">
                    Engineering estimates
                  </tspan>
                </text>
              )}
            </g>
          );
        })}

        {ticks.map((t) => (
          <g key={t}>
            <line x1={m.left} x2={width - m.right} y1={y(t)} y2={y(t)} stroke={t === 0 ? "var(--color-line-strong)" : "var(--color-line)"} strokeDasharray={t === 0 ? undefined : "2 3"} />
            <text x={m.left - 6} y={y(t) + 4} fontSize="12" textAnchor="end" fill="var(--color-ink-muted)" className="tabular-nums">
              {millions(t)}
            </text>
          </g>
        ))}
        <text x={0} y={runs.length ? 40 : 14} fontSize="12" fill="var(--color-ink-muted)">
          Million Sm³
        </text>

        {rows.map((r) => {
          const est = r.estimatedDays > 0;
          const top = y(r.reported);
          const bal = y(r.balance);
          return (
            <g key={r.month}>
              <title>{`${MONTH_LONG[r.i]}: reported ${formatInt(r.reported)} Sm3, gas balance ${formatInt(r.balance)} Sm3 (${formatPct(pctDiff(r.reported, r.balance))})${est ? ", engineering estimate" : ""}`}</title>
              <rect x={cx(r.i) - slot / 2} y={m.top} width={slot} height={H - m.bottom - m.top} fill="transparent" />
              {gapSm3 !== undefined && est && bal < top && (
                <rect x={cx(r.i) - barW / 2} y={bal} width={barW} height={top - bal} fill="var(--color-bad-100)" stroke="var(--color-bad-500)" strokeDasharray="3 2" />
              )}
              <rect
                x={cx(r.i) - barW / 2}
                y={top}
                width={barW}
                height={Math.max(H - m.bottom - top, 0)}
                rx="2"
                fill={est ? `url(#${hatch})` : "var(--color-gold-500)"}
                stroke={est ? "var(--color-gold-500)" : undefined}
              />
              <text x={cx(r.i)} y={H - 8} fontSize="12" textAnchor="middle" fill="var(--color-ink-muted)">
                {slot < 30 ? MONTH_SHORT[r.i][0] : MONTH_SHORT[r.i]}
              </text>
            </g>
          );
        })}

        <path d={balancePath} fill="none" stroke="var(--color-ink)" strokeWidth="2" strokeLinejoin="round" />
        {rows.map((r) => (
          <circle key={r.month} cx={cx(r.i)} cy={y(r.balance)} r="3.5" fill="var(--color-surface)" stroke="var(--color-ink)" strokeWidth="1.75" />
        ))}

        {gapSm3 !== undefined && mainRun && (
          <GapLabel
            x={(m.left + slot * mainRun[0].i + m.left + slot * (mainRun[mainRun.length - 1].i + 1)) / 2}
            y={(y(sum(mainRun, "reported") / mainRun.length) + y(sum(mainRun, "balance") / mainRun.length)) / 2}
            text={`Gap ${millions(gapSm3)} million Sm³`}
          />
        )}
      </svg>
    </div>
  );
}

function GapLabel({ x, y, text }: { x: number; y: number; text: string }) {
  return (
    <text x={x} y={y + 5} fontSize="13" fontWeight="600" textAnchor="middle" fill="var(--color-bad-800)" stroke="var(--color-surface)" strokeWidth="5" strokeLinejoin="round" paintOrder="stroke">
      {text}
    </text>
  );
}
