"use client";

import { useMemo } from "react";
import type { RecurringReminder } from "@/lib/schema";
import { cn } from "@/lib/utils";

/**
 * Per-reminder lit-calendar visualisation. GitHub-contribution-style:
 * columns are weeks, rows are weekdays (Mon→Sun). Each cell represents
 * one calendar day, coloured by completion state.
 *
 * Cell state:
 *  - lit       — user checked off that day
 *  - missed    — that day was a scheduled day for the reminder, no check-off
 *  - skip      — that day was NOT a scheduled day (e.g. Sat on a M-F reminder)
 *  - pre       — that day pre-dates the reminder's creation
 */

const WEEKS = 12; // 12 columns × 7 rows = 84 days ≈ 3 months
const ONE_DAY_MS = 24 * 60 * 60_000;

type CellState = "lit" | "missed" | "skip" | "pre";

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(reminder: RecurringReminder, today: Date): {
  cells: CellState[];
  weekLabels: Array<{ index: number; label: string }>;
} {
  // Anchor: today is the most recent cell. Walk back WEEKS*7 - 1 days
  // and snap to the START of that ISO week (Monday). This puts the
  // calendar in a clean week-aligned grid.
  const totalDays = WEEKS * 7;
  const todayKey = dateKey(today);
  const completionSet = new Set(reminder.completion_dates ?? []);
  const scheduledDays = new Set(
    reminder.days_of_week?.length
      ? reminder.days_of_week
      : [0, 1, 2, 3, 4, 5, 6],
  );
  const createdAtDate = new Date(reminder.created_at);

  // Start from `totalDays - 1` days before today. Then back up to Monday.
  const cursor = new Date(today);
  cursor.setTime(cursor.getTime() - (totalDays - 1) * ONE_DAY_MS);
  const dayOfWeek = cursor.getDay(); // 0=Sun
  const daysSinceMonday = (dayOfWeek + 6) % 7; // Mon=0, Sun=6
  cursor.setTime(cursor.getTime() - daysSinceMonday * ONE_DAY_MS);

  const cells: CellState[] = [];
  const weekLabels: Array<{ index: number; label: string }> = [];
  let lastMonthLabelled = -1;

  // Iterate column-by-column (week) then row (Mon-Sun within week). The
  // grid will be rendered using CSS grid with 7 rows and N cols.
  let weekCol = 0;
  let it = new Date(cursor);
  while (it.getTime() <= today.getTime() || cells.length % 7 !== 0) {
    const k = dateKey(it);
    const jsDay = it.getDay(); // 0=Sun..6=Sat
    let state: CellState;
    if (it < createdAtDate) {
      state = "pre";
    } else if (!scheduledDays.has(jsDay)) {
      state = "skip";
    } else if (completionSet.has(k)) {
      state = "lit";
    } else if (k > todayKey) {
      state = "pre"; // future day — treat as inactive
    } else {
      state = "missed";
    }
    cells.push(state);

    // Week labels: when we move into a new month, label that column.
    if (jsDay === 1) {
      // Monday — start of a new week column visually
      const monthIdx = it.getMonth();
      if (monthIdx !== lastMonthLabelled) {
        weekLabels.push({
          index: weekCol,
          label: it.toLocaleString(undefined, { month: "short" }),
        });
        lastMonthLabelled = monthIdx;
      }
      weekCol += 1;
    }
    it = new Date(it.getTime() + ONE_DAY_MS);
    if (cells.length >= WEEKS * 7) break;
  }
  return { cells, weekLabels };
}

function cellClass(state: CellState): string {
  switch (state) {
    case "lit":
      return "bg-emerald-500/85 dark:bg-emerald-500/80";
    case "missed":
      return "bg-rose-400/55 dark:bg-rose-500/40";
    case "skip":
      return "bg-[color:var(--line-soft)] dark:bg-white/[0.04]";
    case "pre":
      return "bg-transparent";
  }
}

function CalendarGrid({ reminder }: { reminder: RecurringReminder }) {
  const { cells, weekLabels } = useMemo(
    () => buildGrid(reminder, new Date()),
    [reminder],
  );
  return (
    <div className="overflow-x-auto">
      <div className="inline-flex flex-col gap-1">
        {/* Month labels row */}
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `28px repeat(${WEEKS}, 14px)` }}
        >
          <div />
          {Array.from({ length: WEEKS }).map((_, i) => {
            const label = weekLabels.find((w) => w.index === i)?.label ?? "";
            return (
              <div
                key={i}
                className="text-[9px] font-medium text-[color:var(--ink-3)]"
                style={{ gridColumn: i + 2 }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* 7 rows × WEEKS cols. We render row labels (Mon, Wed, Fri) + cells. */}
        <div
          className="grid gap-0.5"
          style={{
            gridTemplateColumns: `28px repeat(${WEEKS}, 14px)`,
            gridTemplateRows: `repeat(7, 14px)`,
          }}
        >
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <div
              key={i}
              className="self-center text-[9px] font-medium text-[color:var(--ink-3)]"
              style={{ gridRow: i + 1 }}
            >
              {i % 2 === 0 ? d : ""}
            </div>
          ))}
          {cells.map((state, idx) => {
            // idx 0..6 = first column rows 1..7 (Mon..Sun)
            const col = Math.floor(idx / 7);
            const row = idx % 7;
            return (
              <div
                key={idx}
                className={cn(
                  "h-3.5 w-3.5 rounded-[3px] border border-[color:var(--line-soft)]/40",
                  cellClass(state),
                )}
                style={{ gridColumn: col + 2, gridRow: row + 1 }}
              />
            );
          })}
        </div>

        {/* Legend */}
        <div className="mt-1 flex items-center gap-3 text-[10px] text-[color:var(--ink-3)]">
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-emerald-500/85" />
            Done
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-rose-400/55" />
            Missed
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-[color:var(--line-soft)]" />
            Not scheduled
          </span>
        </div>
      </div>
    </div>
  );
}

export function RecurringRemindersStatsSection({
  reminders,
}: {
  reminders: RecurringReminder[];
}) {
  if (!reminders.length) return null;
  const ordered = [...reminders].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return b.current_streak - a.current_streak;
  });

  return (
    // Each calendar is only ~12 columns wide, so pack 2-3 per row on
    // wider screens instead of one full-width row each. Cards keep a
    // sensible min so the grid + month labels don't get cramped.
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {ordered.map((reminder) => (
        <div
          key={reminder.id}
          className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-4"
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-medium text-[color:var(--ink)]">
                {reminder.title}
                {!reminder.enabled && (
                  <span className="ml-2 rounded-full bg-[color:var(--sunken)] px-1.5 py-0.5 text-[10px] font-normal text-[color:var(--ink-3)]">
                    paused
                  </span>
                )}
              </div>
              <div className="mt-0.5 text-[11.5px] text-[color:var(--ink-3)]">
                {reminder.time} · {reminder.days_of_week.length === 7
                  ? "Every day"
                  : reminder.days_of_week
                      .map(
                        (d) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
                      )
                      .join(" · ")}
              </div>
            </div>
            <div className="shrink-0 text-right text-[11.5px]">
              {reminder.current_streak > 0 && (
                <div className="font-medium text-emerald-700 dark:text-emerald-400">
                  🔥 {reminder.current_streak} day streak
                </div>
              )}
              {reminder.longest_streak > 0 && (
                <div className="text-[color:var(--ink-3)]">
                  best {reminder.longest_streak}
                </div>
              )}
            </div>
          </div>
          <CalendarGrid reminder={reminder} />
        </div>
      ))}
    </div>
  );
}
