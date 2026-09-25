import type { EvidenceRef } from "@zerocarbon/shared";

/** Stable document id from a file name: drops the "DEC-SDF-CPF2_" style prefix and the extension. */
export function docId(fileName: string): string {
  const base = fileName.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug(base.replace(/^[A-Z0-9]+(?:-[A-Z0-9]+)*_/, "")) || slug(base) || "document";
}

/** File names of one demo submission package (evidence files live in "evidence/"). */
export interface PackageFiles {
  xlsx: string;
  cover: string;
  plan: string;
  verification: string;
  flareLog: string;
  fuelMeter: string;
  diesel: string;
  production: string;
  gasAnalysis: string;
  calibration: string;
  ldar?: string;
}

export function packageFiles(code: string, planRev: string, withLdar: boolean): PackageFiles {
  const f = (s: string) => `${code}_${s}`;
  return {
    xlsx: f("EAD-MRV-Emissions-Report_RY2025.xlsx"),
    cover: f("Cover-Letter_RY2025.pdf"),
    plan: f(`Monitoring-Plan_Rev${planRev}.pdf`),
    verification: f("Verification-Statement_RY2025.pdf"),
    flareLog: f("Flare-Log_Daily_2025.csv"),
    fuelMeter: f("Fuel-Gas-Meter-FT3001_Monthly_2025.csv"),
    diesel: f("Diesel-Invoices_2025.csv"),
    production: f("Production-and-Gas-Balance_Monthly_2025.csv"),
    gasAnalysis: f("Gas-Analysis-Certificate_2025.pdf"),
    calibration: f("Meter-Calibration-Certificates.pdf"),
    ...(withLdar ? { ldar: f("LDAR-Survey-Summary_2025.pdf") } : {}),
  };
}

export type PdfKey = "cover" | "plan" | "verification" | "gasAnalysis" | "calibration" | "ldar";
export type CsvKey = "flareLog" | "fuelMeter" | "diesel" | "production";

/** Regulator reference files, addressable as documents of any submission. */
export const REFERENCE_DOCS = {
  peers: { id: "ref-peer-benchmarks", fileName: "peer-benchmarks_onshore-oil-CPF_RY2025.csv", mediaType: "text/csv" },
  priorYear: { id: "ref-prior-year", fileName: "prior-year-submissions_RY2024.csv", mediaType: "text/csv" },
  satellite: { id: "ref-satellite", fileName: "satellite-methane-detections_2025_SIMULATED.geojson", mediaType: "application/geo+json" },
} as const;

export type ReferenceKey = keyof typeof REFERENCE_DOCS;

const opt = <K extends string, V>(key: K, value: V | undefined) => (value === undefined ? {} : ({ [key]: value } as Record<K, V>));

/** EvidenceRef builders bound to one package's file names. */
export function refBuilders(files: PackageFiles) {
  const base = (fileName: string) => ({ documentId: docId(fileName), fileName });
  return {
    sheet: (sheet: string, rows?: string, quote?: string, section?: string): EvidenceRef => ({
      ...base(files.xlsx),
      locator: [`Sheet ${sheet}`, section, rows && `row ${rows}`].filter(Boolean).join(", "),
      sheet,
      ...opt("rows", rows),
      ...opt("quote", quote),
    }),
    page: (key: PdfKey, page: number, quote?: string, section?: string): EvidenceRef => ({
      ...base(files[key] ?? ""),
      locator: section ? `Page ${page}, ${section}` : `Page ${page}`,
      page,
      ...opt("quote", quote),
    }),
    rows: (key: CsvKey, rows: string, quote?: string, column?: string): EvidenceRef => {
      const [a, b] = rows.split("..");
      const where = b ? `Rows ${a} to ${b}` : `Row ${a}`;
      return { ...base(files[key]), locator: column ? `${where}, column ${column}` : where, rows, ...opt("quote", quote) };
    },
    reference: (key: ReferenceKey, locator: string, rows?: string, quote?: string): EvidenceRef => ({
      documentId: REFERENCE_DOCS[key].id,
      fileName: REFERENCE_DOCS[key].fileName,
      locator,
      ...opt("rows", rows),
      ...opt("quote", quote),
    }),
  };
}

export type RefBuilders = ReturnType<typeof refBuilders>;
