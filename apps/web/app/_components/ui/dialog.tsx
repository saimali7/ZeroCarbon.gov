"use client";

import { X } from "@phosphor-icons/react";
import { useEffect, useRef, type ReactNode } from "react";

/**
 * Modal built on the native <dialog> element: focus trap, Esc to close and inert
 * background come from the browser. `variant="drawer"` docks it to the right edge.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  actions,
  footer,
  variant = "modal",
  size = "lg",
  children,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  /** Extra controls in the header, left of the close button. */
  actions?: ReactNode;
  footer?: ReactNode;
  variant?: "modal" | "drawer";
  size?: "md" | "lg" | "xl";
  children: ReactNode;
  labelledBy?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  const width = { md: "sm:max-w-[560px]", lg: "sm:max-w-[760px]", xl: "sm:max-w-[1040px]" }[size];
  const frame =
    variant === "drawer"
      ? `ml-auto mr-0 h-dvh max-h-dvh w-full ${width} rounded-none sm:rounded-l-card`
      : `m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] ${width} rounded-card`;

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className={`${frame} flex-col overflow-hidden bg-surface p-0 text-ink shadow-overlay open:flex`}
    >
      <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 id={labelledBy} className="text-lg font-semibold leading-snug">
            {title}
          </h2>
          {description && <div className="mt-0.5 text-[13px] text-ink-muted">{description}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-control text-ink-muted transition-colors hover:bg-line-soft hover:text-ink"
          >
            <X size={18} weight="bold" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-sunken px-5 py-3 sm:px-6">{footer}</div>}
    </dialog>
  );
}
