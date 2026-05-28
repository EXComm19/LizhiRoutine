import { NextRequest, NextResponse } from "next/server";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import { createServiceClient } from "@/utils/supabase/service";

export const runtime = "nodejs";

// Cap how many rows we hand back — the extension's picker only needs a few
// dozen to be useful, and the full set could be hundreds of rows.
const MAX_RESULTS = 50;

type UserStateRow = {
  todos: Array<{
    id: string;
    title: string;
    list_id: string;
    category: string;
    status: string;
    due_date: string | null;
  }>;
  todo_lists: Array<{ id: string; name: string }>;
};

/**
 * List the user's pending todos for the extension's task picker.
 *
 * Auth: Bearer token. Once the token is verified by getUserFromExtensionRequest,
 * we switch to a service-role client to bypass RLS — the route has its own
 * notion of "the authenticated user" via the token hash, separate from any
 * Supabase auth session.
 */
export async function GET(request: NextRequest) {
  const user = await getUserFromExtensionRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY missing. Extension API needs it to read user data after Bearer-token auth.",
      },
      { status: 503 },
    );
  }

  const { data, error } = await supabase
    .from("user_state")
    .select("todos, todo_lists")
    .eq("user_id", user.userId)
    .maybeSingle<UserStateRow>();

  if (error) {
    return NextResponse.json(
      { error: `Could not load todos: ${error.message}` },
      { status: 500 },
    );
  }
  if (!data) {
    return NextResponse.json({ todos: [] });
  }

  const listById = new Map(
    (data.todo_lists ?? []).map((list) => [list.id, list.name]),
  );

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();

  const todos = (data.todos ?? [])
    .filter((todo) => todo.status === "pending")
    .filter((todo) => (q ? todo.title.toLowerCase().includes(q) : true))
    .slice(0, MAX_RESULTS)
    .map((todo) => ({
      id: todo.id,
      title: todo.title,
      listName: listById.get(todo.list_id) ?? "Inbox",
      category: todo.category,
      dueDate: todo.due_date,
    }));

  return NextResponse.json({ todos });
}
