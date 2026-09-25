/** Satellite methane detections vs the flare log and declared events. A detection is a signal to investigate, not proof. */
import type { EvidenceRef, SatelliteDetection } from "@zerocarbon/shared";
import { csvRef, flareFactors, type CheckContext, type CheckOutput, type DraftFinding } from "./context.ts";
import {
  clip,
  extractPermits,
  extractTags,
  fmt,
  formatDate,
  isEstimatedSource,
  minutesOf,
  parseTimeWindow,
  shortName,
  tagsOverlap,
} from "./util.ts";

const NORMAL_PILOT = /^(lit|on|normal|ok|yes)?$/i;

type Verdict = "explained" | "corroborated" | "unexplained";

interface Assessment {
  det: SatelliteDetection;
  verdict: Verdict;
  text: string;
  evidence: EvidenceRef[];
}

export function satelliteChecks(ctx: CheckContext): CheckOutput[] {
  return [detections(ctx)];
}

function assess(ctx: CheckContext, det: SatelliteDetection): Assessment {
  const { report: r } = ctx;
  const log = ctx.evidence.flareLog;
  const head =
    `${det.id}${det.simulated ? " (simulated)" : ""}: ${fmt(det.rateKgCh4PerH)} kg CH4/h (+/- ${fmt(det.uncertaintyKgPerH)}, ${det.confidence.toLowerCase()} confidence) ` +
    `at ${det.nearestEquipment}, ${formatDate(det.localDate)} ${det.localTimeGst} local`;
  const evidence: EvidenceRef[] = [ctx.referenceRef("satellite", `Detection ${det.id}, ${formatDate(det.localDate)} ${det.localTimeGst} GST`, det.id)];
  const equipmentTags = extractTags(det.nearestEquipment);
  const day = log?.days.find((d) => d.date === det.localDate);

  if (!log || !day) {
    return { det, verdict: "unexplained", text: `${head}. ${log ? "No flare log entry for that day" : "No flare log provided"} to explain it.`, evidence };
  }
  const pilot = day.pilotStatus.trim();
  const abnormalPilot = !NORMAL_PILOT.test(pilot);
  const event = [day.note, abnormalPilot ? `pilot ${pilot}` : ""].filter(Boolean).join("; ");
  evidence.push(csvRef(log, `Row ${day.date}`, { rows: day.date, ...(day.note ? { quote: clip(day.note) } : {}) }));

  if (!event) {
    const closed = r.methane.find((l) => tagsOverlap(equipmentTags, extractTags(l.source)) && (l.status === "not_applicable" || /closed system/i.test(`${l.basis} ${l.note}`)));
    if (closed) evidence.push(closed.evidence);
    return {
      det,
      verdict: "unexplained",
      text: `${head}. No event logged that day (pilot ${pilot || "not recorded"}, no note)${closed ? `, although sheet G ${closed.id} declares ${shortName(closed.source)} "${closed.basis || closed.note}"` : ""}.`,
      evidence,
    };
  }

  const window = parseTimeWindow(`${pilot} ${day.note}`);
  const overpass = minutesOf(det.localTimeGst);
  const inWindow = window && overpass !== undefined && overpass >= window.from && overpass <= window.to;
  const windowText = window ? ` The ${det.localTimeGst} overpass falls ${inWindow ? "inside" : "outside"} the logged ${window.text} window.` : "";
  const estimated = isEstimatedSource(day.hpSource) || isEstimatedSource(day.lpSource) || /estimat/i.test(day.note);
  // A declared event is a quantified vent/fugitive line citing the same permit, else the same equipment.
  const permits = extractPermits(day.note);
  const candidates = r.methane.filter((l) => l.status === "quantified" && (l.ch4T ?? 0) > 0 && !/flare/i.test(l.source) && !/^combustion$/i.test(l.category));
  const declared =
    candidates.find((l) => permits.some((p) => `${l.note} ${l.basis} ${l.source}`.includes(p))) ??
    candidates.find((l) => tagsOverlap(equipmentTags, extractTags(l.source)) && tagsOverlap(equipmentTags, extractTags(day.note)));
  const quantifiedInNote = /\d[\d,]*\s*Sm3|sheet\s*G|reported/i.test(day.note);

  if (declared && quantifiedInNote && !estimated && !abnormalPilot) {
    evidence.push(declared.evidence);
    return {
      det,
      verdict: "explained",
      text: `${head}. Matches a declared, quantified event: flare log "${clip(day.note, 220)}"${windowText} Quantified in sheet G ${declared.id} (${fmt(declared.ch4T ?? 0, 1)} t CH4).`,
      evidence,
    };
  }

  const { slipLine, combustionEfficiency } = flareFactors(ctx);
  const hours = window && inWindow ? (window.to - window.from) / 60 : undefined;
  const indicative = hours ? ` Indicative only: ${fmt(det.rateKgCh4PerH)} kg/h over the ${fmt(hours, 1)} h window is about ${fmt((det.rateKgCh4PerH * hours) / 1000, 1)} t CH4.` : "";
  const assumption =
    abnormalPilot && slipLine && combustionEfficiency ? ` Sheet G ${slipLine.id} assumes ${fmt(combustionEfficiency * 100, 0)}% combustion efficiency all year.` : "";
  if (abnormalPilot && slipLine) evidence.push(slipLine.evidence);
  return {
    det,
    verdict: "corroborated",
    text: `${head}. The flare log records an abnormal event that day: "${clip(event, 220)}".${windowText}${estimated ? " The volume is an engineering estimate, not metered." : " The event is not quantified in sheet G."}${assumption}${indicative}`,
    evidence,
  };
}

function detections(ctx: CheckContext): CheckOutput {
  const base = { checkId: "satellite.detections", title: "Satellite methane detections", category: "satellite" } as const;
  const { report: r } = ctx;
  const dets = ctx.reference.detections
    .filter((d) => d.nearestFacilityId === r.facility.eadId && d.localDate >= r.period.start && d.localDate <= r.period.end)
    .sort((a, b) => a.datetimeUtc.localeCompare(b.datetimeUtc));
  if (!dets.length) return { ...base, status: "pass", message: `No satellite methane detections attributed to ${r.facility.eadId} in ${ctx.year}`, findings: [] };

  const assessments = dets.map((d) => assess(ctx, d));
  const flagged = assessments.filter((a) => a.verdict !== "explained");
  const explained = assessments.filter((a) => a.verdict === "explained");
  const simulated = dets.every((d) => d.simulated) ? " Satellite data are simulated for the demo." : "";
  const metrics = {
    detections: dets.length,
    explained: explained.length,
    corroborated: flagged.filter((a) => a.verdict === "corroborated").length,
    unexplained: flagged.filter((a) => a.verdict === "unexplained").length,
    maxRateKgCh4PerH: Math.max(...dets.map((d) => d.rateKgCh4PerH)),
  };
  const evidence = assessments.flatMap((a) => a.evidence);
  const uniqueEvidence = evidence.filter((ref, i) => evidence.findIndex((x) => x.documentId === ref.documentId && x.locator === ref.locator) === i);

  if (!flagged.length) {
    const finding: DraftFinding = {
      checkId: base.checkId,
      title: `Satellite detection${dets.length > 1 ? "s" : ""} explained by declared events`,
      category: "satellite",
      severity: "info",
      outcome: "signal",
      summary: `${dets.length} satellite methane detection${dets.length > 1 ? "s match" : " matches"} a declared, quantified event: ${explained.map((a) => `${a.det.id} on ${formatDate(a.det.localDate)} at ${a.det.nearestEquipment}`).join("; ")}. No action needed.${simulated}`,
      details: explained.map((a) => a.text),
      evidence: uniqueEvidence,
      ruleIds: ["EAD-TGD-INSPECTION"],
      metrics,
    };
    return { ...base, status: "pass", message: finding.summary, findings: [finding] };
  }

  const corroborated = flagged.filter((a) => a.verdict === "corroborated");
  const unexplained = flagged.filter((a) => a.verdict === "unexplained");
  const when = (list: Assessment[]) => list.map((a) => `${formatDate(a.det.localDate)}, ${a.det.nearestEquipment}`).join("; ");
  const rates = flagged.map((a) => a.det.rateKgCh4PerH);
  const parts = [
    corroborated.length ? `${corroborated.length} coincide${corroborated.length > 1 ? "" : "s"} with logged events whose volumes are estimated or unquantified (${when(corroborated)})` : "",
    unexplained.length ? `${unexplained.length} ${unexplained.length > 1 ? "have" : "has"} no logged event (${when(unexplained)})` : "",
  ].filter(Boolean);
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: "Satellite methane signals not explained by declared events",
    category: "satellite",
    severity: "high",
    outcome: "signal",
    summary:
      `${flagged.length} satellite methane detection${flagged.length > 1 ? "s" : ""} at this facility (${rates.length > 1 ? `${fmt(Math.min(...rates))} to ${fmt(Math.max(...rates))}` : fmt(rates[0])} kg CH4/h) ` +
      `${flagged.length > 1 ? "are" : "is"} not explained by declared events: ${parts.join(" and ")}. A signal to investigate, not proof.${simulated}`,
    details: assessments.map((a) => `${a.verdict === "explained" ? "Explained" : a.verdict === "corroborated" ? "Corroborated by the log" : "Unexplained"}: ${a.text}`),
    evidence: uniqueEvidence,
    ruleIds: ["EAD-TGD-INSPECTION"],
    metrics,
  };
  return { ...base, status: "warning", message: finding.summary, findings: [finding] };
}
