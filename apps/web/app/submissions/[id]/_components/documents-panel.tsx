"use client";

import { DownloadSimple, Eye, Files } from "@phosphor-icons/react";
import type { DocumentKind, SubmissionDetail, SubmissionDocument } from "@zerocarbon/shared";
import { Button, buttonClass } from "../../../_components/ui/button";
import { Card, CardHeader } from "../../../_components/ui/card";
import { FileTypeIcon, shortFileName } from "../../../_components/ui/evidence";
import { Pill } from "../../../_components/ui/pill";
import { EmptyState } from "../../../_components/ui/states";
import { api } from "../../../_lib/api";
import { formatBytes, formatInt } from "../../../_lib/format";
import { citationsByDocument } from "./c-chart";

const KIND_LABEL: Record<DocumentKind, string> = {
  emissions_report: "Emissions report (EAD MRV workbook)",
  cover_letter: "Cover letter",
  monitoring_plan: "Monitoring Plan",
  verification_statement: "Verification statement",
  calibration_certificates: "Meter calibration certificates",
  gas_analysis_certificate: "Gas analysis certificate",
  ldar_survey: "LDAR survey",
  flare_log: "Flare log",
  fuel_meter_log: "Fuel gas meter log",
  diesel_invoices: "Diesel invoices",
  production_gas_balance: "Production and gas balance",
  other: "Other document",
};

const REPORT_KINDS: DocumentKind[] = ["emissions_report", "cover_letter", "monitoring_plan", "verification_statement"];

const plural = (n: number, one: string, many = `${one}s`) => `${formatInt(n)} ${n === 1 ? one : many}`;

function extent(doc: SubmissionDocument) {
  if (doc.sheetNames?.length) return plural(doc.sheetNames.length, "sheet");
  if (doc.pageCount) return plural(doc.pageCount, "page");
  if (doc.rowCount) return plural(doc.rowCount, "row");
  return undefined;
}

const withoutExtension = (name: string) => name.replace(/\.[^.]+$/, "");
const extensionOf = (name: string) => name.split(".").pop()?.toUpperCase() ?? "";

export function DocumentsPanel({ detail, onOpenDocument }: { detail: SubmissionDetail; onOpenDocument: (documentId: string) => void }) {
  const docs = detail.documents;
  const cited = citationsByDocument(detail.review?.findings ?? []);
  const byKindOrder = (list: SubmissionDocument[], order: DocumentKind[]) =>
    [...list].sort((a, b) => (order.indexOf(a.kind) + 1 || 99) - (order.indexOf(b.kind) + 1 || 99) || a.fileName.localeCompare(b.fileName));
  const groups = [
    { id: "report", title: "Report and declarations", docs: byKindOrder(docs.filter((d) => REPORT_KINDS.includes(d.kind)), REPORT_KINDS) },
    { id: "evidence", title: "Supporting evidence", docs: byKindOrder(docs.filter((d) => !REPORT_KINDS.includes(d.kind)), Object.keys(KIND_LABEL) as DocumentKind[]) },
  ].filter((g) => g.docs.length > 0);
  const totalBytes = docs.reduce((t, d) => t + d.sizeBytes, 0);

  return (
    <Card aria-labelledby="documents-title">
      <CardHeader
        id="documents-title"
        title="Submitted documents"
        description={docs.length ? `${plural(docs.length, "file")} received with this submission, ${formatBytes(totalBytes)} in total.` : undefined}
      />
      {docs.length === 0 ? (
        <div className="p-5">
          <EmptyState icon={<Files size={20} weight="duotone" />} title="No documents in this submission" description="Files appear here once the operator's package has been received." />
        </div>
      ) : (
        <div className="divide-y divide-line">
          {groups.map((g) => (
            <section key={g.id} aria-labelledby={`docs-${g.id}`} className="px-5 py-4">
              <h3 id={`docs-${g.id}`} className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-ink-muted">
                {g.title} <span className="font-normal normal-case tracking-normal">({g.docs.length})</span>
              </h3>
              <ul className="flex flex-col divide-y divide-line-soft">
                {g.docs.map((doc) => (
                  <DocumentRow key={doc.id} doc={doc} citedBy={cited.get(doc.id)?.size ?? 0} href={api.documentUrl(detail.id, doc.id)} onView={() => onOpenDocument(doc.id)} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  );
}

function DocumentRow({ doc, citedBy, href, onView }: { doc: SubmissionDocument; citedBy: number; href: string; onView: () => void }) {
  const name = withoutExtension(shortFileName(doc.fileName));
  const size = extent(doc);
  return (
    <li className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control border border-line bg-sunken">
          <FileTypeIcon fileName={doc.fileName} size={20} />
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="min-w-0 break-words text-[15px] font-medium text-ink" title={doc.fileName}>
              {name}
            </span>
            {citedBy > 0 && (
              <Pill tone="gold" size="sm">
                Cited in {plural(citedBy, "finding")}
              </Pill>
            )}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-muted">
            {KIND_LABEL[doc.kind]} · {[extensionOf(doc.fileName), size, formatBytes(doc.sizeBytes)].filter(Boolean).join(", ")}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 pl-12 sm:pl-0">
        <Button variant="secondary" size="sm" icon={<Eye size={16} weight="regular" aria-hidden />} onClick={onView} aria-label={`View ${name}`}>
          View
        </Button>
        <a href={href} download={doc.fileName} className={buttonClass("ghost", "sm")} aria-label={`Download ${doc.fileName} (${formatBytes(doc.sizeBytes)})`}>
          <DownloadSimple size={16} weight="regular" aria-hidden />
          Download
        </a>
      </div>
    </li>
  );
}
