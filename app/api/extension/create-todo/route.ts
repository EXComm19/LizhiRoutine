import { NextRequest, NextResponse } from "next/server";
import { createTodo } from "@/lib/factories";
import type {
  Category,
  TodoContextDoc,
  TodoItem,
  TodoList,
} from "@/lib/schema";
import type { ParsedTodoCandidate } from "@/lib/ai-todo-parser";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import {
  MAX_PARSE_INPUT_CHARS,
  parseTodosWithKimi,
} from "@/lib/server/todo-parse-engine";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

const MAX_TEXT_CHARS_PER_DOC = 30_000;
const MAX_TITLE_CHARS = 200;

type RequestBody = {
  title?: string;
  listId?: string;
  category?: Category;
  source?: { url?: string; title?: string };
  text?: string;
  /** Optional user-perspective hint to save on the new todo. */
  userInsight?: string;
};

type UserStateRow = {
  todos: TodoItem[];
  todo_lists: TodoList[];
  updated_at: string;
};

function newDocId() {
  return `doc-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function truncateText(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n…[truncated]`;
}

function safeHostname(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/**
 * Clean a captured page <title> into a usable todo title.
 *
 * Page titles from LMS / SaaS apps carry breadcrumb cruft that's noise
 * for a todo. Examples:
 *   "BPS3072 2026: Assessment 2. Background and Plan | MonashELMS1"
 *     → "BPS3072 Assessment 2. Background and Plan"
 *   "Inbox (3) - Gmail"  → "Inbox (3)"
 *
 * Transforms, in order:
 *   1. Strip everything from the last " | " / " · " / " — " / " - "
 *      separator onward WHEN the trailing segment looks like a site
 *      name (≤4 words, no sentence punctuation). Pipe is always a
 *      separator; dash/middot only when the tail is short.
 *   2. Drop a standalone 4-digit year token (2020-2099).
 *   3. Collapse a "CODE: rest" colon that's left dangling after the
 *      year is removed → "CODE rest".
 *   4. Squeeze repeated whitespace.
 */
function cleanCapturedTitle(raw: string): string {
  let title = raw.replace(/[\r\n\t]/g, " ").trim();
  if (!title) return title;

  // 1. Strip a trailing site-name segment.
  //    Pipe: always a separator. Dash/middot/em-dash: only if the tail
  //    is a short site-y token (no period, ≤4 words).
  const pipeIdx = title.lastIndexOf(" | ");
  if (pipeIdx > 0) {
    title = title.slice(0, pipeIdx).trim();
  } else {
    const sepMatch = title.match(/^(.*\S)\s+[–—\-·]\s+([^|]+)$/);
    if (sepMatch) {
      const tail = sepMatch[2].trim();
      const looksLikeSite =
        !tail.includes(".") && tail.split(/\s+/).length <= 4;
      if (looksLikeSite) title = sepMatch[1].trim();
    }
  }

  // 2. Drop standalone year tokens.
  title = title.replace(/\b20\d{2}\b/g, " ");

  // 3. "CODE: rest" leftover (e.g. "BPS3072 : Assessment" → "BPS3072 Assessment").
  title = title.replace(/\s*:\s*/g, " ");

  // 4. Squeeze whitespace.
  title = title.replace(/\s{2,}/g, " ").trim();
  return title || raw.trim();
}

function clampCategory(value: unknown): Category {
  return value === "T0" || value === "T1" || value === "T2" ? value : "T1";
}

/**
 * Create a brand-new todo and attach a captured page in one shot.
 *
 * Body: { title?, listId?, category?, source: {url, title}, text }
 * Auth: Bearer token.
 *
 * When `title` is omitted we use the page title. When `listId` is omitted we
 * fall back to the first todo list ("Inbox" in the default seed). Returns
 * the new todo so the extension can pick the next action (estimate, open
 * planner, etc.).
 */
export async function POST(request: NextRequest) {
  const user = await getUserFromExtensionRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const sourceUrl =
    typeof body.source?.url === "string" ? body.source.url.slice(0, 2000) : null;
  const sourceTitle =
    typeof body.source?.title === "string" ? body.source.title.trim() : "";

  // Title precedence: explicit body.title > source.title > generic
  // fallback. An explicit body.title is the user's own typing — trust
  // it verbatim. A source.title is the page <title>, which carries
  // breadcrumb noise we clean up.
  const explicitTitle =
    typeof body.title === "string" ? body.title.trim() : "";
  let title =
    explicitTitle ||
    (sourceTitle ? cleanCapturedTitle(sourceTitle) : "") ||
    "Captured page";
  title = title.replace(/[\r\n\t]/g, " ").slice(0, MAX_TITLE_CHARS);

  if (!text) {
    return NextResponse.json(
      { error: "text is required." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY missing." },
      { status: 503 },
    );
  }

  const { data: stateRow, error: loadError } = await supabase
    .from("user_state")
    .select("todos, todo_lists, updated_at")
    .eq("user_id", user.userId)
    .maybeSingle<UserStateRow>();
  if (loadError) {
    return NextResponse.json(
      { error: `Could not load state: ${loadError.message}` },
      { status: 500 },
    );
  }
  if (!stateRow) {
    return NextResponse.json(
      { error: "User state not found. Open the app once to initialize." },
      { status: 404 },
    );
  }

  const lists = stateRow.todo_lists ?? [];
  if (!lists.length) {
    return NextResponse.json(
      {
        error:
          "No todo lists found for this user. Open the app once to initialize defaults.",
      },
      { status: 404 },
    );
  }

  // AI-parse the captured page (raw title + body text) for a deadline,
  // tags, list, and category. Best-effort: if Kimi is unavailable or
  // returns nothing we still create the todo with the cleaned title +
  // default list (the old behaviour). We feed the RAW page title (not the
  // cleaned one) since its breadcrumb carries useful course-code signal.
  let parsed: ParsedTodoCandidate | null = null;
  try {
    const parseInput = [sourceTitle, text]
      .filter(Boolean)
      .join("\n")
      .slice(0, MAX_PARSE_INPUT_CHARS);
    const result = await parseTodosWithKimi({
      text: parseInput,
      selectedDate: new Date().toISOString().slice(0, 10),
      existingLists: lists.map((l) => ({ id: l.id, name: l.name })),
    });
    parsed = result.todos[0] ?? null;
  } catch (error) {
    console.warn(
      "[extension/create-todo] parse failed; creating with defaults:",
      error instanceof Error ? error.message : error,
    );
  }

  // List precedence: explicit body.listId > parsed listName (existing
  // match only) > first list (Inbox).
  const requestedListId =
    typeof body.listId === "string" ? body.listId : undefined;
  const explicitList = requestedListId
    ? lists.find((l) => l.id === requestedListId)
    : undefined;
  const parsedListName = parsed?.listName?.trim().toLowerCase();
  const parsedListMatch = parsedListName
    ? lists.find((l) => l.name.toLowerCase() === parsedListName)
    : undefined;
  const list = explicitList ?? parsedListMatch ?? lists[0];

  // Prefer the AI title when we parsed one and the user didn't type an
  // explicit title — it lifts course codes out of LMS body text
  // ("BPS3061 Team Routine") beyond what the breadcrumb cleanup does.
  if (!explicitTitle && parsed?.title) {
    title = parsed.title.replace(/[\r\n\t]/g, " ").slice(0, MAX_TITLE_CHARS);
  }

  const host = safeHostname(sourceUrl ?? undefined);
  const docName = host ? `${sourceTitle || title} — ${host}` : sourceTitle || title;

  const truncated = truncateText(text, MAX_TEXT_CHARS_PER_DOC);
  const newDoc: TodoContextDoc = {
    id: newDocId(),
    name: docName,
    mime: "text/html-extract",
    size_bytes: text.length,
    text: truncated,
    text_chars: truncated.length,
    source_url: sourceUrl,
    added_at: nowIso(),
  };

  const newTodo = createTodo({
    title,
    // Explicit body.category wins; else the parsed tier; else T1.
    category: body.category ? clampCategory(body.category) : (parsed?.category ?? "T1"),
    list_id: list.id,
    due_date: parsed?.dueDate ?? null,
    due_time: parsed?.dueTime ?? null,
    tags: parsed?.tags ?? [],
  });
  newTodo.context_docs = [newDoc];
  if (typeof body.userInsight === "string" && body.userInsight.trim()) {
    newTodo.user_insight = body.userInsight.trim().slice(0, 2000);
  }

  const nextTodos = [newTodo, ...stateRow.todos];

  const { error: writeError } = await supabase
    .from("user_state")
    .update({
      todos: nextTodos,
      updated_at: nowIso(),
    })
    .eq("user_id", user.userId);
  if (writeError) {
    return NextResponse.json(
      { error: `Could not save: ${writeError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ todo: newTodo, doc: newDoc });
}
