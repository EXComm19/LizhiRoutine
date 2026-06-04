import type {
  EventItem,
  Preferences,
  RecurringReminder,
  TodoItem,
} from "@/lib/schema";
import { createServiceClient } from "@/utils/supabase/service";
import { sendPushToUser } from "@/lib/server/web-push";

/**
 * One-minute "tick" of the scheduling worker. Walks every user that has
 * at least one push subscription, decides what (if anything) to push to
 * them in the current minute, and fires the pushes.
 *
 * Concerns covered:
 *   1. Daily-agenda push at the user's configured time
 *   2. Event lead-in push (event starts in exactly `lead_minutes`)
 *   3. Recurring reminders that fire this exact minute on this weekday
 *
 * Dedup is built in: each push includes a `tag` keyed on the
 * minute-bucket and the trigger, so even if the worker fires twice at
 * 22:00:30 and 22:00:55 the same iPhone only buzzes once.
 *
 * Idempotence: pushing the same agenda twice with the same tag won't
 * spam the user; pushing the same reminder twice in two consecutive
 * ticks is suppressed in advance because we round the current time to
 * the minute before comparing.
 */

const ONE_MINUTE = 60_000;

type UserStateRow = {
  user_id: string;
  todos: TodoItem[];
  events: EventItem[] | null;
  recurring_reminders: RecurringReminder[] | null;
  preferences: Preferences;
};

/** "HH:MM" of `date` in server-local time. */
function hhmm(date: Date): string {
  return (
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

function dateKeyFor(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Build the morning-agenda body for the user — quick "you have N tasks
 * and M events today" sentence. Keeps the push body short for the
 * lockscreen.
 */
function summariseAgenda(params: {
  events: EventItem[];
  todos: TodoItem[];
  today: string;
}): string {
  const eventsToday = params.events.filter((e) => {
    const d = new Date(e.starts_at);
    return dateKeyFor(d) === params.today && e.status !== "cancelled";
  });
  const dueTodos = params.todos.filter(
    (t) =>
      t.status !== "completed" &&
      (t.due_date === params.today || (t.due_date && t.due_date < params.today)),
  );
  const bits: string[] = [];
  if (dueTodos.length) {
    const overdue = dueTodos.filter(
      (t) => t.due_date && t.due_date < params.today,
    ).length;
    bits.push(
      `${dueTodos.length} todo${dueTodos.length === 1 ? "" : "s"}` +
        (overdue ? ` (${overdue} overdue)` : ""),
    );
  }
  if (eventsToday.length) {
    const first = [...eventsToday].sort((a, b) =>
      a.starts_at.localeCompare(b.starts_at),
    )[0];
    const firstTime = new Date(first.starts_at).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    bits.push(
      `${eventsToday.length} event${eventsToday.length === 1 ? "" : "s"}` +
        ` (first ${firstTime} ${first.title})`,
    );
  }
  return bits.length ? `Today: ${bits.join(", ")}.` : "Nothing scheduled — a clear day.";
}

/**
 * Run one tick. Returns a summary of what was pushed for logging.
 * Suitable to be called from /api/cron/tick (HTTP) and from the in-
 * process ticker in instrumentation.ts.
 */
export async function runCronTick(now: Date = new Date()): Promise<{
  scanned: number;
  pushes: number;
  errors: string[];
}> {
  const sb = createServiceClient();
  if (!sb) {
    return { scanned: 0, pushes: 0, errors: ["service role not configured"] };
  }

  // Only users with at least one push subscription — anyone else can't
  // receive anything anyway.
  const { data: subs, error: subsError } = await sb
    .from("push_subscriptions")
    .select("user_id");
  if (subsError) {
    return { scanned: 0, pushes: 0, errors: [subsError.message] };
  }
  const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
  if (!userIds.length) return { scanned: 0, pushes: 0, errors: [] };

  const { data: rows, error: stateError } = await sb
    .from("user_state")
    .select("user_id, todos, events, recurring_reminders, preferences")
    .in("user_id", userIds);
  if (stateError) {
    return {
      scanned: userIds.length,
      pushes: 0,
      errors: [stateError.message],
    };
  }

  const errors: string[] = [];
  let pushes = 0;
  const minuteHhmm = hhmm(now);
  const today = dateKeyFor(now);
  const dayOfWeek = now.getDay();

  for (const row of (rows ?? []) as UserStateRow[]) {
    const prefs = row.preferences ?? {
      schema_version: 1,
      sleep_target_minutes: 8 * 60,
      auto_hide_completed_days: null,
      daily_agenda_time: null,
      event_reminder_lead_minutes: null,
      updated_at: "",
    };

    // ── 1. Daily agenda ─────────────────────────────────────────────
    if (prefs.daily_agenda_time === minuteHhmm) {
      try {
        const result = await sendPushToUser({
          userId: row.user_id,
          payload: {
            title: "Today's agenda",
            body: summariseAgenda({
              events: row.events ?? [],
              todos: row.todos ?? [],
              today,
            }),
            url: "/",
            tag: `agenda:${today}`,
          },
        });
        pushes += result.sent;
        errors.push(...result.errors);
      } catch (error) {
        errors.push(
          `agenda push ${row.user_id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    // ── 2. Event lead-in ────────────────────────────────────────────
    const leadMin = prefs.event_reminder_lead_minutes;
    if (typeof leadMin === "number" && leadMin > 0 && row.events) {
      const target = new Date(now.getTime() + leadMin * ONE_MINUTE);
      const targetMinute = hhmm(target);
      const targetDate = dateKeyFor(target);
      for (const event of row.events) {
        if (event.status === "cancelled") continue;
        const start = new Date(event.starts_at);
        if (dateKeyFor(start) !== targetDate) continue;
        if (hhmm(start) !== targetMinute) continue;
        try {
          const result = await sendPushToUser({
            userId: row.user_id,
            payload: {
              title: event.title,
              body: `Starts in ${leadMin} minutes`,
              url: "/",
              tag: `event:${event.id}:${dateKeyFor(start)}`,
            },
          });
          pushes += result.sent;
          errors.push(...result.errors);
        } catch (error) {
          errors.push(
            `event push ${event.id}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }

    // ── 3. Recurring reminders ──────────────────────────────────────
    const reminders = row.recurring_reminders ?? [];
    for (const reminder of reminders) {
      if (!reminder.enabled) continue;
      if (reminder.time !== minuteHhmm) continue;
      const days = reminder.days_of_week?.length
        ? reminder.days_of_week
        : [0, 1, 2, 3, 4, 5, 6];
      if (!days.includes(dayOfWeek)) continue;

      try {
        const result = await sendPushToUser({
          userId: row.user_id,
          payload: {
            title: reminder.title,
            body: reminder.notes
              ? reminder.notes
              : reminder.current_streak > 0
              ? `Tap to log day ${reminder.current_streak + 1}`
              : "Tap to start a streak",
            // URL params trigger the streak check-off on app open.
            url: `/?check_reminder=${encodeURIComponent(reminder.id)}`,
            tag: `reminder:${reminder.id}:${today}`,
          },
        });
        pushes += result.sent;
        errors.push(...result.errors);
      } catch (error) {
        errors.push(
          `reminder push ${reminder.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  return { scanned: userIds.length, pushes, errors };
}
