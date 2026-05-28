import { NextRequest, NextResponse } from "next/server";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import { createServiceClient } from "@/utils/supabase/service";
import type { TodoContextDoc, TodoItem } from "@/lib/schema";

export const runtime = "nodejs";

// Match the file-upload cap so behavior is consistent regardless of source.
const MAX_TEXT_CHARS_PER_DOC = 30_000;
const MAX_TITLE_CHARS = 200;

type RequestBody = {
  todoId?: string;
  source?: { url?: string; title?: string };
  text?: string;
  /** Optional user-perspective hint to save on the todo (used by estimator). */
  userInsight?: string;
};

type UserStateRow = {
  todos: TodoItem[];
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

function sanitizeTitle(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  return value.replace(/[\r\n\t]/g, " ").trim().slice(0, MAX_TITLE_CHARS) || fallback;
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
 * Attach a web-captured context doc to an existing todo.
 *
 * Body: { todoId, source: { url, title }, text }
 * Auth: Bearer token.
 *
 * Returns 200 with the updated todo on success, 404 if the todo isn't on
 * this user's account, 400 on malformed input.
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

  const todoId = typeof body.todoId === "string" ? body.todoId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!todoId) {
    return NextResponse.json(
      { error: "todoId is required." },
      { status: 400 },
    );
  }
  if (!text) {
    return NextResponse.json(
      { error: "text is required." },
      { status: 400 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY missing.",
      },
      { status: 503 },
    );
  }

  const { data: stateRow, error: loadError } = await supabase
    .from("user_state")
    .select("todos, updated_at")
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

  const todoIndex = stateRow.todos.findIndex((t) => t.id === todoId);
  if (todoIndex === -1) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }

  const sourceUrl =
    typeof body.source?.url === "string" ? body.source.url.slice(0, 2000) : null;
  const sourceTitle = sanitizeTitle(body.source?.title, "Web capture");
  const host = safeHostname(sourceUrl ?? undefined);
  // Compose a useful filename so the todo's doc list shows
  // "Lab 4 instructions — learning.monash.edu" instead of just "Web capture".
  const docName = host ? `${sourceTitle} — ${host}` : sourceTitle;

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

  const incomingInsight =
    typeof body.userInsight === "string" ? body.userInsight.trim() : "";
  const updatedTodo: TodoItem = {
    ...stateRow.todos[todoIndex],
    context_docs: [...(stateRow.todos[todoIndex].context_docs ?? []), newDoc],
    // Overwrite the saved insight only when a non-empty new value comes in,
    // so attaching a second page doesn't blow away previous notes.
    user_insight: incomingInsight
      ? incomingInsight.slice(0, 2000)
      : (stateRow.todos[todoIndex].user_insight ?? null),
    updated_at: nowIso(),
  };
  const nextTodos = [...stateRow.todos];
  nextTodos[todoIndex] = updatedTodo;

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

  return NextResponse.json({ todo: updatedTodo, doc: newDoc });
}
