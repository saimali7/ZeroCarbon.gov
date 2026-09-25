import type {
  DieselInvoice,
  EvidenceData,
  FlareLogDay,
  FuelMeterMonth,
  ProductionMonth,
  SubmissionDocument,
} from "@zerocarbon/shared";
import { detectCsvKind } from "./classify.ts";
import { parseCsvRecords } from "./csv.ts";
import { toIsoDate, toMonth, toNumber } from "./ead-workbook.ts";

type Row = Record<string, string>;

/** Accessor for the first header column matching any pattern (in pattern order). */
function field(header: string[], ...patterns: RegExp[]): (row: Row) => string {
  const lower = header.map((h) => h.toLowerCase());
  let key: string | undefined;
  for (const re of patterns) {
    const i = lower.findIndex((h) => re.test(h));
    if (i >= 0) {
      key = header[i];
      break;
    }
  }
  return (row) => (key === undefined ? "" : (row[key] ?? ""));
}

const num = (text: string) => toNumber(text) ?? 0;
const optNum = (text: string) => toNumber(text);

/** Parse a supporting-evidence CSV, detecting its type from the header columns. Unknown layouts return {}. */
export function parseEvidenceCsv(text: string, document: SubmissionDocument): Partial<EvidenceData> {
  const { header, records } = parseCsvRecords(text);
  const source = { documentId: document.id, fileName: document.fileName };
  const f = (...patterns: RegExp[]) => field(header, ...patterns);

  switch (detectCsvKind(header)) {
    case "flare_log": {
      const [date, hp, hpSrc, lp, lpSrc, pilot, note] = [
        f(/^date/, /date/),
        f(/hp.*sm3/, /fl-?501/, /^hp/),
        f(/hp.*(source|status|method)/),
        f(/lp.*sm3/, /fl-?502/, /^lp(?!.*(source|status))/),
        f(/lp.*(source|status|method)/),
        f(/pilot/),
        f(/note|event|remark|comment/),
      ];
      const days: FlareLogDay[] = records.flatMap((r) => {
        const iso = toIsoDate(date(r));
        return iso
          ? [{ date: iso, hpSm3: num(hp(r)), hpSource: hpSrc(r), lpSm3: num(lp(r)), lpSource: lpSrc(r), pilotStatus: pilot(r), note: note(r) }]
          : [];
      });
      return { flareLog: { ...source, days } };
    }
    case "fuel_meter_log": {
      const [month, tag, volume, status, ncv, note] = [
        f(/^month/, /month|period/),
        f(/meter|tag/),
        f(/volume|sm3/),
        f(/status/),
        f(/ncv/),
        f(/note|remark|comment/),
      ];
      const months: FuelMeterMonth[] = records.flatMap((r) => {
        const m = toMonth(month(r));
        return m ? [{ month: m, meterTag: tag(r), volumeSm3: num(volume(r)), status: status(r), ncvMjPerSm3: optNum(ncv(r)), note: note(r) }] : [];
      });
      return { fuelMeter: { ...source, months } };
    }
    case "diesel_invoices": {
      const [invoice, date, supplier, product, litres, density, mass, deliveredTo] = [
        f(/invoice/),
        f(/date/),
        f(/supplier|vendor/),
        f(/product|fuel|description/),
        f(/litre|liter|volume/),
        f(/density/),
        f(/mass|tonnes?\b|_t$/),
        f(/delivered.?to|destination|tank|location/),
      ];
      const invoices: DieselInvoice[] = records.map((r) => {
        const l = num(litres(r));
        const d = optNum(density(r));
        return {
          invoiceNo: invoice(r),
          date: toIsoDate(date(r)) ?? date(r),
          supplier: supplier(r),
          product: product(r),
          litres: l,
          densityKgPerL: d,
          massT: optNum(mass(r)) ?? (d ? Math.round(l * d) / 1000 : 0),
          deliveredTo: deliveredTo(r) || undefined,
        };
      });
      return { dieselInvoices: { ...source, invoices } };
    }
    case "production_gas_balance": {
      const [month, days, oil, bopd, produced, fuel, exportedSm3, exportedBoe, reinjected, flared, note] = [
        f(/^month/, /month|period/),
        f(/^days/, /days/),
        f(/oil.*bbl/, /^oil/),
        f(/bopd|avg/),
        f(/produced|production/),
        f(/fuel/),
        f(/export.*sm3/, /export(?!.*boe)/),
        f(/export.*boe/),
        f(/reinject|injected/),
        f(/flare/),
        f(/note|remark|comment/),
      ];
      const months: ProductionMonth[] = records.flatMap((r) => {
        const m = toMonth(month(r));
        return m
          ? [
              {
                month: m,
                days: num(days(r)),
                oilBbl: num(oil(r)),
                avgBopd: optNum(bopd(r)),
                gasProducedSm3: num(produced(r)),
                fuelGasSm3: num(fuel(r)),
                gasExportedSm3: num(exportedSm3(r)),
                gasExportedBoe: optNum(exportedBoe(r)),
                gasReinjectedSm3: num(reinjected(r)),
                flaredByBalanceSm3: num(flared(r)),
                note: note(r),
              },
            ]
          : [];
      });
      return { productionBalance: { ...source, months } };
    }
    default:
      return {};
  }
}
