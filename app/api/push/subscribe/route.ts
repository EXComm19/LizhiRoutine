import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

/**
 * Session-auth'd subscription registry.
 *
 * POST    — Register a new subscription. Body is the raw browser-side
 *           PushSubscription shape (endpoint + keys.p256dh + keys.auth).
 *           Upsert by endpoint so re-running enable doesn't dupe.
 *
 * DELETE  — Remove ONE subscription by endpoint (the device the user
 *           is disabling on). Pass `endpoint` in the body. To wipe
 *           every device for the user, pass `{ all: true }`.
 *
 * GET     — List the user's current subscriptions for the Settings
 *           panel to show "X devices currently enabled."
 */

type Body =
  | {
      endpoint?: string;
      keys?: { p256dh?: string; auth?: string };
      userAgent?: string;
    }
  | { endpoint?: string; all?: boolean };

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json({ subscriptions: [] });
  }
  const { data, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, user_agent, created_at, last_used_at")
    .eq("user_id", user.userId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ subscriptions: data ?? [] });
}

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
  const endpoint = typeof body?.endpoint === "string" ? body.endpoint : "";
  const keys = "keys" in body && body.keys ? body.keys : null;
  const p256dh = typeof keys?.p256dh === "string" ? keys.p256dh : "";
  const auth = typeof keys?.auth === "string" ? keys.auth : "";
  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json(
      { error: "endpoint + keys.p256dh + keys.auth are required." },
      { status: 400 },
    );
  }
  const userAgent =
    "userAgent" in body && typeof body.userAgent === "string"
      ? body.userAgent.slice(0, 200)
      : request.headers.get("user-agent")?.slice(0, 200) ?? null;

  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase service role not configured." },
      { status: 503 },
    );
  }
  const { error } = await sb.from("push_subscriptions").upsert(
    {
      endpoint,
      user_id: user.userId,
      keys_p256dh: p256dh,
      keys_auth: auth,
      user_agent: userAgent,
      created_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
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
  const sb = createServiceClient();
  if (!sb) {
    return NextResponse.json(
      { error: "Supabase service role not configured." },
      { status: 503 },
    );
  }
  let removed = 0;
  if ("all" in body && body.all) {
    const { data, error } = await sb
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.userId)
      .select("endpoint");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    removed = data?.length ?? 0;
  } else if (typeof body?.endpoint === "string") {
    const { data, error } = await sb
      .from("push_subscriptions")
      .delete()
      .eq("user_id", user.userId)
      .eq("endpoint", body.endpoint)
      .select("endpoint");
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    removed = data?.length ?? 0;
  } else {
    return NextResponse.json(
      { error: "Pass either { endpoint } or { all: true }." },
      { status: 400 },
    );
  }
  return NextResponse.json({ removed });
}
