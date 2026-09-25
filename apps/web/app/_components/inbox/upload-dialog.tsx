"use client";

import { CloudArrowUp, Files, FolderOpen, X } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { api } from "../../_lib/api";
import { formatBytes, formatInt } from "../../_lib/format";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { FileTypeIcon } from "../ui/evidence";
import { Pill } from "../ui/pill";
import { Notice } from "../ui/states";
import { fromDataTransfer, fromFileList, isWorkbook, mergeFiles, type PickedFile } from "./collect-files";

/**
 * Add a submission package: a folder (drag and drop or folder picker) or loose files.
 * Paths are kept relative to the submission folder so "evidence/..." files stay grouped.
 */
export function UploadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const controller = useRef<AbortController | null>(null);

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
  }, []);

  // A file dropped just outside the drop area would otherwise open in the tab.
  useEffect(() => {
    if (!open) return;
    const block = (e: globalThis.DragEvent) => e.preventDefault();
    window.addEventListener("dragover", block);
    window.addEventListener("drop", block);
    return () => {
      window.removeEventListener("dragover", block);
      window.removeEventListener("drop", block);
    };
  }, [open]);

  const close = () => {
    controller.current?.abort();
    setFiles([]);
    setError(undefined);
    setBusy(false);
    setDragging(false);
    onClose();
  };

  const add = (added: PickedFile[]) => {
    setError(undefined);
    setFiles((current) => mergeFiles(current, added));
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (busy) return;
    fromDataTransfer(e.dataTransfer).then(add, () => setError("Some files could not be read. Try choosing the folder instead."));
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = busy ? "none" : "copy";
    if (!busy) setDragging(true);
  };

  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
  };

  const hasWorkbook = files.some((f) => isWorkbook(f.relativePath));
  const totalBytes = files.reduce((sum, f) => sum + f.file.size, 0);

  const submit = async () => {
    const ctrl = new AbortController();
    controller.current = ctrl;
    setBusy(true);
    setError(undefined);
    try {
      const created = await api.upload(files, ctrl.signal);
      close();
      router.push(`/submissions/${encodeURIComponent(created.id)}`);
    } catch (err) {
      if (ctrl.signal.aborted) return;
      setError(err instanceof Error ? err.message : "The upload failed. Try again.");
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      labelledBy="upload-title"
      title="Add a submission"
      description="Upload a facility's package: the EAD MRV emissions report workbook and its supporting documents."
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} busy={busy} disabled={!hasWorkbook} icon={<CloudArrowUp size={18} weight="bold" aria-hidden />}>
            {busy ? "Uploading" : "Upload and open"}
          </Button>
        </>
      }
    >
      <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop} className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div
          className={`flex flex-col items-center gap-3 rounded-card border-2 border-dashed px-5 py-7 text-center transition-colors duration-150 ${
            dragging ? "border-gold-500 bg-gold-50" : "border-line-strong bg-sunken"
          }`}
        >
          <span className="grid size-11 place-items-center rounded-full bg-gold-100 text-gold-700">
            <CloudArrowUp size={22} weight="duotone" aria-hidden />
          </span>
          <div>
            <p className="text-[15px] font-semibold">{dragging ? "Drop to add the files" : "Drag a submission folder here"}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
              Subfolders such as <span className="font-mono text-xs">evidence/</span> are kept. The package must include the .xlsx workbook.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => folderInput.current?.click()} icon={<FolderOpen size={18} aria-hidden />}>
              Choose folder
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => filesInput.current?.click()} icon={<Files size={18} aria-hidden />}>
              Choose files
            </Button>
          </div>
          <p className="text-xs leading-relaxed text-ink-muted">
            Demo packages are in <span className="font-mono">demo/submissions/</span> in the project folder, for example{" "}
            <span className="break-all font-mono">DEC_Southern-Dunes-CPF2_RY2025</span>.
          </p>
        </div>

        <input
          ref={folderInput}
          type="file"
          multiple
          hidden
          aria-label="Choose a submission folder"
          onChange={(e) => {
            if (e.target.files) add(fromFileList(e.target.files));
            e.target.value = "";
          }}
        />
        <input
          ref={filesInput}
          type="file"
          multiple
          hidden
          aria-label="Choose files"
          onChange={(e) => {
            if (e.target.files) add(fromFileList(e.target.files));
            e.target.value = "";
          }}
        />

        {files.length > 0 && <PickedFileList files={files} busy={busy} onRemove={(path) => setFiles((fs) => fs.filter((f) => f.relativePath !== path))} onClear={() => setFiles([])} total={totalBytes} />}

        <div className="flex flex-col gap-2 empty:hidden">
          {files.length > 0 && !hasWorkbook && (
            <Notice tone="gold">Add the EAD MRV emissions report workbook (.xlsx). A submission cannot be reviewed without it.</Notice>
          )}
          {error && (
            <Notice tone="bad">
              <span role="alert">Upload failed: {error}</span>
            </Notice>
          )}
        </div>
      </div>
    </Dialog>
  );
}

function PickedFileList({
  files,
  total,
  busy,
  onRemove,
  onClear,
}: {
  files: PickedFile[];
  total: number;
  busy: boolean;
  onRemove: (path: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="rounded-card border border-line">
      <div className="flex items-center justify-between gap-3 border-b border-line bg-sunken px-4 py-2 text-[13px]">
        <span className="font-medium">
          {formatInt(files.length)} {files.length === 1 ? "file" : "files"}
          <span className="font-normal text-ink-muted">, {formatBytes(total)} in total</span>
        </span>
        <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
          Clear all
        </Button>
      </div>
      <ul className="max-h-64 divide-y divide-line-soft overflow-y-auto">
        {files.map((f) => (
          <li key={f.relativePath} className="flex items-center gap-2.5 py-1 pl-4 pr-1.5 text-[13px]">
            <FileTypeIcon fileName={f.relativePath} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-2" title={f.relativePath}>
              {f.relativePath}
            </span>
            {isWorkbook(f.relativePath) && (
              <Pill tone="ok" size="sm">
                Workbook
              </Pill>
            )}
            <span className="w-16 shrink-0 text-right tabular-nums text-ink-muted">{formatBytes(f.file.size)}</span>
            <button
              type="button"
              onClick={() => onRemove(f.relativePath)}
              disabled={busy}
              aria-label={`Remove ${f.relativePath}`}
              className="grid size-8 shrink-0 place-items-center rounded-control text-ink-faint transition-colors hover:bg-line-soft hover:text-ink disabled:opacity-45"
            >
              <X size={14} weight="bold" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
