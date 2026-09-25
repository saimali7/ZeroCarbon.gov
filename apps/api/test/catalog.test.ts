import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { createCatalog, shortFacilityName } from "../src/catalog.ts";
import { config } from "../src/config.ts";
import { listPackageFiles } from "../src/ingest/package.ts";
import { HttpError } from "../src/lib/http.ts";
import type { UploadedFile } from "../src/types.ts";

const SOUTH = path.join(config.dataDir, "submissions", "DEC_Southern-Dunes-CPF2_RY2025");
const SOUTH_ID = "dec-southern-dunes-cpf2-ry2025";
const EAST_ID = "dec-eastern-dunes-cpf1-ry2025";

const storeDir = await mkdtemp(path.join(os.tmpdir(), "zc-catalog-"));
after(() => rm(storeDir, { recursive: true, force: true }));
const catalog = createCatalog({ dataDir: config.dataDir, storeDir });

async function southFiles(): Promise<UploadedFile[]> {
  const files = await listPackageFiles(SOUTH);
  return Promise.all(files.map(async (rel) => ({ originalName: path.posix.basename(rel), relativePath: rel, buffer: await readFile(path.join(SOUTH, rel)) })));
}

const rejectsWith = (status: number, pattern?: RegExp) => (err: unknown) => {
  assert.ok(err instanceof HttpError, `expected HttpError, got ${err}`);
  assert.equal(err.status, status);
  if (pattern) assert.match(err.message, pattern);
  return true;
};

test("list() returns the demo submissions quickly, sorted by submission date", async () => {
  const started = performance.now();
  const records = await catalog.list();
  const firstMs = performance.now() - started;
  assert.ok(firstMs < 1500, `first list() took ${firstMs.toFixed(0)} ms`);

  const demo = records.filter((r) => r.source === "demo");
  assert.deepEqual(
    demo.map((r) => r.id),
    [EAST_ID, SOUTH_ID],
  );
  const [east, south] = demo;
  assert.equal(east.facilityShortName, "Eastern Dunes CPF-1");
  assert.equal(south.facilityShortName, "Southern Dunes CPF-2");
  assert.equal(south.facilityName, "Southern Dunes Field Central Processing Facility 2 (CPF-2)");
  assert.equal(south.eadId, "AD-OG-0417");
  assert.equal(south.operator, "Dunes Energy Company");
  assert.equal(south.reportedTotalTco2e, 274896);
  assert.equal(east.reportedTotalTco2e, 242693);
  assert.equal(south.lat, 22.814);
  assert.equal(south.lon, 54.1375);
  assert.equal(south.emirate, "Abu Dhabi");
  assert.equal(south.sector, "oil_and_gas");
  assert.equal(south.reportingYear, 2025);
  assert.equal(south.submittedOn, "2026-03-30");
  assert.equal(south.receivedAt, "2026-03-30T00:00:00.000Z");
  assert.equal(south.documentCount, 10);
  assert.equal(east.documentCount, 11);
  assert.equal(south.rootDir, SOUTH);

  const again = performance.now();
  await catalog.list();
  assert.ok(performance.now() - again < 50, "cached list() is near-instant");
  assert.equal((await catalog.get(SOUTH_ID))?.eadId, "AD-OG-0417");
  assert.equal(await catalog.get("nope"), undefined);
});

test("shortFacilityName heuristic", () => {
  assert.equal(shortFacilityName("Southern Dunes Field Central Processing Facility 2 (CPF-2)"), "Southern Dunes CPF-2");
  assert.equal(shortFacilityName("Taweelah Power Station"), "Taweelah Power Station");
});

test("loadPackage parses once and caches; unknown id is a 404", async () => {
  const t1 = performance.now();
  const pkg = await catalog.loadPackage(SOUTH_ID);
  const firstMs = performance.now() - t1;
  assert.equal(pkg.submissionId, SOUTH_ID);
  assert.equal(pkg.source, "demo");
  assert.equal(pkg.report?.facility.eadId, "AD-OG-0417");
  const t2 = performance.now();
  const again = await catalog.loadPackage(SOUTH_ID);
  const secondMs = performance.now() - t2;
  assert.equal(again, pkg);
  assert.ok(secondMs < firstMs / 5, `cached ${secondMs.toFixed(1)} ms vs first ${firstMs.toFixed(1)} ms`);
  await assert.rejects(catalog.loadPackage("unknown-submission"), rejectsWith(404));
});

test("readDocument returns the file bytes", async () => {
  const doc = await catalog.readDocument(SOUTH_ID, "dec-sdf-cpf2-flare-log-daily-2025");
  assert.equal(doc?.document.kind, "flare_log");
  assert.match(doc!.data.toString("utf8"), /^date,hp_flare_fl501_sm3/);
  assert.equal(doc?.data.length, doc?.document.sizeBytes);
  assert.equal(await catalog.readDocument(SOUTH_ID, "missing"), undefined);
  assert.equal(await catalog.readDocument("unknown", "x"), undefined);
});

test("getReference loads the regulator reference folder once", async () => {
  const ref = await catalog.getReference();
  assert.equal(ref.peers.length, 8);
  assert.equal(ref.detections.length, 4);
  assert.equal(await catalog.getReference(), ref);
});

test("createFromUpload stores a package that round-trips through list() and loadPackage()", async () => {
  const record = await catalog.createFromUpload(await southFiles());
  assert.match(record.id, /^ad-og-0417-ry2025-[0-9a-z]{6}$/);
  assert.equal(record.source, "upload");
  assert.equal(record.eadId, "AD-OG-0417");
  assert.equal(record.facilityShortName, "Southern Dunes CPF-2");
  assert.equal(record.documentCount, 10);
  assert.equal(record.rootDir, path.join(storeDir, "uploads", record.id));
  assert.ok(Date.now() - Date.parse(record.receivedAt) < 60_000);

  const manifest = JSON.parse(await readFile(path.join(record.rootDir, "upload.json"), "utf8"));
  assert.equal(manifest.receivedAt, record.receivedAt);
  assert.equal(manifest.files.length, 10);

  const listed = await catalog.list();
  assert.ok(listed.some((r) => r.id === record.id));
  const pkg = await catalog.loadPackage(record.id);
  assert.equal(pkg.source, "upload");
  assert.deepEqual(pkg.warnings, []);
  assert.equal(pkg.documents.length, 10);
  assert.ok(pkg.documents.some((d) => d.relativePath === "evidence/DEC-SDF-CPF2_Flare-Log_Daily_2025.csv"));
  assert.equal(pkg.report?.totals.totalCo2eT, 274896);
});

test("createFromUpload strips a common browser folder prefix", async () => {
  const files = (await southFiles()).map((f) => ({ ...f, relativePath: `DEC_Southern-Dunes-CPF2_RY2025/${f.relativePath}` }));
  const record = await catalog.createFromUpload(files);
  const pkg = await catalog.loadPackage(record.id);
  assert.ok(pkg.documents.some((d) => d.relativePath === "evidence/DEC-SDF-CPF2_Diesel-Invoices_2025.csv"));
});

test("createFromUpload rejects bad uploads with 400", async () => {
  const files = await southFiles();
  const withoutWorkbook = files.filter((f) => !f.originalName.endsWith(".xlsx"));
  await assert.rejects(catalog.createFromUpload(withoutWorkbook), rejectsWith(400, /EAD MRV emissions workbook/));
  await assert.rejects(catalog.createFromUpload([]), rejectsWith(400));
  const csv = files.find((f) => f.originalName.endsWith(".csv"))!;
  await assert.rejects(catalog.createFromUpload([...files, { ...csv, relativePath: "../evil.csv" }]), rejectsWith(400, /Invalid file path/));
  await assert.rejects(catalog.createFromUpload([...files, { ...csv, relativePath: "/etc/evil.csv" }]), rejectsWith(400));
  await assert.rejects(catalog.createFromUpload([...files, { ...csv, relativePath: "a/b/c.csv" }]), rejectsWith(400, /one level/));
  await assert.rejects(
    catalog.createFromUpload([...files, { originalName: "run.exe", buffer: Buffer.from("x") }]),
    rejectsWith(400, /Unsupported file type/),
  );
  await assert.rejects(
    catalog.createFromUpload([{ originalName: "fake.xlsx", buffer: Buffer.from("not a zip") }]),
    rejectsWith(400, /EAD MRV emissions workbook/),
  );
});
