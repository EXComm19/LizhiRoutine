"use client";

import { useEffect, useState } from "react";
import { CalendarDays, ChevronDown, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LifeAreaSelect } from "@/components/planner/LifeAreaSelect";
import {
  clearAllImportedCalendarBlocks,
  deleteImportedCalendarBatch,
  deleteImportedCalendarBlock,
  listImportedCalendarBatches,
  setImportedCalendarBatchArea,
  setImportedCalendarBlockArea,
  type ImportedCalendarBatch,
  type ImportedCalendarBlock,
} from "@/lib/calendar-event-storage";
import { guessLifeArea } from "@/lib/life-area";
import type { LifeArea } from "@/lib/schema";
import { cn } from "@/lib/utils";

/**
 * Settings panel to manage ICS-imported calendar blocks, grouped by the
 * import they came from. Each batch is collapsible with a group-level
 * life-area dropdown (applies to all blocks in it) + group delete.
 * Expanding a batch lets you tweak / delete individual blocks.
 */
export function ImportedCalendarPanel({
  reloadKey = 0,
}: {
  /** Bump to force a re-read after an import elsewhere on the page. */
  reloadKey?: number;
}) {
  const [batches, setBatches] = useState<ImportedCalendarBatch[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBatches(listImportedCalendarBatches());
  }, [reloadKey]);

  const refresh = () => setBatches(listImportedCalendarBatches());

  const totalBlocks = batches.reduce((n, b) => n + b.blocks.length, 0);

  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handleBatchArea = (batch: ImportedCalendarBatch, area: LifeArea) => {
    setImportedCalendarBatchArea(batch.id, area);
    refresh();
  };

  const handleBatchDelete = (batch: ImportedCalendarBatch) => {
    if (
      !window.confirm(
        `Delete all ${batch.blocks.length} block(s) from "${batch.label}"? Re-import the .ics to restore.`,
      )
    ) {
      return;
    }
    deleteImportedCalendarBatch(batch.id);
    refresh();
  };

  const handleBlockArea = (block: ImportedCalendarBlock, area: LifeArea) => {
    setImportedCalendarBlockArea(block.dateKey, block.id, area);
    refresh();
  };

  const handleBlockDelete = (block: ImportedCalendarBlock) => {
    deleteImportedCalendarBlock(block.dateKey, block.id);
    refresh();
  };

  const handleClearAll = () => {
    if (
      !window.confirm(
        `Delete all ${totalBlocks} imported calendar block(s)? Re-import the .ics to restore.`,
      )
    ) {
      return;
    }
    clearAllImportedCalendarBlocks();
    refresh();
  };

  const fmtWhen = (block: ImportedCalendarBlock) => {
    if (!block.startTime) return block.dateKey;
    const d = new Date(block.startTime);
    if (Number.isNaN(d.getTime())) return block.dateKey;
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const fmtImportedAt = (iso: string | null) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  // The dominant area in a batch — what the group dropdown should show.
  const batchArea = (batch: ImportedCalendarBatch): LifeArea => {
    const counts = new Map<LifeArea, number>();
    for (const block of batch.blocks) {
      const a = block.lifeArea ?? guessLifeArea(block.title);
      counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    let best: LifeArea = "general";
    let bestN = -1;
    for (const [area, n] of counts) {
      if (n > bestN) {
        best = area;
        bestN = n;
      }
    }
    return best;
  };

  return (
    <section className="overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Imported calendars
        </h3>
        {totalBlocks > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleClearAll}
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Clear all
          </Button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Grouped by import. Set a life area for a whole calendar at once,
        expand to tweak individual events, or remove a batch.
      </p>

      {batches.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-3 py-3 text-[12px] text-[color:var(--ink-3)]">
          <CalendarDays className="h-3.5 w-3.5 shrink-0" />
          <span>No imported calendars. Use “Import calendar” above.</span>
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-2.5">
          {batches.map((batch) => {
            const isOpen = expanded.has(batch.id);
            const when = fmtImportedAt(batch.importedAt);
            return (
              <li
                key={batch.id}
                className="overflow-hidden rounded-[var(--r)] border border-[color:var(--line)]"
              >
                {/* Batch header */}
                <div className="flex items-center gap-2 bg-[color:var(--sunken)]/50 px-2.5 py-2">
                  <button
                    type="button"
                    onClick={() => toggle(batch.id)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <ChevronDown
                      className={cn(
                        "h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)] transition-transform",
                        !isOpen && "-rotate-90",
                      )}
                    />
                    <div className="min-w-0">
                      <div className="truncate text-[12.5px] font-medium text-[color:var(--ink)]">
                        {batch.label}
                      </div>
                      <div className="text-[10.5px] text-[color:var(--ink-3)]">
                        {batch.blocks.length} event
                        {batch.blocks.length === 1 ? "" : "s"}
                        {when ? ` · imported ${when}` : ""}
                      </div>
                    </div>
                  </button>
                  <LifeAreaSelect
                    value={batchArea(batch)}
                    onChange={(next) => handleBatchArea(batch, next)}
                    aria-label={`Life area for ${batch.label}`}
                    className="shrink-0"
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded p-1 text-[color:var(--ink-3)] transition-colors hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/20 dark:hover:text-rose-400"
                    title={`Delete all from ${batch.label}`}
                    aria-label={`Delete batch ${batch.label}`}
                    onClick={() => handleBatchDelete(batch)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Per-block rows when expanded */}
                {isOpen && (
                  <ul className="flex flex-col gap-1 px-2.5 py-2">
                    {batch.blocks.map((block) => (
                      <li
                        key={`${block.dateKey}:${block.id}`}
                        className="flex items-center gap-2 rounded-md bg-[color:var(--card)] px-2 py-1.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] text-[color:var(--ink)]">
                            {block.title}
                          </div>
                          <div className="font-[family-name:var(--font-mono)] text-[10px] text-[color:var(--ink-3)]">
                            {fmtWhen(block)}
                          </div>
                        </div>
                        <LifeAreaSelect
                          value={block.lifeArea ?? guessLifeArea(block.title)}
                          onChange={(next) => handleBlockArea(block, next)}
                          aria-label={`Life area for ${block.title}`}
                          className="shrink-0"
                        />
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-[color:var(--ink-3)] transition-colors hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/20 dark:hover:text-rose-400"
                          title={`Delete ${block.title}`}
                          aria-label={`Delete ${block.title}`}
                          onClick={() => handleBlockDelete(block)}
                        >
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
