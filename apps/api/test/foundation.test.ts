import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { createOpenRouterClient, parseJsonContent } from "../src/ai/openrouter.ts";
import { config } from "../src/config.ts";
import { parseCsv, parseCsvRecords } from "../src/ingest/csv.ts";
import { extractPdfPages } from "../src/ingest/pdf.ts";

const SOUTH = path.join(config.dataDir, "submissions", "DEC_Southern-Dunes-CPF2_RY2025");

test("parseCsv handles quotes, escaped quotes, CRLF and BOM", () => {
  const rows = parseCsv('\uFEFFa,b,c\r\n1,"x, y","say ""hi"""\r\n2,,"multi\nline"\n');
  assert.deepEqual(rows, [
    ["a", "b", "c"],
    ["1", "x, y", 'say "hi"'],
    ["2", "", "multi\nline"],
  ]);
});

test("parseCsvRecords keys rows by header", async () => {
  const text = await readFile(path.join(SOUTH, "evidence", "DEC-SDF-CPF2_Flare-Log_Daily_2025.csv"), "utf8");
  const { header, records } = parseCsvRecords(text);
  assert.equal(header[0], "date");
  assert.equal(records.length, 365);
  assert.equal(records[151].date, "2025-06-01");
  assert.equal(records[151].hp_data_source, "ENGINEERING ESTIMATE");
});

test("extractPdfPages returns normalised text per page", async () => {
  const data = await readFile(path.join(SOUTH, "evidence", "DEC-SDF-CPF2_Meter-Calibration-Certificates.pdf"));
  const pages = await extractPdfPages(data);
  assert.equal(pages.length, 3);
  assert.equal(pages[0].page, 1);
  assert.match(pages[1].text, /FT-5101/);
  assert.doesNotMatch(pages[0].text, /\uFB01/, "ligatures are normalised");
});

test("parseJsonContent tolerates code fences and surrounding prose", () => {
  assert.deepEqual(parseJsonContent('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(parseJsonContent('Here you go: {"a":[1,2]} done'), { a: [1, 2] });
});

test("OpenRouter client sends json_schema and validates the response", async () => {
  let sentBody: any;
  let sentHeaders: any;
  const client = createOpenRouterClient({
    apiKey: "test-key",
    baseUrl: "https://openrouter.test/api/v1",
    model: "test/model",
    timeoutMs: 5000,
    fetchImpl: async (_url, init) => {
      sentBody = JSON.parse(String(init?.body));
      sentHeaders = init?.headers;
      return new Response(JSON.stringify({ model: "test/model", choices: [{ message: { content: '{"answer":"ok","n":2}' } }] }), {
        status: 200,
      });
    },
  });
  const result = await client.chatJson({
    messages: [{ role: "user", content: "hi" }],
    schema: z.object({ answer: z.string(), n: z.number() }),
    schemaName: "test",
  });
  assert.deepEqual(result.data, { answer: "ok", n: 2 });
  assert.equal(sentBody.response_format.type, "json_schema");
  assert.equal(sentBody.response_format.json_schema.schema.additionalProperties, false);
  assert.equal(sentHeaders.Authorization, "Bearer test-key");
});
