import type { EmissionsReport, ReferenceData, SubmissionDocument } from "@zerocarbon/shared";
import { HttpError } from "../../src/lib/http.ts";
import type { SubmissionCatalog, SubmissionPackage, SubmissionRecord, UploadedFile } from "../../src/types.ts";

export const SOUTH = "DEC_Southern-Dunes-CPF2_RY2025";
export const NORTH = "NGP_Northern-Gas-Plant_RY2025";

const doc = (id: string, fileName: string, kind: SubmissionDocument["kind"], mediaType: string, sizeBytes: number): SubmissionDocument => ({
  id,
  fileName,
  relativePath: kind === "emissions_report" ? fileName : `evidence/${fileName}`,
  kind,
  mediaType,
  sizeBytes,
  sha256: "0".repeat(64),
});

export function makeReport(documentId: string, facility: { name: string; eadId: string }, operator: string, totalCo2eT: number): EmissionsReport {
  return {
    documentId,
    operator: { name: operator, nameAr: "شركة الطاقة الصحراوية" },
    facility: { ...facility, permit: `EAD-PER-${facility.eadId}` },
    reportingYear: 2025,
    period: { start: "2025-01-01", end: "2025-12-31" },
    contacts: { ghgLead: "Dr. Layla Haddad", facilityManager: "Omar Saeed" },
    technicalUnits: [],
    dynamicData: {},
    approaches: { calculation: true, measurement: false, fallback: false, methane: true },
    sourceStreams: [],
    monthly: [],
    methane: [],
    totals: { co2T: totalCo2eT, ch4T: 0, ch4Co2eT: 0, totalCo2eT, gwpCh4: 28 },
    dataGaps: [],
    dataGapsDeclaredNone: true,
    verification: { body: "Gulf Assurance", evidence: { documentId: "x", fileName: "x", locator: "Page 1" } },
    instruments: [],
    mitigation: [],
    notApplicableSheets: {},
    warnings: [],
  };
}

interface Entry {
  record: SubmissionRecord;
  pkg: SubmissionPackage;
  files: Record<string, Buffer>;
}

function entry(record: SubmissionRecord, operator: string): Entry {
  const csv = "date,hp_sm3,lp_sm3\n2025-01-01,1000,200\n2025-01-02,1100,210\n";
  const documents = [
    doc("emissions-report", `${record.eadId}_Emissions-Report_2025.xlsx`, "emissions_report", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", 2048),
    doc("verification-statement", "Verification Statement – Gulf Assurance.pdf", "verification_statement", "application/pdf", 1024),
    doc("flare-log", "Flare-Log_Daily_2025.csv", "flare_log", "text/csv", csv.length),
  ];
  documents[0].sheetNames = ["A_Operator", "D2_Calculation_Approach"];
  return {
    record,
    pkg: {
      submissionId: record.id,
      source: record.source,
      rootDir: record.rootDir,
      documents,
      pdfText: { "verification-statement": [{ page: 1, text: "Verification opinion: qualified" }, { page: 2, text: "Findings F-01" }] },
      report: makeReport("emissions-report", { name: record.facilityName, eadId: record.eadId }, operator, record.reportedTotalTco2e ?? 0),
      evidence: {},
      warnings: [],
      loadedInMs: 3,
    },
    files: {
      "emissions-report": Buffer.from("PK fake xlsx"),
      "verification-statement": Buffer.from("%PDF-1.7 fake"),
      "flare-log": Buffer.from(`\uFEFF${csv}`),
    },
  };
}

export interface FakeCatalog extends SubmissionCatalog {
  uploads: UploadedFile[][];
  loadCalls: string[];
}

export function createFakeCatalog(): FakeCatalog {
  const entries = new Map<string, Entry>();
  const add = (e: Entry) => entries.set(e.record.id, e);
  add(
    entry(
      {
        id: SOUTH,
        source: "demo",
        rootDir: "/demo/south",
        receivedAt: "2026-03-28T08:00:00.000Z",
        facilityName: "Southern Dunes Central Processing Facility 2",
        facilityShortName: "Southern Dunes CPF-2",
        operator: "Desert Energy Company",
        eadId: "AD-OG-0417",
        emirate: "Abu Dhabi",
        sector: "oil_and_gas",
        reportingYear: 2025,
        submittedOn: "2026-03-28",
        reportedTotalTco2e: 1_000_000,
        documentCount: 3,
        lat: 23.1,
        lon: 53.6,
      },
      "Desert Energy Company",
    ),
  );
  add(
    entry(
      {
        id: NORTH,
        source: "demo",
        rootDir: "/demo/north",
        receivedAt: "2026-03-15T08:00:00.000Z",
        facilityName: "Northern Gas Plant",
        facilityShortName: "Northern GP",
        operator: "Northern Gas Processing",
        eadId: "AD-OG-0233",
        emirate: "Abu Dhabi",
        sector: "oil_and_gas",
        reportingYear: 2025,
        submittedOn: "2026-03-15",
        reportedTotalTco2e: 500_000,
        documentCount: 3,
      },
      "Northern Gas Processing",
    ),
  );

  const uploads: UploadedFile[][] = [];
  const loadCalls: string[] = [];
  const reference: ReferenceData = {
    peers: [
      peer("AD-OG-0417", "Southern Dunes CPF-2", 23.1, 53.6),
      peer("AD-OG-0901", "Eastern Oasis Field", 23.9, 54.8),
      { ...peer("AD-OG-0901", "Eastern Oasis Field", 23.9, 54.8), reportingYear: 2023, intensityKgCo2ePerBoe: 1 },
    ],
    priorYear: [],
    detections: [
      {
        id: "DET-01",
        datetimeUtc: "2025-07-14T06:32:00Z",
        localTimeGst: "10:32",
        localDate: "2025-07-14",
        rateKgCh4PerH: 850,
        uncertaintyKgPerH: 200,
        confidence: "high",
        windFromDeg: 310,
        windSpeedMs: 4.2,
        plumeLengthM: 1200,
        nearestFacilityId: "AD-OG-0417",
        nearestFacility: "Southern Dunes CPF-2",
        nearestEquipment: "LP flare",
        distanceToEquipmentM: 90,
        lat: 23.101,
        lon: 53.602,
        instrument: "EMIT",
        note: "Simulated",
        simulated: true,
        plumePolygon: [[[53.6, 23.1], [53.61, 23.1], [53.61, 23.11], [53.6, 23.1]]],
      },
    ],
    facilities: [{ eadId: "AD-OG-0233", name: "Northern Gas Plant", lat: 24.2, lon: 54.1, equipment: [] }],
    sources: {},
  };

  const require = (id: string) => {
    const e = entries.get(id);
    if (!e) throw new HttpError(404, `Submission ${id} not found`);
    return e;
  };

  return {
    uploads,
    loadCalls,
    list: async () => [...entries.values()].map((e) => e.record),
    get: async (id) => entries.get(id)?.record,
    async loadPackage(id) {
      loadCalls.push(id);
      return require(id).pkg;
    },
    async readDocument(id, documentId) {
      const e = entries.get(id);
      const document = e?.pkg.documents.find((d) => d.id === documentId);
      return e && document ? { document, data: e.files[documentId] } : undefined;
    },
    async createFromUpload(files) {
      uploads.push(files);
      if (!files.some((f) => /\.xlsx$/i.test(f.originalName))) throw new HttpError(400, "No EAD emissions workbook (.xlsx) found in the upload");
      const id = `upload-${uploads.length}`;
      const e = entry(
        {
          id,
          source: "upload",
          rootDir: `/uploads/${id}`,
          receivedAt: new Date().toISOString(),
          facilityName: "Western Refinery",
          facilityShortName: "Western Refinery",
          operator: "Western Refining Co",
          eadId: "AD-IN-0555",
          reportingYear: 2025,
          submittedOn: "2026-03-30",
          reportedTotalTco2e: 250_000,
          documentCount: files.length,
          lat: 24.0,
          lon: 52.5,
        },
        "Western Refining Co",
      );
      add(e);
      return e.record;
    },
    getReference: async () => reference,
  };
}

function peer(eadId: string, facility: string, lat: number, lon: number) {
  return {
    eadId,
    operator: "Peer Operator",
    facility,
    emirate: "Abu Dhabi",
    lat,
    lon,
    reportingYear: 2024,
    productionMmboe: 20,
    reportedTco2e: 400_000,
    co2T: 390_000,
    ch4T: 300,
    intensityKgCo2ePerBoe: 20,
    ch4IntensityTPerMmboe: 15,
    flaredSm3PerBoe: 1.2,
    methaneSourcesQuantified: 6,
    verificationOpinion: "unmodified",
  };
}
