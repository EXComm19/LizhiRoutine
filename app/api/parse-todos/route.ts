import { NextRequest, NextResponse } from "next/server";
import type { ParseTodosRequest } from "@/lib/ai-todo-parser";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";
import {
  KimiParseError,
  MAX_PARSE_INPUT_CHARS,
  listContextFromRaw,
  parseTodosWithKimi,
} from "@/lib/server/todo-parse-engine";

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/**
 * Session-authenticated entry into the shared Kimi parser. The Agent's
 * paste composer (and any future authenticated client) calls this.
 *
 * For non-browser ingest paths (Chrome extension, WeChat webhook, etc.)
 * the same engine is reachable via `parseTodosWithKimi` in
 * `lib/server/todo-parse-engine` — those callers handle their own auth
 * + body-shape adaptation.
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

  let body: Partial<ParseTodosRequest>;
  try {
    body = (await request.json()) as Partial<ParseTodosRequest>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request." },
      { status: 400 },
    );
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json(
      { error: "Todo text is required." },
      { status: 400 },
    );
  }
  if (text.length > MAX_PARSE_INPUT_CHARS) {
    return NextResponse.json(
      {
        error: `Todo text is too long. Keep it under ${MAX_PARSE_INPUT_CHARS} characters.`,
      },
      { status: 400 },
    );
  }

  const selectedDate = isDateKey(body.selectedDate)
    ? body.selectedDate
    : new Date().toISOString().slice(0, 10);

  try {
    const result = await parseTodosWithKimi({
      text,
      selectedDate,
      existingLists: listContextFromRaw(body.existingLists),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof KimiParseError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    return NextResponse.json(
      { error: "Unexpected parser error." },
      { status: 500 },
    );
  }
}
