import { NextResponse } from "next/server";
import type {
  ParsedTodoCandidate,
  ParseTodosRequest,
  ParseTodosResponse,
  TodoParserListContext,
} from "@/lib/ai-todo-parser";
import type { Category } from "@/lib/schema";

const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.6";
const MAX_INPUT_CHARS = 8000;
const MAX_TODOS = 40;
const CATEGORY_VALUES: Category[] = ["T0", "T1", "T2"];

type KimiChatResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
    finish_reason?: string;
  }>;
  error?: {
    message?: string;
  };
};

type RawParsedTodos = {
  todos?: unknown;
  warnings?: unknown;
};

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTimeLabel(value: unknown): value is string {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeCategory(value: unknown): Category {
  return CATEGORY_VALUES.includes(value as Category) ? (value as Category) : "T1";
}

function normalizeTitle(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 160) : "";
}

function normalizeListName(value: unknown) {
  const name = typeof value === "string" ? value.trim() : "";
  return (name || "Inbox").slice(0, 48);
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeTodos(value: unknown): ParsedTodoCandidate[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_TODOS)
    .map((item) => {
      const row = item as Record<string, unknown>;
      const title = normalizeTitle(row.title);
      if (!title) return null;

      return {
        title,
        listName: normalizeListName(row.listName),
        category: normalizeCategory(row.category),
        dueDate: isDateKey(row.dueDate) ? row.dueDate : null,
        dueTime: isTimeLabel(row.dueTime) ? row.dueTime : null,
        tags: normalizeTags(row.tags),
      };
    })
    .filter((item): item is ParsedTodoCandidate => Boolean(item));
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value
    .map((warning) => (typeof warning === "string" ? warning.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function cleanEnvValue(value: string | undefined) {
  return value?.trim().replace(/^["']|["']$/g, "") ?? "";
}

function kimiChatCompletionsUrl(baseUrl: string) {
  const normalized = baseUrl.replace(/\/+$/, "");
  return `${normalized}/chat/completions`;
}

function listContextFromRequest(value: unknown): TodoParserListContext[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name) return null;
      return { id, name: name.slice(0, 48) };
    })
    .filter((item): item is TodoParserListContext => Boolean(item))
    .slice(0, 30);
}

function buildSystemPrompt() {
  return `You parse messy natural-language notes into Lizhi Routine todo items.

Return one JSON object only:
{
  "todos": [
    {
      "title": "short actionable todo name",
      "listName": "matching or new todo list name",
      "category": "T0",
      "dueDate": "YYYY-MM-DD or null",
      "dueTime": "HH:MM or null",
      "tags": ["optional", "short"]
    }
  ],
  "warnings": ["optional short uncertainty notes"]
}

Rules:
- Output a JSON object, not an array.
- Preserve the user's intent. Split clear lists into separate todos.
- Prefer existing list names when the text matches one, including course codes and project names.
- If a list is clearly implied but does not exist, use that implied list name.
- If no list is implied, use "Inbox".
- dueDate must be YYYY-MM-DD or null. dueTime must be 24-hour HH:MM or null.
- If no due time is explicit, use null, not 24:00.
- Infer category as T0 for urgent/high-stakes/deadline-critical work, T1 for important study/work/health, T2 for chores/admin.
- Tags should be concise labels from the text, without # symbols.
- Never invent todos that are not present in the user text.`;
}

function buildUserPrompt(request: ParseTodosRequest, realToday: string) {
  const listNames = request.existingLists.map((list) => list.name);

  return JSON.stringify({
    selectedDate: request.selectedDate,
    realToday,
    dateRule:
      "Resolve relative dates like today, tomorrow, next Friday, and this week using selectedDate as the planning context unless the text explicitly says real/current today.",
    existingTodoLists: listNames,
    text: request.text,
  });
}

export async function POST(request: Request) {
  const apiKey = cleanEnvValue(process.env.MOONSHOT_API_KEY);
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing MOONSHOT_API_KEY. Add it to .env.local and restart the dev server.",
      },
      { status: 503 },
    );
  }

  const baseUrl =
    cleanEnvValue(process.env.MOONSHOT_BASE_URL) || DEFAULT_KIMI_BASE_URL;
  const model =
    cleanEnvValue(process.env.KIMI_TODO_PARSER_MODEL) || DEFAULT_MODEL;

  let body: Partial<ParseTodosRequest>;
  try {
    body = (await request.json()) as Partial<ParseTodosRequest>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return NextResponse.json({ error: "Todo text is required." }, { status: 400 });
  }
  if (text.length > MAX_INPUT_CHARS) {
    return NextResponse.json(
      { error: `Todo text is too long. Keep it under ${MAX_INPUT_CHARS} characters.` },
      { status: 400 },
    );
  }

  const selectedDate = isDateKey(body.selectedDate)
    ? body.selectedDate
    : new Date().toISOString().slice(0, 10);
  const parserRequest: ParseTodosRequest = {
    text,
    selectedDate,
    existingLists: listContextFromRequest(body.existingLists),
  };
  const realToday = new Date().toISOString().slice(0, 10);

  const response = await fetch(kimiChatCompletionsUrl(baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: buildSystemPrompt() },
        { role: "user", content: buildUserPrompt(parserRequest, realToday) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 2048,
    }),
  });

  const payload = (await response.json().catch(() => null)) as KimiChatResponse | null;
  if (!response.ok) {
    const upstreamMessage =
      payload?.error?.message ??
      `Kimi parser request failed with status ${response.status}.`;
    const authMessage =
      response.status === 401
        ? `Kimi rejected the API key for ${baseUrl}. Check that MOONSHOT_API_KEY is active and belongs to the same platform as MOONSHOT_BASE_URL. For platform.kimi.com keys, use MOONSHOT_BASE_URL=https://api.moonshot.cn/v1. For platform.moonshot.ai keys, use MOONSHOT_BASE_URL=https://api.moonshot.ai/v1. Upstream message: ${upstreamMessage}`
        : upstreamMessage;

    return NextResponse.json(
      {
        error: authMessage,
      },
      { status: response.status },
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    return NextResponse.json(
      { error: "Kimi returned an empty parser response." },
      { status: 502 },
    );
  }

  let parsed: RawParsedTodos;
  try {
    parsed = JSON.parse(content) as RawParsedTodos;
  } catch {
    return NextResponse.json(
      { error: "Kimi returned JSON that could not be parsed." },
      { status: 502 },
    );
  }

  const result: ParseTodosResponse = {
    todos: normalizeTodos(parsed.todos),
    warnings: normalizeWarnings(parsed.warnings),
  };

  if (payload?.choices?.[0]?.finish_reason === "length") {
    result.warnings.push("The parser response may have been truncated.");
  }

  return NextResponse.json(result);
}
