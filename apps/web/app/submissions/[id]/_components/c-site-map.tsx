"use client";

import type { SatelliteDetection } from "@zerocarbon/shared";
import { useSvgId, useWidth } from "./c-chart";

export interface MapPoint {
  name: string;
  lat: number;
  lon: number;
}

const M_PER_DEG_LAT = 110_574;
const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** 315 → "NW" */
export const compass = (deg: number) => COMPASS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];

const textWidth = (s: string, size = 12) => s.length * size * 0.56;

/**
 * Local site map: equirectangular projection around the facility (metres, cos(lat) scaled),
 * equipment points, plume outlines and source markers, a scale bar, north arrow and wind for the selected detection.
 */
export function SiteMap({
  center,
  facilityName,
  equipment,
  detections,
  selectedId,
  ariaLabel,
}: {
  center: { lat: number; lon: number };
  facilityName: string;
  equipment: MapPoint[];
  detections: SatelliteDetection[];
  selectedId?: string;
  ariaLabel: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const clip = useSvgId("site-clip");
  const arrowId = useSvgId("wind-arrow");
  const narrow = width < 480;
  const mPerLon = 111_320 * Math.cos((center.lat * Math.PI) / 180);
  const project = (lon: number, lat: number) => ({ x: (lon - center.lon) * mPerLon, y: (lat - center.lat) * M_PER_DEG_LAT });

  const equipmentM = equipment.map((e) => ({ ...e, ...project(e.lon, e.lat) }));
  const plumes = detections.map((d) => ({
    d,
    source: project(d.lon, d.lat),
    ring: (d.plumePolygon?.[0] ?? []).map(([lon, lat]) => project(lon, lat)),
  }));

  // Extent in metres: everything drawn, padded, at least 1.2 km across.
  const xs = [0, ...equipmentM.map((p) => p.x), ...plumes.flatMap((p) => [p.source.x, ...p.ring.map((q) => q.x)])];
  const ys = [0, ...equipmentM.map((p) => p.y), ...plumes.flatMap((p) => [p.source.y, ...p.ring.map((q) => q.y)])];
  const pad = 220;
  let [x0, x1, y0, y1] = [Math.min(...xs) - pad, Math.max(...xs) + pad, Math.min(...ys) - pad, Math.max(...ys) + pad];
  const grow = (a: number, b: number, min: number) => (b - a >= min ? [a, b] : [(a + b) / 2 - min / 2, (a + b) / 2 + min / 2]);
  [x0, x1] = grow(x0, x1, 1200);
  [y0, y1] = grow(y0, y1, 1200);
  const H = Math.round(Math.min(Math.max(width * ((y1 - y0) / (x1 - x0)), narrow ? 260 : 300), narrow ? 360 : 440));
  const scale = Math.min(width / (x1 - x0), H / (y1 - y0));
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const px = (p: { x: number; y: number }) => ({ x: width / 2 + (p.x - cx) * scale, y: H / 2 - (p.y - cy) * scale });

  const eqPx = equipmentM.map((e) => ({ ...e, p: px(e) }));
  const boundary = eqPx.length
    ? (() => {
        const bx = eqPx.map((e) => e.p.x);
        const by = eqPx.map((e) => e.p.y);
        const b = 110 * scale + 14;
        return { x: Math.min(...bx) - b, y: Math.min(...by) - b, w: Math.max(...bx) - Math.min(...bx) + 2 * b, h: Math.max(...by) - Math.min(...by) + 2 * b };
      })()
    : undefined;

  const selected = plumes.find((p) => p.d.id === selectedId);
  const others = plumes.filter((p) => p !== selected);
  const ringPath = (ring: { x: number; y: number }[]) => ring.map((q, i) => `${i ? "L" : "M"}${px(q).x.toFixed(1)},${px(q).y.toFixed(1)}`).join(" ") + " Z";

  let scaleM = 500;
  if (scaleM * scale > width * 0.45) scaleM = 250;
  if (scaleM * scale < 40) scaleM = 1000;
  const scalePx = scaleM * scale;

  const windTo = selected ? selected.d.windFromDeg + 180 : 0;
  const sourcePx = selected ? px(selected.source) : undefined;
  const upwind = selected ? { dx: Math.sin((selected.d.windFromDeg * Math.PI) / 180), dy: -Math.cos((selected.d.windFromDeg * Math.PI) / 180) } : undefined;
  const rateText = selected ? `${selected.d.rateKgCh4PerH.toLocaleString("en-US")} kg/h` : "";

  return (
    <div ref={ref} className="w-full overflow-hidden rounded-control border border-line">
      <svg role="img" aria-label={ariaLabel} width={width} height={H} viewBox={`0 0 ${width} ${H}`} className="block">
        <defs>
          <clipPath id={clip}>
            <rect width={width} height={H} />
          </clipPath>
          <marker id={arrowId} viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--color-ink-2)" />
          </marker>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <rect width={width} height={H} fill="var(--color-gold-50)" />

          {boundary && (
            <g>
              <rect x={boundary.x} y={boundary.y} width={boundary.w} height={boundary.h} rx="10" fill="var(--color-surface)" fillOpacity="0.7" stroke="var(--color-line-strong)" strokeDasharray="5 4" />
              <text x={boundary.x + 8} y={boundary.y + 16} fontSize="11" fill="var(--color-ink-muted)">
                {narrow ? "Facility (indicative)" : `${facilityName}, facility area (indicative)`}
              </text>
            </g>
          )}

          {others.map((p) =>
            p.ring.length > 2 ? (
              <path key={p.d.id} d={ringPath(p.ring)} fill="var(--color-gold-300)" fillOpacity="0.22" stroke="var(--color-gold-500)" strokeOpacity="0.7" strokeDasharray="3 3" />
            ) : null,
          )}
          {selected && selected.ring.length > 2 && (
            <path d={ringPath(selected.ring)} fill="var(--color-bad-500)" fillOpacity="0.26" stroke="var(--color-bad-700)" strokeWidth="1.5" strokeLinejoin="round" />
          )}

          {eqPx.map((e) => {
            const w = textWidth(e.name);
            const right = e.p.x + 10 + w < width - 8;
            return (
              <g key={e.name}>
                <rect x={e.p.x - 4.5} y={e.p.y - 4.5} width="9" height="9" rx="1.5" fill="var(--color-ink-2)" stroke="var(--color-surface)" strokeWidth="1.5" />
                <text
                  x={right ? e.p.x + 10 : e.p.x - 10}
                  y={e.p.y + 4}
                  fontSize="12"
                  fontWeight="500"
                  textAnchor={right ? "start" : "end"}
                  fill="var(--color-ink)"
                  stroke="var(--color-surface)"
                  strokeWidth="3.5"
                  strokeLinejoin="round"
                  paintOrder="stroke"
                >
                  {e.name}
                </text>
              </g>
            );
          })}

          {others.map((p) => {
            const s = px(p.source);
            return <circle key={p.d.id} cx={s.x} cy={s.y} r="4" fill="var(--color-surface)" stroke="var(--color-gold-600)" strokeWidth="2" />;
          })}
          {selected && sourcePx && upwind && (
            <g>
              <circle cx={sourcePx.x} cy={sourcePx.y} r="10" fill="none" stroke="var(--color-bad-700)" strokeOpacity="0.5" strokeWidth="1.5" />
              <circle cx={sourcePx.x} cy={sourcePx.y} r="5" fill="var(--color-bad-700)" stroke="var(--color-surface)" strokeWidth="1.5" />
              <text
                x={sourcePx.x + upwind.dx * 16}
                y={sourcePx.y + upwind.dy * 16 + 4}
                fontSize="13"
                fontWeight="700"
                textAnchor={upwind.dx < -0.2 ? "end" : upwind.dx > 0.2 ? "start" : "middle"}
                fill="var(--color-bad-800)"
                stroke="var(--color-surface)"
                strokeWidth="4"
                strokeLinejoin="round"
                paintOrder="stroke"
              >
                {rateText}
              </text>
            </g>
          )}
        </g>

        <g transform="translate(22 14)">
          <path d="M0,0 L6,16 L0,12 L-6,16 Z" fill="var(--color-ink-2)" />
          <text x="0" y="30" fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--color-ink-2)">
            N
          </text>
        </g>

        <g transform={`translate(14 ${H - 22})`}>
          <rect x="-6" y="-14" width={scalePx + 12 + textWidth(`${scaleM} m`, 11) + 8} height="28" rx="6" fill="var(--color-surface)" fillOpacity="0.85" />
          <path d={`M0,-4 V4 H${scalePx} V-4`} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" />
          <text x={scalePx + 8} y="4" fontSize="11" fill="var(--color-ink-2)">
            {scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}
          </text>
        </g>

        {selected && (
          <g transform={`translate(${width - 62} 12)`}>
            <rect width="50" height="68" rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
            <circle cx="25" cy="24" r="15" fill="none" stroke="var(--color-line)" />
            <line
              x1="25"
              y1="34"
              x2="25"
              y2="15"
              stroke="var(--color-ink-2)"
              strokeWidth="2"
              markerEnd={`url(#${arrowId})`}
              transform={`rotate(${windTo} 25 24)`}
            />
            <text x="25" y="52" fontSize="10" textAnchor="middle" fill="var(--color-ink-muted)">
              Wind
            </text>
            <text x="25" y="63" fontSize="10" fontWeight="600" textAnchor="middle" fill="var(--color-ink-2)">
              {selected.d.windSpeedMs} m/s
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
