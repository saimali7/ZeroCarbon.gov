import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { EmissionsReport, EvidenceData, SubmissionDocument, SubmissionSource } from "@zerocarbon/shared";
import type { PageText, SubmissionPackage } from "../types.ts";
import { classifyDocument } from "./classify.ts";
import { parseCsv } from "./csv.ts";
import { isEadWorkbook, parseEadWorkbook } from "./ead-workbook.ts";
import { parseEvidenceCsv } from "./evidence.ts";
import { extractPdfPages } from "./pdf.ts";
import { readXlsx } from "./xlsx.ts";

/** Name of the manifest written next to uploaded packages (not a submission document). */
export const UPLOAD_MANIFEST = "upload.json";

const MEDIA_TYPES: Record<string, string> = {
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pdf": "application/pdf",
  ".csv": "text/csv",
  ".json": "application/json",
  ".txt": "text/plain",
};

export const mediaTypeOf = (fileName: string) => MEDIA_TYPES[path.extname(fileName).toLowerCase()] ?? "application/octet-stream";

/** "DEC-SDF-CPF2_Flare-Log_Daily_2025" -> "dec-sdf-cpf2-flare-log-daily-2025" */
export function slugify(text: string): string {
  return (
    text
      .normalize("NFKD")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file"
  );
}

/** Relative paths (forward slashes) of all package files, sorted; skips dotfiles and the upload manifest. */
export async function listPackageFiles(rootDir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, prefix: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") || entry.name === "__MACOSX") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await walk(path.join(dir, entry.name), rel);
      else if (entry.isFile() && rel !== UPLOAD_MANIFEST) out.push(rel);
    }
  };
  await walk(rootDir, "");
  return out.sort();
}

/** Stable document id: slug of the file name without extension, suffixed when two files share it. */
function uniqueId(fileName: string, usedIds: Set<string>): string {
  const base = slugify(fileName.replace(/\.[^.]+$/, ""));
  let id = base;
  for (let n = 2; usedIds.has(id); n++) id = `${base}-${n}`;
  usedIds.add(id);
  return id;
}

function describe(relativePath: string, data: Buffer, id: string): SubmissionDocument {
  const fileName = path.posix.basename(relativePath);
  return {
    id,
    fileName,
    relativePath,
    kind: classifyDocument(relativePath),
    mediaType: mediaTypeOf(fileName),
    sizeBytes: data.length,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const isXlsx = (name: string) => /\.xlsx$/i.test(name);
/** Sort key so that a workbook named like the EAD report is preferred when several exist. */
const workbookRank = (rel: string) => (isXlsx(rel) && /mrv|emission/i.test(path.posix.basename(rel)) ? 0 : 1);

/** Parse an EAD workbook file, returning undefined when it is not one. Throws on unreadable files. */
function parseWorkbook(document: SubmissionDocument, data: Buffer): { report?: EmissionsReport; sheetNames: string[] } {
  const workbook = readXlsx(data);
  const sheetNames = workbook.sheets.map((s) => s.name);
  return { report: isEadWorkbook(workbook) ? parseEadWorkbook(workbook, document) : undefined, sheetNames };
}

/** Read and parse a whole submission folder: documents, PDF text, EAD workbook and evidence CSVs. */
export async function loadSubmissionPackage(
  rootDir: string,
  options: { submissionId: string; source: SubmissionSource },
): Promise<SubmissionPackage> {
  const started = performance.now();
  const warnings: string[] = [];
  const usedIds = new Set<string>();
  const files = await Promise.all(
    (await listPackageFiles(rootDir)).map(async (rel) => ({ rel, data: await readFile(path.join(rootDir, ...rel.split("/"))) })),
  );
  const documents = files.map(({ rel, data }) => ({ document: describe(rel, data, uniqueId(path.posix.basename(rel), usedIds)), data }));

  const pdfText: Record<string, PageText[]> = {};
  const pdfJobs = documents
    .filter(({ document }) => document.mediaType === "application/pdf")
    .map(async ({ document, data }) => {
      try {
        const pages = await extractPdfPages(data);
        pdfText[document.id] = pages;
        document.pageCount = pages.length;
        if (document.kind === "other") document.kind = classifyDocument(document.relativePath, { firstText: pages[0]?.text });
      } catch (err) {
        warnings.push(`${document.fileName}: could not extract PDF text (${errorText(err)}).`);
      }
    });

  let report: EmissionsReport | undefined;
  let reportFile = "";
  const evidence: EvidenceData = {};
  for (const { document, data } of [...documents].sort((a, b) => workbookRank(a.document.relativePath) - workbookRank(b.document.relativePath))) {
    try {
      if (isXlsx(document.fileName)) {
        const parsed = parseWorkbook(document, data);
        document.sheetNames = parsed.sheetNames;
        if (!parsed.report) {
          warnings.push(`${document.fileName}: not an EAD MRV workbook (sheets C1 and D2 not found).`);
          if (document.kind === "emissions_report") document.kind = "other";
        } else if (report) {
          warnings.push(`${document.fileName}: more than one EAD MRV workbook found; using ${reportFile}.`);
        } else {
          report = parsed.report;
          reportFile = document.fileName;
          document.kind = "emissions_report";
          warnings.push(...report.warnings.map((w) => `${document.fileName}: ${w}`));
        }
      } else if (/\.csv$/i.test(document.fileName)) {
        const text = data.toString("utf8");
        const rows = parseCsv(text);
        document.rowCount = Math.max(0, rows.length - 1);
        if (document.kind === "other") document.kind = classifyDocument(document.relativePath, { csvHeader: rows[0] ?? [] });
        const parsed = parseEvidenceCsv(text, document);
        for (const key of Object.keys(parsed) as (keyof EvidenceData)[]) {
          if (evidence[key]) warnings.push(`${document.fileName}: duplicate ${key} evidence; keeping ${evidence[key]!.fileName}.`);
          else Object.assign(evidence, { [key]: parsed[key] });
        }
      }
    } catch (err) {
      warnings.push(`${document.fileName}: could not be parsed (${errorText(err)}).`);
    }
  }
  await Promise.all(pdfJobs);
  if (!report) warnings.push("No EAD MRV emissions workbook found in the package.");

  return {
    submissionId: options.submissionId,
    source: options.source,
    rootDir,
    documents: documents.map((d) => d.document),
    pdfText,
    report,
    evidence,
    warnings,
    loadedInMs: Math.round(performance.now() - started),
  };
}

export interface PackageSummary {
  rootDir: string;
  documentCount: number;
  /** The first EAD workbook found, if any. */
  report?: EmissionsReport;
  workbook?: SubmissionDocument;
  warnings: string[];
}

/** Cheap summary for listings: counts files and parses only the EAD workbook. */
export async function readPackageSummary(rootDir: string): Promise<PackageSummary> {
  const files = await listPackageFiles(rootDir);
  const warnings: string[] = [];
  const usedIds = new Set<string>();
  // Assign ids for every file so the workbook's document id matches loadSubmissionPackage.
  const workbooks = files
    .map((rel) => ({ rel, id: uniqueId(path.posix.basename(rel), usedIds) }))
    .filter((f) => isXlsx(f.rel))
    .sort((a, b) => workbookRank(a.rel) - workbookRank(b.rel));
  for (const { rel, id } of workbooks) {
    try {
      const data = await readFile(path.join(rootDir, ...rel.split("/")));
      const document = describe(rel, data, id);
      const parsed = parseWorkbook(document, data);
      if (parsed.report) {
        return { rootDir, documentCount: files.length, report: parsed.report, workbook: { ...document, sheetNames: parsed.sheetNames }, warnings };
      }
    } catch (err) {
      warnings.push(`${path.posix.basename(rel)}: could not be parsed (${errorText(err)}).`);
    }
  }
  warnings.push("No EAD MRV emissions workbook found in the package.");
  return { rootDir, documentCount: files.length, warnings };
}
