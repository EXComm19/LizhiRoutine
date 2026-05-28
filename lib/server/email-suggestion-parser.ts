import type {
  EmailTodoSuggestion,
} from "@/lib/email-suggestions";
import type { Category } from "@/lib/schema";
import type { GmailMessageSummary } from "@/lib/server/gmail-client";
import { makeFingerprint } from "@/lib/server/gmail-store";
import { cleanEnvValue } from "@/lib/server/env";

const DEFAULT_KIMI_BASE_URL = "https://api.moonshot.cn/v1";
const DEFAULT_MODEL = "kimi-k2.6";
const CATEGORY_VALUES: Category[] = ["T0", "T1", "T2"];

type EmailParserListContext = {
  id: string;
  name: string;
};

type KimiChatResponse = {
  choices?: Array<{
    message?: { content?: string | null };
    finish_reason?: string;
  }>;
  error?: { message?: string };
};

type RawEmailParserResponse = {
  suggestions?: unknown;
  warnings?: unknown;
};

export type ParsedEmailSuggestion = Omit<
  EmailTodoSuggestion,
  | "id"
  | "accountId"
  | "status"
  | "createdTodoId"
  | "createdAt"
  | "updatedAt"
>;

function kimiChatCompletionsUrl(baseUrl: string) {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
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

function normalizeText(value: unknown, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((tag) => (typeof tag === "string" ? tag.trim() : ""))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeConfidence(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeKind(value: unknown): "task" | "event" {
  return value === "event" ? "event" : "task";
}

function normalizeDurationMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return null;
  return Math.min(24 * 60, Math.max(5, Math.round(value)));
}

function normalizeWarnings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value
    .map((warning) => (typeof warning === "string" ? warning.trim() : ""))
    .filter(Boolean)
    .slice(0, 6);
}

function buildSystemPrompt() {
  return `You are an inbox-summarizing assistant for Lizhi Routine. For EVERY email in the input you return one entry. Each entry contains a short summary of the email plus, when the email implies a concrete personal action, a task or event suggestion.

Return one JSON object only:
{
  "suggestions": [
    {
      "sourceMessageId": "the exact source email id",
      "summary": "1-2 short sentences capturing what this email actually says",
      "isActionable": true | false,
      "title": "short actionable name (only when isActionable=true)",
      "listName": "matching or new list name (only when isActionable=true)",
      "category": "T0" | "T1" | "T2",
      "dueDate": "YYYY-MM-DD or null",
      "dueTime": "HH:MM or null",
      "tags": ["short", "labels"],
      "kind": "task" | "event",
      "durationMinutes": <int or null>,
      "durationUncertain": <true | false>,
      "confidence": 0.85,
      "reason": "brief why this email implies the suggestion"
    }
  ],
  "warnings": ["optional uncertainty notes"]
}

Every email gets exactly one entry. Always include "summary". The other fields below are required only when isActionable=true.

The summary field (always):
- 1-2 sentences, plain English, under 220 characters total.
- Capture the key information someone skimming their inbox would need: who is writing, what they want, key dates/numbers if any.
- Newsletter/digest? Say it's a newsletter and the topic. Receipt? Say it's a confirmation receipt and what for.
- Never repeat the subject verbatim — paraphrase what the body actually says.

isActionable=true ONLY when the email clearly implies a concrete action the recipient must do personally:
- Personal emails arranging/confirming/changing a meeting, appointment, deadline, follow-up, or required action.
- Course/cohort emails for enrolled units: workshops, labs, tutorials, presentations, assessments, submission deadlines, changed class times, extra required classes, cohort-specific meetings.
- LMS/Moodle/forum posts that announce a deadline, required class, workshop, presentation, meeting, or assessment.
- Appointment reminders/confirmations (GP, mental health, vaccination, dentist, booking, interview, reservation).

isActionable=false for:
- General newsletters, bulletins, mass marketing, optional opportunities, competitions, celebrations, social events, generic university news, startup/program promotions, surveys, gift-card draws, transport-plan feedback, research recommendations, tool/product announcements, Facebook/social notifications.
- Payment advice, statements, receipts, certificates, informational notices that don't require the recipient to act.
- Submission confirmations / Turnitin receipts / "you have submitted" / "successfully booked" messages — these record completed work.
- Anything where the email is FYI rather than "you must act".

For isActionable=true entries:
- Classifying task vs event:
  - "event" when a fixed-time happening the user attends. Hallmarks: explicit clock time + the user shows up at that time. Examples: meeting invites, appointment confirmations, lab/class times.
  - "task" when the email implies WORK the user does. Even with a deadline, it's a task. Examples: "assignment due Friday", "submit form by X", "pay invoice by Y".
  - If unsure, default to "task".
- durationMinutes (events only): best estimate from the content. "30-minute appointment" → 30; "1-hour meeting" → 60; "lab 9-11" → 120. Start time but no duration → 60. Tasks: null.
- durationUncertain (events only): true when you fell back to 60min. Tasks: false.
- Use the exact sourceMessageId from the input.
- Prefer existing list names when the email matches one, including course codes and projects.
- If a list is implied but not existing, use that implied list name.
- If no list is implied, use "Inbox".
- dueDate must be YYYY-MM-DD or null. dueTime must be 24-hour HH:MM or null. If no due time is explicit, use null.
- Infer T0 for urgent/high-stakes/deadline-critical work, T1 for important study/work/health, T2 for admin/chores.
- Use confidence >= 0.75 only for clearly relevant items. Keep confidence below 0.65 for broad/newsletter/optional/promotional items even if they contain dates.
- Keep titles actionable and under 120 characters.

For isActionable=false entries:
- You may omit title/listName/category/dueDate/dueTime/tags/kind/durationMinutes/durationUncertain or send them as null/empty. They will be ignored.
- Set confidence to reflect summary quality (0.3 is fine for newsletters); it isn't used to filter informational cards.
- reason can be empty.

Never invent details that aren't in the email.`;
}

function buildUserPrompt({
  messages,
  existingLists,
  selectedDate,
  realToday,
}: {
  messages: GmailMessageSummary[];
  existingLists: EmailParserListContext[];
  selectedDate: string;
  realToday: string;
}) {
  return JSON.stringify({
    selectedDate,
    realToday,
    dateRule:
      "Resolve relative dates using the email received date first, then selectedDate as planning context. Use realToday only when the email says today/current day.",
    existingTodoLists: existingLists.map((list) => list.name),
    emails: messages.map((message) => ({
      sourceMessageId: message.id,
      threadId: message.threadId,
      from: message.from,
      subject: message.subject,
      receivedAt: message.receivedAt,
      dateHeader: message.date,
      snippet: message.snippet,
      bodyText:
        message.bodyText ||
        "(No readable body text was extracted; rely on subject and snippet only.)",
      bodyTextChars: message.bodyTextChars,
      bodyTextTruncated: message.bodyTextTruncated,
    })),
  });
}

function normalizeSuggestions({
  raw,
  messages,
}: {
  raw: unknown;
  messages: GmailMessageSummary[];
}): ParsedEmailSuggestion[] {
  if (!Array.isArray(raw)) return [];
  const byId = new Map(messages.map((message) => [message.id, message]));

  return raw
    .map((item): ParsedEmailSuggestion | null => {
      const row = item as Record<string, unknown>;
      const sourceMessageId = normalizeText(row.sourceMessageId);
      const source = byId.get(sourceMessageId);
      if (!source) return null;

      const summary = normalizeText(row.summary).slice(0, 320);
      const isActionable = row.isActionable === true;

      if (!isActionable) {
        // Informational card: only the summary matters. We still populate
        // the suggestion-shaped fields so the DB schema stays uniform, but
        // they're placeholders the UI ignores when isActionable=false.
        if (!summary) {
          // No summary AND no action means nothing useful — drop it so the
          // user isn't shown an empty card.
          return null;
        }
        return {
          provider: "gmail" as const,
          sourceMessageId: source.id,
          sourceThreadId: source.threadId,
          sourceSubject: source.subject,
          sourceFrom: source.from,
          sourceReceivedAt: source.receivedAt,
          sourceSnippet: source.snippet,
          // For informational cards, the dedupe key is the thread itself —
          // we don't want the same newsletter posting multiple "summary"
          // cards within a thread.
          fingerprint: makeFingerprint([
            "gmail",
            source.threadId ?? source.id,
            "informational",
          ]),
          title: source.subject.slice(0, 160),
          listName: "Inbox",
          category: "T2" as Category,
          dueDate: null,
          dueTime: null,
          tags: [] as string[],
          kind: "task" as const,
          durationMinutes: null,
          durationUncertain: false,
          confidence: normalizeConfidence(row.confidence),
          reason: normalizeText(row.reason).slice(0, 220),
          summary,
          isActionable: false,
        };
      }

      // Actionable: existing task/event normalization rules.
      const title = normalizeText(row.title).slice(0, 160);
      if (!title) return null;

      const dueDate = isDateKey(row.dueDate) ? row.dueDate : null;
      const dueTime = isTimeLabel(row.dueTime) ? row.dueTime : null;
      const listName = normalizeText(row.listName, "Inbox").slice(0, 48) || "Inbox";
      const category = normalizeCategory(row.category);

      // Demote to task if the model said "event" but we don't have a
      // concrete time anchor — events with no when don't make sense.
      const claimedKind = normalizeKind(row.kind);
      const kind: "task" | "event" =
        claimedKind === "event" && dueDate && dueTime ? "event" : "task";
      const explicitDuration = normalizeDurationMinutes(row.durationMinutes);
      const durationMinutes =
        kind === "event" ? (explicitDuration ?? 60) : null;
      const durationUncertain =
        kind === "event" &&
        (row.durationUncertain === true || explicitDuration === null);

      return {
        provider: "gmail" as const,
        sourceMessageId: source.id,
        sourceThreadId: source.threadId,
        sourceSubject: source.subject,
        sourceFrom: source.from,
        sourceReceivedAt: source.receivedAt,
        sourceSnippet: source.snippet,
        // Title intentionally excluded — Kimi sometimes rephrases the
        // wording across runs, which would otherwise leave the user with
        // multiple pending suggestions for the same email. Thread + due
        // date/time is enough to dedupe.
        fingerprint: makeFingerprint([
          "gmail",
          source.threadId ?? source.id,
          dueDate,
          dueTime,
        ]),
        title,
        listName,
        category,
        dueDate,
        dueTime,
        tags: normalizeTags(row.tags),
        kind,
        durationMinutes,
        durationUncertain,
        confidence: normalizeConfidence(row.confidence),
        reason: normalizeText(row.reason).slice(0, 220),
        summary,
        isActionable: true,
      };
    })
    .filter((item): item is ParsedEmailSuggestion => Boolean(item))
    // Confidence threshold only gates actionable suggestions; informational
    // summaries always pass so the user still sees what landed in the inbox.
    .filter((item) => !item.isActionable || item.confidence >= 0.75)
    .slice(0, 40);
}

export async function parseEmailSuggestions({
  messages,
  existingLists,
  selectedDate,
}: {
  messages: GmailMessageSummary[];
  existingLists: EmailParserListContext[];
  selectedDate: string;
}) {
  const apiKey = cleanEnvValue(process.env.MOONSHOT_API_KEY);
  if (!apiKey) {
    throw new Error(
      "Missing MOONSHOT_API_KEY. Add it to .env.local and restart the server.",
    );
  }

  if (!messages.length) {
    return { suggestions: [], warnings: [] as string[] };
  }

  const baseUrl =
    cleanEnvValue(process.env.MOONSHOT_BASE_URL) || DEFAULT_KIMI_BASE_URL;
  const model =
    cleanEnvValue(process.env.KIMI_EMAIL_PARSER_MODEL) ||
    cleanEnvValue(process.env.KIMI_TODO_PARSER_MODEL) ||
    DEFAULT_MODEL;
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
        {
          role: "user",
          content: buildUserPrompt({
            messages,
            existingLists,
            selectedDate,
            realToday,
          }),
        },
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      // Bumped from 3072 in #50: every email now gets a summary plus an
      // optional suggestion, so a 12-message batch can easily produce more
      // text than the old "actionable-only" responses.
      max_tokens: 4096,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | KimiChatResponse
    | null;
  if (!response.ok) {
    throw new Error(
      payload?.error?.message ??
        `Kimi email parser request failed with status ${response.status}.`,
    );
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Kimi returned an empty email parser response.");
  }

  let parsed: RawEmailParserResponse;
  try {
    parsed = JSON.parse(content) as RawEmailParserResponse;
  } catch {
    throw new Error("Kimi returned email parser JSON that could not be parsed.");
  }

  const warnings = normalizeWarnings(parsed.warnings);
  if (payload?.choices?.[0]?.finish_reason === "length") {
    warnings.push("The email parser response may have been truncated.");
  }

  return {
    suggestions: normalizeSuggestions({ raw: parsed.suggestions, messages }),
    warnings,
  };
}
