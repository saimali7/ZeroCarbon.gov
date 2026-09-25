"use client";

import { FolderSimplePlus, Prohibit } from "@phosphor-icons/react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ApiRequestError, api } from "../../_lib/api";
import { demoSubmissions, loadSampleFolder, type ActiveRun } from "../../_lib/runs";
import { fromDataTransfer, fromFileList, type PickedFile } from "../inbox/collect-files";
import { Composer, DropZone, QUESTION_CHIPS, SuggestionChips, type Sample } from "./assistant-composer";
import { STEP_COUNT, STEP_MS, dropLabel, packageLabel, packageProblem, pickerLabel, runPhase, toActiveRun, type RunItem, type ThreadItem } from "./assistant-model";
import { AssistantProgress } from "./assistant-progress";
import { AssistantResult } from "./assistant-result";
import { AnswerMessage, AssistantAvatar, AssistantTurn, FilesMessage, NoticeMessage, OfficerTurn, Paragraphs } from "./assistant-thread";

/** Samples in the order the pitch uses them (non-compliant first); other demo submissions follow. */
const SAMPLE_ORDER = ["dec-southern-dunes-cpf2-ry2025", "dec-eastern-dunes-cpf1-ry2025"];

const INTRO =
  "Drop a company's submission folder here and I'll review it against the Climate Law and EAD guidance. You'll see each step as it runs, then the verdict, the risk score and a recommended action.";

let counter = 0;
const uid = () => `run-${Date.now().toString(36)}-${(counter++).toString(36)}`;

const errorText = (err: unknown) => (err instanceof ApiRequestError || err instanceof Error ? err.message : "Something went wrong.");

function wait(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

const prefersReducedMotion = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Home page assistant: the officer drops a submission folder (or runs a sample), watches the upload and
 * review as a step-by-step progress report, gets a verdict card, and can ask follow-up questions.
 */
export function HomeAssistant({ onRunChange, onRunsChanged }: { onRunChange: (run: ActiveRun | null) => void; onRunsChanged: () => void }) {
  const [items, setItems] = useState<ThreadItem[]>([]);
  const [samples, setSamples] = useState<Sample[] | "loading" | "error">("loading");
  const [loadingSample, setLoadingSample] = useState<string>();
  const [dragging, setDragging] = useState(false);
  const [text, setText] = useState("");

  const controller = useRef<AbortController>(new AbortController());
  const busyRef = useRef(false);
  const dragDepth = useRef(0);
  const reported = useRef("");
  const callbacks = useRef({ onRunChange, onRunsChanged });
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const threadRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLElement>(null);
  /** Run whose result heading takes focus once it renders. */
  const focusRun = useRef<string | undefined>(undefined);

  useEffect(() => {
    callbacks.current = { onRunChange, onRunsChanged };
  }, [onRunChange, onRunsChanged]);

  useEffect(() => {
    const ctrl = new AbortController();
    controller.current = ctrl;
    folderInput.current?.setAttribute("webkitdirectory", "");
    api
      .submissions(ctrl.signal)
      .then((all) => {
        const rank = (id: string) => (SAMPLE_ORDER.includes(id) ? SAMPLE_ORDER.indexOf(id) : SAMPLE_ORDER.length);
        const demo = demoSubmissions(all).sort((a, b) => rank(a.id) - rank(b.id));
        setSamples(demo.map((s) => ({ id: s.id, name: s.facilityShortName || s.facilityName })));
      })
      .catch(() => !ctrl.signal.aborted && setSamples("error"));
    // Files dropped outside the card would otherwise open in the tab and end the demo.
    const block = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      ctrl.abort();
      busyRef.current = false;
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, []);

  // Keep the newest step in view inside the thread, and bring the whole card into view when something new appears.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [items]);

  const runs = items.filter((it): it is RunItem => it.kind === "run");
  const running = runs.some((r) => runPhase(r) === "uploading" || runPhase(r) === "reviewing");
  const busy = running || loadingSample !== undefined;
  const latestDone = runs.filter((r) => runPhase(r) === "done").at(-1);
  const asking = items.some((it) => it.kind === "answer" && it.status === "loading");
  const viewKey = `${items.length}:${latestDone?.id ?? ""}`;

  useEffect(() => {
    if (viewKey.startsWith("0:")) return;
    sectionRef.current?.scrollIntoView({ block: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  }, [viewKey]);

  useEffect(() => {
    if (!latestDone || focusRun.current !== latestDone.id) return;
    focusRun.current = undefined;
    resultHeading.current?.focus({ preventScroll: true });
    // After the steps fold away (see AssistantProgress), bring the verdict and its buttons into view.
    window.setTimeout(() => {
      const thread = threadRef.current;
      if (thread) thread.scrollTo({ top: thread.scrollHeight, behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }, 1500);
  }, [latestDone]);

  const commit = useCallback((run: RunItem) => {
    setItems((prev) => prev.map((it) => (it.kind === "run" && it.id === run.id ? run : it)));
    const active = toActiveRun(run);
    const key = `${run.id}:${active.phase}:${active.submissionId ?? ""}`;
    if (reported.current !== key) {
      reported.current = key;
      callbacks.current.onRunChange(active);
    }
  }, []);

  const patchItem = (id: string, patch: Partial<Extract<ThreadItem, { kind: "answer" }>>) =>
    setItems((prev) => prev.map((it) => (it.kind === "answer" && it.id === id ? { ...it, ...patch } : it)));

  /** Uploads (unless already uploaded) and reviews, pacing the visible steps so each one is readable. */
  const execute = useCallback(
    async (initial: RunItem) => {
      const signal = controller.current.signal;
      busyRef.current = true;
      let run: RunItem = { ...initial, failed: undefined, endedAt: undefined, startedAt: Date.now(), done: initial.upload ? 1 : 0 };
      commit(run);
      const fail = (step: number, err: unknown) => {
        if (signal.aborted) return;
        commit({ ...run, failed: { step, message: errorText(err) }, endedAt: Date.now() });
        busyRef.current = false;
      };

      if (!run.upload) {
        try {
          const started = performance.now();
          const timed = api.upload(run.files, signal).then((upload) => ({ upload, ms: performance.now() - started }));
          const [{ upload, ms }] = await Promise.all([timed, wait(STEP_MS, signal)]);
          run = { ...run, upload, uploadMs: ms, done: 1 };
          commit(run);
          callbacks.current.onRunsChanged();
        } catch (err) {
          return fail(0, err);
        }
      }

      try {
        const [review] = await Promise.all([api.review(run.upload!.id, signal), wait(STEP_MS, signal)]);
        run = { ...run, review, done: 2 };
        commit(run);
        for (let done = 3; done <= STEP_COUNT; done++) {
          await wait(STEP_MS, signal);
          run = { ...run, done, endedAt: done === STEP_COUNT ? Date.now() : undefined };
          commit(run);
        }
      } catch (err) {
        return fail(run.done, err);
      }
      busyRef.current = false;
      focusRun.current = run.id;
      callbacks.current.onRunsChanged();
    },
    [commit],
  );

  const startPackage = (files: PickedFile[], label: string) => {
    if (busyRef.current) return;
    const id = uid();
    const problem = packageProblem(files);
    const added: ThreadItem[] = files.length > 0 ? [{ kind: "files", id: `${id}-files`, label, files }] : [];
    if (problem) {
      setItems((prev) => [...prev, ...added, { kind: "notice", id: `${id}-notice`, ...problem }]);
      return;
    }
    const run: RunItem = { kind: "run", id, label, files, startedAt: Date.now(), done: 0 };
    setItems((prev) => [...prev, ...added, run]);
    void execute(run);
  };

  const runSample = async (sample: Sample) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoadingSample(sample.id);
    const signal = controller.current.signal;
    try {
      const { label, files } = await loadSampleFolder(sample.id, signal);
      busyRef.current = false;
      startPackage(files, label);
    } catch (err) {
      if (signal.aborted) return;
      busyRef.current = false;
      setItems((prev) => [...prev, { kind: "notice", id: uid(), title: "Could not load the sample folder", text: errorText(err) }]);
    } finally {
      if (!signal.aborted) setLoadingSample(undefined);
    }
  };

  const fetchAnswer = async (id: string, question: string, submissionId: string) => {
    const signal = controller.current.signal;
    try {
      const response = await api.ask(submissionId, question, signal);
      patchItem(id, { status: "ready", response });
    } catch (err) {
      if (!signal.aborted) patchItem(id, { status: "error", text: errorText(err) });
    }
  };

  const ask = (raw: string) => {
    const question = raw.trim();
    if (!question || asking) return;
    setText("");
    const id = uid();
    const asked: ThreadItem = { kind: "question", id: `${id}-q`, text: question };
    if (!latestDone?.upload) {
      const hint = running
        ? "The review is still running. Ask me again when it finishes and I'll answer from its findings."
        : "Drop a submission folder here first, or run one of the samples. Once a review is done I can answer questions about it, with sources.";
      setItems((prev) => [...prev, asked, { kind: "answer", id, question, status: "local", text: hint }]);
      return;
    }
    const { id: submissionId, facilityShortName, facilityName } = latestDone.upload;
    setItems((prev) => [...prev, asked, { kind: "answer", id, question, submissionId, facility: facilityShortName || facilityName, status: "loading" }]);
    void fetchAnswer(id, question, submissionId);
  };

  const isFileDrag = (e: DragEvent) => Array.from(e.dataTransfer.types).includes("Files");
  const onDragEnter = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const onDragOver = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? "none" : "copy";
  };
  const onDragLeave = (e: DragEvent) => {
    if (!isFileDrag(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };
  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (busyRef.current) return;
    const label = dropLabel(e.dataTransfer);
    fromDataTransfer(e.dataTransfer)
      .then((files) => startPackage(files, packageLabel(files, label)))
      .catch((err) => setItems((prev) => [...prev, { kind: "notice", id: uid(), title: "Could not read the dropped folder", text: errorText(err) }]));
  };

  const onPicked = (list: FileList | null, folder: boolean) => {
    if (!list || list.length === 0) return;
    const files = fromFileList(list);
    startPackage(files, packageLabel(files, folder ? pickerLabel(list) : undefined));
  };

  const focusComposer = () => textareaRef.current?.focus();
  const retry = (run: RunItem) => !busyRef.current && void execute(run.failed?.step === 0 ? { ...run, upload: undefined, uploadMs: undefined } : run);
  const empty = items.length === 0;
  const status = busy ? "Reviewing" : "Ready";

  return (
    <section
      ref={sectionRef}
      aria-labelledby="assistant-title"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className="relative overflow-hidden rounded-[18px] border border-line bg-surface shadow-raised"
    >
      <header className="relative flex items-center gap-3.5 border-b border-line-soft bg-linear-to-b from-gold-50 to-surface px-5 py-4 sm:px-6">
        <span aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-gold-500" />
        <AssistantAvatar size={44} />
        <div className="min-w-0 flex-1">
          <h2 id="assistant-title" className="text-base font-semibold">
            Review assistant
          </h2>
          <p className="text-[13px] leading-snug text-ink-muted">Checks annual emissions submissions against Federal Decree-Law No. 11 of 2024 and EAD guidance</p>
        </div>
        <span className="hidden shrink-0 items-center gap-1.5 text-[13px] font-medium text-ink-2 sm:inline-flex">
          <span aria-hidden className={`size-2 rounded-full ${busy ? "animate-pulse bg-gold-500 motion-reduce:animate-none" : "bg-ok-600"}`} />
          {status}
        </span>
      </header>

      <div
        ref={threadRef}
        className={`overflow-y-auto overscroll-contain px-4 py-5 sm:px-6 ${empty ? "" : "max-h-[max(360px,min(620px,calc(100dvh-300px)))]"}`}
      >
        <ol className="flex flex-col gap-5" aria-label="Conversation">
          <li>
            <AssistantTurn>
              <Paragraphs text={INTRO} />
            </AssistantTurn>
          </li>
          {empty && (
            <li>
              <DropZone disabled={busy} onPickFolder={() => folderInput.current?.click()} onPickFiles={() => filesInput.current?.click()} />
            </li>
          )}
          {items.map((item) => (
            <li key={item.id}>
              {item.kind === "files" && <FilesMessage label={item.label} files={item.files} />}
              {item.kind === "notice" && <NoticeMessage title={item.title} text={item.text} />}
              {item.kind === "question" && (
                <OfficerTurn>
                  <p className="whitespace-pre-line break-words">{item.text}</p>
                </OfficerTurn>
              )}
              {item.kind === "answer" && (
                <AnswerMessage
                  status={item.status}
                  response={item.response}
                  text={item.text}
                  facility={item.facility}
                  onRetry={() => {
                    if (!item.submissionId) return;
                    patchItem(item.id, { status: "loading", text: undefined });
                    void fetchAnswer(item.id, item.question, item.submissionId);
                  }}
                />
              )}
              {item.kind === "run" && (
                <AssistantTurn>
                  <AssistantProgress run={item} retryDisabled={busy} onRetry={() => retry(item)} />
                  {runPhase(item) === "done" && item.review && item.upload && (
                    <AssistantResult
                      review={item.review}
                      submission={item.upload}
                      uploadMs={item.uploadMs}
                      onAsk={focusComposer}
                      headingRef={item === latestDone ? resultHeading : undefined}
                    />
                  )}
                </AssistantTurn>
              )}
            </li>
          ))}
        </ol>
      </div>

      <div className="flex flex-col gap-3 border-t border-line-soft bg-surface px-4 pb-4 pt-3.5 sm:px-6">
        <SuggestionChips
          samples={samples}
          loadingSample={loadingSample}
          runBusy={busy}
          questions={latestDone ? QUESTION_CHIPS : []}
          askBusy={asking}
          onSample={(s) => void runSample(s)}
          onQuestion={ask}
        />
        <Composer
          value={text}
          onChange={setText}
          onSend={() => ask(text)}
          sending={asking}
          attachDisabled={busy}
          onPickFolder={() => folderInput.current?.click()}
          onPickFiles={() => filesInput.current?.click()}
          inputRef={textareaRef}
          placeholder={latestDone ? "Ask about this review" : "Ask a question"}
        />
        <p className="text-xs text-ink-muted">The assistant checks and recommends. The decision stays with you.</p>
      </div>

      <input ref={folderInput} type="file" multiple hidden aria-label="Choose a submission folder" onChange={(e) => (onPicked(e.target.files, true), (e.target.value = ""))} />
      <input ref={filesInput} type="file" multiple hidden aria-label="Choose files" onChange={(e) => (onPicked(e.target.files, false), (e.target.value = ""))} />

      {dragging && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-3 rounded-[14px] border-2 border-dashed text-center backdrop-blur-[1px] ${
            busy ? "border-line-strong bg-sunken/95" : "border-gold-500 bg-gold-50/95"
          }`}
        >
          <span className={`grid size-14 place-items-center rounded-full ${busy ? "bg-line-soft text-ink-muted" : "bg-gold-100 text-gold-700"}`}>
            {busy ? <Prohibit size={26} weight="duotone" /> : <FolderSimplePlus size={26} weight="duotone" />}
          </span>
          <p className="px-6 text-base font-semibold">{busy ? "A review is running" : "Drop the folder to start the review"}</p>
          <p className="max-w-[40ch] px-6 text-sm text-ink-muted">
            {busy ? "You can drop another folder when it finishes." : "The folder must include the EAD MRV emissions report workbook (.xlsx)."}
          </p>
        </div>
      )}
    </section>
  );
}
