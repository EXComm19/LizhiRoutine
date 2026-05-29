import { NextRequest, NextResponse } from "next/server";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import { parseTodosWithKimi } from "@/lib/server/todo-parse-engine";
import { applyParsedItemsToUser } from "@/lib/server/apply-parsed-items";

export const runtime = "nodejs";

/**
 * Bearer-authenticated "capture text → parse → add" endpoint.
 *
 * Designed for iOS Shortcuts, share sheets, and any other one-shot
 * external input. Body: { text: string }. Auth: Authorization: Bearer
 * <api_token> from Settings → Extension access.
 *
 * Synchronous: runs Kimi parse inline so the Shortcut can show a
 * meaningful summary in its success notification. If you want
 * fire-and-forget instead, hit /api/wechat/webhook style — but for
 * Shortcuts the user is staring at the screen waiting, so the small
 * extra latency is fine.
 */

type Body = { text?: unknown };

const MAX_INPUT_CHARS = 4000;

export async function POST(request: NextRequest) {
  const user = await getUserFromExtensionRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const text =
    typeof body.text === "string" ? body.text.trim().slice(0, MAX_INPUT_CHARS) : "";
  if (!text) {
    return NextResponse.json({ error: "text is required." }, { status: 400 });
  }

  try {
    const parsed = await parseTodosWithKimi({
      text,
      selectedDate: new Date().toISOString().slice(0, 10),
      existingLists: [],
    });
    const summary = await applyParsedItemsToUser({
      userId: user.userId,
      candidates: parsed.todos,
    });
    return NextResponse.json({
      todosAdded: summary.todosAdded,
      eventsAdded: summary.eventsAdded,
      lists: summary.lists,
      warnings: parsed.warnings,
      errors: summary.errors,
      /** Compact human-readable summary for the Shortcut's notification. */
      summary:
        summary.errors.length > 0
          ? `Failed: ${summary.errors[0]}`
          : summary.todosAdded + summary.eventsAdded === 0
          ? "No items found in the text."
          : `Added ${summary.todosAdded} todo${summary.todosAdded === 1 ? "" : "s"}` +
            (summary.eventsAdded > 0
              ? `, ${summary.eventsAdded} event${summary.eventsAdded === 1 ? "" : "s"}`
              : ""),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
