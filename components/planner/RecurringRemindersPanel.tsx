"use client";

import { useEffect, useState } from "react";
import { Pencil, Plus, RepeatIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  createRecurringReminder,
  patchRecurringReminder,
} from "@/lib/factories";
import type { RecurringReminder } from "@/lib/schema";
import {
  loadRecurringReminders,
  saveRecurringReminders,
} from "@/lib/storage";
import { cn } from "@/lib/utils";

/**
 * Settings → Recurring reminders. Manage push reminders that fire on
 * a weekday-pattern schedule. Doesn't touch the timeline — pure push
 * config + streak display.
 */

const DAY_LABELS: ReadonlyArray<{ value: number; short: string }> = [
  { value: 1, short: "Mon" },
  { value: 2, short: "Tue" },
  { value: 3, short: "Wed" },
  { value: 4, short: "Thu" },
  { value: 5, short: "Fri" },
  { value: 6, short: "Sat" },
  { value: 0, short: "Sun" },
];

type DraftState = {
  id?: string;
  title: string;
  notes: string;
  time: string;
  days_of_week: number[];
  enabled: boolean;
};

const EMPTY_DRAFT: DraftState = {
  title: "",
  notes: "",
  time: "22:00",
  days_of_week: [0, 1, 2, 3, 4, 5, 6],
  enabled: true,
};

function describeDays(days: number[]): string {
  if (!days.length || days.length === 7) return "Every day";
  const setAll = new Set(days);
  const weekdays = setAll.size === 5 && [1, 2, 3, 4, 5].every((d) => setAll.has(d));
  if (weekdays) return "Weekdays";
  const weekends = setAll.size === 2 && [0, 6].every((d) => setAll.has(d));
  if (weekends) return "Weekends";
  return DAY_LABELS.filter((d) => setAll.has(d.value))
    .map((d) => d.short)
    .join(" · ");
}

export function RecurringRemindersPanel() {
  // Empty initial state on both server + client to avoid SSR/CSR
  // hydration mismatch (server has no localStorage); hydrate from
  // storage on mount.
  const [reminders, setReminders] = useState<RecurringReminder[]>([]);
  const [draft, setDraft] = useState<DraftState | null>(null);

  useEffect(() => {
    // localStorage isn't available during SSR; hydrate after mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setReminders(loadRecurringReminders());
  }, []);

  const persist = (next: RecurringReminder[]) => {
    setReminders(next);
    saveRecurringReminders(next);
  };

  const startNew = () => setDraft({ ...EMPTY_DRAFT });

  const startEdit = (reminder: RecurringReminder) => {
    setDraft({
      id: reminder.id,
      title: reminder.title,
      notes: reminder.notes ?? "",
      time: reminder.time,
      days_of_week:
        reminder.days_of_week?.length
          ? [...reminder.days_of_week]
          : [0, 1, 2, 3, 4, 5, 6],
      enabled: reminder.enabled,
    });
  };

  const cancel = () => setDraft(null);

  const submit = () => {
    if (!draft) return;
    const title = draft.title.trim();
    if (!title) return;
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(draft.time)) return;

    if (draft.id) {
      const existing = reminders.find((r) => r.id === draft.id);
      if (!existing) return;
      const patched = patchRecurringReminder(existing, {
        title,
        notes: draft.notes.trim() || null,
        time: draft.time,
        days_of_week: draft.days_of_week,
        enabled: draft.enabled,
      });
      persist(reminders.map((r) => (r.id === draft.id ? patched : r)));
    } else {
      const created = createRecurringReminder({
        title,
        notes: draft.notes.trim() || null,
        time: draft.time,
        days_of_week: draft.days_of_week,
        enabled: draft.enabled,
      });
      persist([created, ...reminders]);
    }
    setDraft(null);
  };

  const toggleEnabled = (reminder: RecurringReminder) => {
    persist(
      reminders.map((r) =>
        r.id === reminder.id
          ? patchRecurringReminder(r, { enabled: !r.enabled })
          : r,
      ),
    );
  };

  const remove = (reminder: RecurringReminder) => {
    if (!window.confirm(`Delete "${reminder.title}"?`)) return;
    persist(reminders.filter((r) => r.id !== reminder.id));
  };

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <RepeatIcon className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
          <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Recurring reminders
          </h2>
        </div>
        {!draft && (
          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={startNew}
          >
            <Plus className="mr-1 h-3 w-3" /> New
          </Button>
        )}
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Fire push notifications at a fixed time on selected weekdays
        (e.g. 22:00 every night → &ldquo;Take medicine&rdquo;). Tap the
        notification to log a streak.
      </p>

      {draft && (
        <div className="mt-4 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)]/50 p-3">
          <div className="grid gap-2">
            <input
              type="text"
              autoFocus
              placeholder="What to remind you of"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              className="rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[13px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
            />
            <input
              type="text"
              placeholder="Optional notes (location, dose, etc.)"
              value={draft.notes}
              onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
              className="rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[12.5px] text-[color:var(--ink-2)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
            />
            <div className="flex items-center gap-2">
              <label className="text-[12px] font-medium text-[color:var(--ink-2)]">
                Time
              </label>
              <input
                type="time"
                value={draft.time}
                onChange={(e) => setDraft({ ...draft, time: e.target.value })}
                className="rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 font-[family-name:var(--font-mono)] text-[12.5px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
              />
            </div>
            <div>
              <div className="mb-1 text-[11.5px] text-[color:var(--ink-3)]">
                Days
              </div>
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((d) => {
                  const active = draft.days_of_week.includes(d.value);
                  return (
                    <button
                      key={d.value}
                      type="button"
                      onClick={() => {
                        const set = new Set(draft.days_of_week);
                        if (active) set.delete(d.value);
                        else set.add(d.value);
                        setDraft({
                          ...draft,
                          days_of_week: Array.from(set).sort((a, b) => a - b),
                        });
                      }}
                      className={cn(
                        // !text- to win over the parent's inherited text
                        // color — matches the pattern in RailTab et al.
                        "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium transition-colors",
                        active
                          ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
                          : "border-[color:var(--line)] bg-[color:var(--card)] !text-[color:var(--ink-2)] hover:border-[color:var(--line-strong)]",
                      )}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="flex items-center gap-2 text-[12px] text-[color:var(--ink-2)]">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked })
                }
                className="h-4 w-4 accent-[color:var(--ink)]"
              />
              Enabled
            </label>
            <div className="mt-1 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={cancel}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={submit}
                disabled={!draft.title.trim()}
              >
                {draft.id ? "Save" : "Add"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {reminders.length === 0 && !draft && (
        <div className="mt-4 rounded-[var(--r)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/30 px-3 py-4 text-center text-[12px] text-[color:var(--ink-3)]">
          No reminders yet. Click &ldquo;New&rdquo; to add one.
        </div>
      )}

      {reminders.length > 0 && (
        <ul className="mt-4 space-y-2">
          {reminders.map((r) => (
            <li
              key={r.id}
              className="flex items-center gap-3 rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--sunken)]/30 px-3 py-2"
            >
              <button
                type="button"
                onClick={() => toggleEnabled(r)}
                aria-label={r.enabled ? "Disable" : "Enable"}
                className={cn(
                  "relative h-5 w-9 shrink-0 rounded-full transition-colors",
                  r.enabled
                    ? "bg-emerald-500/85"
                    : "bg-[color:var(--line)]",
                )}
              >
                <span
                  className={cn(
                    "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all",
                    r.enabled ? "left-[18px]" : "left-0.5",
                  )}
                />
              </button>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13.5px] font-medium text-[color:var(--ink)]">
                  {r.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-[color:var(--ink-3)]">
                  <span className="font-[family-name:var(--font-mono)] tabular-nums">
                    {r.time}
                  </span>
                  <span>·</span>
                  <span>{describeDays(r.days_of_week)}</span>
                  {r.current_streak > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-700 dark:text-emerald-400">
                        🔥 {r.current_streak} day streak
                      </span>
                    </>
                  )}
                  {r.longest_streak > r.current_streak &&
                    r.longest_streak > 0 && (
                      <>
                        <span>·</span>
                        <span>best {r.longest_streak}</span>
                      </>
                    )}
                </div>
                {r.notes && (
                  <div className="mt-0.5 truncate text-[11.5px] text-[color:var(--ink-3)]">
                    {r.notes}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => startEdit(r)}
                aria-label="Edit"
                className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--card)] hover:text-[color:var(--ink)]"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => remove(r)}
                aria-label="Delete"
                className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-3)] transition-colors hover:bg-rose-100 hover:text-rose-700 dark:hover:bg-rose-500/20 dark:hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
