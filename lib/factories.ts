import {
  SCHEMA_VERSION,
  type Category,
  type CommuteConfig,
  type CommuteEstimate,
  type EventItem,
  type EventStatus,
  type EventType,
  type Period,
  type PeriodBreak,
  type PeriodColor,
  type PeriodKind,
  type RoutineIconName,
  type RoutineTemplate,
  type Task,
  type TodoItem,
  type TodoList,
  type TodoListColor,
} from "@/lib/schema";

function newId(prefix: string) {
  return `${prefix}-${randomId()}`;
}

function randomId() {
  const cryptoApi = globalThis.crypto;

  if (typeof cryptoApi?.randomUUID === "function") {
    return cryptoApi.randomUUID();
  }

  if (typeof cryptoApi?.getRandomValues === "function") {
    const bytes = new Uint8Array(16);
    cryptoApi.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;

    const hex = Array.from(bytes, (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");

    return [
      hex.slice(0, 8),
      hex.slice(8, 12),
      hex.slice(12, 16),
      hex.slice(16, 20),
      hex.slice(20),
    ].join("-");
  }

  return `${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 12)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function defaultRoutineColor(category: Category): TodoListColor {
  if (category === "T0") return "blue";
  if (category === "T1") return "emerald";
  return "amber";
}

export type CreateTaskInput = {
  title: string;
  category: Category;
  duration_minutes: number;
  start_time?: string | null;
  status?: Task["status"];
  kind?: Task["kind"];
  locked?: boolean;
  source_id?: string | null;
  commute_config?: CommuteConfig | null;
  commute_estimate?: CommuteEstimate | null;
  id?: string;
};

export function createTask(input: CreateTaskInput): Task {
  const now = nowIso();
  return {
    id: input.id ?? newId(input.kind === "sleep" ? "sleep" : input.kind ?? "task"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled",
    category: input.category,
    kind: input.kind ?? "task",
    status: input.status ?? "pending",
    duration_minutes: input.duration_minutes,
    start_time: input.start_time ?? null,
    locked: input.locked ?? false,
    source_id: input.source_id ?? null,
    commute_config: input.commute_config ?? null,
    commute_estimate: input.commute_estimate ?? null,
    created_at: now,
    updated_at: now,
  };
}

export function patchTask(task: Task, patch: Partial<Task>): Task {
  return {
    ...task,
    ...patch,
    id: task.id,
    schema_version: SCHEMA_VERSION,
    created_at: task.created_at,
    updated_at: nowIso(),
  };
}

export type CreateTemplateInput = {
  title: string;
  category: Category;
  color?: TodoListColor;
  icon?: RoutineIconName;
  default_duration_minutes: number;
  commute_enabled?: boolean;
  commute_config?: CommuteConfig | null;
  kind?: RoutineTemplate["kind"];
  built_in?: boolean;
  id?: string;
};

export function createTemplate(input: CreateTemplateInput): RoutineTemplate {
  const now = nowIso();
  return {
    id: input.id ?? newId("template"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled routine",
    category: input.category,
    color:
      input.color ??
      (input.kind === "sleep" ? "violet" : defaultRoutineColor(input.category)),
    icon: input.icon ?? (input.kind === "sleep" ? "moon" : "zap"),
    kind: input.kind ?? "routine",
    default_duration_minutes: input.default_duration_minutes,
    commute_enabled: input.commute_enabled ?? Boolean(input.commute_config),
    commute_config: input.commute_config ?? null,
    built_in: input.built_in ?? false,
    created_at: now,
    updated_at: now,
  };
}

export function patchTemplate(
  template: RoutineTemplate,
  patch: Partial<RoutineTemplate>,
): RoutineTemplate {
  return {
    ...template,
    ...patch,
    id: template.id,
    schema_version: SCHEMA_VERSION,
    created_at: template.created_at,
    updated_at: nowIso(),
  };
}

export type CreateTodoInput = {
  title: string;
  category: Category;
  due_date?: string | null;
  due_time?: string | null;
  tags?: string[];
  list_id: string;
  status?: TodoItem["status"];
  id?: string;
};

export function createTodo(input: CreateTodoInput): TodoItem {
  const now = nowIso();
  const status = input.status ?? "pending";
  return {
    id: input.id ?? newId("todo"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled todo",
    category: input.category,
    status,
    due_date: input.due_date ?? null,
    due_time: input.due_time ?? null,
    tags: input.tags ?? [],
    list_id: input.list_id,
    completed_at: status === "completed" ? now : null,
    context_docs: [],
    user_insight: null,
    estimate: null,
    estimate_snapshot: null,
    actual_minutes: null,
    created_at: now,
    updated_at: now,
  };
}

export function patchTodo(todo: TodoItem, patch: Partial<TodoItem>): TodoItem {
  const now = nowIso();
  const merged: TodoItem = {
    ...todo,
    ...patch,
    id: todo.id,
    schema_version: SCHEMA_VERSION,
    created_at: todo.created_at,
    updated_at: now,
  };

  // Auto-manage status-flip side effects so callers don't have to:
  // - pending → completed:
  //     * stamp completed_at (now, unless patch overrides)
  //     * snapshot the current estimate so accuracy stats can later compare
  //       the actual against the *prediction that was standing at completion*
  //       — even if the user re-estimates afterwards.
  //     * actual_minutes comes from the patch (caller passes the auto-derived
  //       value from completedMinutesByTodo); leave null if not provided.
  // - completed → pending: clear the completion-time fields. User is starting
  //   over, the old snapshot/actual no longer represent this attempt.
  // - No transition: leave the snapshot/actual alone unless the patch
  //   explicitly sets them.
  if (patch.status && patch.status !== todo.status) {
    if (patch.status === "completed") {
      merged.completed_at = patch.completed_at ?? now;
      if (patch.estimate_snapshot === undefined) {
        merged.estimate_snapshot = todo.estimate
          ? {
              minutes: todo.estimate.minutes,
              source: todo.estimate.source,
              snapshotted_at: now,
            }
          : null;
      }
      // actual_minutes: prefer patch value; otherwise leave null.
      if (patch.actual_minutes === undefined) {
        merged.actual_minutes = null;
      }
    } else {
      merged.completed_at = null;
      merged.estimate_snapshot = null;
      merged.actual_minutes = null;
    }
  }

  return merged;
}

export type CreateTodoListInput = {
  name: string;
  color: TodoList["color"];
  built_in?: boolean;
  id?: string;
};

export function createTodoList(input: CreateTodoListInput): TodoList {
  const now = nowIso();
  return {
    id: input.id ?? newId("list"),
    schema_version: SCHEMA_VERSION,
    name: input.name.trim() || "List",
    color: input.color,
    built_in: input.built_in ?? false,
    created_at: now,
    updated_at: now,
  };
}

export function patchTodoList(
  list: TodoList,
  patch: Partial<TodoList>,
): TodoList {
  return {
    ...list,
    ...patch,
    id: list.id,
    schema_version: SCHEMA_VERSION,
    created_at: list.created_at,
    updated_at: nowIso(),
  };
}

export type CreatePeriodBreakInput = {
  label?: string;
  start_time: string;
  end_time: string;
  id?: string;
};

export function createPeriodBreak(input: CreatePeriodBreakInput): PeriodBreak {
  return {
    id: input.id ?? newId("break"),
    label: (input.label ?? "Break").trim() || "Break",
    start_time: input.start_time,
    end_time: input.end_time,
  };
}

export type CreatePeriodInput = {
  title: string;
  kind?: PeriodKind;
  color?: PeriodColor;
  start_date: string;
  end_date: string;
  daily_start_time?: string | null;
  daily_end_time?: string | null;
  days_of_week?: number[];
  breaks?: PeriodBreak[];
  notes?: string;
  id?: string;
};

export function createPeriod(input: CreatePeriodInput): Period {
  const now = nowIso();
  return {
    id: input.id ?? newId("period"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled period",
    kind: input.kind ?? "custom",
    color: input.color ?? "violet",
    start_date: input.start_date,
    end_date: input.end_date,
    daily_start_time: input.daily_start_time ?? null,
    daily_end_time: input.daily_end_time ?? null,
    days_of_week: input.days_of_week ?? [0, 1, 2, 3, 4, 5, 6],
    breaks: input.breaks ?? [],
    notes: input.notes ?? "",
    created_at: now,
    updated_at: now,
  };
}

export function patchPeriod(period: Period, patch: Partial<Period>): Period {
  return {
    ...period,
    ...patch,
    id: period.id,
    schema_version: SCHEMA_VERSION,
    created_at: period.created_at,
    updated_at: nowIso(),
  };
}

// ── Event factories ────────────────────────────────────────────────────

export type CreateEventInput = {
  title: string;
  category?: Category;
  list_id: string;
  /** ISO datetime — required, an event without a time is meaningless. */
  starts_at: string;
  duration_minutes: number;
  duration_uncertain?: boolean;
  event_type?: EventType;
  tags?: string[];
  notes?: string | null;
  status?: EventStatus;
  id?: string;
};

export function createEvent(input: CreateEventInput): EventItem {
  const now = nowIso();
  return {
    id: input.id ?? newId("event"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled event",
    category: input.category ?? "T1",
    list_id: input.list_id,
    tags: input.tags ?? [],
    starts_at: input.starts_at,
    duration_minutes: Math.max(5, Math.round(input.duration_minutes)),
    duration_uncertain: input.duration_uncertain ?? false,
    event_type: input.event_type ?? "general",
    notes:
      typeof input.notes === "string" && input.notes.trim()
        ? input.notes.trim().slice(0, 2000)
        : null,
    context_docs: [],
    status: input.status ?? "scheduled",
    created_at: now,
    updated_at: now,
  };
}

export function patchEvent(
  event: EventItem,
  patch: Partial<EventItem>,
): EventItem {
  return {
    ...event,
    ...patch,
    id: event.id,
    schema_version: SCHEMA_VERSION,
    created_at: event.created_at,
    updated_at: nowIso(),
  };
}
