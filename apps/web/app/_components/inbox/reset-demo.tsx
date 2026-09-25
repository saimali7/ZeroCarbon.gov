"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react";
import { useState } from "react";
import { api } from "../../_lib/api";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Notice } from "../ui/states";

/** Quiet "Reset demo" action with a confirmation step. */
export function ResetDemo({ onReset, disabled }: { onReset: () => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const close = () => {
    if (busy) return;
    setOpen(false);
    setError(undefined);
  };

  const confirm = async () => {
    setBusy(true);
    setError(undefined);
    try {
      await api.resetDemo();
      setOpen(false);
      onReset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The demo could not be reset.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button variant="ghost" size="sm" disabled={disabled} onClick={() => setOpen(true)} icon={<ArrowCounterClockwise size={15} aria-hidden />}>
        Reset demo
      </Button>
      <Dialog
        open={open}
        onClose={close}
        size="md"
        labelledBy="reset-demo-title"
        title="Reset the demo?"
        footer={
          <>
            <Button variant="ghost" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button variant="danger" onClick={confirm} busy={busy}>
              Reset demo
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 px-5 py-5 text-[15px] leading-relaxed sm:px-6">
          <p>
            This clears every review, decision, letter and uploaded submission. The demo reports return to <strong>Not reviewed</strong>.
          </p>
          <p className="text-sm text-ink-muted">Use it before a new demo run. It cannot be undone.</p>
          {error && (
            <Notice tone="bad">
              <span role="alert">Reset failed: {error}</span>
            </Notice>
          )}
        </div>
      </Dialog>
    </>
  );
}
