import type { RecurringReminder } from "@/lib/schema";

/**
 * Pure streak math for recurring reminders. Lives outside the React tree
 * so the cron worker (server) and the notification-click handler
 * (client) can both compute it the same way.
 *
 * The "yesterday" definition here is calendar-local. If the reminder
 * fires daily, missing one day breaks the streak. If the reminder fires
 * on Mon/Wed/Fri, missing a Wed still breaks the streak — we don't
 * try to be clever about scheduled-vs-actual gaps.
 */

const ONE_DAY_MS = 24 * 60 * 60_000;

/**
 * "YYYY-MM-DD" of the given Date in the SERVER's local TZ.
 * Matches lib/time.ts → formatDateKey for the live planner.
 */
function localDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function previousDateKey(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, (m ?? 1) - 1, d ?? 1);
  date.setTime(date.getTime() - ONE_DAY_MS);
  return localDateKey(date);
}

/**
 * Mark a reminder complete "now". Returns the patched reminder.
 *
 * Rules:
 * - If already completed today → no-op (returns input unchanged).
 * - If last_completed_date was yesterday → streak += 1.
 * - Otherwise → streak resets to 1.
 * - longest_streak is bumped if current_streak ever exceeds it.
 */
export function checkOffRecurringReminder(
  reminder: RecurringReminder,
  now: Date = new Date(),
): RecurringReminder {
  const today = localDateKey(now);
  if (reminder.last_completed_date === today) return reminder;

  const yesterday = previousDateKey(today);
  const continuingStreak = reminder.last_completed_date === yesterday;
  const nextStreak = continuingStreak ? reminder.current_streak + 1 : 1;
  const nextLongest = Math.max(reminder.longest_streak, nextStreak);

  // Append to history, dedup + cap at last 365 entries. The viz only
  // shows ~26 weeks so older entries are dead weight in cloud JSONB.
  const history = Array.from(
    new Set([...(reminder.completion_dates ?? []), today]),
  )
    .sort()
    .slice(-365);

  return {
    ...reminder,
    last_completed_date: today,
    current_streak: nextStreak,
    longest_streak: nextLongest,
    completion_dates: history,
    updated_at: now.toISOString(),
  };
}

/**
 * Detect when a reminder's streak should be reset because the user
 * missed multiple scheduled days. The cron worker calls this once per
 * tick — strictly cheaper than re-deriving it from history.
 *
 * Rules:
 * - Streak is alive if last_completed_date >= yesterday OR null.
 * - Otherwise reset to 0 (longest_streak untouched).
 */
export function decayStreakIfMissed(
  reminder: RecurringReminder,
  now: Date = new Date(),
): RecurringReminder {
  if (reminder.current_streak === 0) return reminder;
  if (!reminder.last_completed_date) return reminder;
  const today = localDateKey(now);
  const yesterday = previousDateKey(today);
  if (reminder.last_completed_date >= yesterday) return reminder;
  return {
    ...reminder,
    current_streak: 0,
    updated_at: now.toISOString(),
  };
}
