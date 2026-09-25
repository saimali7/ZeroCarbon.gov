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
  alert = true,
  ariaLabel,
}: {
  center: { lat: number; lon: number };
  facilityName: string;
  equipment: MapPoint[];
  detections: SatelliteDetection[];
  selectedId?: string;
  /** Draw the selected plume as a warning (red) rather than a neutral selection (gold). */
  alert?: boolean;
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

  const selected = plumes.find((p) => p.d.id === selectedId);
  const others = plumes.filter((p) => p !== selected);
  // Downwind unit vector (metres, north up) and the far tip of the selected plume, where its rate label goes.
  const downwind = selected ? { dx: -Math.sin((selected.d.windFromDeg * Math.PI) / 180), dy: -Math.cos((selected.d.windFromDeg * Math.PI) / 180) } : undefined;
  const tip = selected
    ? selected.ring.reduce((far, q) => (Math.hypot(q.x - selected.source.x, q.y - selected.source.y) > Math.hypot(far.x - selected.source.x, far.y - selected.source.y) ? q : far), selected.source)
    : undefined;
  const rateText = selected ? `${selected.d.rateKgCh4PerH.toLocaleString("en-US")} kg/h` : "";

  // Drawing area: keeps clear of the north/wind box (top right) and the scale bar (bottom left).
  const inset = { left: 10, right: 72, top: 10, bottom: 38 };
  const innerW = Math.max(width - inset.left - inset.right, 120);
  const H = narrow ? 320 : 400;
  const innerH = H - inset.top - inset.bottom;

  // Extent in metres: everything drawn, padded, at least 1.2 km across, plus room for the boundary and rate labels.
  const xs = [0, ...equipmentM.map((p) => p.x), ...plumes.flatMap((p) => [p.source.x, ...p.ring.map((q) => q.x)])];
  const ys = [0, ...equipmentM.map((p) => p.y), ...plumes.flatMap((p) => [p.source.y, ...p.ring.map((q) => q.y)])];
  const grow = (a: number, b: number, min: number) => (b - a >= min ? [a, b] : [(a + b) / 2 - min / 2, (a + b) / 2 + min / 2]);
  const fit = (extraX: number[], extraY: number[]) => {
    const pad = 120;
    let [x0, x1] = grow(Math.min(...xs, ...extraX) - pad, Math.max(...xs, ...extraX) + pad, 1200);
    let [y0, y1] = grow(Math.min(...ys, ...extraY) - pad, Math.max(...ys, ...extraY) + pad, 1200);
    const scale = Math.min(innerW / (x1 - x0), innerH / (y1 - y0));
    [x0, x1] = grow(x0, x1, innerW / scale);
    [y0, y1] = grow(y0, y1, innerH / scale);
    return { scale, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 };
  };
  const first = fit([], []);
  const extraX: number[] = [];
  const extraY: number[] = equipmentM.length ? [Math.max(...equipmentM.map((e) => e.y)) + 110 + 34 / first.scale] : [];
  if (tip && downwind) {
    // Leave room past the plume tip for the rate label.
    const reach = ((14 + textWidth(rateText, 13)) / first.scale) * 1.1;
    extraX.push(tip.x + downwind.dx * reach);
    extraY.push(tip.y + downwind.dy * reach - 14 / first.scale);
  }
  const view = fit(extraX, extraY);
  const { scale, cx, cy } = view;
  const px = (p: { x: number; y: number }) => ({ x: inset.left + innerW / 2 + (p.x - cx) * scale, y: inset.top + innerH / 2 - (p.y - cy) * scale });

  const eqPx = equipmentM.map((e) => ({ ...e, p: px(e) }));
  const boundary = eqPx.length
    ? (() => {
        const bx = eqPx.map((e) => e.p.x);
        const by = eqPx.map((e) => e.p.y);
        const b = 110 * scale + 14;
        return { x: Math.min(...bx) - b, y: Math.min(...by) - b, w: Math.max(...bx) - Math.min(...bx) + 2 * b, h: Math.max(...by) - Math.min(...by) + 2 * b };
      })()
    : undefined;

  const ringPath = (ring: { x: number; y: number }[]) => ring.map((q, i) => `${i ? "L" : "M"}${px(q).x.toFixed(1)},${px(q).y.toFixed(1)}`).join(" ") + " Z";

  let scaleM = 500;
  if (scaleM * scale > width * 0.45) scaleM = 250;
  if (scaleM * scale < 40) scaleM = 1000;
  const scalePx = scaleM * scale;

  const windTo = selected ? selected.d.windFromDeg + 180 : 0;
  const sourcePx = selected ? px(selected.source) : undefined;
  const tipPx = tip ? px(tip) : undefined;
  const strong = alert ? "var(--color-bad-700)" : "var(--color-gold-700)";

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
              <text x={boundary.x + 2} y={boundary.y - 6} fontSize="11" fill="var(--color-ink-muted)">
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
            <path d={ringPath(selected.ring)} fill={alert ? "var(--color-bad-500)" : "var(--color-gold-500)"} fillOpacity="0.26" stroke={strong} strokeWidth="1.5" strokeLinejoin="round" />
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
          {selected && sourcePx && (
            <g>
              <circle cx={sourcePx.x} cy={sourcePx.y} r="10" fill="none" stroke={strong} strokeOpacity="0.5" strokeWidth="1.5" />
              <circle cx={sourcePx.x} cy={sourcePx.y} r="5" fill={strong} stroke="var(--color-surface)" strokeWidth="1.5" />
            </g>
          )}
          {tipPx && downwind && (
            <text
              x={tipPx.x + downwind.dx * 8}
              y={tipPx.y - downwind.dy * 8 + (downwind.dy < -0.3 ? 12 : downwind.dy > 0.3 ? -2 : 4)}
              fontSize="13"
              fontWeight="700"
              textAnchor={downwind.dx < -0.2 ? "end" : downwind.dx > 0.2 ? "start" : "middle"}
              fill={alert ? "var(--color-bad-800)" : "var(--color-gold-800)"}
              stroke="var(--color-surface)"
              strokeWidth="4"
              strokeLinejoin="round"
              paintOrder="stroke"
            >
              {rateText}
            </text>
          )}
        </g>

        <g transform={`translate(14 ${H - 22})`}>
          <rect x="-6" y="-14" width={scalePx + 12 + textWidth(`${scaleM} m`, 11) + 8} height="28" rx="6" fill="var(--color-surface)" fillOpacity="0.85" />
          <path d={`M0,-4 V4 H${scalePx} V-4`} fill="none" stroke="var(--color-ink-2)" strokeWidth="1.5" />
          <text x={scalePx + 8} y="4" fontSize="11" fill="var(--color-ink-2)">
            {scaleM >= 1000 ? `${scaleM / 1000} km` : `${scaleM} m`}
          </text>
        </g>

        <g transform={`translate(${width - 62} 10)`}>
          <rect width="52" height={selected ? 112 : 46} rx="8" fill="var(--color-surface)" stroke="var(--color-line)" />
          <path d="M26,7 L32,23 L26,19 L20,23 Z" fill="var(--color-ink-2)" />
          <text x="26" y="37" fontSize="11" fontWeight="700" textAnchor="middle" fill="var(--color-ink-2)">
            N
          </text>
          {selected && (
            <g transform="translate(1 44)">
              <line x1="6" x2="44" y1="0" y2="0" stroke="var(--color-line-soft)" />
              <circle cx="25" cy="24" r="14" fill="none" stroke="var(--color-line)" />
              <line
                x1="25"
                y1="33"
                x2="25"
                y2="15"
                stroke="var(--color-ink-2)"
                strokeWidth="2"
                markerEnd={`url(#${arrowId})`}
                transform={`rotate(${windTo} 25 24)`}
              />
              <text x="25" y="51" fontSize="10" textAnchor="middle" fill="var(--color-ink-muted)">
                Wind
              </text>
              <text x="25" y="62" fontSize="10" fontWeight="600" textAnchor="middle" fill="var(--color-ink-2)">
                {selected.d.windSpeedMs} m/s
              </text>
            </g>
          )}
        </g>
      </svg>
    </div>
  );
}
