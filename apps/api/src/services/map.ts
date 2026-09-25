import type { PeerBenchmark } from "@zerocarbon/shared";
import type { AppDeps } from "../app.ts";
import type { StageProbe } from "./review-runner.ts";
import { listSummaries } from "./summaries.ts";

export type MapFeatureKind = "submission" | "peer" | "detection" | "plume";

export interface MapFeature {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] } | { type: "Polygon"; coordinates: number[][][] };
  properties: { kind: MapFeatureKind; [key: string]: unknown };
}

export interface MapResponse {
  type: "FeatureCollection";
  features: MapFeature[];
}

const point = (lon: number, lat: number, properties: MapFeature["properties"]): MapFeature => ({
  type: "Feature",
  geometry: { type: "Point", coordinates: [lon, lat] },
  properties,
});

/** GeoJSON layer data: submitted facilities, peer facilities, satellite detections and plume polygons. */
export async function buildMap(deps: Pick<AppDeps, "catalog" | "store">, probe: StageProbe): Promise<MapResponse> {
  const [summaries, reference] = await Promise.all([listSummaries(deps, probe), deps.catalog.getReference()]);
  const facilities = new Map(reference.facilities.map((f) => [f.eadId, f]));
  const peers = new Map<string, PeerBenchmark>();
  for (const peer of reference.peers) {
    const current = peers.get(peer.eadId);
    if (!current || peer.reportingYear > current.reportingYear) peers.set(peer.eadId, peer);
  }
  const submissionByEadId = new Map(summaries.map((s) => [s.eadId, s.id]));
  const features: MapFeature[] = [];

  for (const s of summaries) {
    const fallback = facilities.get(s.eadId) ?? peers.get(s.eadId);
    const lat = s.lat ?? fallback?.lat;
    const lon = s.lon ?? fallback?.lon;
    if (lat === undefined || lon === undefined) continue;
    features.push(
      point(lon, lat, {
        kind: "submission",
        submissionId: s.id,
        eadId: s.eadId,
        name: s.facilityName,
        shortName: s.facilityShortName,
        operator: s.operator,
        stage: s.stage,
        status: s.status,
        riskScore: s.riskScore,
        riskBand: s.riskBand,
        reportedTotalTco2e: s.reportedTotalTco2e,
      }),
    );
  }

  for (const peer of peers.values()) {
    if (submissionByEadId.has(peer.eadId)) continue;
    features.push(
      point(peer.lon, peer.lat, {
        kind: "peer",
        eadId: peer.eadId,
        name: peer.facility,
        operator: peer.operator,
        reportingYear: peer.reportingYear,
        intensity: peer.intensityKgCo2ePerBoe,
        reportedTco2e: peer.reportedTco2e,
        verificationOpinion: peer.verificationOpinion,
      }),
    );
  }

  for (const { plumePolygon, ...detection } of reference.detections) {
    const submissionId = submissionByEadId.get(detection.nearestFacilityId);
    features.push(point(detection.lon, detection.lat, { kind: "detection", ...detection, ...(submissionId ? { submissionId } : {}) }));
    if (plumePolygon?.length) {
      features.push({
        type: "Feature",
        geometry: { type: "Polygon", coordinates: plumePolygon },
        properties: { kind: "plume", detectionId: detection.id, rateKgCh4PerH: detection.rateKgCh4PerH, simulated: detection.simulated },
      });
    }
  }

  return { type: "FeatureCollection", features };
}
