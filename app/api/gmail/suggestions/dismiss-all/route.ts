import { NextRequest, NextResponse } from "next/server";
import {
  dismissAllPendingSuggestionsForUser,
} from "@/lib/server/gmail-store";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

/**
 * Bulk-dismiss every pending suggestion belonging to the current user.
 * Powers the agent's "Mark all read" button (#52). Same-origin only so it
 * can't be triggered by a malicious cross-site form post.
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

  const dismissed = await dismissAllPendingSuggestionsForUser(user.userId);
  return NextResponse.json({ dismissed });
}
