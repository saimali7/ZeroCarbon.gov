"use client";

import { Check, PencilSimple, Printer, SealCheck } from "@phosphor-icons/react";
import type { Letter, LetterContent, SubmissionDetail } from "@zerocarbon/shared";
import { useId, useMemo, useRef, useState } from "react";
import { api } from "../../../_lib/api";
import { formatDateTime } from "../../../_lib/format";
import { OFFICER } from "../../../_lib/officer";
import { Button } from "../../../_components/ui/button";
import { Dialog } from "../../../_components/ui/dialog";
import { Pill } from "../../../_components/ui/pill";
import { Segmented } from "../../../_components/ui/segmented";
import { Notice } from "../../../_components/ui/states";
import { LetterEditor, LetterPaper, joinLetter, printLetters, splitLetter, type Lang, type LetterParts } from "./d-letter-paper";

type View = "both" | Lang;
type Draft = Record<Lang, { subject: string; main: string }>;

const LANGS: Lang[] = ["en", "ar"];
const LANG_NAME: Record<Lang, string> = { en: "English", ar: "Arabic" };

const GENERATED_BY: Record<Letter["generatedBy"], string> = {
  llm: "Drafted by AI",
  cache: "Drafted by AI, prepared in advance",
  template: "Drafted from standard wording",
};

const toDraft = (letter: Letter, parts: Record<Lang, LetterParts>): Draft => ({
  en: { subject: letter.en.subject, main: parts.en.main },
  ar: { subject: letter.ar.subject, main: parts.ar.main },
});

const sameDraft = (a: Draft, b: Draft) => LANGS.every((l) => a[l].subject === b[l].subject && a[l].main === b[l].main);

/** Bilingual letter review: side-by-side preview, per-language editing, save, approve and print. */
export function LetterDialog({
  detail,
  letter,
  open,
  onClose,
  onSaved,
}: {
  detail: SubmissionDetail;
  letter: Letter | null;
  open: boolean;
  onClose: () => void;
  onSaved: (letter: Letter) => void;
}) {
  if (!letter) return null;
  return <LetterReview key={letter.id} detail={detail} letter={letter} open={open} onClose={onClose} onSaved={onSaved} />;
}

function LetterReview({
  detail,
  letter,
  open,
  onClose,
  onSaved,
}: {
  detail: SubmissionDetail;
  letter: Letter;
  open: boolean;
  onClose: () => void;
  onSaved: (letter: Letter) => void;
}) {
  const titleId = useId();
  const parts = useMemo(() => ({ en: splitLetter(letter.en.body), ar: splitLetter(letter.ar.body) }), [letter]);
  const saved = useMemo(() => toDraft(letter, parts), [letter, parts]);
  const [draft, setDraft] = useState<Draft>(saved);
  const [base, setBase] = useState<Draft>(saved);
  if (base !== saved) {
    // The letter changed underneath (save or reload): follow it unless the officer has unsaved edits.
    setBase(saved);
    if (sameDraft(draft, base)) setDraft(saved);
  }
  const [view, setView] = useState<View>("both");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | null>(null);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  const printRef = useRef<HTMLDivElement>(null);

  const approved = letter.status === "approved";
  const dirty = !sameDraft(draft, saved);
  const canEdit = editing && !approved;

  const requestClose = () => {
    if (dirty && !window.confirm("You have unsaved changes to this letter. Close it and discard them?")) return;
    onClose();
  };

  const save = async (approve: boolean) => {
    const empty = LANGS.find((l) => !draft[l].subject.trim() || !draft[l].main.trim());
    if (empty) {
      setError(`The ${LANG_NAME[empty]} letter needs a subject and text before it can be saved.`);
      return;
    }
    const content = (l: Lang): LetterContent => ({ subject: draft[l].subject.trim(), body: joinLetter(parts[l], draft[l].main) });
    setBusy(approve ? "approve" : "save");
    setError(undefined);
    setStatus(undefined);
    try {
      // Only changed languages are sent, so the audit log records exactly what was edited.
      const changed = (l: Lang) => draft[l].subject !== saved[l].subject || draft[l].main !== saved[l].main;
      const body = Object.fromEntries(LANGS.filter(changed).map((l) => [l, content(l)]));
      const res = await api.updateLetter(letter.id, { ...body, officerName: OFFICER.name, ...(approve ? { status: "approved" as const } : {}) });
      setDraft(toDraft(res, { en: splitLetter(res.en.body), ar: splitLetter(res.ar.body) }));
      if (approve) setEditing(false);
      setStatus(approve ? "Letter approved." : "Changes saved.");
      onSaved(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The letter could not be saved.");
    } finally {
      setBusy(null);
    }
  };

  const print = () => {
    const html = printRef.current?.innerHTML;
    if (html && !printLetters(html, `${letter.reference} ${detail.facilityShortName}`)) {
      setError("The print window was blocked. Allow pop-ups for this site and try again.");
    }
  };

  const paneClass = (l: Lang) => {
    if (view === "both") return l === "ar" ? "hidden min-w-0 lg:block" : "min-w-0";
    return view === l ? "mx-auto w-full min-w-0 max-w-[760px]" : "hidden";
  };

  return (
    <Dialog
      open={open}
      onClose={requestClose}
      size="xl"
      labelledBy={titleId}
      title={`Letter to ${detail.operator}`}
      description={
        <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="font-mono text-[12px] text-ink-2">{letter.reference}</span>
          <Pill size="sm" tone={approved ? "ok" : "gold"}>
            {approved ? "Approved" : "Draft"}
          </Pill>
          <span>
            {GENERATED_BY[letter.generatedBy]}
            {letter.generatedBy === "llm" && letter.model ? ` (${letter.model})` : ""}
          </span>
        </span>
      }
      footer={
        <>
          <p aria-live="polite" className="mr-auto text-[13px] text-ink-muted">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-gold-800">
                <span aria-hidden className="size-2 rounded-full bg-gold-500" />
                Unsaved changes
              </span>
            ) : (
              status
            )}
          </p>
          <Button variant="ghost" icon={<Printer size={16} weight="bold" />} onClick={print}>
            Print
          </Button>
          {approved ? (
            <Button variant="secondary" onClick={requestClose}>
              Close
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                icon={editing ? <Check size={16} weight="bold" /> : <PencilSimple size={16} weight="bold" />}
                onClick={() => setEditing((e) => !e)}
                disabled={busy !== null}
              >
                {editing ? "Done editing" : "Edit"}
              </Button>
              {dirty && (
                <Button variant="secondary" busy={busy === "save"} disabled={busy !== null} onClick={() => void save(false)}>
                  Save changes
                </Button>
              )}
              <Button icon={<SealCheck size={16} weight="bold" />} busy={busy === "approve"} disabled={busy !== null} onClick={() => void save(true)}>
                Approve letter
              </Button>
            </>
          )}
        </>
      }
    >
      <div className="min-h-full bg-page">
        <div className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line bg-surface px-5 py-3 sm:px-6">
          <div className="hidden lg:block">
            <Segmented<View>
              label="Letter language"
              value={view}
              onChange={setView}
              options={[
                { value: "both", label: "Side by side" },
                { value: "en", label: "English" },
                { value: "ar", label: "العربية", lang: "ar" },
              ]}
            />
          </div>
          <div className="lg:hidden">
            <Segmented<Lang>
              label="Letter language"
              value={view === "both" ? "en" : view}
              onChange={setView}
              options={[
                { value: "en", label: "English" },
                { value: "ar", label: "العربية", lang: "ar" },
              ]}
            />
          </div>
          <p className="text-[13px] text-ink-muted">
            {approved
              ? "Final version. Editing is closed."
              : canEdit
                ? "Letterhead, reference, recipient and signature are added automatically."
                : "Preview. Review both languages before approving."}
          </p>
        </div>

        <div className="flex flex-col gap-4 p-4 sm:p-6">
          {approved && (
            <Notice tone="ok" className="flex items-start gap-2">
              <SealCheck size={18} weight="duotone" aria-hidden className="mt-0.5 shrink-0" />
              <span>
                Approved by {letter.approvedBy ?? OFFICER.name}
                {letter.approvedAt ? ` on ${formatDateTime(letter.approvedAt)}` : ""}. The letter is final and ready to send to the operator.
              </span>
            </Notice>
          )}
          {error && (
            <div role="alert">
              <Notice tone="bad">{error}</Notice>
            </div>
          )}
          <div className={`grid gap-5 ${view === "both" ? "lg:grid-cols-2" : ""}`}>
            {LANGS.map((l) => (
              <div key={l} className={paneClass(l)}>
                {canEdit ? (
                  <LetterEditor
                    lang={l}
                    subject={draft[l].subject}
                    main={draft[l].main}
                    disabled={busy !== null}
                    onChange={(next) => setDraft((d) => ({ ...d, [l]: next }))}
                  />
                ) : (
                  <LetterPaper lang={l} subject={draft[l].subject} parts={{ ...parts[l], main: draft[l].main }} letter={letter} detail={detail} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div ref={printRef} hidden>
          {LANGS.map((l) => (
            <LetterPaper key={l} print lang={l} subject={draft[l].subject} parts={{ ...parts[l], main: draft[l].main }} letter={letter} detail={detail} />
          ))}
        </div>
      </div>
    </Dialog>
  );
}
