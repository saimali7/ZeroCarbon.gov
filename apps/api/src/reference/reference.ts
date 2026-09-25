import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FacilityPoint, PeerBenchmark, PriorYearRecord, ReferenceData, SatelliteDetection } from "@zerocarbon/shared";
import { parseCsvRecords } from "../ingest/csv.ts";
import { toNumber } from "../ingest/ead-workbook.ts";

type Row = Record<string, string>;

const str = (row: Row, ...keys: string[]) => keys.map((k) => row[k]?.trim()).find(Boolean) ?? "";
const num = (row: Row, ...keys: string[]) => toNumber(str(row, ...keys)) ?? 0;
const optNum = (row: Row, ...keys: string[]) => toNumber(str(row, ...keys));

function toPeer(r: Row): PeerBenchmark {
  return {
    eadId: str(r, "ead_facility_id", "ead_id", "facility_id"),
    operator: str(r, "operator"),
    facility: str(r, "facility", "facility_name"),
    emirate: str(r, "emirate"),
    lat: num(r, "lat", "latitude"),
    lon: num(r, "lon", "longitude"),
    reportingYear: num(r, "reporting_year", "year"),
    productionMmboe: num(r, "production_mmboe"),
    reportedTco2e: num(r, "reported_tco2e", "tco2e"),
    co2T: num(r, "co2_t"),
    ch4T: num(r, "ch4_t"),
    intensityKgCo2ePerBoe: num(r, "intensity_kgco2e_per_boe"),
    ch4IntensityTPerMmboe: num(r, "ch4_intensity_t_per_mmboe"),
    flaredSm3PerBoe: num(r, "flared_sm3_per_boe"),
    methaneSourcesQuantified: num(r, "methane_sources_quantified"),
    verificationOpinion: str(r, "verification_opinion"),
  };
}

function toPriorYear(r: Row): PriorYearRecord {
  return {
    eadId: str(r, "ead_facility_id", "ead_id", "facility_id"),
    facility: str(r, "facility", "facility_name"),
    reportingYear: num(r, "reporting_year", "year"),
    item: str(r, "item"),
    description: str(r, "description"),
    activity: optNum(r, "activity"),
    unit: str(r, "unit") || undefined,
    co2T: optNum(r, "co2_t"),
    ch4T: optNum(r, "ch4_t"),
    tco2e: optNum(r, "tco2e"),
  };
}

interface Feature {
  geometry?: { type?: string; coordinates?: unknown };
  properties?: Record<string, unknown>;
}

const pText = (p: Record<string, unknown>, key: string) => (p[key] === undefined || p[key] === null ? "" : String(p[key]));
const pNum = (p: Record<string, unknown>, key: string) => toNumber(p[key]) ?? 0;

function pointOf(feature: Feature): { lat: number; lon: number } | undefined {
  const c = feature.geometry?.type === "Point" ? feature.geometry.coordinates : undefined;
  return Array.isArray(c) && typeof c[0] === "number" && typeof c[1] === "number" ? { lon: c[0], lat: c[1] } : undefined;
}

/** Local (GST, UTC+4) calendar date of a UTC timestamp. */
function gstDate(utc: string): string {
  const t = Date.parse(utc);
  return Number.isNaN(t) ? utc.slice(0, 10) : new Date(t + 4 * 3_600_000).toISOString().slice(0, 10);
}

function readSatellite(features: Feature[], fileName: string, facilities: Map<string, FacilityPoint>, detections: SatelliteDetection[]) {
  const polygons = new Map<string, number[][][]>();
  const equipment: { eadId: string; name: string; lat: number; lon: number }[] = [];
  for (const feature of features) {
    const p = feature.properties ?? {};
    const point = pointOf(feature);
    switch (p.kind) {
      case "facility":
        if (point) {
          const eadId = pText(p, "ead_facility_id");
          facilities.set(eadId, { eadId, name: pText(p, "facility"), operator: pText(p, "operator") || undefined, ...point, equipment: facilities.get(eadId)?.equipment ?? [] });
        }
        break;
      case "equipment":
        if (point) equipment.push({ eadId: pText(p, "ead_facility_id"), name: pText(p, "equipment"), ...point });
        break;
      case "plume_extent":
        if (feature.geometry?.type === "Polygon" && Array.isArray(feature.geometry.coordinates)) {
          polygons.set(pText(p, "detection_id"), feature.geometry.coordinates as number[][][]);
        }
        break;
      case "plume_source": {
        const instrument = pText(p, "instrument");
        const datetimeUtc = pText(p, "datetime_utc");
        detections.push({
          id: pText(p, "detection_id"),
          datetimeUtc,
          localTimeGst: pText(p, "local_time_gst"),
          localDate: gstDate(datetimeUtc),
          rateKgCh4PerH: pNum(p, "emission_rate_kg_ch4_per_h"),
          uncertaintyKgPerH: pNum(p, "uncertainty_kg_per_h"),
          confidence: pText(p, "confidence"),
          windFromDeg: pNum(p, "wind_from_deg"),
          windSpeedMs: pNum(p, "wind_speed_m_s"),
          plumeLengthM: pNum(p, "plume_length_m"),
          nearestFacilityId: pText(p, "nearest_facility_id"),
          nearestFacility: pText(p, "nearest_facility"),
          nearestEquipment: pText(p, "nearest_equipment"),
          distanceToEquipmentM: pNum(p, "distance_to_equipment_m"),
          lat: point?.lat ?? pNum(p, "lat"),
          lon: point?.lon ?? pNum(p, "lon"),
          instrument,
          note: pText(p, "note"),
          simulated: /simulated/i.test(fileName) || /simulated/i.test(instrument),
        });
        break;
      }
    }
  }
  for (const e of equipment) {
    const facility = facilities.get(e.eadId);
    if (facility) facility.equipment.push({ name: e.name, lat: e.lat, lon: e.lon });
    else facilities.set(e.eadId, { eadId: e.eadId, name: e.eadId, lat: e.lat, lon: e.lon, equipment: [{ name: e.name, lat: e.lat, lon: e.lon }] });
  }
  for (const d of detections) d.plumePolygon ??= polygons.get(d.id);
}

/** Load regulator reference data (peer benchmarks, prior-year submissions, satellite detections). Missing files give empty lists. */
export async function loadReferenceData(regulatorDir: string): Promise<ReferenceData> {
  const data: ReferenceData = { peers: [], priorYear: [], detections: [], facilities: [], sources: {} };
  const names = (await readdir(regulatorDir).catch(() => [] as string[])).filter((n) => !n.startsWith(".")).sort();
  const read = (name: string) => readFile(path.join(regulatorDir, name), "utf8");

  const peersFile = names.find((n) => /^peer-benchmarks.*\.csv$/i.test(n));
  if (peersFile) {
    data.peers = parseCsvRecords(await read(peersFile)).records.map(toPeer).filter((p) => p.eadId);
    data.sources.peers = peersFile;
  }
  const priorFile = names.find((n) => /^prior-year-submissions.*\.csv$/i.test(n));
  if (priorFile) {
    data.priorYear = parseCsvRecords(await read(priorFile)).records.map(toPriorYear).filter((p) => p.eadId);
    data.sources.priorYear = priorFile;
  }

  const satelliteFiles = names.filter((n) => /\.geojson$/i.test(n));
  const facilities = new Map<string, FacilityPoint>();
  for (const name of satelliteFiles) {
    try {
      const json = JSON.parse(await read(name)) as { features?: Feature[] };
      readSatellite(Array.isArray(json.features) ? json.features : [], name, facilities, data.detections);
    } catch (err) {
      console.warn(`[reference] skipped ${name}: ${err instanceof Error ? err.message : err}`);
    }
  }
  if (satelliteFiles.length) data.sources.satellite = satelliteFiles.join(", ");
  data.facilities = [...facilities.values()];
  data.detections.sort((a, b) => a.datetimeUtc.localeCompare(b.datetimeUtc));
  return data;
}
