import { defaultTemplates, defaultTodoLists } from "@/lib/default-data";
import { createTodo } from "@/lib/factories";
import { guessLifeArea, isLifeArea } from "@/lib/life-area";
import { todayKey } from "@/lib/time";
import {
  SCHEMA_VERSION,
  type BlockKind,
  type Category,
  type CommuteConfig,
  type CommuteEstimate,
  type CommuteMode,
  type CommuteProvider,
  type CommuteTimeStrategy,
  type DayDoc,
  type Period,
  type PeriodBreak,
  type PeriodKind,
  type PeriodsDoc,
  type Preferences,
  type PreferencesDoc,
  type RoutineIconName,
  type RoutineTemplate,
  type Task,
  type TaskStatus,
  type TemplatesDoc,
  type EventItem,
  type EventsDoc,
  type EventStatus,
  type EventType,
  type SleepRecord,
  type SleepRecordsDoc,
  type RecurringReminder,
  type RecurringRemindersDoc,
  type TodoContextDoc,
  type TodoEstimate,
  type TodoEstimateSnapshot,
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
const EVENTS_KEY = "lizhi-routine:events";
const SLEEP_RECORDS_KEY = "lizhi-routine:sleep-records";
const RECURRING_REMINDERS_KEY = "lizhi-routine:recurring-reminders";
/**
 * localStorage keys that survive clearAllLocalState() — used when we pull
 * a fresh snapshot from the cloud or sign out and want to reset user data
 * without losing device-local preferences and bookkeeping.
 *
 * Includes:
 *  - UI preferences that are intentionally per-device (theme, pane widths,
 *    sort order, hide-done toggle)
 *  - The sync marker (lizhi-routine:last-synced-user-id). Without this the
 *    very act of pulling from cloud would erase the "we've reconciled"
 *    flag, causing the *next* refresh to re-enter syncOnSignIn and pop the
 *    conflict dialog even though nothing changed on either side.
 */
const PRESERVED_LOCAL_KEYS = new Set([
  "lizhi-routine:theme",
  "lizhi-routine:pane-widths",
  "lizhi-routine:calendar-todo-sort",
  "lizhi-routine:calendar-events-height",
  "lizhi-routine:hide-done-reminders",
  "lizhi-routine:timeline-zoom",
  "lizhi-routine:last-synced-user-id",
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
  events: (doc: EventsDoc) => void;
  sleepRecords: (doc: SleepRecordsDoc) => void;
  recurringReminders: (doc: RecurringRemindersDoc) => void;
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
  invalidateAllDaysCache();
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

/**
 * True when the user has any state in localStorage beyond the seeded
 * defaults. Used by sign-in flow to decide between auto-pull-from-cloud and
 * prompting the user to pick a side.
 *
 * "User data" = at least one scheduled day, any saved todos/periods, or
 * templates/todo-lists with anything beyond the default seeds.
 */
export function localHasUserData(): boolean {
  if (!isBrowser()) return false;

  for (let i = 0; i < window.localStorage.length; i += 1) {
    const key = window.localStorage.key(i);
    if (!key) continue;
    if (key.startsWith(DAY_PREFIX)) return true;
  }
  if (window.localStorage.getItem(TODOS_KEY)) {
    const todos = loadTodos();
    if (todos.length > 0) return true;
  }
  if (window.localStorage.getItem(PERIODS_KEY)) {
    const periods = loadPeriods();
    if (periods.length > 0) return true;
  }
  if (window.localStorage.getItem(EVENTS_KEY)) {
    const events = loadEvents();
    if (events.length > 0) return true;
  }
  if (window.localStorage.getItem(SLEEP_RECORDS_KEY)) {
    const records = loadSleepRecords();
    if (records.length > 0) return true;
  }
  if (window.localStorage.getItem(RECURRING_REMINDERS_KEY)) {
    const reminders = loadRecurringReminders();
    if (reminders.length > 0) return true;
  }
  if (window.localStorage.getItem(TEMPLATES_KEY)) {
    const templates = loadTemplates();
    const defaultIds = new Set(defaultTemplates.map((t) => t.id));
    if (templates.some((t) => !defaultIds.has(t.id))) return true;
  }
  if (window.localStorage.getItem(TODO_LISTS_KEY)) {
    const lists = loadTodoLists();
    const defaultIds = new Set(defaultTodoLists.map((l) => l.id));
    if (lists.some((list) => !defaultIds.has(list.id))) return true;
  }
  return false;
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
  invalidateAllDaysCache();
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
const COMMUTE_MODES: CommuteMode[] = [
  "driving",
  "driving-traffic",
  "walking",
  "cycling",
];
const COMMUTE_PROVIDERS: CommuteProvider[] = ["mapbox"];
const COMMUTE_TIME_STRATEGIES: CommuteTimeStrategy[] = [
  "depart_at_start",
  "arrive_by_end",
];
const CATEGORY_VALUES: Category[] = ["T0", "T1", "T2"];
const TASK_STATUS_VALUES: TaskStatus[] = ["pending", "completed"];
const BLOCK_KIND_VALUES: BlockKind[] = ["task", "routine", "calendar", "sleep"];
const PERIOD_KIND_VALUES: PeriodKind[] = [
  "placement",
  "work",
  "internship",
  "holiday",
  "study",
  "custom",
];
const ROUTINE_TEMPLATE_KIND_VALUES: RoutineTemplate["kind"][] = [
  "routine",
  "sleep",
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

function isCommuteMode(value: unknown): value is CommuteMode {
  return COMMUTE_MODES.includes(value as CommuteMode);
}

function isCommuteProvider(value: unknown): value is CommuteProvider {
  return COMMUTE_PROVIDERS.includes(value as CommuteProvider);
}

function isCommuteTimeStrategy(value: unknown): value is CommuteTimeStrategy {
  return COMMUTE_TIME_STRATEGIES.includes(value as CommuteTimeStrategy);
}

function isCategory(value: unknown): value is Category {
  return CATEGORY_VALUES.includes(value as Category);
}

function isTaskStatus(value: unknown): value is TaskStatus {
  return TASK_STATUS_VALUES.includes(value as TaskStatus);
}

function isBlockKind(value: unknown): value is BlockKind {
  return BLOCK_KIND_VALUES.includes(value as BlockKind);
}

function isPeriodKind(value: unknown): value is PeriodKind {
  return PERIOD_KIND_VALUES.includes(value as PeriodKind);
}

function isRoutineTemplateKind(
  value: unknown,
): value is RoutineTemplate["kind"] {
  return ROUTINE_TEMPLATE_KIND_VALUES.includes(value as RoutineTemplate["kind"]);
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

function migrateCommuteConfig(value: unknown): CommuteConfig | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (typeof c.origin !== "string" || typeof c.destination !== "string") {
    return null;
  }
  const origin = c.origin.trim();
  const destination = c.destination.trim();
  if (!origin || !destination) return null;

  return {
    origin,
    destination,
    mode: isCommuteMode(c.mode) ? c.mode : "driving-traffic",
    buffer_minutes:
      typeof c.buffer_minutes === "number"
        ? Math.max(0, Math.min(240, Math.round(c.buffer_minutes)))
        : 0,
    time_strategy: isCommuteTimeStrategy(c.time_strategy)
      ? c.time_strategy
      : typeof c.target_arrival_time === "string"
        ? "arrive_by_end"
        : "depart_at_start",
    provider: isCommuteProvider(c.provider) ? c.provider : "mapbox",
  };
}

function migrateCommuteEstimate(value: unknown): CommuteEstimate | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (
    typeof e.origin !== "string" ||
    typeof e.destination !== "string" ||
    typeof e.travel_duration_minutes !== "number" ||
    typeof e.duration_minutes !== "number"
  ) {
    return null;
  }

  return {
    provider: isCommuteProvider(e.provider) ? e.provider : "mapbox",
    origin: e.origin,
    destination: e.destination,
    mode: isCommuteMode(e.mode) ? e.mode : "driving-traffic",
    travel_duration_minutes: Math.max(1, Math.round(e.travel_duration_minutes)),
    buffer_minutes:
      typeof e.buffer_minutes === "number"
        ? Math.max(0, Math.round(e.buffer_minutes))
        : 0,
    duration_minutes: Math.max(1, Math.round(e.duration_minutes)),
    distance_meters:
      typeof e.distance_meters === "number" ? Math.max(0, e.distance_meters) : 0,
    calculated_at:
      typeof e.calculated_at === "string" ? e.calculated_at : nowIso(),
  };
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
    category: isCategory(t.category) ? t.category : "T1",
    kind: isBlockKind(t.kind) ? t.kind : "task",
    status: isTaskStatus(t.status) ? t.status : "pending",
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
    commute_config: migrateCommuteConfig(t.commute_config),
    commute_estimate: migrateCommuteEstimate(t.commute_estimate),
    ...(isLifeArea(t.life_area) ? { life_area: t.life_area } : {}),
    ...(isImportBatch(t.import_batch)
      ? { import_batch: t.import_batch }
      : {}),
    created_at: typeof t.created_at === "string" ? t.created_at : now,
    updated_at: typeof t.updated_at === "string" ? t.updated_at : now,
  };
}

function isImportBatch(
  value: unknown,
): value is { id: string; label: string; importedAt: string } {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  return (
    typeof b.id === "string" &&
    typeof b.label === "string" &&
    typeof b.importedAt === "string"
  );
}

function migrateTemplate(template: unknown): RoutineTemplate | null {
  if (typeof template !== "object" || template === null) return null;
  const t = template as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;

  const now = nowIso();
  const kind: RoutineTemplate["kind"] = isRoutineTemplateKind(t.kind)
    ? t.kind
    : "routine";
  const category: Category = isCategory(t.category) ? t.category : "T1";
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
    life_area:
      kind === "sleep"
        ? "sleep"
        : isLifeArea(t.life_area)
          ? t.life_area
          : guessLifeArea(t.title),
    commute_enabled:
      Boolean(t.commute_enabled) || Boolean(migrateCommuteConfig(t.commute_config)),
    commute_config: migrateCommuteConfig(t.commute_config),
    built_in: Boolean(t.built_in) || kind === "sleep",
    created_at: typeof t.created_at === "string" ? t.created_at : now,
    updated_at: typeof t.updated_at === "string" ? t.updated_at : now,
  };
}

function migrateContextDoc(value: unknown): TodoContextDoc | null {
  if (typeof value !== "object" || value === null) return null;
  const d = value as Record<string, unknown>;
  if (
    typeof d.id !== "string" ||
    typeof d.name !== "string" ||
    typeof d.text !== "string"
  ) {
    return null;
  }
  const text = d.text;
  return {
    id: d.id,
    name: d.name,
    mime: typeof d.mime === "string" ? d.mime : "text/plain",
    size_bytes:
      typeof d.size_bytes === "number" && Number.isFinite(d.size_bytes)
        ? d.size_bytes
        : 0,
    text,
    text_chars:
      typeof d.text_chars === "number" && Number.isFinite(d.text_chars)
        ? d.text_chars
        : text.length,
    source_url: typeof d.source_url === "string" ? d.source_url : null,
    added_at: typeof d.added_at === "string" ? d.added_at : nowIso(),
  };
}

function migrateEstimate(value: unknown): TodoEstimate | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (typeof e.minutes !== "number" || !Number.isFinite(e.minutes)) return null;
  const source = e.source === "manual" ? "manual" : "ai";

  // Phase-2A optional fields — read defensively, drop anything malformed.
  const subtasks = Array.isArray(e.subtasks)
    ? e.subtasks
        .map((item) => {
          if (typeof item !== "object" || item === null) return null;
          const s = item as Record<string, unknown>;
          if (typeof s.name !== "string") return null;
          if (typeof s.minutes !== "number" || !Number.isFinite(s.minutes)) {
            return null;
          }
          return {
            name: s.name.slice(0, 200),
            minutes: Math.max(0, Math.round(s.minutes)),
          };
        })
        .filter((s): s is { name: string; minutes: number } => s !== null)
    : undefined;

  const factors = Array.isArray(e.factors)
    ? e.factors
        .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
        .map((f) => f.trim().slice(0, 120))
    : undefined;

  const confidence =
    e.confidence === "low" || e.confidence === "medium" || e.confidence === "high"
      ? e.confidence
      : undefined;

  const clampMinutes = (raw: unknown): number | undefined => {
    if (typeof raw !== "number" || !Number.isFinite(raw)) return undefined;
    return Math.max(0, Math.round(raw));
  };

  return {
    minutes: Math.max(0, Math.round(e.minutes)),
    source,
    notes: typeof e.notes === "string" ? e.notes : null,
    computed_at: typeof e.computed_at === "string" ? e.computed_at : nowIso(),
    minutes_optimistic: clampMinutes(e.minutes_optimistic),
    minutes_pessimistic: clampMinutes(e.minutes_pessimistic),
    subtasks,
    factors,
    confidence,
  };
}

function migrateEstimateSnapshot(value: unknown): TodoEstimateSnapshot | null {
  if (typeof value !== "object" || value === null) return null;
  const s = value as Record<string, unknown>;
  if (typeof s.minutes !== "number" || !Number.isFinite(s.minutes)) return null;
  const source = s.source === "manual" ? "manual" : "ai";
  return {
    minutes: Math.max(0, Math.round(s.minutes)),
    source,
    snapshotted_at:
      typeof s.snapshotted_at === "string" ? s.snapshotted_at : nowIso(),
  };
}

function migrateActualMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.round(value);
}

function migrateTodo(todo: unknown): TodoItem | null {
  if (typeof todo !== "object" || todo === null) return null;
  const t = todo as Record<string, unknown>;
  if (typeof t.id !== "string" || typeof t.title !== "string") return null;

  const now = nowIso();
  const tags = Array.isArray(t.tags)
    ? t.tags.filter((tag): tag is string => typeof tag === "string")
    : [];

  const status = isTaskStatus(t.status) ? t.status : "pending";
  // For older records without completed_at, fall back to updated_at when the
  // todo is already completed — gives the auto-hide-after-N-days check a
  // sensible starting point rather than treating ancient items as fresh.
  let completedAt: string | null = null;
  if (typeof t.completed_at === "string") {
    completedAt = t.completed_at;
  } else if (status === "completed") {
    completedAt = typeof t.updated_at === "string" ? t.updated_at : now;
  }

  const contextDocs = Array.isArray(t.context_docs)
    ? t.context_docs
        .map(migrateContextDoc)
        .filter((doc): doc is TodoContextDoc => doc !== null)
    : [];

  const estimate = migrateEstimate(t.estimate);
  let estimateSnapshot = migrateEstimateSnapshot(t.estimate_snapshot);
  // Backfill heuristic: an old completed todo that has an estimate but no
  // snapshot was completed before this feature existed. Treat the standing
  // estimate as if it had been the prediction at the time of completion —
  // gives accuracy stats some day-one data to chew on. Re-estimating later
  // will preserve this snapshot (only flipping the status flips the field).
  if (!estimateSnapshot && status === "completed" && estimate) {
    estimateSnapshot = {
      minutes: estimate.minutes,
      source: estimate.source,
      snapshotted_at: completedAt ?? now,
    };
  }

  return {
    id: t.id,
    schema_version: SCHEMA_VERSION,
    title: t.title,
    category: isCategory(t.category) ? t.category : "T1",
    status,
    due_date: typeof t.due_date === "string" ? t.due_date : null,
    due_time: typeof t.due_time === "string" ? t.due_time : null,
    tags,
    list_id: typeof t.list_id === "string" ? t.list_id : "list-inbox",
    completed_at: completedAt,
    context_docs: contextDocs,
    user_insight:
      typeof t.user_insight === "string" && t.user_insight.trim().length > 0
        ? t.user_insight.slice(0, 2000)
        : null,
    estimate,
    estimate_snapshot: estimateSnapshot,
    actual_minutes: migrateActualMinutes(t.actual_minutes),
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
    kind: isPeriodKind(p.kind) ? p.kind : "custom",
    color: isTodoListColor(p.color) ? p.color : "violet",
    start_date: p.start_date,
    end_date: p.end_date,
    daily_start_time:
      typeof p.daily_start_time === "string" ? p.daily_start_time : null,
    daily_end_time:
      typeof p.daily_end_time === "string" ? p.daily_end_time : null,
    days_of_week: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    breaks,
    notes: typeof p.notes === "string" ? p.notes : "",
    life_area: isLifeArea(p.life_area)
      ? p.life_area
      : guessLifeArea(p.title),
    created_at: typeof p.created_at === "string" ? p.created_at : now,
    updated_at: typeof p.updated_at === "string" ? p.updated_at : now,
  };
}

function isEventStatus(value: unknown): value is EventStatus {
  return value === "scheduled" || value === "cancelled";
}

const EVENT_TYPE_VALUES: ReadonlyArray<EventType> = [
  "general",
  "medical",
  "work",
  "academic",
  "social",
  "personal",
];

function isEventType(value: unknown): value is EventType {
  return EVENT_TYPE_VALUES.includes(value as EventType);
}

function migrateEvent(value: unknown): EventItem | null {
  if (typeof value !== "object" || value === null) return null;
  const e = value as Record<string, unknown>;
  if (
    typeof e.id !== "string" ||
    typeof e.title !== "string" ||
    typeof e.starts_at !== "string" ||
    typeof e.duration_minutes !== "number" ||
    !Number.isFinite(e.duration_minutes)
  ) {
    return null;
  }
  const now = nowIso();
  const tags = Array.isArray(e.tags)
    ? e.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
  const contextDocs = Array.isArray(e.context_docs)
    ? e.context_docs
        .map(migrateContextDoc)
        .filter((doc): doc is TodoContextDoc => doc !== null)
    : [];
  return {
    id: e.id,
    schema_version: SCHEMA_VERSION,
    title: e.title,
    category: isCategory(e.category) ? e.category : "T1",
    list_id: typeof e.list_id === "string" ? e.list_id : "list-inbox",
    tags,
    starts_at: e.starts_at,
    duration_minutes: Math.max(5, Math.round(e.duration_minutes)),
    duration_uncertain: e.duration_uncertain === true,
    event_type: isEventType(e.event_type)
      ? e.event_type
      : guessLifeArea(typeof e.title === "string" ? e.title : ""),
    notes:
      typeof e.notes === "string" && e.notes.trim()
        ? e.notes.trim().slice(0, 2000)
        : null,
    context_docs: contextDocs,
    status: isEventStatus(e.status) ? e.status : "scheduled",
    created_at: typeof e.created_at === "string" ? e.created_at : now,
    updated_at: typeof e.updated_at === "string" ? e.updated_at : now,
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
    color: isTodoListColor(l.color) ? l.color : "blue",
    life_area: isLifeArea(l.life_area)
      ? l.life_area
      : guessLifeArea(l.name),
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

// loadAllDays() is called from React memos that re-fire on every save (via
// the `dataRevision` cache-bust counter), so a naive implementation scans
// the entire localStorage every time. We keep a process-local cache and
// invalidate it from every writer that touches a day.
let allDaysCache: Array<{ dateKey: string; tasks: Task[] }> | null = null;

function invalidateAllDaysCache() {
  allDaysCache = null;
}

export function loadAllDays(): Array<{ dateKey: string; tasks: Task[] }> {
  if (!isBrowser()) return [];
  if (allDaysCache) return allDaysCache;

  const entries: Array<{ dateKey: string; tasks: Task[] }> = [];
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index);
    if (!key) continue;
    const dateKey = dateKeyFromDayStorageKey(key);
    if (!dateKey) continue;
    entries.push({ dateKey, tasks: loadDay(dateKey) });
  }

  allDaysCache = entries;
  return entries;
}

export function saveDay(dateKey: string, tasks: Task[]) {
  const doc: DayDoc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { tasks },
  };
  writeJson(dayKey(dateKey), doc);
  invalidateAllDaysCache();
  cloudWriter?.day(dateKey, doc);
}

function ensureSleepTemplate(templates: RoutineTemplate[]): RoutineTemplate[] {
  if (templates.some((t) => t.kind === "sleep")) return templates;
  const seed = defaultTemplates.find((t) => t.kind === "sleep");
  return seed ? [...templates, seed] : templates;
}

function ensureDefaultList(lists: TodoList[]): TodoList[] {
  const existing = new Set(lists.map((list) => list.id));
  return [
    ...lists,
    ...defaultTodoLists.filter((list) => !existing.has(list.id)),
  ];
}

/**
 * Generic load for an envelope-wrapped array, e.g.
 * `{ schema_version, updated_at, data: { templates: [...] } }`.
 * Also accepts a bare array (older builds wrote that shape).
 */
function loadArrayEnvelope<TItem>({
  key,
  field,
  migrate,
  defaults,
  ensure,
}: {
  key: string;
  field: string;
  migrate: (raw: unknown) => TItem | null;
  defaults: TItem[];
  ensure?: (items: TItem[]) => TItem[];
}): TItem[] {
  const raw = readJson<unknown>(key);
  if (raw === null) return ensure ? ensure(defaults) : defaults;

  const inner = isEnvelope(raw)
    ? (raw.data as Record<string, unknown>)?.[field] ?? []
    : raw;
  const arr = Array.isArray(inner) ? inner : [];
  const migrated = arr
    .map(migrate)
    .filter((item): item is TItem => item !== null);
  return ensure ? ensure(migrated) : migrated;
}

/**
 * Generic save for an envelope-wrapped array. The caller provides a
 * pre-bound `cloudWrite` closure so the latest `cloudWriter` is captured
 * at call time (it can be (re)set during the app's lifetime).
 */
function saveArrayEnvelope<TItem, TDoc>({
  key,
  field,
  items,
  ensure,
  cloudWrite,
}: {
  key: string;
  field: string;
  items: TItem[];
  ensure?: (items: TItem[]) => TItem[];
  cloudWrite: (doc: TDoc) => void;
}): TDoc {
  const finalItems = ensure ? ensure(items) : items;
  const doc = {
    schema_version: SCHEMA_VERSION,
    updated_at: nowIso(),
    data: { [field]: finalItems },
  } as unknown as TDoc;
  writeJson(key, doc);
  cloudWrite(doc);
  return doc;
}

export function loadTemplates(): RoutineTemplate[] {
  return loadArrayEnvelope({
    key: TEMPLATES_KEY,
    field: "templates",
    migrate: migrateTemplate,
    defaults: defaultTemplates,
    ensure: ensureSleepTemplate,
  });
}

export function saveTemplates(templates: RoutineTemplate[]) {
  saveArrayEnvelope<RoutineTemplate, TemplatesDoc>({
    key: TEMPLATES_KEY,
    field: "templates",
    items: templates,
    ensure: ensureSleepTemplate,
    cloudWrite: (doc) => cloudWriter?.templates(doc),
  });
}

export function loadTodoLists(): TodoList[] {
  return loadArrayEnvelope({
    key: TODO_LISTS_KEY,
    field: "lists",
    migrate: migrateTodoList,
    defaults: defaultTodoLists,
    ensure: ensureDefaultList,
  });
}

export function saveTodoLists(lists: TodoList[]) {
  saveArrayEnvelope<TodoList, TodoListsDoc>({
    key: TODO_LISTS_KEY,
    field: "lists",
    items: lists,
    ensure: ensureDefaultList,
    cloudWrite: (doc) => cloudWriter?.todoLists(doc),
  });
}

export function loadTodos(): TodoItem[] {
  return loadArrayEnvelope({
    key: TODOS_KEY,
    field: "todos",
    migrate: migrateTodo,
    defaults: [],
  });
}

export function saveTodos(todos: TodoItem[]) {
  saveArrayEnvelope<TodoItem, TodosDoc>({
    key: TODOS_KEY,
    field: "todos",
    items: todos,
    cloudWrite: (doc) => cloudWriter?.todos(doc),
  });
}

function migrateAutoHideDays(value: unknown): number | null {
  // null = feature off, 0 = hide immediately, any positive integer = days.
  // Reject negative numbers / non-finite values so a corrupt store can't
  // produce a filter that drops everything.
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.floor(value);
}

function migrateTimeOfDay(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return null;
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : null;
}

function migrateLeadMinutes(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return Math.min(24 * 60, Math.floor(value));
}

export function loadPreferences(): Preferences {
  const raw = readJson<PreferencesDoc | Preferences>(PREFERENCES_KEY);
  if (raw === null) {
    return {
      schema_version: SCHEMA_VERSION,
      sleep_target_minutes: DEFAULT_SLEEP_TARGET_MINUTES,
      auto_hide_completed_days: null,
      daily_agenda_time: null,
      event_reminder_lead_minutes: null,
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
    auto_hide_completed_days: migrateAutoHideDays(
      (data as Partial<Preferences>).auto_hide_completed_days,
    ),
    daily_agenda_time: migrateTimeOfDay(
      (data as Partial<Preferences>).daily_agenda_time,
    ),
    event_reminder_lead_minutes: migrateLeadMinutes(
      (data as Partial<Preferences>).event_reminder_lead_minutes,
    ),
    updated_at: typeof data.updated_at === "string" ? data.updated_at : nowIso(),
  };
}

export function loadPeriods(): Period[] {
  return loadArrayEnvelope({
    key: PERIODS_KEY,
    field: "periods",
    migrate: migratePeriod,
    defaults: [],
  });
}

export function savePeriods(periods: Period[]) {
  saveArrayEnvelope<Period, PeriodsDoc>({
    key: PERIODS_KEY,
    field: "periods",
    items: periods,
    cloudWrite: (doc) => cloudWriter?.periods(doc),
  });
}

export function loadEvents(): EventItem[] {
  return loadArrayEnvelope({
    key: EVENTS_KEY,
    field: "events",
    migrate: migrateEvent,
    defaults: [],
  });
}

export function saveEvents(events: EventItem[]) {
  saveArrayEnvelope<EventItem, EventsDoc>({
    key: EVENTS_KEY,
    field: "events",
    items: events,
    cloudWrite: (doc) => cloudWriter?.events(doc),
  });
}

/**
 * In-memory mirror for the loadEvents / saveEvents pair so callers (planner
 * memoes, timeline rendering, stats builders) can read after a save without
 * round-tripping JSON parse. Updated only when we write or hydrate; the
 * cloud writer doesn't touch it because cloud-only changes come through
 * applyCloudSnapshotLocally → writeEventsLocal → invalidate.
 */
export function writeEventsLocal(doc: EventsDoc) {
  writeJson(EVENTS_KEY, doc);
}

function migrateSleepRecord(value: unknown): SleepRecord | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.started_at !== "string" ||
    typeof r.ended_at !== "string" ||
    typeof r.source_uid !== "string" ||
    !r.source_uid
  ) {
    return null;
  }
  const startMs = Date.parse(r.started_at);
  const endMs = Date.parse(r.ended_at);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
  // Recompute duration defensively — some sources report values that
  // disagree with the ISO span (e.g. only counting "asleep" not "in bed").
  // Either is fine; what matters is consistency with what we render.
  const minutesFromSpan = Math.max(0, Math.round((endMs - startMs) / 60_000));
  const declared =
    typeof r.duration_minutes === "number" && Number.isFinite(r.duration_minutes)
      ? Math.max(0, Math.round(r.duration_minutes))
      : null;
  const duration = declared ?? minutesFromSpan;
  const now = nowIso();
  return {
    id: r.id,
    schema_version: SCHEMA_VERSION,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_minutes: duration,
    source: typeof r.source === "string" && r.source ? r.source : "unknown",
    source_uid: r.source_uid,
    created_at: typeof r.created_at === "string" ? r.created_at : now,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : now,
  };
}

export function loadSleepRecords(): SleepRecord[] {
  return loadArrayEnvelope({
    key: SLEEP_RECORDS_KEY,
    field: "records",
    migrate: migrateSleepRecord,
    defaults: [],
  });
}

export function saveSleepRecords(records: SleepRecord[]) {
  saveArrayEnvelope<SleepRecord, SleepRecordsDoc>({
    key: SLEEP_RECORDS_KEY,
    field: "records",
    items: records,
    cloudWrite: (doc) => cloudWriter?.sleepRecords(doc),
  });
}

export function writeSleepRecordsLocal(doc: SleepRecordsDoc) {
  writeJson(SLEEP_RECORDS_KEY, doc);
}

function migrateRecurringReminder(value: unknown): RecurringReminder | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  if (
    typeof r.id !== "string" ||
    typeof r.title !== "string" ||
    typeof r.time !== "string" ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(r.time)
  ) {
    return null;
  }
  const days = Array.isArray(r.days_of_week)
    ? Array.from(
        new Set(
          r.days_of_week.filter(
            (d): d is number =>
              typeof d === "number" && Number.isInteger(d) && d >= 0 && d <= 6,
          ),
        ),
      ).sort((a, b) => a - b)
    : [];
  const now = nowIso();
  return {
    id: r.id,
    schema_version: SCHEMA_VERSION,
    title: r.title,
    notes:
      typeof r.notes === "string" && r.notes.trim()
        ? r.notes.trim().slice(0, 500)
        : null,
    time: r.time,
    days_of_week: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    enabled: r.enabled !== false,
    last_completed_date:
      typeof r.last_completed_date === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(r.last_completed_date)
        ? r.last_completed_date
        : null,
    current_streak:
      typeof r.current_streak === "number" &&
      Number.isFinite(r.current_streak) &&
      r.current_streak >= 0
        ? Math.floor(r.current_streak)
        : 0,
    longest_streak:
      typeof r.longest_streak === "number" &&
      Number.isFinite(r.longest_streak) &&
      r.longest_streak >= 0
        ? Math.floor(r.longest_streak)
        : 0,
    completion_dates: (() => {
      // Migration path: rows written before this field existed get an
      // empty history (we can't reconstruct what we never recorded). If
      // there's a last_completed_date though, seed with it so the most
      // recent box on the calendar shows lit immediately.
      if (Array.isArray(r.completion_dates)) {
        const cleaned = r.completion_dates
          .filter(
            (d): d is string =>
              typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d),
          )
          .sort();
        // Dedup + cap at last 365 — the visualisation only ever shows
        // 12-26 weeks so older entries are pure cost.
        const deduped = Array.from(new Set(cleaned));
        return deduped.slice(-365);
      }
      if (
        typeof r.last_completed_date === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(r.last_completed_date)
      ) {
        return [r.last_completed_date];
      }
      return [];
    })(),
    created_at: typeof r.created_at === "string" ? r.created_at : now,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : now,
  };
}

export function loadRecurringReminders(): RecurringReminder[] {
  return loadArrayEnvelope({
    key: RECURRING_REMINDERS_KEY,
    field: "reminders",
    migrate: migrateRecurringReminder,
    defaults: [],
  });
}

export function saveRecurringReminders(reminders: RecurringReminder[]) {
  saveArrayEnvelope<RecurringReminder, RecurringRemindersDoc>({
    key: RECURRING_REMINDERS_KEY,
    field: "reminders",
    items: reminders,
    cloudWrite: (doc) => cloudWriter?.recurringReminders(doc),
  });
}

export function writeRecurringRemindersLocal(doc: RecurringRemindersDoc) {
  writeJson(RECURRING_REMINDERS_KEY, doc);
}

// ── One-shot migrations ─────────────────────────────────────────────────

const LEGACY_TODOS_MIGRATED_KEY = "lizhi-routine:legacy-todos-migrated";

/**
 * Older builds stored todos inside the day-tasks JSON as `kind=task` rows
 * without a `start_time` or a `source_id`. Newer builds keep them in the
 * dedicated todos store. This migration moves any stragglers across on the
 * first boot after the schema bump, then flags itself done so it never
 * iterates localStorage again.
 *
 * Safe to call from anywhere on the client; it's idempotent and gated by
 * a localStorage flag.
 */
export function migrateLegacyTodosOnce(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(LEGACY_TODOS_MIGRATED_KEY) === "1") return;

  const days = loadAllDays();
  if (!days.length) {
    window.localStorage.setItem(LEGACY_TODOS_MIGRATED_KEY, "1");
    return;
  }

  let todos = loadTodos();
  const existingTodoIds = new Set(todos.map((todo) => todo.id));
  const newTodos: TodoItem[] = [];
  const updatedDays: Array<{ dateKey: string; tasks: Task[] }> = [];

  for (const day of days) {
    const legacy = day.tasks.filter(
      (task) => task.kind === "task" && !task.start_time && !task.source_id,
    );
    if (!legacy.length) continue;

    for (const task of legacy) {
      if (existingTodoIds.has(task.id)) continue;
      existingTodoIds.add(task.id);
      newTodos.push(
        createTodo({
          id: task.id,
          title: task.title,
          category: task.category,
          status: task.status,
          list_id: "list-inbox",
        }),
      );
    }

    const legacyIds = new Set(legacy.map((task) => task.id));
    updatedDays.push({
      dateKey: day.dateKey,
      tasks: day.tasks.filter((task) => !legacyIds.has(task.id)),
    });
  }

  if (newTodos.length) {
    todos = [...newTodos, ...todos];
    saveTodos(todos);
  }
  for (const entry of updatedDays) {
    saveDay(entry.dateKey, entry.tasks);
  }

  window.localStorage.setItem(LEGACY_TODOS_MIGRATED_KEY, "1");
}

const ESTIMATE_ACTUALS_BACKFILLED_KEY = "lizhi-routine:estimate-actuals-backfilled";

/**
 * One-shot: for every existing completed todo that has an estimate_snapshot
 * but no actual_minutes, fill actual_minutes from past/today scheduled blocks
 * linked to that todo. Mirrors the live "completedMinutesByTodo" logic the
 * planner uses for the progress bar — so users who already had estimates +
 * completions get day-one accuracy data without manual entry.
 *
 * Future completions get actual_minutes set inline by the checkbox handler,
 * so this only ever needs to run once per device. Gated by a localStorage
 * flag.
 */
export function backfillEstimateActualsOnce(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(ESTIMATE_ACTUALS_BACKFILLED_KEY) === "1") {
    return;
  }

  const todos = loadTodos();
  const candidates = todos.filter(
    (todo) =>
      todo.status === "completed" &&
      todo.estimate_snapshot !== null &&
      todo.actual_minutes === null,
  );
  if (!candidates.length) {
    window.localStorage.setItem(ESTIMATE_ACTUALS_BACKFILLED_KEY, "1");
    return;
  }

  const candidateIds = new Set(candidates.map((todo) => todo.id));
  const totals = new Map<string, number>();
  const today = todayKey();
  for (const day of loadAllDays()) {
    if (day.dateKey > today) continue; // future blocks don't count as "done"
    for (const task of day.tasks) {
      if (task.kind !== "task" || !task.source_id) continue;
      if (!candidateIds.has(task.source_id)) continue;
      totals.set(
        task.source_id,
        (totals.get(task.source_id) ?? 0) + task.duration_minutes,
      );
    }
  }

  let dirty = false;
  const updated = todos.map((todo) => {
    if (!candidateIds.has(todo.id)) return todo;
    const minutes = totals.get(todo.id);
    if (!minutes) return todo;
    dirty = true;
    return { ...todo, actual_minutes: minutes };
  });

  if (dirty) saveTodos(updated);
  window.localStorage.setItem(ESTIMATE_ACTUALS_BACKFILLED_KEY, "1");
}

const SLEEP_RECORDS_DEDUPED_KEY = "lizhi-routine:sleep-records-deduped";

/**
 * One-shot: collapse historical sleep records that were stored as
 * separate rows per source / per re-sync. The old ingest keyed on
 * `source|start`, so a single night tracked by Pillow + Apple Watch and
 * re-pushed hourly by HAE piled up into 2-6 rows.
 *
 * Strategy: greedily group records whose [start, end] windows overlap
 * (same night), keep the one with the latest `updated_at` as the
 * winner, drop the rest. Mirrors the latest-arrival-wins rule the
 * ingest route now enforces, applied retroactively. Gated by a flag so
 * it runs once per device.
 */
export function dedupeSleepRecordsOnce(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(SLEEP_RECORDS_DEDUPED_KEY) === "1") return;

  const records = loadSleepRecords();
  if (records.length < 2) {
    window.localStorage.setItem(SLEEP_RECORDS_DEDUPED_KEY, "1");
    return;
  }

  // Sort by start so overlapping records sit next to each other, then
  // sweep into clusters where each record overlaps the running window.
  const sorted = [...records].sort((a, b) =>
    a.started_at.localeCompare(b.started_at),
  );
  const winners: SleepRecord[] = [];
  let cluster: SleepRecord[] = [];
  let clusterEnd = -Infinity;

  const flush = () => {
    if (!cluster.length) return;
    // Latest-updated wins; ties broken by latest created.
    const winner = cluster
      .slice()
      .sort(
        (a, b) =>
          b.updated_at.localeCompare(a.updated_at) ||
          b.created_at.localeCompare(a.created_at),
      )[0];
    winners.push(winner);
    cluster = [];
  };

  for (const record of sorted) {
    const start = Date.parse(record.started_at);
    const end = Date.parse(record.ended_at);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      // Unparseable — keep as its own row, don't risk losing data.
      flush();
      clusterEnd = -Infinity;
      winners.push(record);
      continue;
    }
    if (cluster.length && start < clusterEnd) {
      cluster.push(record);
      clusterEnd = Math.max(clusterEnd, end);
    } else {
      flush();
      cluster = [record];
      clusterEnd = end;
    }
  }
  flush();

  if (winners.length !== records.length) {
    // Re-sort newest-first to match ingest output ordering.
    winners.sort((a, b) =>
      a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
    );
    saveSleepRecords(winners);
  }
  window.localStorage.setItem(SLEEP_RECORDS_DEDUPED_KEY, "1");
}

const LEGACY_CALENDAR_CLEARED_KEY = "lizhi-routine:legacy-calendar-cleared";

/**
 * One-shot: remove ICS-imported calendar blocks that predate the
 * `import_batch` stamp (so they can't be grouped or bulk-managed). The
 * user re-imports their .ics files afterward; the fresh import tags
 * every block with a batch. Gated by a flag so it runs once per device.
 * Only touches `kind: "calendar"` tasks with no `import_batch` — placed
 * tasks, routines, and sleep are left alone.
 */
export function clearLegacyCalendarImportsOnce(): void {
  if (!isBrowser()) return;
  if (window.localStorage.getItem(LEGACY_CALENDAR_CLEARED_KEY) === "1") return;

  for (const { dateKey, tasks } of loadAllDays()) {
    const next = tasks.filter(
      (task) => !(task.kind === "calendar" && !task.import_batch),
    );
    if (next.length !== tasks.length) saveDay(dateKey, next);
  }
  window.localStorage.setItem(LEGACY_CALENDAR_CLEARED_KEY, "1");
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
