"use client";

import { SealCheck } from "@phosphor-icons/react";
import type { Letter, SubmissionDetail } from "@zerocarbon/shared";
import { useId, useLayoutEffect, useRef, type ComponentProps } from "react";
import { formatDate } from "../../../_lib/format";
import { OFFICER } from "../../../_lib/officer";

export type Lang = "en" | "ar";

/** Letter body split into the managed parts (letterhead block, sign-off) and the text the officer edits. */
export interface LetterParts {
  head: string[];
  main: string;
  closing: string[];
}

const SALUTATION = /^(dear\b|to whom it may concern|تحية طيبة|السلام عليكم)/i;
const CLOSING = /^(yours (faithfully|sincerely|truly)|sincerely|kind regards|best regards|وتفضلوا|وتفضل|مع خالص|وتقبلوا)/i;
const HEAD_LINE =
  /^(draft\b|our ref|ref(erence)?\b|date\b|to\b|attention\b|facility\b|subject\b|environment agency|climate change|مسودة|المرجع|الرقم المرجعي|التاريخ|إلى|السيد|السادة|لعناية|المنشأة|الموضوع|هيئة البيئة|إدارة)/i;

const paragraphs = (text: string) =>
  text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);

/**
 * Drafted bodies carry their own reference, date, addressee and sign-off. Those are rendered from
 * the letter record instead, so only the text from the salutation to the closing is shown and edited.
 */
export function splitLetter(body: string): LetterParts {
  const paras = paragraphs(body);
  let start = paras.findIndex((p) => SALUTATION.test(p));
  if (start < 0) {
    start = 0;
    while (start < paras.length && paras[start].split("\n").every((line) => HEAD_LINE.test(line.trim()))) start++;
  }
  const found = paras.findIndex((p, i) => i > start && CLOSING.test(p));
  const end = found < 0 ? paras.length : found;
  return { head: paras.slice(0, start), main: paras.slice(start, end).join("\n\n"), closing: paras.slice(end) };
}

export function joinLetter(parts: LetterParts, main: string): string {
  return [...parts.head, main.trim(), ...parts.closing].filter(Boolean).join("\n\n");
}

type Block = { kind: "p"; text: string } | { kind: "ol"; start: number; items: string[] };

const ARABIC_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const toInt = (digits: string) => Number(digits.replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d))));

/** Paragraphs, with consecutive "1. ..." lines (in one or several paragraphs) grouped into ordered lists. */
function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  for (const para of paragraphs(text)) {
    let open: { kind: "p"; text: string } | null = null;
    for (const line of para.split("\n")) {
      const item = /^\s*([0-9٠-٩]{1,3})[.)٫]\s+(.*)$/.exec(line);
      const last = blocks[blocks.length - 1];
      if (item) {
        open = null;
        const n = toInt(item[1]);
        if (last?.kind === "ol" && n !== 1) last.items.push(item[2]);
        else blocks.push({ kind: "ol", start: n, items: [item[2]] });
      } else if (line.trim()) {
        if (open) open.text += `\n${line.trim()}`;
        else blocks.push((open = { kind: "p", text: line.trim() }));
      }
    }
  }
  return blocks;
}

const dateAr = new Intl.DateTimeFormat("ar-AE-u-nu-latn", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Dubai" });
const formatDateAr = (iso: string | undefined) => (iso ? dateAr.format(new Date(iso)) : "-");

const OFFICER_AR = { name: "محمد المزروعي", role: "موظف مراجعة القياس والإبلاغ والتحقق", authority: "هيئة البيئة - أبوظبي" };

const TEXT = {
  en: {
    label: "English letter",
    org: "Environment Agency - Abu Dhabi",
    date: "Date",
    ref: "Our reference",
    to: "To",
    eadId: "EAD ID",
    subject: "Subject:",
    draft: "Draft",
    closing: "Yours faithfully,",
    pending: "Signature pending approval",
    approved: (name: string, date: string) => `Approved by ${name} on ${date}`,
    officer: { name: OFFICER.name, role: OFFICER.role, authority: OFFICER.authority },
    date_: (iso?: string) => formatDate(iso),
  },
  ar: {
    label: "الخطاب باللغة العربية",
    org: "هيئة البيئة - أبوظبي",
    date: "التاريخ",
    ref: "المرجع",
    to: "إلى",
    eadId: "رقم التسجيل لدى الهيئة",
    subject: "الموضوع:",
    draft: "مسودة",
    closing: "وتفضلوا بقبول فائق الاحترام والتقدير،",
    pending: "التوقيع بانتظار الاعتماد",
    approved: (name: string, date: string) => `اعتمده ${name} بتاريخ ${date}`,
    officer: OFFICER_AR,
    date_: formatDateAr,
  },
} as const;

/** Formal letter preview on letterhead. `print` drops the card chrome for the print window. */
export function LetterPaper({
  lang,
  subject,
  parts,
  letter,
  detail,
  print = false,
}: {
  lang: Lang;
  subject: string;
  parts: LetterParts;
  letter: Letter;
  detail: SubmissionDetail;
  print?: boolean;
}) {
  const t = TEXT[lang];
  const other = lang === "en" ? "ar" : "en";
  const approved = letter.status === "approved";
  const operator = lang === "ar" ? (detail.report?.operator.nameAr ?? detail.operator) : detail.operator;
  const approver = letter.approvedBy === OFFICER.name ? t.officer.name : (letter.approvedBy ?? t.officer.name);
  const closingLine = parts.closing[0]?.split("\n")[0] ?? t.closing;
  const blocks = toBlocks(parts.main);

  return (
    <article
      lang={lang}
      dir={lang === "ar" ? "rtl" : "ltr"}
      aria-label={t.label}
      className={
        print
          ? "break-after-page text-[10.5pt] leading-relaxed text-ink last:break-after-auto"
          : "rounded-card border border-line bg-surface px-5 py-6 text-[14px] leading-relaxed text-ink shadow-raised sm:px-9 sm:py-9"
      }
    >
      <header className="flex items-start justify-between gap-4 border-b-2 border-gold-500 pb-4">
        <div className="min-w-0">
          <p className="text-[15px] font-bold leading-snug">{t.org}</p>
          <p lang={other} dir={other === "ar" ? "rtl" : "ltr"} className="text-[13px] text-ink-muted">
            {TEXT[other].org}
          </p>
        </div>
        <div className="shrink-0 text-end text-[12px] leading-snug">
          <p lang="en" className="font-semibold text-gold-700">
            Zerocarbon.gov
          </p>
          {!approved && <p className="mt-1 font-semibold uppercase tracking-wider text-gold-700">{t.draft}</p>}
        </div>
      </header>

      <dl className="mt-5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px]">
        <dt className="text-ink-muted">{t.date}</dt>
        <dd>{t.date_(letter.createdAt)}</dd>
        <dt className="text-ink-muted">{t.ref}</dt>
        <dd className="break-all">
          <bdi className="font-mono text-[12.5px]">{letter.reference}</bdi>
        </dd>
        <dt className="text-ink-muted">{t.to}</dt>
        <dd className="break-words">
          {operator}
          <br />
          <bdi>{detail.facilityName}</bdi>
          <br />
          {t.eadId} <bdi>{detail.eadId}</bdi>
        </dd>
      </dl>

      <p className="mt-6 text-[15px] font-bold leading-snug text-pretty">
        {t.subject} {subject}
      </p>

      <div className="mt-4 flex flex-col gap-3 break-words">
        {blocks.map((b, i) =>
          b.kind === "p" ? (
            <p key={i} className="whitespace-pre-line text-pretty">
              {b.text}
            </p>
          ) : (
            <ol key={i} start={b.start} className="flex list-decimal flex-col gap-2 ps-6 marker:text-ink-muted">
              {b.items.map((item, j) => (
                <li key={j} className="ps-1">
                  {item}
                </li>
              ))}
            </ol>
          ),
        )}
      </div>

      <div className="mt-8 break-inside-avoid">
        <p>{closingLine}</p>
        {approved ? (
          <p className="mt-4 inline-flex items-center gap-1.5 rounded-control bg-ok-50 px-2.5 py-1 text-[13px] font-medium text-ok-700">
            <SealCheck size={16} weight="duotone" aria-hidden />
            {t.approved(approver, t.date_(letter.approvedAt))}
          </p>
        ) : (
          <div className="mt-9 w-56 max-w-full border-t border-dashed border-line-strong pt-1 text-[12px] text-ink-faint">{t.pending}</div>
        )}
        <p className="mt-3 font-semibold">{t.officer.name}</p>
        <p className="text-[13px] text-ink-muted">{t.officer.role}</p>
        <p className="text-[13px] text-ink-muted">{t.officer.authority}</p>
      </div>
    </article>
  );
}

const fieldClass =
  "w-full rounded-field border border-line-strong bg-surface px-3 text-[14px] text-ink transition-colors hover:border-ink-faint focus:border-gold-500 disabled:bg-sunken disabled:text-ink-muted";

/** Subject and body editor for one language. Labels stay in English; the fields take the letter's language. */
export function LetterEditor({
  lang,
  subject,
  main,
  onChange,
  disabled,
}: {
  lang: Lang;
  subject: string;
  main: string;
  onChange: (next: { subject: string; main: string }) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const name = lang === "en" ? "English" : "Arabic";
  const dir = lang === "ar" ? "rtl" : "ltr";
  return (
    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5 shadow-raised">
      <h3 className="text-[15px] font-semibold">{name} letter</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-subject`} className="text-[13px] font-medium text-ink-2">
          Subject ({name})
        </label>
        <input
          id={`${id}-subject`}
          lang={lang}
          dir={dir}
          value={subject}
          disabled={disabled}
          onChange={(e) => onChange({ subject: e.target.value, main })}
          className={`${fieldClass} h-10`}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-body`} className="text-[13px] font-medium text-ink-2">
          Letter text ({name})
        </label>
        <p id={`${id}-hint`} className="text-xs leading-relaxed text-ink-muted">
          Leave a blank line between paragraphs. Start a line with &quot;1.&quot; for a numbered list.
        </p>
        <AutoTextarea
          id={`${id}-body`}
          aria-describedby={`${id}-hint`}
          lang={lang}
          dir={dir}
          value={main}
          disabled={disabled}
          onChange={(e) => onChange({ subject, main: e.target.value })}
          className={`${fieldClass} resize-none py-2.5 leading-relaxed`}
        />
      </div>
    </div>
  );
}

/** Textarea that grows with its content (refits on value and width changes). */
function AutoTextarea({ value, ...rest }: ComponentProps<"textarea"> & { value: string }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`;
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      fit();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);
  return <textarea ref={ref} rows={8} value={value} {...rest} />;
}

const escapeHtml = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Opens a print window with the given letter markup and the app's stylesheets, then prints once
 * styles and fonts are ready. Returns false when the browser blocked the window.
 */
export function printLetters(html: string, title: string): boolean {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return false;
  const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
    .map((node) => node.outerHTML)
    .join("\n");
  win.document.open();
  win.document.write(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><base href="${location.origin}/"><title>${escapeHtml(title)}</title>${styles}` +
      `<style>@page{size:A4;margin:18mm 16mm}html,body{background:#fff}body{padding:24px}@media print{body{padding:0}}</style></head>` +
      `<body><main class="mx-auto flex max-w-[760px] flex-col gap-16">${html}</main></body></html>`,
  );
  win.document.close();
  let printed = false;
  const run = () => {
    if (printed) return;
    printed = true;
    void win.document.fonts.ready.then(() => {
      win.focus();
      win.print();
    });
  };
  win.addEventListener("load", run, { once: true });
  setTimeout(run, 1500);
  return true;
}
