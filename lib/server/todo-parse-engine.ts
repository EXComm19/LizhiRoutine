import type {
  ParsedTodoCandidate,
  ParseTodosRequest,
  ParseTodosResponse,
  TodoParserListContext,
} from "@/lib/ai-todo-parser";
import type { Category } from "@/lib/schema";
import { cleanEnvValue } from "@/lib/server/env";

/**
 * Shared Kimi-backed todo/event parser. Single source of truth for the
 * system prompt + JSON normalization, used by both:
 *
 *   /api/parse-todos       — session-authenticated, called from the
 *                            Agent's paste composer
 *   /api/wechat/webhook    — bearer-less server-internal call from the
 *                            WeChat inbound message handler
 *
 * On success returns the parsed shape; on any upstream failure THROWS a
 * `KimiParseError` with `.status` so route handlers can map it to the
 * right HTTP status. The Kimi API key + base URL are read from env
 * here so callers don't need to thread them.
 */

const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.6";
export const MAX_PARSE_INPUT_CHARS = 8000;
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

export class KimiParseError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.name = "KimiParseError";
    this.status = status;
  }
}

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
      const claimedKind = normalizeKind(row.kind);
      const kind: "task" | "event" =
        claimedKind === "event" && dueDate && dueTime ? "event" : "task";
      const explicitDuration = normalizeDurationMinutes(row.durationMinutes);
      const durationMinutes = kind === "event" ? (explicitDuration ?? 60) : null;
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
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
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

Classifying task vs event — read all three rules together:

1. EVENT only when SOMEONE ELSE controls the schedule and the user shows up to fit it. Hallmarks: a third party (teacher, doctor, host, ticket) sets a fixed start AND the duration is intrinsic to the event (a 1h lecture is 1h; a 30min appointment is 30min).
   Examples (events):
   - "lab from 9-11 Friday" / "BPS3071 lecture Mon 14:00"
   - "dentist Wed 2:30pm" / "doctor's appointment Tuesday 10am"
   - "team standup at 10am" / "1:1 with Sarah at 3pm"
   - "concert Sat 7pm" / "flight at 6:55am"
   - "interview Tue 11am for 45min"

2. TASKS include errands and shopping even when a time is mentioned — the time is the user's planned start, not a fixed appointment. The store / post office / gym does not care when you arrive. The user decides when to leave.
   Examples (TASKS even with a time):
   - "明天早上十点去 Bunnings 买套筒" / "明天下午三点去超市买菜"
   - "tomorrow morning pick up dry cleaning"
   - "after work grocery run"
   - "Saturday 10am gym session" (user-initiated, not a class)
   - "tonight 8pm call mom" / "晚上九点给妈妈打电话"
   - "明天早上学一小时英语" / "tomorrow 9am study for 1h"

3. Deadlines are also tasks. "Submit X by Friday 17:00" / "lab report due Friday" / "report due Monday" — the deadline is when it's due, not when the work happens.
   More task examples: "read chapter 5", "fix login bug", "email Sarah", "book flights", "study for exam".

When unsure, default to TASK. Tasks are the safer fallback because they're flexible — the user can still pin a task to a clock time later.

Heuristic if you're stuck: "If the user doesn't show up at exactly that time, does someone else notice or get inconvenienced?" Yes → event. No → task.

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

export function listContextFromRaw(value: unknown): TodoParserListContext[] {
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

/**
 * Run the Kimi parser. Throws on any failure with a `.status` matching
 * the closest HTTP code (401 → upstream auth, 503 → missing env, 502 →
 * everything else). Callers map .status to NextResponse status.
 */
export async function parseTodosWithKimi(
  params: ParseTodosRequest,
): Promise<ParseTodosResponse> {
  const apiKey = cleanEnvValue(process.env.MOONSHOT_API_KEY);
  if (!apiKey) {
    throw new KimiParseError(
      "Missing MOONSHOT_API_KEY. Add it to .env.local and restart the dev server.",
      503,
    );
  }
  const baseUrl =
    cleanEnvValue(process.env.MOONSHOT_BASE_URL) || DEFAULT_KIMI_BASE_URL;
  const model =
    cleanEnvValue(process.env.KIMI_TODO_PARSER_MODEL) || DEFAULT_MODEL;
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
        { role: "user", content: buildUserPrompt(params, realToday) },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 2048,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | KimiChatResponse
    | null;
  if (!response.ok) {
    const upstream =
      payload?.error?.message ??
      `Kimi parser request failed with status ${response.status}.`;
    const message =
      response.status === 401
        ? `Kimi rejected the API key for ${baseUrl}. Check MOONSHOT_API_KEY. Upstream: ${upstream}`
        : upstream;
    throw new KimiParseError(message, response.status);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new KimiParseError("Kimi returned an empty parser response.", 502);
  }

  let parsed: RawParsedTodos;
  try {
    parsed = JSON.parse(content) as RawParsedTodos;
  } catch {
    throw new KimiParseError(
      "Kimi returned JSON that could not be parsed.",
      502,
    );
  }

  const result: ParseTodosResponse = {
    todos: normalizeTodos(parsed.todos),
    warnings: normalizeWarnings(parsed.warnings),
  };
  if (payload?.choices?.[0]?.finish_reason === "length") {
    result.warnings.push("The parser response may have been truncated.");
  }
  return result;
}
