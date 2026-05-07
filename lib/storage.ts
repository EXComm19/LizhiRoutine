import { defaultTemplates, defaultTodoLists } from "@/lib/default-data";
import {
  SCHEMA_VERSION,
  type DayDoc,
  type Period,
  type PeriodBreak,
  type PeriodsDoc,
  type Preferences,
  type PreferencesDoc,
  type RoutineIconName,
  type RoutineTemplate,
  type Task,
  type TemplatesDoc,
  type TodoItem,
  type TodoList,
  type TodoListColor,
  type TodoListsDoc,
  type TodosDoc,
} from "@/lib/schema";

const APP_KEY_PREFIX = "lizhi-routine:";
const DAY_PREFIX = "lizhi-routine:day:";
const TEMPLATES_KEY = "lizhi-routine:templates";
const PREFERENCES_KEY = "lizhi-routine:preferences";
const TODOS_KEY = "lizhi-routine:todos";
const TODO_LISTS_KEY = "lizhi-routine:todo-lists";
const PERIODS_KEY = "lizhi-routine:periods";
const PRESERVED_LOCAL_KEYS = new Set([
  "lizhi-routine:theme",
  "lizhi-routine:pane-widths",
]);

/**
 * Cloud-sync hook. When set, every local write also fires the matching
 * upsert on the cloud writer (fire-and-forget). The writer is registered
 * by `lib/cloud-sync.ts` after a Supabase session is established.
 */
export type CloudWriter = {
  day: (dateKey: string, doc: DayDoc) => void;
  templates: (doc: TemplatesDoc) => void;
  todos: (doc: TodosDoc) => void;
  todoLists: (doc: TodoListsDoc) => void;
  periods: (doc: PeriodsDoc) => void;
  preferences: (doc: PreferencesDoc) => void;
};

let cloudWriter: CloudWriter | null = null;

export function setCloudWriter(writer: CloudWriter | null) {
  cloudWriter = writer;
}

/**
 * Wipe every key written by this app from localStorage, except UI prefs
 * (theme, pane widths) which aren't synced and shouldn't reset on sign-out.
 */
/**
 * Local-only write helpers used by `lib/cloud-sync.ts` when hydrating from
 * the cloud. They never touch the cloud writer (which would loop).
 */
export function writeDayLocal(dateKey: string, doc: DayDoc) {
  writeJson(dayKey(dateKey), doc);
}

export function writeTemplatesLocal(doc: TemplatesDoc) {
  writeJson(TEMPLATES_KEY, doc);
}

export function writeTodosLocal(doc: TodosDoc) {
  writeJson(TODOS_KEY, doc);
}

export function writeTodoListsLocal(doc: TodoListsDoc) {
  writeJson(TODO_LISTS_KEY, doc);
}

export function writePeriodsLocal(doc: PeriodsDoc) {
  writeJson(PERIODS_KEY, doc);
}

export function writePreferencesLocal(doc: PreferencesDoc) {
  writeJson(PREFERENCES_KEY, doc);
}

export function clearAllLocalState() {
  if (!isBrowser()) return;
  const toRemove: string[] = [];
  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (!key.startsWith(APP_KEY_PREFIX)) continue;
    if (PRESERVED_LOCAL_KEYS.has(key)) continue;
    toRemove.push(key);
  }
  for (const key of toRemove) window.localStorage.removeItem(key);
}

const DEFAULT_SLEEP_TARGET_MINUTES = 8 * 60;
const ROUTINE_ICON_NAMES: RoutineIconName[] = [
  "zap",
  "dumbbell",
  "utensils",
  "book",
  "briefcase",
  "laptop",
  "coffee",
  "shower",
  "moon",
];
const PALETTE_COLORS: TodoListColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];

function isBrowser() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function isRoutineIconName(value: unknown): value is RoutineIconName {
  return ROUTINE_ICON_NAMES.includes(value as RoutineIconName);
}

function isTodoListColor(value: unknown): value is TodoListColor {
  return PALETTE_COLORS.includes(value as TodoListColor);
}

function defaultRoutineColor(category: RoutineTemplate["category"]) {
  if (category === "T0") return "blue";
  if (category === "T1") return "emerald";
  return "amber";
}

function inferRoutineIcon(title: string, kind: RoutineTemplate["kind"]) {
  if (kind === "sleep") return "moon";
  const lower = title.toLowerCase();
  if (lower.includes("shower")) return "shower";
  if (lower.includes("fitness") || lower.includes("gym")) return "dumbbell";
  if (lower.includes("meal") || lower.includes("cook")) return "utensils";
  return "zap";
}

function readJson<T>(key: string): T | null {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function dayKey(dateKey: string) {
  return `${DAY_PREFIX}${dateKey}`;
}

function dateKeyFromDayStorageKey(key: string) {
  return key.startsWith(DAY_PREFIX) ? key.slice(DAY_PREFIX.length) : null;
}

function isEnvelope(value: unknown): value is { schema_version: number; data: unknown } {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema_version" in value &&
    "data" in value
  );
}

function migrateTask(task: unknown): Task | null {
  if (typeof task !== "object" || task === null) return null;
  const t = task as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;

  const now = nowIso();
  return {
    id: t.id,
    schema_version: SCHEMA_VERSION,
    title: t.title,
    category: (t.category as Task["category"]) ?? "T1",
    kind: (t.kind as Task["kind"]) ?? "task",
    status: (t.status as Task["status"]) ?? "pending",
    duration_minutes:
      typeof t.duration_minutes === "number" ? t.duration_minutes : 60,
    start_time: typeof t.start_time === "string" ? t.start_time : null,
    locked: Boolean(t.locked),
    source_id:
      typeof t.source_task_id === "string"
        ? t.source_task_id
        : typeof t.source_id === "string"
          ? t.source_id
          : null,
    created_at: typeof t.created_at === "string" ? t.created_at : now,
    updated_at: typeof t.updated_at === "string" ? t.updated_at : now,
  };
}

function migrateTemplate(template: unknown): RoutineTemplate | null {
  if (typeof template !== "object" || template === null) return null;
  const t = template as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;

  const now = nowIso();
  const kind = (t.kind as RoutineTemplate["kind"]) ?? "routine";
  const category = (t.category as RoutineTemplate["category"]) ?? "T1";
  return {
    id: t.id,
    schema_version: SCHEMA_VERSION,
    title: t.title,
    category,
    color: isTodoListColor(t.color)
      ? t.color
      : kind === "sleep"
        ? "violet"
        : defaultRoutineColor(category),
    icon:
      kind !== "sleep" && t.icon === "moon"
        ? "shower"
        : isRoutineIconName(t.icon)
          ? t.icon
          : inferRoutineIcon(t.title, kind),
    kind,
    default_duration_minutes:
      typeof t.default_duration_minutes === "number"
        ? t.default_duration_minutes
        : 60,
    built_in: Boolean(t.built_in) || kind === "sleep",
    created_at: typeof t.created_at === "string" ? t.created_at : now,
    updated_at: typeof t.updated_at === "string" ? t.updated_at : now,
  };
}

function migrateTodo(todo: unknown): TodoItem | null {
  if (typeof todo !== "object" || todo === null) return null;
  const t = todo as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;

  const now = nowIso();
  const tags = Array.isArray(t.tags)
    ? t.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  return {
    id: t.id,
    schema_version: SCHEMA_VERSION,
    title: t.title,
    category: (t.category as TodoItem["category"]) ?? "T1",
    status: (t.status as TodoItem["status"]) ?? "pending",
    due_date: typeof t.due_date === "string" ? t.due_date : null,
    due_time: typeof t.due_time === "string" ? t.due_time : null,
    tags,
    list_id: typeof t.list_id === "string" ? t.list_id : "list-inbox",
    created_at: typeof t.created_at === "string" ? t.created_at : now,
    updated_at: typeof t.updated_at === "string" ? t.updated_at : now,
  };
}

function migrateBreak(value: unknown): PeriodBreak | null {
  if (typeof value !== "object" || value === null) return null;
  const b = value as Record<string, unknown>;
  if (typeof b.start_time !== "string" || typeof b.end_time !== "string") {
    return null;
  }
  return {
    id: typeof b.id === "string" ? b.id : `break-${b.start_time}-${b.end_time}`,
    label: typeof b.label === "string" && b.label.trim() ? b.label : "Break",
    start_time: b.start_time,
    end_time: b.end_time,
  };
}

function migratePeriod(value: unknown): Period | null {
  if (typeof value !== "object" || value === null) return null;
  const p = value as Record<string, unknown>;
  if (
    typeof p.id !== "string" ||
    typeof p.title !== "string" ||
    typeof p.start_date !== "string" ||
    typeof p.end_date !== "string"
  ) {
    return null;
  }

  const now = nowIso();
  const days = Array.isArray(p.days_of_week)
    ? p.days_of_week.filter(
        (day): day is number => typeof day === "number" && day >= 0 && day <= 6,
      )
    : [0, 1, 2, 3, 4, 5, 6];

  const breaks = Array.isArray(p.breaks)
    ? p.breaks
        .map(migrateBreak)
        .filter((value): value is PeriodBreak => value !== null)
    : [];

  return {
    id: p.id,
    schema_version: SCHEMA_VERSION,
    title: p.title,
    kind: (p.kind as Period["kind"]) ?? "custom",
    color: (p.color as Period["color"]) ?? "violet",
    start_date: p.start_date,
    end_date: p.end_date,
    daily_start_time:
      typeof p.daily_start_time === "string" ? p.daily_start_time : null,
    daily_end_time:
      typeof p.daily_end_time === "string" ? p.daily_end_time : null,
    days_of_week: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    breaks,
    notes: typeof p.notes === "string" ? p.notes : "",
    created_at: typeof p.created_at === "string" ? p.created_at : now,
    updated_at: typeof p.updated_at === "string" ? p.updated_at : now,
  };
}

function migrateTodoList(list: unknown): TodoList | null {
  if (typeof list !== "object" || list === null) return null;
  const l = list as Record<string, unknown>;
  if (typeof l.id !== "string" || typeof l.name !== "string") return null;

  const now = nowIso();
  return {
    id: l.id,
    schema_version: SCHEMA_VERSION,
    name: l.name,
    color: (l.color as TodoList["color"]) ?? "blue",
    built_in: Boolean(l.built_in),
    created_at: typeof l.created_at === "string" ? l.created_at : now,
    updated_at: typeof l.updated_at === "string" ? l.updated_at : now,
  };
}

export function loadDay(dateKey: string): Task[] {
  const raw = readJson<unknown>(dayKey(dateKey));
  if (raw === null) return [];

  const list = isEnvelope(raw)
    ? (raw.data as { tasks?: unknown[] })?.tasks ?? []
    : Array.isArray(raw)
      ? raw
      : [];

  // Defensive dedupe by id: protects React from duplicate-key errors if a
  // historical write ever stored two tasks with the same id (e.g. older
  // calendar imports before the import-time dedupe was tightened).
  const seenIds = new Set<string>();
  return list
    .map(migrateTask)
    .filter((task): task is Task => task !== null)
    .filter((task) => {
      if (seenIds.has(task.id)) return false;
      seenIds.add(task.id);
      return true;
    });
}

export function loadAllDays(): Array<{ dateKey: string; tasks: Task[] }> {
  if (!isBrowser()) return [];

  const entries: Array<{ dateKey: string; tasks: Task[] }> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const dateKey = dateKeyFromDayStorageKey(key);
    if (!dateKey) continue;
    entries.push({ dateKey, tasks: loadDay(dateKey) });
  }

  return entries;
}

export function saveDay(dateKey: string, tasks: Task[]) {
  const doc: DayDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { tasks },
  };
  writeJson(dayKey(dateKey), doc);
  cloudWriter?.day(dateKey, doc);
}

function ensureSleepTemplate(templates: RoutineTemplate[]): RoutineTemplate[] {
  if (templates.some((t) => t.kind === "sleep")) return templates;
  const seed = defaultTemplates.find((t) => t.kind === "sleep");
  return seed ? [...templates, seed] : templates;
}

export function loadTemplates(): RoutineTemplate[] {
  const raw = readJson<unknown>(TEMPLATES_KEY);
  if (raw === null) return defaultTemplates;

  const list = isEnvelope(raw)
    ? (raw.data as { templates?: unknown[] })?.templates ?? []
    : Array.isArray(raw)
      ? raw
      : [];

  const templates = list
    .map(migrateTemplate)
    .filter((template): template is RoutineTemplate => template !== null);

  return ensureSleepTemplate(templates);
}

export function saveTemplates(templates: RoutineTemplate[]) {
  const doc: TemplatesDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { templates: ensureSleepTemplate(templates) },
  };
  writeJson(TEMPLATES_KEY, doc);
  cloudWriter?.templates(doc);
}

function ensureDefaultList(lists: TodoList[]): TodoList[] {
  const existing = new Set(lists.map((list) => list.id));
  return [
    ...lists,
    ...defaultTodoLists.filter((list) => !existing.has(list.id)),
  ];
}

export function loadTodoLists(): TodoList[] {
  const raw = readJson<unknown>(TODO_LISTS_KEY);
  if (raw === null) return defaultTodoLists;

  const list = isEnvelope(raw)
    ? (raw.data as { lists?: unknown[] })?.lists ?? []
    : Array.isArray(raw)
      ? raw
      : [];

  const lists = list
    .map(migrateTodoList)
    .filter((todoList): todoList is TodoList => todoList !== null);

  return ensureDefaultList(lists);
}

export function saveTodoLists(lists: TodoList[]) {
  const doc: TodoListsDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { lists: ensureDefaultList(lists) },
  };
  writeJson(TODO_LISTS_KEY, doc);
  cloudWriter?.todoLists(doc);
}

export function loadTodos(): TodoItem[] {
  const raw = readJson<unknown>(TODOS_KEY);
  if (raw === null) return [];

  const list = isEnvelope(raw)
    ? (raw.data as { todos?: unknown[] })?.todos ?? []
    : Array.isArray(raw)
      ? raw
      : [];

  return list
    .map(migrateTodo)
    .filter((todo): todo is TodoItem => todo !== null);
}

export function saveTodos(todos: TodoItem[]) {
  const doc: TodosDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { todos },
  };
  writeJson(TODOS_KEY, doc);
  cloudWriter?.todos(doc);
}

export function loadPreferences(): Preferences {
  const raw = readJson<PreferencesDoc | Preferences>(PREFERENCES_KEY);
  if (raw === null) {
    return {
      schema_version: SCHEMA_VERSION,
      sleep_target_minutes: DEFAULT_SLEEP_TARGET_MINUTES,
      updated_at: nowIso(),
    };
  }

  const data = isEnvelope(raw) ? (raw.data as Preferences) : raw;
  return {
    schema_version: SCHEMA_VERSION,
    sleep_target_minutes:
      typeof data.sleep_target_minutes === "number"
        ? data.sleep_target_minutes
        : DEFAULT_SLEEP_TARGET_MINUTES,
    updated_at: typeof data.updated_at === "string" ? data.updated_at : nowIso(),
  };
}

export function loadPeriods(): Period[] {
  const raw = readJson<unknown>(PERIODS_KEY);
  if (raw === null) return [];

  const list = isEnvelope(raw)
    ? (raw.data as { periods?: unknown[] })?.periods ?? []
    : Array.isArray(raw)
      ? raw
      : [];

  return list
    .map(migratePeriod)
    .filter((period): period is Period => period !== null);
}

export function savePeriods(periods: Period[]) {
  const doc: PeriodsDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { periods },
  };
  writeJson(PERIODS_KEY, doc);
  cloudWriter?.periods(doc);
}

export function savePreferences(prefs: Preferences) {
  const doc: PreferencesDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { ...prefs, schema_version: SCHEMA_VERSION, updated_at: nowIso() },
  };
  writeJson(PREFERENCES_KEY, doc);
  cloudWriter?.preferences(doc);
}
