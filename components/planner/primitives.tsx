"use client";

import { Plus } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--r)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/40 px-4 py-6 text-center text-[12px] text-[color:var(--ink-3)]">
      {text}
    </div>
  );
}

export function SectionHeader({
  title,
  onAdd,
  trailing,
}: {
  title: string;
  onAdd?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-[18px] pt-[14px] pb-2">
      <span className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
        {title}
      </span>
      {trailing ??
        (onAdd ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)]"
            onClick={onAdd}
            title="Add"
            aria-label="Add"
          >
            <Plus className="h-3 w-3" />
            New
          </button>
        ) : null)}
    </div>
  );
}

export function Label({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
