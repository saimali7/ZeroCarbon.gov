import { formatDateShort, formatInt } from "../../../_lib/format";

/** Unit suffixes used in finding metric keys, longest first. */
const UNIT_SUFFIXES: [string, string][] = [
  ["KgCo2ePerBoe", "kg CO2e/boe"],
  ["TPerMmboe", "t/MMboe"],
  ["KgCh4PerH", "kg CH4/h"],
  ["KgPerH", "kg/h"],
  ["Sm3PerDay", "Sm3/d"],
  ["Tco2e", "t CO2e"],
  ["Co2eT", "t CO2e"],
  ["Tco2", "t CO2"],
  ["Co2T", "t CO2"],
  ["Ch4T", "t CH4"],
  ["Sm3", "Sm3"],
  ["Tj", "TJ"],
  ["Pct", "%"],
  ["T", "t"],
];

const WORDS: Record<string, string> = {
  ch4: "CH4",
  co2: "CO2",
  co2e: "CO2e",
  ef: "EF",
  tj: "TJ",
  ncv: "NCV",
  mmboe: "MMboe",
  ldar: "LDAR",
  yoy: "year-on-year",
  diff: "difference",
  id: "ID",
  avg: "average",
};

function humanise(key: string): string {
  const text = key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(" ")
    .map((w) => WORDS[w] ?? w.replace(/^ss(\d\d)$/, "SS-$1"))
    .join(" ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatValue(value: number | string, unit?: string): string {
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateShort(value);
    if (/^\d{4}-\d{2}$/.test(value)) return MONTH.format(new Date(`${value}-15T12:00:00Z`));
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  const text = Number.isInteger(value) ? formatInt(value) : value.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (!unit) return text;
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });

/** Finding metrics as labelled, formatted rows: { reportedCh4T: 264.3 } → { label: "Reported", value: "264.3 t CH4" }. */
export function metricRows(metrics: Record<string, number | string>): { key: string; label: string; value: string }[] {
  const rows = Object.entries(metrics).map(([key, raw]) => {
    const suffix = UNIT_SUFFIXES.find(([s]) => key.length > s.length && key.endsWith(s) && /[a-z0-9]/.test(key[key.length - s.length - 1]));
    const base = suffix ? key.slice(0, -suffix[0].length) : key;
    return { key, label: humanise(base), unit: suffix?.[1], value: formatValue(raw, suffix?.[1]) };
  });
  // Several figures of the same quantity ("gap" in Sm3, t CO2, t CH4): name the unit so the labels stay distinct.
  return rows.map(({ unit, ...row }) =>
    unit && rows.filter((r) => r.label === row.label).length > 1 ? { ...row, label: `${row.label} (${unit})` } : row,
  );
}
