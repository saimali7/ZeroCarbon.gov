"use client";

import { useId, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is not plain text. */
  ariaLabel?: string;
  lang?: string;
}

/** Single-choice segmented control (radio group semantics, arrow-key navigation). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "md",
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const name = useId();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const group = e.currentTarget;
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => group.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus());
  };
  const pad = size === "sm" ? "h-7 px-2.5 text-[13px]" : "h-8 px-3.5 text-[13px]";
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={`inline-flex rounded-[10px] bg-line-soft p-1 ${className}`}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            name={name}
            data-value={o.value}
            aria-checked={selected}
            aria-label={o.ariaLabel}
            lang={o.lang}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[7px] font-medium transition-[background-color,color,box-shadow] duration-150 ${pad} ${
              selected ? "bg-surface text-ink shadow-raised" : "text-ink-muted hover:text-ink"
            }`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
