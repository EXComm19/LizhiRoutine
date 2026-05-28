// Lizhi Routine API client. All calls go through fetchJson which centralizes
// auth header injection + JSON error parsing. baseUrl is the user-configured
// origin (e.g., https://lizhi-routine.com or http://localhost:3000); the
// extension declares matching host_permissions so fetch isn't blocked by CORS.

import type { AttachResponse, ExtensionTodo, TodoCategory } from "./types";
import { loadSettings, type Settings } from "./storage";

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

async function fetchJson<T>(
  settings: Settings,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const response = await fetch(joinUrl(settings.baseUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiToken}`,
      ...(init.headers ?? {}),
    },
  });
  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // Non-JSON response, fall through.
    }
  }
  if (!response.ok) {
    const message =
      (payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error?: string }).error)
        : null) ?? `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return (payload ?? {}) as T;
}

/**
 * Tiny ping that doubles as a "test connection" probe — fetches the todos
 * list (which any valid Bearer token can access) but ignores the result.
 */
export async function testConnection(settings: Settings): Promise<void> {
  await fetchJson<{ todos: ExtensionTodo[] }>(settings, "/api/extension/todos");
}

export async function listTodos(query: string = ""): Promise<ExtensionTodo[]> {
  const settings = await loadSettings();
  const qs = query.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
  const payload = await fetchJson<{ todos: ExtensionTodo[] }>(
    settings,
    `/api/extension/todos${qs}`,
  );
  return payload.todos ?? [];
}

export async function attachContext(args: {
  todoId: string;
  url: string;
  title: string;
  text: string;
  userInsight?: string;
}): Promise<AttachResponse> {
  const settings = await loadSettings();
  return fetchJson<AttachResponse>(settings, "/api/extension/attach-context", {
    method: "POST",
    body: JSON.stringify({
      todoId: args.todoId,
      source: { url: args.url, title: args.title },
      text: args.text,
      userInsight: args.userInsight,
    }),
  });
}

export async function createTodoFromCapture(args: {
  title?: string;
  category?: TodoCategory;
  url: string;
  pageTitle: string;
  text: string;
  userInsight?: string;
}): Promise<AttachResponse> {
  const settings = await loadSettings();
  return fetchJson<AttachResponse>(settings, "/api/extension/create-todo", {
    method: "POST",
    body: JSON.stringify({
      title: args.title,
      category: args.category,
      source: { url: args.url, title: args.pageTitle },
      text: args.text,
      userInsight: args.userInsight,
    }),
  });
}

/**
 * Kick off an AI estimate for an existing todo. The server reads the
 * todo's stored title + context_docs + user_insight and persists the
 * resulting estimate back onto the row.
 */
export async function estimateTodo(args: {
  todoId: string;
  userInsight?: string;
}): Promise<{ estimate: { minutes: number; notes: string | null } }> {
  const settings = await loadSettings();
  return fetchJson(settings, "/api/extension/estimate-todo", {
    method: "POST",
    body: JSON.stringify({
      todoId: args.todoId,
      userInsight: args.userInsight,
    }),
  });
}

export { ApiError };
