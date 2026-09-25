"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/** Click-to-open popover anchored below its trigger. Closes on Esc and outside click. */
export function Popover({
  trigger,
  children,
  align = "start",
  label,
}: {
  trigger: (props: { open: boolean; toggle: () => void; id: string }) => ReactNode;
  children: ReactNode;
  align?: "start" | "end";
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <span ref={root} className="relative inline-flex">
      {trigger({ open, toggle: () => setOpen((o) => !o), id })}
      {open && (
        <span
          id={id}
          role="dialog"
          aria-label={label}
          className={`absolute top-full z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-card border border-line bg-surface p-4 text-left text-sm shadow-overlay ${
            align === "end" ? "right-0" : "left-0"
          }`}
        >
          {children}
        </span>
      )}
    </span>
  );
}
