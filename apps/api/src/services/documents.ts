import { readXlsx, workbookToText } from "../ingest/xlsx.ts";
import type { AskResponse, DocumentTextResponse, EmissionsReport, SubmissionDocument } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import { HttpError } from "../lib/http.ts";
import { buildIdentity, requireRecord } from "./summaries.ts";

type DocDeps = Pick<AppDeps, "catalog" | "store" | "ai" | "rules">;

const MAX_TEXT_CHARS = 200_000;

const isPdf = (d: SubmissionDocument) => d.mediaType === "application/pdf" || /\.pdf$/i.test(d.fileName);
const isWorkbook = (d: SubmissionDocument) => /spreadsheetml|ms-excel/i.test(d.mediaType) || /\.xlsx?$/i.test(d.fileName);
const isText = (d: SubmissionDocument) =>
  /^text\/|json/i.test(d.mediaType) || /\.(csv|txt|json|md)$/i.test(d.fileName);

export async function readDocumentFile(deps: Pick<AppDeps, "catalog">, id: string, documentId: string) {
  await requireRecord(deps.catalog, id);
  const file = documentId.startsWith("ref-")
    ? await deps.catalog.readReferenceDocument?.(documentId)
    : await deps.catalog.readDocument(id, documentId);
  if (!file) throw new HttpError(404, `Document ${documentId} not found`);
  return file;
}

export async function getDocumentText(deps: DocDeps, id: string, documentId: string): Promise<DocumentTextResponse> {
  await requireRecord(deps.catalog, id);
  if (documentId.startsWith("ref-")) {
    const { document, data } = await readDocumentFile(deps, id, documentId);
    const raw = data.toString("utf8").replace(/^\uFEFF/, "");
    const text = document.fileName.endsWith(".geojson") ? JSON.stringify(JSON.parse(raw), null, 2) : raw;
    return { documentId, fileName: document.fileName, kind: document.kind, pages: [{ page: 1, text: truncateText(text) }] };
  }
  const pkg = await deps.catalog.loadPackage(id);
  const document = pkg.documents.find((d) => d.id === documentId);
  if (!document) throw new HttpError(404, `Document ${documentId} not found`);
  const respond = (pages: { page: number; text: string }[]): DocumentTextResponse => ({
    documentId,
    fileName: document.fileName,
    kind: document.kind,
    pages,
  });

  if (isPdf(document)) {
    const pages = pkg.pdfText[documentId] ?? [];
    return respond(pages.length ? pages.map(({ page, text }) => ({ page, text })) : [{ page: 1, text: "No text could be extracted from this PDF." }]);
  }
  if (isWorkbook(document)) {
    const { data } = await readDocumentFile(deps, id, documentId);
    let text: string;
    try {
      text = workbookToText(readXlsx(new Uint8Array(data)));
    } catch {
      text = pkg.report?.documentId === documentId ? renderReport(pkg.report) : `Workbook sheets: ${document.sheetNames?.join(", ") || "unknown"}`;
    }
    return respond([{ page: 1, text }]);
  }
  if (isText(document)) {
    const { data } = await readDocumentFile(deps, id, documentId);
    return respond([{ page: 1, text: truncateText(data.toString("utf8").replace(/^\uFEFF/, "")) }]);
  }
  return respond([{ page: 1, text: "Text preview is not available for this file type. Download the file to view it." }]);
}

export function truncateText(text: string, maxChars = MAX_TEXT_CHARS): string {
  if (text.length <= maxChars) return text;
  const cut = text.lastIndexOf("\n", maxChars);
  const shown = text.slice(0, cut > 0 ? cut : maxChars);
  const totalLines = text.split("\n").length;
  const shownLines = shown.split("\n").length;
  return `${shown}\n\n[Truncated: showing the first ${shownLines} of ${totalLines} lines. Download the file for the full content.]`;
}

/** Plain-text rendering of the parsed workbook (sections as indented JSON, evidence refs omitted). */
export function renderReport(report: EmissionsReport): string {
  const sections: [string, unknown][] = [
    ["Operator", report.operator],
    ["Facility", report.facility],
    ["Reporting period", { reportingYear: report.reportingYear, period: report.period, submittedOn: report.submittedOn, monitoringPlan: report.monitoringPlan }],
    ["Contacts", report.contacts],
    ["Totals", report.totals],
    ["Production", report.production],
    ["Source streams", report.sourceStreams],
    ["Monthly activity", report.monthly],
    ["Methane", report.methane],
    ["Data gaps", report.dataGapsDeclaredNone && !report.dataGaps.length ? "None declared" : report.dataGaps],
    ["Verification", report.verification],
    ["Instruments", report.instruments],
    ["Declaration", report.declaration],
    ["Parser warnings", report.warnings],
  ];
  const json = (value: unknown) => JSON.stringify(value, (key, v) => (key === "evidence" ? undefined : v), 2);
  return sections
    .filter(([, value]) => value !== undefined)
    .map(([title, value]) => `## ${title}\n${typeof value === "string" ? value : json(value)}`)
    .join("\n\n");
}

export async function askQuestion(deps: DocDeps, id: string, question: string): Promise<AskResponse> {
  const record = await requireRecord(deps.catalog, id);
  const pkg = await deps.catalog.loadPackage(id);
  return deps.ai.answerQuestion({
    identity: buildIdentity(record, pkg.report),
    question,
    review: deps.store.getLatestReview(id),
    pkg,
    rules: deps.rules.list(),
  });
}
