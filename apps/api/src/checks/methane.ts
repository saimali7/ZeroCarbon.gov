/** Completeness of methane quantification (sheet G). */
import type { EmissionsReport, EvidenceRef, MethaneLine } from "@zerocarbon/shared";
import { MATERIALITY_PCT, pctOfTotal, type CheckContext, type CheckOutput, type DraftFinding } from "./context.ts";
import { clip, extractTags, fmt, median, round, shortName, sum, tagsOverlap } from "./util.ts";

/** Technical-unit notes that indicate a methane emission point. */
const METHANE_EQUIPMENT = /vent|seal|methane|fugitive|pneumatic|leak|blowdown/i;
/** Monitoring Plan wording that shows a method is missing. */
const METHOD_MISSING = /under development|not (yet )?(been )?quantified|to be (developed|defined|included)|will be included/i;
const SOURCE_KINDS: [string, RegExp][] = [
  ["tank", /tank|storage/i],
  ["dehydration", /\bTEG\b|glycol|dehydrat/i],
  ["pneumatic", /pneumatic/i],
  ["seal", /seal/i],
  ["fugitive", /fugitive|leak|LDAR/i],
  ["blowdown", /blowdown|depressur/i],
];

const kindsOf = (text: string) => SOURCE_KINDS.filter(([, re]) => re.test(text)).map(([kind]) => kind);
/** True when a text refers to the same kind of source or the same equipment as a methane line. */
const mentions = (text: string, line: MethaneLine) =>
  kindsOf(line.source).some((k) => kindsOf(text).includes(k)) || tagsOverlap(extractTags(line.source), extractTags(text));

/** Vented and fugitive methane lines (excludes flare slip and combustion). */
export const isVentOrFugitive = (l: MethaneLine) => /vent|fugitive/i.test(l.category) && !/flare/i.test(l.source);
const isUnquantified = (l: MethaneLine) => l.status === "not_applicable" || l.status === "not_quantified" || l.ch4T === null;
const allQuantified = (r: EmissionsReport) => r.methane.length > 0 && r.methane.every((l) => l.status === "quantified" || l.status === "zero");

/** Median vented + fugitive methane intensity (t CH4/MMboe) of peer submissions that quantify every methane source. */
export function methaneReference(ctx: CheckContext) {
  const { report: r } = ctx;
  const peers = ctx.input.peerSubmissions
    .map((p) => p.report)
    .filter((p) => p.facility.eadId !== r.facility.eadId && p.reportingYear === r.reportingYear && (p.production?.mmboe ?? 0) > 0 && allQuantified(p))
    .map((p) => ({ name: p.facility.name, eadId: p.facility.eadId, intensity: sum(p.methane.filter(isVentOrFugitive).map((l) => l.ch4T ?? 0)) / p.production!.mmboe }));
  return peers.length ? { intensity: median(peers.map((p) => p.intensity)), peers } : undefined;
}

export function methaneChecks(ctx: CheckContext): CheckOutput[] {
  return [methaneCompleteness(ctx)];
}

function methaneCompleteness(ctx: CheckContext): CheckOutput {
  const { report: r } = ctx;
  const base = { checkId: "methane.completeness", title: "Methane sources quantified", category: "methane" } as const;
  const plan = ctx.plan("methane_method");
  const planMissing = plan && METHOD_MISSING.test(plan.text) ? plan : undefined;
  const tankPlans = ctx.plans("tank_venting");
  const exclusions = ctx.facts.verification?.scopeExclusions ?? [];

  const flagged: { line: MethaneLine; reasons: string[]; refs: EvidenceRef[] }[] = [];
  const clauses = new Set<string>();
  for (const line of r.methane.filter(isUnquantified)) {
    const reasons: string[] = [];
    const refs: EvidenceRef[] = [line.evidence];
    if (/de ?minimis/i.test(`${line.method} ${line.basis} ${line.note}`)) reasons.push("claimed de minimis without a quantified estimate");
    else if (line.status === "not_quantified") reasons.push("not quantified");
    const tags = extractTags(line.source);
    for (const unit of r.technicalUnits.filter((u) => u.inScope !== false && METHANE_EQUIPMENT.test(u.notes ?? "") && tagsOverlap(tags, extractTags(u.tag)))) {
      reasons.push(`C2 lists ${unit.tag} ${unit.description} in scope ("${unit.notes}")`);
      refs.push(ctx.reportRef("C2", `(b) Main technical units, ${unit.tag}`, { rows: unit.tag }));
      clauses.add("the facility has this equipment in scope");
    }
    if (kindsOf(line.source).includes("tank"))
      for (const p of tankPlans) {
        reasons.push(`Monitoring Plan${p.section ? ` section ${p.section}` : ""}: "${clip(p.text, 140)}"`);
        refs.push(p.evidence);
      }
    if (planMissing && mentions(planMissing.text, line)) {
      reasons.push(`Monitoring Plan section ${planMissing.section ?? "?"} names it as a source whose method is "under development"`);
      clauses.add("the Monitoring Plan says the method is under development");
    }
    if (exclusions.includes(line.id)) {
      reasons.push("excluded from the verification scope");
      clauses.add("the verifier excluded them from scope");
    }
    // A "not applicable" line with nothing contradicting it is accepted.
    if (reasons.length) flagged.push({ line, reasons, refs });
  }

  if (!flagged.length) {
    if (!r.methane.length) return { ...base, status: "not_applicable", message: "Sheet G reports no methane sources", findings: [] };
    return { ...base, status: "pass", message: `All ${r.methane.length} methane sources quantified (${fmt(r.totals.ch4T, 1)} t CH4)`, findings: [] };
  }

  const ids = flagged.map((f) => f.line.id);
  const idx = ids.map((id) => r.methane.findIndex((l) => l.id === id));
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  const idLabel = ids.length > 2 && contiguous ? `${ids[0]} to ${ids[ids.length - 1]}` : ids.join(", ");
  const names = flagged.map((f) => shortName(f.line.source).replace(/^[A-Z](?=[a-z])/, (c) => c.toLowerCase()));
  const why = [...clauses];
  const whyText = why.length ? ` although ${why.length > 1 ? `${why.slice(0, -1).join(", ")} and ${why[why.length - 1]}` : why[0]}` : " without a quantified estimate";

  const reference = methaneReference(ctx);
  const mmboe = r.production?.mmboe;
  const reportedVent = sum(r.methane.filter((l) => isVentOrFugitive(l) && !isUnquantified(l)).map((l) => l.ch4T ?? 0));
  const missingCh4 = reference && mmboe ? Math.max(0, Math.round(reference.intensity * mmboe - reportedVent)) : undefined;
  const missingCo2e = missingCh4 !== undefined ? missingCh4 * ctx.gwp : undefined;
  const material = missingCo2e !== undefined && pctOfTotal(ctx, missingCo2e) >= MATERIALITY_PCT;

  const details = flagged.map((f) => `${f.line.id} ${shortName(f.line.source)}: reported "${f.line.note || f.line.method || f.line.status}"; ${f.reasons.join("; ")}.`);
  if (planMissing) details.push(`Monitoring Plan section ${planMissing.section ?? "?"}: "${clip(planMissing.text, 240)}"`);
  if (exclusions.length) details.push(`The verifier excluded ${exclusions.join(", ")} from the scope of the verification.`);
  if (flagged.some((f) => f.reasons[0]?.startsWith("claimed de minimis")))
    details.push("EAD's template asks for the estimated t CO2e of every source, including de minimis ones, so a de minimis claim needs a quantified estimate showing the thresholds are met.");
  if (missingCh4 !== undefined) {
    const peers = reference!.peers;
    details.push(
      `Estimate: reference vented and fugitive methane intensity ${fmt(reference!.intensity, 1)} t CH4/MMboe (median of ${peers.length} peer submission${peers.length > 1 ? "s" : ""} that quantify every source: ${peers.map((p) => p.name).join(", ")}) ` +
        `x ${fmt(mmboe!, 2)} MMboe = ${fmt(reference!.intensity * mmboe!, 1)} t CH4, less ${fmt(reportedVent, 1)} t already reported = ${fmt(missingCh4)} t CH4 (x ${ctx.gwp} = ${fmt(missingCo2e!)} t CO2e).`,
    );
  } else details.push("No peer submission that quantifies every methane source is available, so the missing methane is not estimated.");

  const scopeRef = ctx.facts.verification?.evidence.find((e) => /exclu|scope|does not cover/i.test(e.quote ?? "")) ?? ctx.facts.verification?.evidence[0];
  const evidence = [...flagged.flatMap((f) => f.refs), ...(planMissing ? [planMissing.evidence] : []), ...(exclusions.length && scopeRef ? [scopeRef] : [])];
  const finding: DraftFinding = {
    checkId: base.checkId,
    title: `Methane sources not quantified (${idLabel})`,
    category: "methane",
    severity: material ? "critical" : "high",
    outcome: "breach",
    summary:
      `${flagged.length} methane source${flagged.length > 1 ? "s" : ""} (${names.join(", ")}) ${flagged.length > 1 ? "are" : "is"} reported as not applicable or not quantified${whyText}.` +
      (missingCh4 !== undefined ? ` Using a peer reference of ${fmt(reference!.intensity, 1)} t CH4/MMboe, the missing methane is about ${fmt(missingCh4)} t CH4 (${fmt(missingCo2e!)} t CO2e).` : ""),
    details,
    evidence: evidence.filter((ref, i) => evidence.findIndex((x) => x.documentId === ref.documentId && x.locator === ref.locator) === i),
    ruleIds: ["EAD-TGD-COMPLETENESS", "EAD-TGD-CATEGORIES", "DL11-2024-ART6-1"],
    ...(missingCo2e !== undefined
      ? {
          impact: {
            tco2e: missingCo2e,
            basis: `${fmt(reference!.intensity, 1)} t CH4/MMboe peer reference x ${fmt(mmboe!, 2)} MMboe - ${fmt(reportedVent, 1)} t reported = ${fmt(missingCh4!)} t CH4 x GWP ${ctx.gwp}`,
            countsTowardTotal: true,
          },
        }
      : {}),
    metrics: {
      sourcesNotQuantified: flagged.length,
      ...(reference ? { referenceIntensityTPerMmboe: round(reference.intensity, 1), referencePeers: reference.peers.length } : {}),
      ...(missingCh4 !== undefined ? { estimatedCh4T: missingCh4, estimatedCo2eT: missingCo2e! } : {}),
    },
  };
  return { ...base, status: "fail", message: finding.summary, findings: [finding] };
}
