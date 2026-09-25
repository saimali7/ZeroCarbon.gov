import { extractText, getDocumentProxy } from "unpdf";
import type { PageText } from "../types.ts";

/** Normalise extracted PDF text: ligatures (NFKC), non-breaking spaces, trailing spaces. */
export function normalizePdfText(text: string): string {
  return text
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Extract text per page. Pages are 1-based. */
export async function extractPdfPages(data: Uint8Array): Promise<PageText[]> {
  // Copy: pdf.js may detach the buffer it is given.
  const pdf = await getDocumentProxy(new Uint8Array(data));
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text.map((pageText, i) => ({ page: i + 1, text: normalizePdfText(pageText) }));
  } finally {
    await pdf.destroy();
  }
}
