import { NextRequest, NextResponse } from "next/server";
import type {
  ParsedTodoCandidate,
  ParseTodosRequest,
  ParseTodosResponse,
  TodoParserListContext,
} from "@/lib/ai-todo-parser";
import type { Category } from "@/lib/schema";
import { cleanEnvValue } from "@/lib/server/env";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

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

function normalizeKind(value: unknown): "task" | "event" {
  return value === "event" ? "event" : "task";
}

function normalizeDurationMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  // Sanity cap: nobody schedules a 16h meeting; clamp to a day.
  return Math.min(24 * 60, Math.max(5, Math.round(value)));
}

function normalizeTodos(value: unknown): ParsedTodoCandidate[] {
  if (!Array.isArray(value)) return [];

  return value
    .slice(0, MAX_TODOS)
    .map((item) => {
      const row = item as Record<string, unknown>;
      const title = normalizeTitle(row.title);
      if (!title) return null;

      const dueDate = isDateKey(row.dueDate) ? row.dueDate : null;
      const dueTime = isTimeLabel(row.dueTime) ? row.dueTime : null;
      // Demote to task if the model said "event" but there's no actual time
      // anchor — events without when don't make sense.
      const claimedKind = normalizeKind(row.kind);
      const kind: "task" | "event" =
        claimedKind === "event" && dueDate && dueTime ? "event" : "task";
      const explicitDuration = normalizeDurationMinutes(row.durationMinutes);
      const durationMinutes =
        kind === "event" ? (explicitDuration ?? 60) : null;
      // Mark uncertain when the model told us so, OR when it couldn't give
      // a concrete duration and we fell back to 60. The latter catch is
      // defensive — older model versions may not emit the flag yet.
      const durationUncertain =
        kind === "event" &&
        (row.durationUncertain === true || explicitDuration === null);

      return {
        title,
        listName: normalizeListName(row.listName),
        category: normalizeCategory(row.category),
        dueDate,
        dueTime,
        tags: normalizeTags(row.tags),
        kind,
        durationMinutes,
        durationUncertain,
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
  return `You parse messy natural-language notes into Lizhi Routine items. Each item is either a TASK (something the user works on, flexible duration) or an EVENT (something that happens at a fixed time the user attends).

Return one JSON object only:
{
  "todos": [
    {
      "title": "short actionable name",
      "listName": "matching or new list name",
      "category": "T0",
      "dueDate": "YYYY-MM-DD or null",
      "dueTime": "HH:MM or null",
      "tags": ["optional", "short"],
      "kind": "task" | "event",
      "durationMinutes": <int or null>,
      "durationUncertain": <true | false>
    }
  ],
  "warnings": ["optional short uncertainty notes"]
}

Classifying task vs event:
- "event" when the item IS a fixed-time happening the user attends or participates in. Hallmarks: explicit time of day AND it makes no sense to estimate "how long will this take me" — the duration belongs to the event itself.
  Examples: "lab from 9-11 Friday", "BPS3071 lecture Mon 14:00", "dentist Wed 2:30pm", "team standup at 10am", "concert Sat 7pm", "interview Tue 11am for 45min".
- "task" when the item is work the user does. Even with a deadline ("submit X by Friday 17:00"), it's still a task — the deadline is when it's due, not when the work happens.
  Examples: "lab report due Friday", "read chapter 5", "fix login bug", "email Sarah", "book flights", "study for exam".
- If unsure, default to "task". Tasks are the safer fallback because they're flexible.

durationMinutes:
- For events: best-effort estimate from the text. "9-11" → 120; "45min interview" → 45; "1hr meeting" → 60. If unknown, use 60 (sensible default for a meeting).
- For tasks: always null.

durationUncertain:
- For events: true when the source text did NOT give an explicit duration (you guessed 60min as a default). False when the text was specific (e.g. "9-11", "30min", "1 hour").
- For tasks: always false.

Other rules:
- Output a JSON object, not an array.
- Preserve the user's intent. Split clear lists into separate items.
- Prefer existing list names when the text matches one, including course codes and project names.
- If a list is clearly implied but does not exist, use that implied list name.
- If no list is implied, use "Inbox".
- dueDate must be YYYY-MM-DD or null. dueTime must be 24-hour HH:MM or null.
- For events: dueTime should be set when a clock time was given. If no clock time was given but item is clearly an event (e.g., "lecture Monday"), set dueTime to null and kind=task (we can't place an event without a time).
- Infer category as T0 for urgent/high-stakes/deadline-critical, T1 for important study/work/health, T2 for chores/admin.
- Tags should be concise labels from the text, without # symbols.
- Never invent items that are not present in the user text.`;
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

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

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
