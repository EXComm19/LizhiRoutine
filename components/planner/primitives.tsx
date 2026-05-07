"use client";

import { CirclePlus } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 px-4 py-6 text-center text-xs text-zinc-400 dark:text-zinc-500">
      {text}
    </div>
  );
}

export function SectionHeader({
  title,
  onAdd,
}: {
  title: string;
  onAdd?: () => void;
}) {
  return (
    <div className="mt-6 flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        {title}
      </span>
      {onAdd && (
        <button
          type="button"
          className="rounded-md p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
          onClick={onAdd}
          title="Add"
          aria-label="Add"
        >
          <CirclePlus className="h-4 w-4" />
        </button>
      )}
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
        "mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500",
        className,
      )}
    >
      {children}
    </div>
  );
}
