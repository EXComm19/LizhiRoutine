import { NextRequest, NextResponse } from "next/server";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";
import { sendPushToUser } from "@/lib/server/web-push";

export const runtime = "nodejs";

/**
 * Send a test push to all of the current user's devices. Powers the
 * "Send test push" button in Settings → Notifications, used to verify
 * the whole chain (browser → SW → push gateway → APNs → device).
 */
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
  const result = await sendPushToUser({
    userId: user.userId,
    payload: {
      title: "Lizhi",
      body: "Test push received. Tap to open the planner.",
      url: "/",
      tag: "lizhi-test",
    },
  });
  return NextResponse.json(result);
}
