import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server/http";
import { checkOffRecurringReminder } from "@/lib/recurring-reminder-streak";
import type { RecurringReminder } from "@/lib/schema";
import { getServerUser } from "@/lib/server/supabase-user";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

/**
 * Check off ("tick") a recurring reminder. Called from the app when
 * the user taps a reminder push notification — the SW navigates to
 * `/?check_reminder=<id>`, the planner picks it up on mount, and
 * POSTs here so the streak gets updated server-side.
 *
 * Idempotent: if today is already the last_completed_date, this is a
 * no-op and we return success without changing anything.
 */

type Body = { id?: string };

type UserStateRow = {
  recurring_reminders: RecurringReminder[] | null;
};

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const id = typeof body.id === "string" ? body.id : "";
  if (!id) {
    return NextResponse.json({ error: "id is required." }, { status: 400 });
  }

  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Server misconfiguration." },
      { status: 503 },
    );
  }
  const { data: row, error: loadError } = await sb
    .from("user_state")
    .select("recurring_reminders")
    .eq("user_id", user.userId)
    .maybeSingle<UserStateRow>();
  if (loadError) {
    return NextResponse.json({ error: loadError.message }, { status: 500 });
  }
  const list = row?.recurring_reminders ?? [];
  const target = list.find((r) => r.id === id);
  if (!target) {
    return NextResponse.json(
      { error: "Reminder not found." },
      { status: 404 },
    );
  }

  const patched = checkOffRecurringReminder(target);
  // If checkOff is a no-op (already checked today), short-circuit but
  // still return the current streak so the client can show feedback.
  if (patched === target) {
    return NextResponse.json({
      already: true,
      current_streak: target.current_streak,
      longest_streak: target.longest_streak,
    });
  }

  const nextList = list.map((r) => (r.id === id ? patched : r));
  const { error: writeError } = await sb
    .from("user_state")
    .update({
      recurring_reminders: nextList,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", user.userId);
  if (writeError) {
    return NextResponse.json(
      { error: writeError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    already: false,
    current_streak: patched.current_streak,
    longest_streak: patched.longest_streak,
  });
}
