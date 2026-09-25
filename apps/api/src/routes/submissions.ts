import { Router, type RequestHandler } from "express";
import multer from "multer";
import { z } from "zod";
import type { AppDeps } from "../app.ts";
import { HttpError, parseInput } from "../lib/http.ts";
import { errorMessage, recordAudit } from "../services/audit.ts";
import { getDocumentText, readDocumentFile } from "../services/documents.ts";
import type { ReviewRunner } from "../services/review-runner.ts";
import { buildSummary, getDetail, listSummaries } from "../services/summaries.ts";
import type { UploadedFile } from "../types.ts";
import { listQuery, queryFlag } from "./schemas.ts";

const MAX_FILES = 40;

export function submissionsRouter(deps: AppDeps, runner: ReviewRunner): Router {
  const router = Router();

  router.get("/submissions", async (req, res) => {
    res.json(await listSummaries(deps, runner, parseInput(listQuery, req.query)));
  });

  router.get("/submissions/:id", async (req, res) => {
    res.json(await getDetail(deps, runner, req.params.id));
  });

  router.post("/submissions", uploadMiddleware(deps.maxUploadMb), async (req, res) => {
    const files = toUploadedFiles(req.files as Express.Multer.File[] | undefined, req.body?.relativePaths ?? req.body?.paths);
    const record = await deps.catalog.createFromUpload(files);
    await recordAudit(deps, {
      type: "submission_received",
      submissionId: record.id,
      actor: "upload",
      message: `Submission package uploaded: ${record.facilityName} (${record.eadId}), ${files.length} file(s)`,
    });
    if (queryFlag(req.query.review)) {
      // The upload itself succeeded: a failed review shows up as stage "failed" in the summary.
      await runner.run(record.id).catch((err) => console.warn(`[upload] review of ${record.id} failed: ${errorMessage(err)}`));
    }
    res.status(201).json(buildSummary(deps.store, runner, record));
  });

  router.get("/submissions/:id/documents/:documentId", async (req, res) => {
    const { document, data } = await readDocumentFile(deps, req.params.id, req.params.documentId);
    const risky = /(^|\/|\+)(x?html|svg|xml)\b|javascript/i.test(document.mediaType);
    const type = risky || !document.mediaType ? "application/octet-stream" : document.mediaType;
    res.set({
      "Content-Type": /^text\/[^;]+$/i.test(type) ? `${type}; charset=utf-8` : type,
      "Content-Length": String(data.length),
      "Content-Disposition": contentDisposition(risky ? "attachment" : "inline", document.fileName),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    });
    res.end(data);
  });

  router.get("/submissions/:id/documents/:documentId/text", async (req, res) => {
    res.json(await getDocumentText(deps, req.params.id, req.params.documentId));
  });

  return router;
}

function uploadMiddleware(maxUploadMb: number): RequestHandler {
  const maxBytes = Math.max(1, Math.floor(maxUploadMb * 1024 * 1024));
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: MAX_FILES, fields: 200, parts: 300 },
    preservePath: true,
    defParamCharset: "utf8",
  }).array("files", MAX_FILES);
  return (req, res, next) =>
    upload(req, res, (err?: unknown) => {
      if (!err) return next();
      if (err instanceof multer.MulterError) {
        if (err.code === "LIMIT_FILE_SIZE") return next(new HttpError(413, `File too large (max ${maxUploadMb} MB per file)`, (err as { filename?: string }).filename));
        if (err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE") {
          return next(new HttpError(400, `Upload up to ${MAX_FILES} files in the "files" field`));
        }
        return next(new HttpError(400, `Invalid upload: ${err.message}`));
      }
      next(new HttpError(400, `Malformed multipart body: ${errorMessage(err)}`));
    });
}

const pathList = z.array(z.string().max(500));

function parsePaths(raw: unknown): (string | undefined)[] | undefined {
  if (raw === undefined) return undefined;
  const values = Array.isArray(raw) ? raw : [raw];
  if (values.length === 1 && typeof values[0] === "string" && values[0].trim().startsWith("[")) {
    try {
      return parseInput(pathList, JSON.parse(values[0])).map(cleanPath);
    } catch {
      throw new HttpError(400, 'Field "paths" must be a JSON array of relative paths');
    }
  }
  return parseInput(pathList, values).map(cleanPath);
}

/** Normalise a client-supplied relative path: forward slashes, no empty, "." or ".." segments. */
function cleanPath(value: string): string | undefined {
  const segments = value.replace(/\\/g, "/").split("/").filter((s) => s && s !== "." && s !== "..");
  return segments.length ? segments.join("/") : undefined;
}

function toUploadedFiles(files: Express.Multer.File[] | undefined, rawPaths: unknown): UploadedFile[] {
  if (!files?.length) throw new HttpError(400, 'Send the submission package as multipart/form-data in the "files" field');
  const paths = parsePaths(rawPaths);
  if (paths && paths.length !== files.length) {
    throw new HttpError(400, `Got ${paths.length} path(s) for ${files.length} file(s): "paths" must align with "files"`);
  }
  return files.map((file, i) => {
    const clientPath = cleanPath(file.originalname);
    const relativePath = paths?.[i] ?? (clientPath?.includes("/") ? clientPath : undefined);
    return {
      originalName: clientPath?.split("/").pop() ?? "file",
      ...(relativePath ? { relativePath } : {}),
      buffer: file.buffer,
      ...(file.mimetype ? { mediaType: file.mimetype } : {}),
    };
  });
}

/** `inline; filename="ascii"; filename*=UTF-8''percent-encoded` (RFC 6266 / RFC 5987). */
export function contentDisposition(type: "inline" | "attachment", fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]|["\\]/g, "_");
  const encoded = encodeURIComponent(fileName).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
