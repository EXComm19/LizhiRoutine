import { NextRequest, NextResponse } from "next/server";
import { patchTodo } from "@/lib/factories";
import type { TodoItem } from "@/lib/schema";
import { computeEstimate } from "@/lib/server/estimate-engine";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";
export const maxDuration = 90;

type RequestBody = {
  todoId?: string;
  /** Optional fresh insight — overwrites the todo's stored value when set. */
  userInsight?: string;
};

type UserStateRow = {
  todos: TodoItem[];
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

/**
 * Extension-driven estimate. Looks up the todo by id, builds the prompt
 * from its stored title + context_docs + user_insight, runs the engine,
 * and PERSISTS the estimate back to the row (the panel route doesn't
 * persist — the user has to click save in the UI — but the extension's
 * "attach + auto-estimate" loop wants a single round-trip).
 *
 * Auth: Bearer token.
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
  if (!todoId) {
    return NextResponse.json({ error: "todoId is required." }, { status: 400 });
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

  const idx = stateRow.todos.findIndex((todo) => todo.id === todoId);
  if (idx === -1) {
    return NextResponse.json({ error: "Todo not found." }, { status: 404 });
  }
  const todo = stateRow.todos[idx];

  // Caller can pass a fresh insight string to overwrite what's saved on the
  // todo. When omitted, we use whatever's already stored. Either way the
  // engine treats it as a first-person hint.
  const effectiveInsight =
    typeof body.userInsight === "string"
      ? body.userInsight
      : todo.user_insight;

  const result = await computeEstimate({
    title: todo.title,
    category: todo.category,
    existingDocs: todo.context_docs.map((doc) => ({
      name: doc.name,
      text: doc.text,
    })),
    newFiles: [],
    userInsight: effectiveInsight ?? undefined,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  // Persist the estimate (+ refreshed insight) so the panel reflects it.
  const updatedTodo = patchTodo(todo, {
    estimate: result.estimate,
    user_insight: effectiveInsight ?? null,
  });
  const nextTodos = [...stateRow.todos];
  nextTodos[idx] = updatedTodo;

  const { error: writeError } = await supabase
    .from("user_state")
    .update({ todos: nextTodos, updated_at: nowIso() })
    .eq("user_id", user.userId);
  if (writeError) {
    return NextResponse.json(
      { error: `Could not save: ${writeError.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    todo: { id: updatedTodo.id, title: updatedTodo.title },
    estimate: result.estimate,
    warnings: result.warnings,
  });
}
