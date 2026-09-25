"use client";

import { Info } from "@phosphor-icons/react";
import type { EvidenceRef, FlareLogDay, ReferenceData, Review, SatelliteDetection, SubmissionDetail } from "@zerocarbon/shared";
import { useState, type ReactNode } from "react";
import { Card, CardBody, CardHeader } from "../../../_components/ui/card";
import { EvidenceChip } from "../../../_components/ui/evidence";
import { OutcomePill, Pill, SeverityPill, type Tone } from "../../../_components/ui/pill";
import { Notice, Skeleton } from "../../../_components/ui/states";
import { formatDate, formatDateShort, formatInt } from "../../../_lib/format";
import { ChartHeadline, DataTable, Legend, LegendItem, findDocument } from "./c-chart";
import { SiteMap, compass } from "./c-site-map";

type Match = "pilot_out" | "event" | "no_event" | "no_row" | "no_log";

interface CrossCheck {
  match: Match;
  day?: FlareLogDay;
  /** Logged time window, e.g. ["12:05", "18:35"], and whether the overpass falls inside it. */
  window?: [string, string];
  overpassInside?: boolean;
}

const WINDOW = /(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/;
const minutes = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

/** Cross-references a detection with the operator's flare log for the same local date. */
function crossCheck(d: SatelliteDetection, days: FlareLogDay[] | undefined): CrossCheck {
  if (!days) return { match: "no_log" };
  const day = days.find((x) => x.date === d.localDate);
  if (!day) return { match: "no_row" };
  const pilotOut = !/^\s*lit\s*$/i.test(day.pilotStatus);
  const hasNote = day.note.trim().length > 0;
  if (!pilotOut && !hasNote) return { match: "no_event", day };
  const w = `${day.pilotStatus} ${day.note}`.match(WINDOW);
  const window: [string, string] | undefined = w ? [w[1], w[2]] : undefined;
  const t = minutes(d.localTimeGst);
  return { match: pilotOut ? "pilot_out" : "event", day, window, overpassInside: window ? t >= minutes(window[0]) && t <= minutes(window[1]) : undefined };
}

const MATCH_PILL: Record<Match, { tone: Tone; label: string }> = {
  pilot_out: { tone: "bad", label: "Flare pilot out" },
  event: { tone: "neutral", label: "Logged event" },
  no_event: { tone: "bad", label: "No event logged" },
  no_row: { tone: "gold", label: "No flare log entry" },
  no_log: { tone: "neutral", label: "No flare log" },
};

/** Sentence-cases all-caps log values: "ENGINEERING ESTIMATE" → "Engineering estimate". */
const sourceLabel = (s: string) => (s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s);

const rate = (d: SatelliteDetection) => `${formatInt(d.rateKgCh4PerH)} ± ${formatInt(d.uncertaintyKgPerH)} kg CH₄/h`;

export function SatellitePanel({
  detail,
  review,
  reference,
  onOpenEvidence,
}: {
  detail: SubmissionDetail;
  review: Review;
  reference?: ReferenceData;
  onOpenEvidence: (ref: EvidenceRef) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const year = detail.reportingYear;
  const findings = review.findings.filter((f) => f.category === "satellite");

  const header = (
    <CardHeader
      id="satellite-title"
      title="Satellite methane (simulated)"
      description={`Point-source methane plumes seen near ${detail.facilityShortName} in ${year}, checked against the operator's own flare log.`}
    />
  );

  if (!reference)
    return (
      <Card aria-labelledby="satellite-title">
        {header}
        <CardBody className="flex flex-col gap-4">
          <div aria-busy className="flex flex-col gap-4">
            <Skeleton className="h-5 w-2/3" />
            <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_18rem]">
              <Skeleton className="h-80 w-full rounded-control" />
              <div className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-20 w-full rounded-control" />
                ))}
              </div>
            </div>
          </div>
        </CardBody>
      </Card>
    );

  const site = reference.facilities.find((f) => f.eadId === detail.eadId);
  const lat = site?.lat ?? detail.report?.facility.lat ?? detail.lat;
  const lon = site?.lon ?? detail.report?.facility.lon ?? detail.lon;
  const detections = reference.detections.filter((d) => d.nearestFacilityId === detail.eadId).sort((a, b) => a.datetimeUtc.localeCompare(b.datetimeUtc));
  const largest = detections.reduce<SatelliteDetection | undefined>((best, d) => (!best || d.rateKgCh4PerH > best.rateKgCh4PerH ? d : best), undefined);
  const selected = detections.find((d) => d.id === picked) ?? largest;
  const flareLog = detail.evidence?.flareLog;
  const checks = new Map(detections.map((d) => [d.id, crossCheck(d, flareLog?.days)]));
  const count = (m: Match) => detections.filter((d) => checks.get(d.id)?.match === m).length;

  const plural = detections.length === 1 ? "plume" : "plumes";
  const headline =
    detections.length === 0 ? `No methane plumes detected near this facility in ${year}` : `${detections.length} simulated methane ${plural} detected near this facility in ${year}`;
  const parts = [
    count("pilot_out") && `${count("pilot_out")} while the flare pilot was out`,
    count("event") && `${count("event")} during ${count("event") === 1 ? "an event" : "events"} logged by the operator`,
    count("no_event") && `${count("no_event")} on ${count("no_event") === 1 ? "a day" : "days"} with no event in the flare log`,
  ].filter(Boolean);
  const sub =
    detections.length === 0
      ? "The site map shows the facility's equipment for reference."
      : flareLog
        ? detections.length === 1 && parts.length === 1
          ? `It was seen ${String(parts[0]).replace(/^1 /, "")}.`
          : `${parts.join(", ")}.`
        : "The submission has no flare log to cross-check these dates.";
  // Red only when the flare log does not explain the selected plume; otherwise selection is shown in gold.
  const alert = selected ? ["pilot_out", "no_event"].includes(checks.get(selected.id)!.match) : false;
  const tone = detections.length === 0 || (count("pilot_out") === 0 && count("no_event") === 0 && !!flareLog) ? "ok" : "bad";

  const equipment = site?.equipment ?? [];
  const ariaLabel = `Site map of ${detail.facilityShortName} with ${equipment.length} equipment points (${equipment.map((e) => e.name).join(", ")}) and ${detections.length} simulated methane ${plural}.${
    selected ? ` Selected: ${formatDate(selected.localDate)} at ${selected.localTimeGst} local time, ${formatInt(selected.rateKgCh4PerH)} kg CH4 per hour near ${selected.nearestEquipment}, wind from ${compass(selected.windFromDeg)} at ${selected.windSpeedMs} m/s.` : ""
  }`;

  return (
    <Card aria-labelledby="satellite-title">
      {header}
      <CardBody className="flex flex-col gap-5">
        <ChartHeadline tone={tone} sub={sub}>
          {headline}
        </ChartHeadline>

        <div className={`grid gap-5 ${detections.length ? "md:grid-cols-[minmax(0,1fr)_18rem]" : ""}`}>
          <figure className="flex min-w-0 flex-col gap-3">
            {lat !== undefined && lon !== undefined ? (
              <SiteMap center={{ lat, lon }} facilityName={detail.facilityShortName} equipment={equipment} detections={detections} selectedId={selected?.id} alert={alert} ariaLabel={ariaLabel} />
            ) : (
              <Notice tone="neutral">No site location is available for this facility, so the map cannot be drawn.</Notice>
            )}
            <figcaption>
              <Legend>
                <LegendItem swatch={<rect x="4.5" y="1.5" width="9" height="9" rx="1.5" fill="var(--color-ink-2)" />}>Equipment</LegendItem>
                {detections.length > 0 && (
                  <>
                    <LegendItem
                      swatch={<path d="M2 6 Q9 -1 16 4 Q12 11 2 6 Z" fill={alert ? "var(--color-bad-500)" : "var(--color-gold-500)"} fillOpacity="0.3" stroke={alert ? "var(--color-bad-700)" : "var(--color-gold-700)"} />}
                    >
                      Selected plume
                    </LegendItem>
                    {detections.length > 1 && (
                      <LegendItem swatch={<path d="M2 6 Q9 -1 16 4 Q12 11 2 6 Z" fill="var(--color-gold-300)" fillOpacity="0.3" stroke="var(--color-gold-500)" strokeDasharray="2 2" />}>
                        Other plumes
                      </LegendItem>
                    )}
                    <LegendItem swatch={<circle cx="9" cy="6" r="4" fill={alert ? "var(--color-bad-700)" : "var(--color-gold-700)"} />}>Plume source</LegendItem>
                  </>
                )}
              </Legend>
            </figcaption>
          </figure>

          {detections.length > 0 && (
            <div className="flex min-w-0 flex-col gap-2">
              <h3 id="detections-heading" className="text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                Detections
              </h3>
              <ul aria-labelledby="detections-heading" className="flex flex-col gap-2">
                {detections.map((d) => {
                  const on = d.id === selected?.id;
                  const m = MATCH_PILL[checks.get(d.id)!.match];
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        aria-pressed={on}
                        onClick={() => setPicked(d.id)}
                        className={`flex w-full flex-col gap-1 rounded-control border px-3 py-2.5 text-left transition-colors duration-150 ${
                          on ? (alert ? "border-bad-200 bg-bad-50" : "border-gold-300 bg-gold-50") : "border-line bg-surface hover:border-line-strong hover:bg-sunken"
                        }`}
                      >
                        <span className="text-[13px] tabular-nums text-ink-muted">
                          <span className="font-semibold text-ink">{formatDateShort(d.localDate)}</span>, {d.localTimeGst} GST
                        </span>
                        <span className="text-[15px] font-semibold tabular-nums text-ink">{rate(d)}</span>
                        <span className="text-[13px] text-ink-2">
                          {d.nearestEquipment}, {formatInt(d.distanceToEquipmentM)} m
                        </span>
                        <span className="mt-1 flex flex-wrap gap-1.5">
                          <Pill size="sm" tone={m.tone}>
                            {m.label}
                          </Pill>
                          <Pill size="sm">{d.confidence} confidence</Pill>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {selected && <FlareLogCheck detection={selected} check={checks.get(selected.id)!} detail={detail} onOpenEvidence={onOpenEvidence} />}

        {detections.length > 0 && (
          <DataTable
            caption={`Simulated methane detections near ${detail.facilityShortName}, ${year}`}
            columns={[
              { label: "Local date" },
              { label: "Time (GST)" },
              { label: "Rate (kg CH₄/h)", numeric: true },
              { label: "Uncertainty (kg/h)", numeric: true },
              { label: "Nearest equipment" },
              { label: "Wind" },
              { label: "Confidence" },
              { label: "Flare log" },
            ]}
            rows={detections.map((d) => [
              formatDate(d.localDate),
              d.localTimeGst,
              formatInt(d.rateKgCh4PerH),
              formatInt(d.uncertaintyKgPerH),
              `${d.nearestEquipment} (${formatInt(d.distanceToEquipmentM)} m)`,
              `From ${compass(d.windFromDeg)}, ${d.windSpeedMs} m/s`,
              d.confidence,
              MATCH_PILL[checks.get(d.id)!.match].label,
            ])}
          />
        )}

        {findings.length > 0 && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            <h3 className="text-[13px] font-medium text-ink-muted">{findings.length === 1 ? "Related finding" : "Related findings"}</h3>
            <ul className="flex flex-col gap-4">
              {findings.map((f) => (
                <li key={f.id} className="flex flex-col gap-2">
                  <p className="flex flex-wrap items-center gap-2 text-sm">
                    <SeverityPill severity={f.severity} />
                    <OutcomePill outcome={f.outcome} />
                    <span className="font-mono text-[13px] text-ink-muted">{f.id}</span>
                    <span className="font-medium text-ink">{f.title}</span>
                  </p>
                  <p className="text-sm leading-relaxed text-ink-2 text-pretty">{f.summary}</p>
                  {f.evidence.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {f.evidence.map((e) => (
                        <EvidenceChip key={`${e.documentId}|${e.locator}`} evidence={e} onOpen={onOpenEvidence} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="flex items-start gap-2 text-[13px] leading-relaxed text-ink-muted">
          <Info size={16} weight="regular" aria-hidden className="mt-0.5 shrink-0" />
          Simulated detections for this demo. A detection is a signal to investigate, not proof.
        </p>
      </CardBody>
    </Card>
  );
}

/** What the operator's flare log says about the selected detection's date. */
function FlareLogCheck({ detection: d, check, detail, onOpenEvidence }: { detection: SatelliteDetection; check: CrossCheck; detail: SubmissionDetail; onOpenEvidence: (ref: EvidenceRef) => void }) {
  const log = detail.evidence?.flareLog;
  const doc = findDocument(detail, "flare_log", log?.documentId);
  const day = check.day;
  const quote = day ? [day.pilotStatus !== "Lit" ? day.pilotStatus : "", day.note].filter(Boolean).join(". ").slice(0, 300) : undefined;
  const ref: EvidenceRef | undefined =
    doc && day ? { documentId: doc.id, fileName: doc.fileName, locator: `Row ${day.date}`, rows: day.date, ...(quote ? { quote } : {}) } : undefined;

  const verdict = (() => {
    switch (check.match) {
      case "no_event":
        return (
          <Notice tone="bad">
            <strong className="font-semibold">No event logged in the flare log that day.</strong> The pilot is recorded as lit and there is no event note, so the operator's
            records give no explanation for this plume.
          </Notice>
        );
      case "pilot_out":
      case "event": {
        const inside = check.overpassInside;
        const text =
          check.window && inside !== undefined
            ? `The overpass at ${d.localTimeGst} falls ${inside ? "inside" : "outside"} the logged window of ${check.window[0]} to ${check.window[1]}.`
            : "The flare log records an event on this date.";
        return (
          <Notice tone={check.match === "pilot_out" ? "bad" : inside === false ? "gold" : "ok"}>
            <strong className="font-semibold">{text}</strong>
            {check.match === "pilot_out" && " With the pilot out, gas sent to the flare may have been released unburnt."}
          </Notice>
        );
      }
      case "no_row":
        return <Notice tone="gold">The flare log has no entry for {formatDate(d.localDate)}.</Notice>;
      default:
        return <Notice tone="neutral">The submission has no flare log to cross-check this date.</Notice>;
    }
  })();

  return (
    <section aria-live="polite" aria-labelledby="flare-log-check" className="flex flex-col gap-3 rounded-control border border-line bg-sunken p-4">
      <h3 id="flare-log-check" className="text-[15px] font-semibold text-ink">
        Flare log on {formatDate(d.localDate)}
      </h3>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <Field label="Satellite overpass">
          {d.localTimeGst} GST, wind from {compass(d.windFromDeg)} at {d.windSpeedMs} m/s, plume {formatInt(d.plumeLengthM)} m long
        </Field>
        {day && (
          <>
            <Field label="Pilot status">
              <span className={day.pilotStatus.trim().toLowerCase() === "lit" ? "" : "font-semibold text-bad-800"}>{day.pilotStatus || "-"}</span>
            </Field>
            <Field label="Flare volumes">
              HP {formatInt(day.hpSm3)} Sm³ ({sourceLabel(day.hpSource)}), LP {formatInt(day.lpSm3)} Sm³ ({sourceLabel(day.lpSource)})
            </Field>
            <Field label="Event note">{day.note ? <q>{day.note}</q> : "None"}</Field>
          </>
        )}
      </dl>
      {verdict}
      {ref && (
        <div>
          <EvidenceChip evidence={ref} onOpen={onOpenEvidence} />
        </div>
      )}
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[13px] text-ink-muted">{label}</dt>
      <dd className="text-ink-2">{children}</dd>
    </div>
  );
}
