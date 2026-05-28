"use client";

import type React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/schema";

// ── Class constants — shared across every editor dialog ──────────────────

export const EDITOR_CARD_CLASS =
  "w-full overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] text-left font-[family-name:var(--font-ui)] text-[color:var(--ink)] shadow-[0_24px_48px_-12px_rgba(20,18,10,0.28)]";

export const EDITOR_MODAL_WIDTH_CLASS = "w-[27rem] max-w-[calc(100vw-2rem)]";

export const EDITOR_INPUT_CLASS =
  "h-8 w-full rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] px-2.5 text-[13px] font-medium text-[color:var(--ink)] outline-none transition-colors placeholder:font-normal placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line-strong)] focus:bg-[color:var(--card)] focus:ring-2 focus:ring-[color:var(--ring)]";

export const EDITOR_PLAIN_INPUT_CLASS =
  "h-8 w-full rounded-[var(--r-sm)] border border-transparent bg-transparent px-0 text-[13px] font-medium text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line)] focus:bg-[color:var(--sunken)] focus:px-2.5 focus:ring-2 focus:ring-[color:var(--ring)]";

export const EDITOR_PLAIN_VALUE_CLASS =
  "flex min-h-8 items-center text-[13px] font-medium text-[color:var(--ink)]";

export const EDITOR_LABEL_CLASS =
  "font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]";

export const EDITOR_HEADER_CLASS =
  "border-b border-[color:var(--line-soft)] bg-[radial-gradient(120%_100%_at_0%_0%,oklch(94%_0.04_70)_0%,transparent_60%),linear-gradient(180deg,var(--card),var(--sunken))] px-5 py-4";

export const EDITOR_TITLE_CLASS =
  "mt-3 max-w-full font-[family-name:var(--font-disp)] text-[20px] font-medium leading-tight tracking-[-0.015em] text-[color:var(--ink)]";

export const EDITOR_META_CLASS =
  "mt-1 flex flex-wrap items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)]";

export const EDITOR_BODY_CLASS =
  "border-y border-[color:var(--line-soft)] bg-[color:var(--card)]";

export const EDITOR_ROW_CLASS =
  "relative grid grid-cols-[4.25rem_minmax(0,1fr)] items-center gap-2 px-5 py-3 after:absolute after:bottom-0 after:left-5 after:right-5 after:h-px after:bg-[color:var(--line-soft)] after:content-[''] last:after:hidden";

export const EDITOR_FOOTER_CLASS =
  "flex items-center justify-between gap-3 bg-[color:var(--sunken)] px-5 py-3";

export const EDITOR_SECONDARY_BUTTON_CLASS =
  "inline-flex h-8 min-w-16 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 text-center text-[12.5px] font-medium !text-[color:var(--ink)] transition-colors hover:bg-[color:var(--sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]";

export const EDITOR_PRIMARY_BUTTON_CLASS =
  "inline-flex h-8 min-w-16 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--ink)] px-3 text-center text-[12.5px] font-medium !text-[color:var(--card)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";

export const EDITOR_DELETE_BUTTON_CLASS =
  "inline-flex h-8 items-center justify-center rounded-[var(--r-sm)] px-2.5 text-[12.5px] font-medium !text-[oklch(55%_0.18_25)] transition-colors hover:bg-[oklch(95%_0.04_25)] dark:!text-[oklch(72%_0.15_25)] dark:hover:bg-[oklch(28%_0.10_25)]";

const CATEGORY_OPTIONS: Category[] = ["T0", "T1", "T2"];

// ── Helpers + shared sub-components ──────────────────────────────────────

export function formatEditorDuration(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safeMinutes / 60);
  const mins = safeMinutes % 60;
  return `${hours}h ${String(mins).padStart(2, "0")}m`;
}

export function EditorMetaDot() {
  return (
    <span
      aria-hidden="true"
      className="h-1 w-1 rounded-full bg-[color:var(--line-strong)]"
    />
  );
}

export function EditorModal({
  children,
  onClose,
  widthClass = EDITOR_MODAL_WIDTH_CLASS,
}: {
  children: React.ReactNode;
  onClose: () => void;
  widthClass?: string;
}) {
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[color:var(--ink)]/12 p-4 backdrop-blur-[1px]"
      role="dialog"
      aria-modal="true"
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        className={cn(
          widthClass,
          "max-h-[calc(100vh-2rem)] overflow-y-auto rounded-[18px]",
        )}
        onDoubleClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function EditorHeader({
  eyebrow,
  title,
  meta,
  onCancel,
  leading,
}: {
  eyebrow: string;
  title: string;
  meta: Array<string | null | undefined>;
  onCancel: () => void;
  leading?: React.ReactNode;
}) {
  const visibleMeta = meta.filter(Boolean) as string[];

  return (
    <div className={EDITOR_HEADER_CLASS}>
      <div className="flex items-start justify-between gap-4">
        <span className={EDITOR_LABEL_CLASS}>{eyebrow}</span>
        <button
          type="button"
          className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          title="Close"
          aria-label="Close editor"
          onClick={onCancel}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-3 flex min-w-0 items-start gap-2.5">
        {leading}
        <h2
          className={cn(EDITOR_TITLE_CLASS, "mt-0 whitespace-normal break-words")}
        >
          {title || "Untitled"}
        </h2>
      </div>
      {visibleMeta.length > 0 && (
        <div className={EDITOR_META_CLASS}>
          {visibleMeta.map((item, index) => (
            <span key={`${item}-${index}`} className="inline-flex items-center gap-1.5">
              {index > 0 && <EditorMetaDot />}
              <span>{item}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function EditorTierSegment({
  value,
  onChange,
}: {
  value: Category;
  onChange: (value: Category) => void;
}) {
  return (
    <div className="inline-flex w-fit rounded-full border border-[color:var(--line)] bg-[color:var(--sunken)] p-1">
      {CATEGORY_OPTIONS.map((option) => (
        <button
          key={option}
          type="button"
          className={cn(
            "h-6 min-w-9 rounded-full px-2.5 text-[11px] font-semibold transition-colors",
            value === option
              ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
              : "!text-[color:var(--ink-2)] hover:bg-[color:var(--card)] hover:!text-[color:var(--ink)]",
          )}
          onClick={() => onChange(option)}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

export function EditorFooter({
  onDelete,
  onCancel,
  onSubmit,
  submitLabel,
  submitDisabled,
}: {
  onDelete?: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className={EDITOR_FOOTER_CLASS}>
      {onDelete ? (
        <button
          type="button"
          className={EDITOR_DELETE_BUTTON_CLASS}
          onClick={onDelete}
        >
          Delete
        </button>
      ) : (
        <div />
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className={EDITOR_SECONDARY_BUTTON_CLASS}
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className={EDITOR_PRIMARY_BUTTON_CLASS}
          onClick={onSubmit}
          disabled={submitDisabled}
        >
          {submitLabel}
        </button>
      </div>
    </div>
  );
}
