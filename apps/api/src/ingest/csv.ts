/** RFC 4180 CSV parser: quoted fields, escaped quotes, embedded newlines, CRLF, BOM. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const src = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || r[0] !== "");
}

/** Parse CSV with a header row into records keyed by header name. */
export function parseCsvRecords(text: string): { header: string[]; records: Record<string, string>[] } {
  const [header = [], ...rows] = parseCsv(text);
  const keys = header.map((h) => h.trim());
  return {
    header: keys,
    records: rows.map((cells) => Object.fromEntries(keys.map((key, i) => [key, (cells[i] ?? "").trim()]))),
  };
}
