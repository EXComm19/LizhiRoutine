"use client";

import { useMemo } from "react";
import { Check } from "lucide-react";
import type { RecurringReminder } from "@/lib/schema";
import { cn } from "@/lib/utils";

/**
 * Per-reminder lit-calendar visualisation. GitHub-contribution-style:
 * columns are weeks, rows are weekdays (Mon→Sun). Each cell represents
 * one calendar day, coloured by completion state.
 *
 * Cells for real past-or-today days are CLICKABLE: tapping toggles that
 * day's completion (manual check-off / backfill). The parent recomputes
 * the streak from the full history, so a missed/undelivered push
 * notification never permanently kills a streak — you just tap the day.
 *
 * Cell state:
 *  - lit       — user checked off that day
 *  - missed    — that day was a scheduled day for the reminder, no check-off
 *  - skip      — that day was NOT a scheduled day (e.g. Sat on a M-F reminder)
 *  - pre       — that day pre-dates the reminder's creation, or is in the future
 */

const WEEKS = 12; // 12 columns × 7 rows = 84 days ≈ 3 months

type CellState = "lit" | "missed" | "skip" | "pre";
type Cell = { state: CellState; key: string; clickable: boolean };

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function buildGrid(reminder: RecurringReminder, today: Date): {
  cells: Cell[];
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
  const createdKey = dateKey(createdAtDate);

  // Anchor the LAST column to the ISO week (Mon–Sun) that contains today,
  // so today is always in the rightmost column. Start = the Monday of
  // (WEEKS - 1) weeks before this week. (The previous approach snapped the
  // START back to Monday but kept a fixed 84-cell cap, which truncated the
  // final partial week — hiding "today" and the current month entirely.)
  // Use noon + setDate stepping so DST transitions can't shift a date key.
  const todaySinceMonday = (today.getDay() + 6) % 7; // Mon=0 … Sun=6
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  cursor.setDate(cursor.getDate() - todaySinceMonday - (WEEKS - 1) * 7);

  const cells: Cell[] = [];
  const weekLabels: Array<{ index: number; label: string }> = [];
  let lastMonthLabelled = -1;

  // Iterate column-by-column (week) then row (Mon-Sun within week), exactly
  // WEEKS*7 cells. Days after today land as "pre" (transparent).
  let weekCol = 0;
  const it = new Date(cursor);
  for (let i = 0; i < totalDays; i += 1) {
    const k = dateKey(it);
    const jsDay = it.getDay(); // 0=Sun..6=Sat
    const isFuture = k > todayKey;
    const isBeforeCreated = k < createdKey;
    let state: CellState;
    if (isBeforeCreated || isFuture) {
      state = "pre";
    } else if (!scheduledDays.has(jsDay)) {
      state = "skip";
    } else if (completionSet.has(k)) {
      state = "lit";
    } else {
      state = "missed";
    }
    // A real, on-or-after-creation, not-future day can be toggled — even
    // a "skip" day (you might take it off-schedule and want to log it).
    cells.push({ state, key: k, clickable: !isFuture && !isBeforeCreated });

    // Week labels: when a column's Monday enters a new month, label it.
    if (jsDay === 1) {
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
    it.setDate(it.getDate() + 1);
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

function CalendarGrid({
  reminder,
  onToggleDay,
}: {
  reminder: RecurringReminder;
  onToggleDay?: (reminderId: string, dateKey: string) => void;
}) {
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
          {cells.map((cell, idx) => {
            // idx 0..6 = first column rows 1..7 (Mon..Sun)
            const col = Math.floor(idx / 7);
            const row = idx % 7;
            const base = cn(
              "h-3.5 w-3.5 rounded-[3px] border border-[color:var(--line-soft)]/40",
              cellClass(cell.state),
            );
            const style = { gridColumn: col + 2, gridRow: row + 1 } as const;
            if (cell.clickable && onToggleDay) {
              const done = cell.state === "lit";
              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onToggleDay(reminder.id, cell.key)}
                  title={`${cell.key} — ${done ? "done (tap to undo)" : "tap to mark done"}`}
                  className={cn(
                    base,
                    "cursor-pointer transition-transform hover:scale-125 hover:ring-1 hover:ring-[color:var(--ink-3)]",
                  )}
                  style={style}
                />
              );
            }
            return <div key={idx} className={base} style={style} />;
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
          {onToggleDay && (
            <span className="text-[color:var(--ink-3)]/80">· tap a day to toggle</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecurringRemindersStatsSection({
  reminders,
  onToggleDay,
}: {
  reminders: RecurringReminder[];
  /**
   * Toggle one day's completion for a reminder. When provided, calendar
   * cells (and the "today" button) become interactive. Omit for a
   * read-only viz.
   */
  onToggleDay?: (reminderId: string, dateKey: string) => void;
}) {
  if (!reminders.length) return null;
  const ordered = [...reminders].sort((a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return b.current_streak - a.current_streak;
  });
  const todayKey = dateKey(new Date());

  return (
    // Each calendar is only ~12 columns wide, so pack 2-3 per row on
    // wider screens instead of one full-width row each. Cards keep a
    // sensible min so the grid + month labels don't get cramped.
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
      {ordered.map((reminder) => {
        const doneToday = (reminder.completion_dates ?? []).includes(todayKey);
        return (
          <div
            key={reminder.id}
            className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-4"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
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
                          (d) =>
                            ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d],
                        )
                        .join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1.5">
                <div className="text-right text-[11.5px]">
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
                {onToggleDay && (
                  <button
                    type="button"
                    onClick={() => onToggleDay(reminder.id, todayKey)}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                      doneToday
                        ? "border-emerald-500/60 bg-emerald-500/15 !text-emerald-700 dark:!text-emerald-400"
                        : "border-[color:var(--line)] !text-[color:var(--ink-2)] hover:border-[color:var(--line-strong)] hover:!text-[color:var(--ink)]",
                    )}
                  >
                    <Check className="h-3 w-3" />
                    {doneToday ? "Done today" : "Mark today"}
                  </button>
                )}
              </div>
            </div>
            <CalendarGrid reminder={reminder} onToggleDay={onToggleDay} />
          </div>
        );
      })}
    </div>
  );
}
