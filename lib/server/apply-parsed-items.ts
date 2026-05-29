import type { ParsedTodoCandidate } from "@/lib/ai-todo-parser";
import { createEvent, createTodo } from "@/lib/factories";
import type { EventItem, TodoItem, TodoList } from "@/lib/schema";
import { createServiceClient } from "@/utils/supabase/service";

/**
 * Server-side companion to the client `importParsedTodos` flow. Takes
 * parsed candidates from Kimi and writes them straight into the user's
 * `user_state` row via service role.
 *
 * Used by the WeChat webhook async handler (and anything else that
 * needs to persist parsed items without a user session). The session-
 * auth client path still uses `importParsedTodos` in
 * `components/routine-planner.tsx` because that path mutates local
 * React state too — this helper is purely the cloud-side write.
 *
 * Returns counts so the caller can log / debug.
 */

type UserStateRow = {
  todos: TodoItem[];
  events: EventItem[] | null;
  todo_lists: TodoList[];
  updated_at: string;
};

/**
 * Resolve a candidate's `listName` to a TodoList.id from the user's
 * current lists. Falls back to the first list (Inbox) when nothing
 * matches by case-insensitive equality.
 */
function resolveListId(
  listName: string,
  lists: TodoList[],
): { listId: string; listName: string } {
  const trimmed = listName.trim();
  if (!trimmed) {
    return { listId: lists[0]?.id ?? "list-inbox", listName: "Inbox" };
  }
  const match = lists.find(
    (list) => list.name.toLowerCase() === trimmed.toLowerCase(),
  );
  if (match) return { listId: match.id, listName: match.name };
  return { listId: lists[0]?.id ?? "list-inbox", listName: trimmed };
}

/**
 * Convert dueDate + dueTime ("YYYY-MM-DD" + "HH:MM") into an ISO 8601
 * datetime in the SERVER's timezone. Yes — same caveat as the rest of
 * the planner; if a user is in a wildly different TZ than the server
 * this slips. Out of scope for v1 of the WeChat bot.
 */
function toIsoStart(dueDate: string, dueTime: string): string {
  const [y, m, d] = dueDate.split("-").map((s) => Number(s));
  const [hh, mm] = dueTime.split(":").map((s) => Number(s));
  const date = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return date.toISOString();
}

export type ApplyParsedSummary = {
  todosAdded: number;
  eventsAdded: number;
  /** Names of lists the items landed in, deduped — for the ack message. */
  lists: string[];
  errors: string[];
};

export async function applyParsedItemsToUser(params: {
  userId: string;
  candidates: ParsedTodoCandidate[];
}): Promise<ApplyParsedSummary> {
  const summary: ApplyParsedSummary = {
    todosAdded: 0,
    eventsAdded: 0,
    lists: [],
    errors: [],
  };
  if (!params.candidates.length) return summary;

  const sb = createServiceClient();
  if (!sb) {
    summary.errors.push("Supabase service role not configured.");
    return summary;
  }

  const { data: stateRow, error: loadError } = await sb
    .from("user_state")
    .select("todos, events, todo_lists, updated_at")
    .eq("user_id", params.userId)
    .maybeSingle<UserStateRow>();

  if (loadError) {
    summary.errors.push(`Could not load state: ${loadError.message}`);
    return summary;
  }
  if (!stateRow) {
    summary.errors.push("User state not found — open the app once first.");
    return summary;
  }

  const lists = stateRow.todo_lists ?? [];
  if (!lists.length) {
    summary.errors.push("No todo lists — open the app once to seed defaults.");
    return summary;
  }

  const newTodos: TodoItem[] = [];
  const newEvents: EventItem[] = [];
  const listNamesSeen = new Set<string>();

  for (const candidate of params.candidates) {
    const { listId, listName } = resolveListId(candidate.listName, lists);
    listNamesSeen.add(listName);

    if (
      candidate.kind === "event" &&
      candidate.dueDate &&
      candidate.dueTime &&
      candidate.durationMinutes
    ) {
      newEvents.push(
        createEvent({
          title: candidate.title,
          category: candidate.category,
          list_id: listId,
          starts_at: toIsoStart(candidate.dueDate, candidate.dueTime),
          duration_minutes: candidate.durationMinutes,
          duration_uncertain: candidate.durationUncertain ?? false,
          tags: candidate.tags,
        }),
      );
      summary.eventsAdded += 1;
    } else {
      newTodos.push(
        createTodo({
          title: candidate.title,
          category: candidate.category,
          list_id: listId,
          due_date: candidate.dueDate,
          due_time: candidate.dueTime,
          tags: candidate.tags,
        }),
      );
      summary.todosAdded += 1;
    }
  }

  const nextTodos = [...newTodos, ...stateRow.todos];
  const nextEvents = [...newEvents, ...(stateRow.events ?? [])];
  const now = new Date().toISOString();

  const { error: writeError } = await sb
    .from("user_state")
    .update({
      todos: nextTodos,
      events: nextEvents,
      updated_at: now,
    })
    .eq("user_id", params.userId);

  if (writeError) {
    summary.errors.push(`Save failed: ${writeError.message}`);
    return summary;
  }

  summary.lists = [...listNamesSeen];
  return summary;
}
