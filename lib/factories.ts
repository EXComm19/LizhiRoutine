import {
  SCHEMA_VERSION,
  type Category,
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
  return {
    id: input.id ?? newId("todo"),
    schema_version: SCHEMA_VERSION,
    title: input.title.trim() || "Untitled todo",
    category: input.category,
    status: input.status ?? "pending",
    due_date: input.due_date ?? null,
    due_time: input.due_time ?? null,
    tags: input.tags ?? [],
    list_id: input.list_id,
    created_at: now,
    updated_at: now,
  };
}

export function patchTodo(todo: TodoItem, patch: Partial<TodoItem>): TodoItem {
  return {
    ...todo,
    ...patch,
    id: todo.id,
    schema_version: SCHEMA_VERSION,
    created_at: todo.created_at,
    updated_at: nowIso(),
  };
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
