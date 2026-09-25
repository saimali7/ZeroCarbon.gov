"use client";

import type { PeerBenchmark, ReferenceData, Review, SubmissionDetail } from "@zerocarbon/shared";
import type { ReactNode } from "react";
import { Card, CardBody, CardHeader } from "../../../_components/ui/card";
import { Skeleton } from "../../../_components/ui/states";
import { formatInt, formatNumber, formatPct } from "../../../_lib/format";
import { ChartHeadline, DataTable } from "./c-chart";
import { StripPlot, type StripPeer } from "./c-strip-plot";

const fmt = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 });

function medianOf(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  if (s.length === 0) return undefined;
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

const toPeer = (p: PeerBenchmark, value: number): StripPeer => ({ id: p.eadId, facility: p.facility, operator: p.operator, value });

export function BenchmarkPanel({ detail, review, reference }: { detail: SubmissionDetail; review: Review; reference?: ReferenceData }) {
  const year = detail.reportingYear;
  const peerRows = reference?.peers.filter((p) => p.reportingYear === year) ?? [];
  const others = peerRows.filter((p) => p.eadId !== detail.eadId);
  const selfRow = peerRows.find((p) => p.eadId === detail.eadId);

  return (
    <Card aria-labelledby="benchmark-title">
      <CardHeader
        id="benchmark-title"
        title="Compared with similar facilities"
        description={
          reference && others.length > 0
            ? `${others.length} onshore oil processing peers, reporting year ${year}, and this facility's previous report. Peer figures are simulated for this demo.`
            : "Peer benchmarks and the previous year's report from the regulator's reference data."
        }
      />
      {!reference ? (
        <BenchmarkSkeleton />
      ) : (
        <BenchmarkBody detail={detail} review={review} reference={reference} others={others} selfRow={selfRow} />
      )}
    </Card>
  );
}

function BenchmarkBody({
  detail,
  review,
  reference,
  others,
  selfRow,
}: {
  detail: SubmissionDetail;
  review: Review;
  reference: ReferenceData;
  others: PeerBenchmark[];
  selfRow?: PeerBenchmark;
}) {
  const m = review.metrics;
  const name = detail.facilityShortName;
  const intensity = m.intensityKgCo2ePerBoe ?? selfRow?.intensityKgCo2ePerBoe;
  const ch4 = m.ch4IntensityTPerMmboe ?? selfRow?.ch4IntensityTPerMmboe;
  const sections: ReactNode[] = [];

  if (intensity !== undefined && others.length > 0) {
    const values = others.map((p) => p.intensityKgCo2ePerBoe);
    const median = m.peerMedianIntensity ?? medianOf(values);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const corrected = m.correctedIntensityKgCo2ePerBoe;
    const showCorrected = corrected !== undefined && Math.abs(corrected - intensity) >= 0.05;
    const headline =
      intensity < lo
        ? `Lowest intensity of ${others.length + 1} facilities: ${fmt(intensity)} kg CO₂e/boe against a peer median of ${fmt(median!)}`
        : intensity > hi
          ? `Highest intensity of ${others.length + 1} facilities: ${fmt(intensity)} kg CO₂e/boe against a peer median of ${fmt(median!)}`
          : `${fmt(intensity)} kg CO₂e/boe, within the peer range of ${fmt(lo)} to ${fmt(hi)}`;
    const sub = showCorrected
      ? `Corrected for the findings, it would be ${fmt(corrected)} kg CO₂e/boe, ${corrected >= lo && corrected <= hi ? "in line with its peers" : corrected < lo ? "still below every peer" : "above every peer"}.`
      : intensity >= lo && intensity <= hi && median !== undefined
        ? `The peer median is ${fmt(median)} kg CO₂e/boe.`
        : `Peers range from ${fmt(lo)} to ${fmt(hi)} kg CO₂e/boe.`;
    sections.push(
      <BenchSection key="intensity" title="Emissions intensity" headline={headline} sub={sub} tone={intensity >= lo && intensity <= hi ? "ok" : "ink"}>
        <StripPlot
          peers={others.map((p) => toPeer(p, p.intensityKgCo2ePerBoe))}
          median={median}
          self={{ name, value: intensity, corrected: showCorrected ? corrected : undefined }}
          unit="kg CO₂e/boe"
          axisLabel="kg CO₂e per barrel of oil equivalent"
          ariaLabel={`Strip plot of emissions intensity in kg CO2e per boe. ${headline}.${showCorrected ? ` Corrected value ${fmt(corrected)}.` : ""} Peers: ${others.map((p) => `${p.facility} ${fmt(p.intensityKgCo2ePerBoe)}`).join(", ")}.`}
        />
        <PeerTable
          caption={`Emissions intensity, reporting year ${detail.reportingYear}, kg CO2e per boe`}
          valueLabel="kg CO₂e/boe"
          selfName={name}
          selfValue={intensity}
          selfOperator={detail.operator}
          rows={others.map((p) => [p.facility, p.operator, p.intensityKgCo2ePerBoe])}
          extra={showCorrected ? [`${name} (corrected)`, detail.operator, corrected] : undefined}
        />
      </BenchSection>,
    );
  }

  if (ch4 !== undefined && others.length > 0) {
    const values = others.map((p) => p.ch4IntensityTPerMmboe);
    const median = medianOf(values);
    const lo = Math.min(...values);
    const hi = Math.max(...values);
    const headline =
      ch4 < lo
        ? `Methane intensity is ${fmt(ch4)} t CH₄/MMboe, ${ch4 <= lo / 2 ? "less than half" : "below"} the lowest peer (${fmt(lo)})`
        : ch4 > hi
          ? `Methane intensity is ${fmt(ch4)} t CH₄/MMboe, above the highest peer (${fmt(hi)})`
          : `Methane intensity is ${fmt(ch4)} t CH₄/MMboe, within the peer range of ${fmt(lo)} to ${fmt(hi)}`;
    const sources = others.map((p) => p.methaneSourcesQuantified);
    const selfSources = selfRow?.methaneSourcesQuantified;
    const sub =
      selfSources !== undefined
        ? `${selfSources} methane ${selfSources === 1 ? "source" : "sources"} quantified; peers quantify ${Math.min(...sources)} to ${Math.max(...sources)}.`
        : `The peer median is ${fmt(median!)} t CH₄/MMboe.`;
    sections.push(
      <BenchSection key="methane" title="Methane intensity" headline={headline} sub={sub} tone={ch4 >= lo && ch4 <= hi ? "ok" : "ink"}>
        <StripPlot
          peers={others.map((p) => toPeer(p, p.ch4IntensityTPerMmboe))}
          median={median}
          self={{ name, value: ch4 }}
          unit="t CH₄/MMboe"
          axisLabel="t CH₄ per million barrels of oil equivalent"
          ariaLabel={`Strip plot of methane intensity in t CH4 per MMboe. ${headline}. Peers: ${others.map((p) => `${p.facility} ${fmt(p.ch4IntensityTPerMmboe)}`).join(", ")}.`}
        />
        <PeerTable
          caption={`Methane intensity, reporting year ${detail.reportingYear}, t CH4 per MMboe`}
          valueLabel="t CH₄/MMboe"
          selfName={name}
          selfValue={ch4}
          selfOperator={detail.operator}
          rows={others.map((p) => [p.facility, p.operator, p.ch4IntensityTPerMmboe, p.methaneSourcesQuantified])}
          selfExtra={selfSources}
          extraLabel="Sources quantified"
        />
      </BenchSection>,
    );
  }

  const yoy = yearOnYearData(detail, review, reference);
  if (yoy) sections.push(<YearOnYear key="yoy" data={yoy} year={detail.reportingYear} />);

  if (sections.length === 0)
    return (
      <CardBody>
        <p className="text-sm text-ink-muted">No peer benchmarks or prior-year figures are available for this facility.</p>
      </CardBody>
    );
  return <div className="divide-y divide-line">{sections}</div>;
}

function BenchSection({ title, headline, sub, tone, children }: { title: string; headline: string; sub?: string; tone?: "ink" | "ok" | "bad"; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 px-5 py-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">{title}</h3>
        <ChartHeadline tone={tone} sub={sub}>
          {headline}
        </ChartHeadline>
      </div>
      {children}
    </section>
  );
}

function PeerTable({
  caption,
  valueLabel,
  selfName,
  selfOperator,
  selfValue,
  rows,
  extra,
  selfExtra,
  extraLabel,
}: {
  caption: string;
  valueLabel: string;
  selfName: string;
  selfOperator: string;
  selfValue: number;
  rows: [string, string, number, number?][];
  extra?: [string, string, number];
  selfExtra?: number;
  extraLabel?: string;
}) {
  const all: [string, string, number, number?][] = [[`${selfName} (this facility)`, selfOperator, selfValue, selfExtra], ...rows, ...(extra ? [extra] : [])];
  all.sort((a, b) => a[2] - b[2]);
  return (
    <DataTable
      caption={caption}
      columns={[{ label: "Facility" }, { label: "Operator" }, { label: valueLabel, numeric: true }, ...(extraLabel ? [{ label: extraLabel, numeric: true }] : [])]}
      rows={all.map(([facility, operator, value, n]) => [facility, operator, fmt(value), ...(extraLabel ? [n === undefined ? "-" : String(n)] : [])])}
    />
  );
}

interface YoyData {
  priorYear: number;
  priorTotal: number;
  total: number;
  totalPct: number;
  prodPct?: number;
  priorProd?: number;
  prod?: number;
  priorFlare?: number;
  flare?: number;
}

function yearOnYearData(detail: SubmissionDetail, review: Review, reference: ReferenceData): YoyData | null {
  const m = review.metrics;
  const priorYear = detail.reportingYear - 1;
  const rows = reference.priorYear.filter((r) => r.eadId === detail.eadId && r.reportingYear === priorYear);
  const totalRow = rows.find((r) => r.item === "TOTAL");
  const priorTotal = totalRow?.tco2e ?? m.priorYearTotalTco2e;
  if (priorTotal === undefined || !priorTotal) return null;
  const total = m.reportedTotalTco2e;
  const priorProdText = totalRow?.description.match(/production\s+([\d.,]+)\s*MMboe/i)?.[1];
  const flareRow = rows.find((r) => /^SS-0?2/.test(r.item) || /flare/i.test(r.description));
  const flareStreams = detail.report?.sourceStreams.filter((s) => /flar/i.test(s.type)) ?? [];
  return {
    priorYear,
    priorTotal,
    total,
    totalPct: m.yoyTotalPct ?? ((total - priorTotal) / priorTotal) * 100,
    prodPct: m.yoyProductionPct,
    priorProd: priorProdText ? Number(priorProdText.replace(/,/g, "")) : undefined,
    prod: m.productionMmboe ?? detail.report?.production?.mmboe,
    priorFlare: flareRow?.co2T ?? flareRow?.tco2e,
    flare: flareStreams.length ? flareStreams.reduce((t, s) => t + s.co2T, 0) : undefined,
  };
}

function YearOnYear({ data: d, year }: { data: YoyData; year: number }) {
  const verb = (pct: number) => (pct < 0 ? "fell" : pct > 0 ? "rose" : "was unchanged");
  const pct = (v: number) => `${Math.abs(v).toFixed(1)}%`;
  const headline =
    d.prodPct === undefined
      ? `Emissions ${verb(d.totalPct)} ${pct(d.totalPct)} from ${d.priorYear}`
      : `Emissions ${verb(d.totalPct)} ${pct(d.totalPct)} ${Math.sign(d.totalPct) === Math.sign(d.prodPct) ? "and" : "while"} production ${verb(d.prodPct)} ${pct(d.prodPct)}`;
  const totalDecline = d.priorTotal - d.total;
  const flareDecline = d.priorFlare !== undefined && d.flare !== undefined ? d.priorFlare - d.flare : undefined;
  const priorIntensity = d.priorProd ? d.priorTotal / (d.priorProd * 1000) : undefined;
  const intensity = d.prod ? d.total / (d.prod * 1000) : undefined;
  const sub =
    flareDecline !== undefined && totalDecline > 0 && flareDecline > totalDecline
      ? `The flare streams alone fell ${formatInt(flareDecline)} t CO₂, more than the whole decline of ${formatInt(totalDecline)} t CO₂e.`
      : priorIntensity !== undefined && intensity !== undefined
        ? `Intensity moved from ${formatNumber(priorIntensity, 2)} to ${formatNumber(intensity, 2)} kg CO₂e/boe.`
        : undefined;
  const consistent = d.prodPct !== undefined && (Math.sign(d.totalPct) === Math.sign(d.prodPct) || Math.abs(d.totalPct - d.prodPct) < 2);

  const pairs: { id: string; title: string; unit: string; prior: number; current: number; change: number; digits: number }[] = [
    { id: "total", title: "Total emissions", unit: "t CO₂e", prior: d.priorTotal, current: d.total, change: d.totalPct, digits: 0 },
  ];
  if (d.priorProd !== undefined && d.prod !== undefined)
    pairs.push({ id: "prod", title: "Production", unit: "MMboe", prior: d.priorProd, current: d.prod, change: d.prodPct ?? ((d.prod - d.priorProd) / d.priorProd) * 100, digits: 2 });
  if (d.priorFlare !== undefined && d.flare !== undefined)
    pairs.push({ id: "flare", title: "Flare streams", unit: "t CO₂", prior: d.priorFlare, current: d.flare, change: ((d.flare - d.priorFlare) / d.priorFlare) * 100, digits: 0 });

  return (
    <BenchSection title="Year on year" headline={headline} sub={sub} tone={consistent ? "ok" : "ink"}>
      <div className={`grid gap-5 ${pairs.length === 3 ? "sm:grid-cols-3" : pairs.length === 2 ? "sm:grid-cols-2" : ""}`}>
        {pairs.map((p) => (
          <YoyBars key={p.id} {...p} priorYear={d.priorYear} year={year} />
        ))}
        {pairs.length === 1 && d.prodPct !== undefined && (
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-ink">Production</span>
            <span className="text-[22px] font-bold tabular-nums">{formatPct(d.prodPct)}</span>
            <span className="text-xs text-ink-muted">Change from {d.priorYear}</span>
          </div>
        )}
      </div>
      <DataTable
        caption={`Year on year, ${d.priorYear} against ${year}`}
        columns={[{ label: "Item" }, { label: String(d.priorYear), numeric: true }, { label: String(year), numeric: true }, { label: "Change", numeric: true }]}
        rows={[
          ...pairs.map((p) => [`${p.title} (${p.unit})`, formatNumber(p.prior, p.digits), formatNumber(p.current, p.digits), formatPct(p.change)]),
          ...(pairs.some((p) => p.id === "prod") || d.prodPct === undefined ? [] : [["Production", "-", "-", formatPct(d.prodPct)]]),
          ...(priorIntensity !== undefined && intensity !== undefined
            ? [["Intensity (kg CO₂e/boe)", formatNumber(priorIntensity, 2), formatNumber(intensity, 2), formatPct(((intensity - priorIntensity) / priorIntensity) * 100)]]
            : []),
        ]}
      />
    </BenchSection>
  );
}

function YoyBars({ title, unit, prior, current, change, digits, priorYear, year }: { id: string; title: string; unit: string; prior: number; current: number; change: number; digits: number; priorYear: number; year: number }) {
  const max = Math.max(prior, current) || 1;
  const rows = [
    { label: String(priorYear), value: prior, bar: "bg-line-strong" },
    { label: String(year), value: current, bar: "bg-gold-500" },
  ];
  return (
    <div
      role="img"
      aria-label={`${title}: ${formatNumber(prior, digits)} ${unit} in ${priorYear}, ${formatNumber(current, digits)} ${unit} in ${year}, ${formatPct(change)}`}
      className="flex min-w-0 flex-col gap-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-ink">
          {title} <span className="font-normal text-ink-muted">({unit})</span>
        </span>
        <span className="text-[15px] font-bold tabular-nums text-ink">{formatPct(change)}</span>
      </div>
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2 text-[13px]">
          <span className="tabular-nums text-ink-muted">{r.label}</span>
          <div className="flex min-w-0 items-center gap-2">
            <span className={`block h-3.5 rounded-sm ${r.bar}`} style={{ width: `${Math.max((r.value / max) * 72, 1)}%` }} />
            <span className="shrink-0 tabular-nums text-ink-2">{formatNumber(r.value, digits)}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function BenchmarkSkeleton() {
  return (
    <div aria-busy className="divide-y divide-line">
      {[0, 1].map((i) => (
        <div key={i} className="flex flex-col gap-3 px-5 py-5">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-5 w-3/4" />
          <div className="relative mt-2 h-28">
            {[12, 30, 38, 52, 60, 71, 86].map((left) => (
              <span key={left} className="absolute top-6" style={{ left: `${left}%` }}>
                <Skeleton className="size-3 rounded-full" />
              </span>
            ))}
            <Skeleton className="absolute inset-x-0 bottom-8 h-px" />
          </div>
        </div>
      ))}
      <div className="flex flex-col gap-3 px-5 py-5">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-5 w-2/3" />
        <div className="grid gap-5 sm:grid-cols-3">
          {[0, 1, 2].map((k) => (
            <div key={k} className="flex flex-col gap-2">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3.5 w-4/5" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
