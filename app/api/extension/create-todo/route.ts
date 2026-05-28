import { NextRequest, NextResponse } from "next/server";
import { createTodo } from "@/lib/factories";
import type {
  Category,
  TodoContextDoc,
  TodoItem,
  TodoList,
} from "@/lib/schema";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
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

  // Title precedence: explicit body.title > source.title > generic fallback.
  let title =
    (typeof body.title === "string" ? body.title.trim() : "") ||
    sourceTitle ||
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
  const requestedListId =
    typeof body.listId === "string" ? body.listId : undefined;
  const list =
    (requestedListId && lists.find((l) => l.id === requestedListId)) ||
    lists[0];
  if (!list) {
    return NextResponse.json(
      {
        error:
          "No todo lists found for this user. Open the app once to initialize defaults.",
      },
      { status: 404 },
    );
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
    category: clampCategory(body.category),
    list_id: list.id,
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
