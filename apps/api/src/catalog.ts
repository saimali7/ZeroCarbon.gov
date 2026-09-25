import { createHash, randomBytes } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ReferenceData, SubmissionDocument, SubmissionSource } from "@zerocarbon/shared";
import { isEadWorkbook, parseEadWorkbook } from "./ingest/ead-workbook.ts";
import { loadSubmissionPackage, mediaTypeOf, readPackageSummary, slugify, UPLOAD_MANIFEST } from "./ingest/package.ts";
import { readXlsx } from "./ingest/xlsx.ts";
import { HttpError } from "./lib/http.ts";
import { loadReferenceData } from "./reference/reference.ts";
import type { SubmissionCatalog, SubmissionPackage, SubmissionRecord, UploadedFile } from "./types.ts";

interface Entry {
  id: string;
  source: SubmissionSource;
  rootDir: string;
  mtimeMs: number;
}

const ALLOWED_EXT = /\.(xlsx|pdf|csv|json|txt)$/i;

/** "Southern Dunes Field Central Processing Facility 2 (CPF-2)" -> "Southern Dunes CPF-2" */
export function shortFacilityName(name: string): string {
  const abbr = name.match(/\(([^)]{1,20})\)\s*$/)?.[1];
  const base = name.replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (abbr) {
    const lead = base.split(/\s+(?:Field|Central|Processing|Facility|Plant|Station|Complex|Terminal|Site)\b/i)[0].trim();
    return lead && lead !== base ? `${lead} ${abbr}` : `${base} (${abbr})`;
  }
  return base.length <= 40 ? base : `${base.slice(0, 37).trimEnd()}...`;
}

const sanitizeSegment = (s: string) =>
  s
    .normalize("NFKC")
    .replace(/[^\w.\- ()]+/g, "_")
    .replace(/^[.\s]+/, "")
    .trim()
    .slice(0, 150);

/** Validate and normalise upload paths: no absolute paths or "..", at most one subfolder, allowed extensions only. */
function uploadPaths(files: UploadedFile[]): { rel: string; file: UploadedFile }[] {
  const split = files
    .map((file) => {
      const raw = (file.relativePath || file.originalName || "").replace(/\\/g, "/").trim();
      if (!raw || raw.startsWith("/") || /^[a-z]:/i.test(raw) || raw.split("/").includes("..")) {
        throw new HttpError(400, `Invalid file path "${raw}": use a plain file name or one subfolder such as "evidence/".`);
      }
      return { file, parts: raw.split("/").filter((s) => s && s !== ".") };
    })
    .filter(({ parts }) => parts.length > 0 && !parts.some((p) => p.startsWith(".") || p === "__MACOSX"));
  // Folder uploads from a browser prefix every path with the selected folder name: drop it.
  const top = split[0]?.parts[0];
  if (split.length > 0 && split.every((s) => s.parts.length > 1 && s.parts[0] === top)) for (const s of split) s.parts.shift();

  const seen = new Set<string>();
  return split.map(({ file, parts }) => {
    if (parts.length > 2) throw new HttpError(400, `"${parts.join("/")}" is nested too deeply: only one level of subfolder is allowed.`);
    const rel = parts.map(sanitizeSegment).join("/");
    if (!ALLOWED_EXT.test(rel)) throw new HttpError(400, `Unsupported file type "${parts.join("/")}": allowed types are .xlsx, .pdf, .csv, .json and .txt.`);
    if (rel.toLowerCase() === UPLOAD_MANIFEST) throw new HttpError(400, `"${UPLOAD_MANIFEST}" is a reserved file name.`);
    if (seen.has(rel.toLowerCase())) throw new HttpError(400, `Duplicate file "${rel}" in the upload.`);
    seen.add(rel.toLowerCase());
    return { rel, file };
  });
}

const randomId = () => Array.from(randomBytes(6), (b) => "0123456789abcdefghijklmnopqrstuvwxyz"[b % 36]).join("");

async function readManifest(rootDir: string): Promise<{ receivedAt?: string }> {
  try {
    return JSON.parse(await readFile(path.join(rootDir, UPLOAD_MANIFEST), "utf8"));
  } catch {
    return {};
  }
}

/** Regulator reference files, addressable as documents of any submission (evidence for peer and satellite findings). */
export const REFERENCE_DOCUMENTS: Record<string, RegExp> = {
  "ref-peer-benchmarks": /^peer-benchmarks.*\.csv$/i,
  "ref-prior-year": /^prior-year-submissions.*\.csv$/i,
  "ref-satellite": /satellite.*\.geojson$/i,
};

export function createCatalog(options: { dataDir: string; storeDir: string }): SubmissionCatalog {
  const demoDir = path.join(options.dataDir, "submissions");
  const uploadsDir = path.join(options.storeDir, "uploads");
  /** Keyed by folder; rebuilt when the folder's mtime changes. */
  const records = new Map<string, { mtimeMs: number; record: Promise<SubmissionRecord | undefined> }>();
  const packages = new Map<string, { mtimeMs: number; pkg: Promise<SubmissionPackage> }>();
  let reference: Promise<ReferenceData> | undefined;

  async function discover(): Promise<Entry[]> {
    const scan = async (dir: string, source: SubmissionSource): Promise<Entry[]> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
      const folders = entries.filter((e) => e.isDirectory() && !e.name.startsWith("."));
      return Promise.all(
        folders.map(async (e) => {
          const rootDir = path.join(dir, e.name);
          return { id: source === "demo" ? slugify(e.name) : e.name, source, rootDir, mtimeMs: (await stat(rootDir)).mtimeMs };
        }),
      );
    };
    return [...(await scan(demoDir, "demo")), ...(await scan(uploadsDir, "upload"))];
  }

  async function referenceDir(): Promise<string> {
    const entries = await readdir(options.dataDir, { withFileTypes: true }).catch(() => []);
    const dir = entries
      .filter((e) => e.isDirectory() && e.name.startsWith("regulator-reference"))
      .map((e) => e.name)
      .sort()[0];
    return path.join(options.dataDir, dir ?? "regulator-reference");
  }

  function getReference(): Promise<ReferenceData> {
    reference ??= referenceDir()
      .then(loadReferenceData)
      .catch((err) => {
        reference = undefined;
        throw err;
      });
    return reference;
  }

  async function readReferenceDocument(documentId: string): Promise<{ document: SubmissionDocument; data: Buffer } | undefined> {
    const pattern = REFERENCE_DOCUMENTS[documentId];
    if (!pattern) return undefined;
    const dir = await referenceDir();
    const fileName = (await readdir(dir).catch(() => [] as string[])).sort().find((name) => pattern.test(name));
    if (!fileName) return undefined;
    const data = await readFile(path.join(dir, fileName));
    return {
      data,
      document: {
        id: documentId,
        fileName,
        relativePath: fileName,
        kind: "other",
        mediaType: mediaTypeOf(fileName),
        sizeBytes: data.length,
        sha256: createHash("sha256").update(data).digest("hex"),
      },
    };
  }

  async function buildRecord(entry: Entry): Promise<SubmissionRecord | undefined> {
    const summary = await readPackageSummary(entry.rootDir);
    const report = summary.report;
    if (!report?.facility.eadId) {
      console.warn(`[catalog] skipped ${entry.rootDir}: ${summary.warnings.join(" ") || "no EAD facility ID in the workbook."}`);
      return undefined;
    }
    // Reference data only improves the display name: never let it hide a submission.
    const ref = await getReference().catch(() => undefined);
    const eadId = report.facility.eadId;
    const knownName = ref?.peers.find((p) => p.eadId === eadId)?.facility || ref?.facilities.find((f) => f.eadId === eadId)?.name;
    const facilityName = report.facility.name || path.basename(entry.rootDir);
    const receivedAt =
      entry.source === "upload" ? (await readManifest(entry.rootDir)).receivedAt : report.submittedOn && `${report.submittedOn}T00:00:00.000Z`;
    return {
      id: entry.id,
      source: entry.source,
      rootDir: entry.rootDir,
      receivedAt: receivedAt || new Date(entry.mtimeMs).toISOString(),
      facilityName,
      facilityShortName: knownName || shortFacilityName(facilityName),
      operator: report.operator.name,
      eadId,
      emirate: report.facility.emirate,
      sector: report.facility.sector,
      reportingYear: report.reportingYear,
      submittedOn: report.submittedOn,
      reportedTotalTco2e: report.totals.totalCo2eT || undefined,
      documentCount: summary.documentCount,
      lat: report.facility.lat,
      lon: report.facility.lon,
    };
  }

  async function list(): Promise<SubmissionRecord[]> {
    const entries = await discover();
    const built = await Promise.all(
      entries.map((entry) => {
        let cached = records.get(entry.rootDir);
        if (!cached || cached.mtimeMs !== entry.mtimeMs) {
          const record = buildRecord(entry).catch((err) => {
            console.warn(`[catalog] could not read ${entry.rootDir}: ${err instanceof Error ? err.message : err}`);
            return undefined;
          });
          cached = { mtimeMs: entry.mtimeMs, record };
          records.set(entry.rootDir, cached);
        }
        return cached.record;
      }),
    );
    const unique = new Map<string, SubmissionRecord>();
    for (const r of built) if (r && !unique.has(r.id)) unique.set(r.id, r);
    return [...unique.values()].sort(
      (a, b) => (a.submittedOn ?? a.receivedAt).localeCompare(b.submittedOn ?? b.receivedAt) || a.id.localeCompare(b.id),
    );
  }

  const get = async (id: string) => (await list()).find((r) => r.id === id);

  async function loadPackage(id: string): Promise<SubmissionPackage> {
    const record = await get(id);
    if (!record) throw new HttpError(404, `Submission "${id}" not found.`);
    const { mtimeMs } = await stat(record.rootDir);
    let cached = packages.get(id);
    if (!cached || cached.mtimeMs !== mtimeMs) {
      const pkg = loadSubmissionPackage(record.rootDir, { submissionId: id, source: record.source });
      const entry = { mtimeMs, pkg };
      packages.set(id, entry);
      pkg.catch(() => packages.get(id) === entry && packages.delete(id));
      cached = entry;
    }
    return cached.pkg;
  }

  async function readDocument(id: string, documentId: string): Promise<{ document: SubmissionDocument; data: Buffer } | undefined> {
    if (!(await get(id))) return undefined;
    const pkg = await loadPackage(id);
    const document = pkg.documents.find((d) => d.id === documentId);
    return document && { document, data: await readFile(path.join(pkg.rootDir, ...document.relativePath.split("/"))) };
  }

  async function createFromUpload(files: UploadedFile[]): Promise<SubmissionRecord> {
    if (files.length === 0) throw new HttpError(400, "No files were uploaded.");
    const prepared = uploadPaths(files);

    let eadId = "";
    let year = 0;
    for (const { rel, file } of prepared.filter((p) => /\.xlsx$/i.test(p.rel))) {
      try {
        const workbook = readXlsx(file.buffer);
        if (!isEadWorkbook(workbook)) continue;
        const fileName = path.posix.basename(rel);
        const document: SubmissionDocument = {
          id: slugify(fileName.replace(/\.[^.]+$/, "")),
          fileName,
          relativePath: rel,
          kind: "emissions_report",
          mediaType: mediaTypeOf(fileName),
          sizeBytes: file.buffer.length,
          sha256: "",
        };
        const report = parseEadWorkbook(workbook, document);
        if (report.facility.eadId) {
          eadId = report.facility.eadId;
          year = report.reportingYear;
          break;
        }
      } catch {
        // Not a readable workbook: keep looking.
      }
    }
    if (!eadId) {
      throw new HttpError(
        400,
        "The upload must include the EAD MRV emissions workbook (.xlsx) with the EAD facility registration ID filled in (sheet C1).",
      );
    }

    const id = `${slugify(eadId)}-ry${year || new Date().getFullYear()}-${randomId()}`;
    const rootDir = path.join(uploadsDir, id);
    try {
      for (const { rel, file } of prepared) {
        const target = path.join(rootDir, ...rel.split("/"));
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, file.buffer);
      }
      const manifest = {
        id,
        receivedAt: new Date().toISOString(),
        eadId,
        reportingYear: year,
        files: prepared.map(({ rel, file }) => ({
          path: rel,
          originalName: file.originalName,
          sizeBytes: file.buffer.length,
          mediaType: file.mediaType || mediaTypeOf(rel),
        })),
      };
      await writeFile(path.join(rootDir, UPLOAD_MANIFEST), JSON.stringify(manifest, null, 2));
    } catch (err) {
      await rm(rootDir, { recursive: true, force: true });
      throw err;
    }

    records.delete(rootDir);
    const record = await get(id);
    if (!record) throw new HttpError(500, "The uploaded package could not be read back.");
    return record;
  }

  return { list, get, loadPackage, readDocument, createFromUpload, getReference, readReferenceDocument };
}
