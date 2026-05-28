// Planner-internal helpers — extracted from routine-planner.tsx to keep the
// main component file focused on UI. Anything pure (no React state, no
// component imports) that operated on planner data lives here.
//
// Grouped by section: date/format, hour labels, sun times, drag, stats /
// visible tasks, commute, todo formatters.

import type { CollisionDetection } from "@dnd-kit/core";
import { pointerWithin, rectIntersection } from "@dnd-kit/core";
import {
  SCHEMA_VERSION,
  type Category,
  type CommuteConfig,
  type CommuteEstimate,
  type CommuteTimeStrategy,
  type DragPayload,
  type EventItem,
  type RoutineTemplate,
  type SleepRecord,
  type Task,
  type TodoItem,
  type TodoList,
  type TodoListColor,
} from "@/lib/schema";
import type { CommuteEstimateResponse } from "@/lib/commute";
import { isCommuteTemplate } from "@/lib/commute";
import { patchTask } from "@/lib/factories";
import { loadAllDays, loadDay, saveDay } from "@/lib/storage";
import {
  DAY_START_HOUR,
  TOTAL_MINUTES,
  addDays,
  dateForTimelineMinutes,
  dateKeysBetween,
  formatDateKey,
  formatDuration,
  formatTimeFromMinutes,
  overlapsTimeline,
  parseDateKey,
  parseHmToMinutes,
  todayKey,
  visibleRange,
  wallTimeToTimelineMinutes,
} from "@/lib/time";
import type {
  CalendarView,
  CurrentTimeMarker,
  DeadlineMarker,
  StatsAccuracyListRow,
  StatsAccuracyPoint,
  StatsCompletionListRow,
  StatsCompletionSummary,
  StatsEstimateAccuracySummary,
  StatsListRow,
  StatsRoutineRow,
  StatsSummary,
  StatsTodoRow,
  SleepStatsRow,
  SleepStatsSummary,
  SunTimes,
  TodoWithMeta,
  VisibleTask,
} from "@/components/planner/types";

// ── Constants ───────────────────────────────────────────────────────────

export const WEATHER_LOCATION = {
  latitude: -33.8688,
  longitude: 151.2093,
  label: "Sydney",
};

export const OPEN_METEO_FORECAST_URL =
  "https://api.open-meteo.com/v1/forecast";

export const ROUTINE_SOURCE_IDS_BACKFILLED_KEY =
  "lizhi-routine:routine-source-ids-backfilled";

export const TODO_LIST_COLOR_PALETTE: TodoListColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];

// ── Date math + formatting ──────────────────────────────────────────────

export function addMonths(dateKey: string, months: number) {
  const date = parseDateKey(dateKey);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);

  // Clamp the day so e.g. Jan 31 + 1 month becomes Feb 28/29 (matches the
  // calendar's "same day-of-month next month" expectation), not Mar 3.
  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return formatDateKey(date);
}

export function startOfWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return formatDateKey(date);
}

export function weekDateKeys(dateKey: string) {
  const start = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

export function monthDateKeys(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setDate(1);
  const gridStart = startOfWeek(formatDateKey(date));
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

export function isSameMonth(dateKey: string, referenceDateKey: string) {
  const date = parseDateKey(dateKey);
  const reference = parseDateKey(referenceDateKey);
  return (
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

export function formatDayNumber(dateKey: string) {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric" }).format(
    parseDateKey(dateKey),
  );
}

export function formatTimelineScaleLabel(minutes: number) {
  const total = DAY_START_HOUR * 60 + minutes;
  const hours = Math.floor(total / 60) % 24;
  const displayHour = hours % 12 || 12;
  return `${displayHour} ${hours < 12 ? "AM" : "PM"}`;
}

export function formatCompactDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

export function formatCalendarTitle(dateKey: string, view: CalendarView) {
  const date = parseDateKey(dateKey);

  if (view === "stats") {
    return "Statistics";
  }

  if (view === "month") {
    return new Intl.DateTimeFormat("en-AU", {
      month: "long",
      year: "numeric",
    }).format(date);
  }

  if (view === "week") {
    const days = weekDateKeys(dateKey);
    return `${formatCompactDate(days[0])} - ${formatCompactDate(days[6])}, ${parseDateKey(days[6]).getFullYear()}`;
  }

  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

// ── Hour label conversion ───────────────────────────────────────────────

export function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function parseHourLabelToWallMinutes(label: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.min(24 * 60, hours * 60 + minutes));
}

export function formatRoundedHourLabel(minutes: number) {
  const rounded = Math.max(0, Math.min(24 * 60, Math.round(minutes / 60) * 60));
  if (rounded === 24 * 60) return "24:00";
  const hours = Math.floor(rounded / 60);
  return `${String(hours).padStart(2, "0")}:00`;
}

export function roundLocalIsoToHourLabel(value: string) {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return formatRoundedHourLabel(Number(match[1]) * 60 + Number(match[2]));
}

export function wallLabelToSameDayTimelineOffset(label: string) {
  const wallMinutes = parseHourLabelToWallMinutes(label);
  if (wallMinutes === null) return 0;
  const dayStartMinutes = DAY_START_HOUR * 60;
  return clampNumber(wallMinutes - dayStartMinutes, 0, TOTAL_MINUTES);
}

export function endTimeToTimelineMinutes(value: string, startMinutes: number) {
  const dayStartMinutes = DAY_START_HOUR * 60;
  const raw = parseHmToMinutes(value);
  const wrapped = raw < dayStartMinutes ? raw + 24 * 60 : raw;
  let offset = wrapped - dayStartMinutes;

  if (offset <= startMinutes) {
    offset += 24 * 60;
  }

  return offset;
}

// ── Sun times ───────────────────────────────────────────────────────────

type OpenMeteoSunResponse = {
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
};

export function sunTimesFromLabels(
  sunriseLabel: string,
  sunsetLabel: string,
  source: SunTimes["source"],
): SunTimes {
  return {
    sunriseLabel,
    sunsetLabel,
    sunriseOffsetMinutes: wallLabelToSameDayTimelineOffset(sunriseLabel),
    sunsetOffsetMinutes: wallLabelToSameDayTimelineOffset(sunsetLabel),
    locationLabel: WEATHER_LOCATION.label,
    source,
  };
}

export function fallbackSunTimes() {
  return sunTimesFromLabels("06:00", "22:00", "fallback");
}

export async function fetchSunTimes(dateKey: string, signal: AbortSignal) {
  const url = new URL(OPEN_METEO_FORECAST_URL);
  url.searchParams.set("latitude", String(WEATHER_LOCATION.latitude));
  url.searchParams.set("longitude", String(WEATHER_LOCATION.longitude));
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("start_date", dateKey);
  url.searchParams.set("end_date", dateKey);

  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Unable to load sunrise and sunset");
  }

  const data = (await response.json()) as OpenMeteoSunResponse;
  const sunriseLabel = data.daily?.sunrise?.[0]
    ? roundLocalIsoToHourLabel(data.daily.sunrise[0])
    : null;
  const sunsetLabel = data.daily?.sunset?.[0]
    ? roundLocalIsoToHourLabel(data.daily.sunset[0])
    : null;

  if (!sunriseLabel || !sunsetLabel) {
    throw new Error("Sunrise or sunset missing from weather response");
  }

  return sunTimesFromLabels(sunriseLabel, sunsetLabel, "open-meteo");
}

// ── Drag + current-time markers ─────────────────────────────────────────

export const timelineCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;
  return rectIntersection(args);
};

export function isDragPayload(value: unknown): value is DragPayload {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return ["task", "template", "placed-task"].includes(
    String((value as { type: unknown }).type),
  );
}

export function hasPointerCoordinates(
  event: Event,
): event is Event & { clientX: number; clientY: number } {
  return "clientX" in event && "clientY" in event;
}

export function ownerDateKey(startTime: string) {
  const date = new Date(startTime);
  if (date.getHours() < DAY_START_HOUR) {
    date.setDate(date.getDate() - 1);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function currentTimeMarkerForDate(
  dateKey: string,
  now: Date,
): CurrentTimeMarker | null {
  if (ownerDateKey(now.toISOString()) !== dateKey) return null;

  const wallMinutes =
    now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
  const dayStartMinutes = DAY_START_HOUR * 60;
  const topMinutes =
    wallMinutes < dayStartMinutes
      ? wallMinutes + 24 * 60 - dayStartMinutes
      : wallMinutes - dayStartMinutes;

  if (topMinutes < 0 || topMinutes > TOTAL_MINUTES) return null;

  return {
    topMinutes,
    label: `${String(now.getHours()).padStart(2, "0")}:${String(
      now.getMinutes(),
    ).padStart(2, "0")}`,
  };
}

// ── Deadline markers + visible tasks ────────────────────────────────────

export function deadlineMarkersForDate(
  dateKey: string,
  todos: TodoItem[],
): DeadlineMarker[] {
  const stackCounts = new Map<number, number>();

  return todos
    .filter(
      (todo) =>
        todo.status !== "completed" &&
        todo.due_date === dateKey,
    )
    .map((todo) => {
      const hasExplicitTime = Boolean(todo.due_time);
      const timeLabel = todo.due_time ?? "24:00";
      const topMinutes = wallTimeToTimelineMinutes(timeLabel);

      return {
        id: `deadline:${todo.id}`,
        todoId: todo.id,
        title: todo.title,
        category: todo.category,
        dateKey,
        topMinutes,
        timeLabel,
        hasExplicitTime,
        stackIndex: 0,
      };
    })
    .sort((a, b) => a.topMinutes - b.topMinutes || a.title.localeCompare(b.title))
    .map((marker) => {
      const stackIndex = stackCounts.get(marker.topMinutes) ?? 0;
      stackCounts.set(marker.topMinutes, stackIndex + 1);
      return { ...marker, stackIndex };
    });
}

/**
 * Convert a stored Event into the shape of a Task so the timeline can render
 * it without changing the rest of the pipeline. Synthetic id (`event:<id>`)
 * keeps it distinguishable; `locked: true` blocks drag/resize.
 *
 * These synthetic tasks never get persisted into day storage — they're a
 * pure render-time projection. The single source of truth stays the
 * EventItem entity.
 */
function eventToSyntheticTask(event: EventItem): Task {
  return {
    id: `event:${event.id}`,
    schema_version: SCHEMA_VERSION,
    title: event.title,
    category: event.category,
    kind: "calendar",
    status: "pending",
    duration_minutes: event.duration_minutes,
    start_time: event.starts_at,
    locked: true,
    source_id: event.id,
    commute_config: null,
    commute_estimate: null,
    created_at: event.created_at,
    updated_at: event.updated_at,
  };
}

/**
 * Convert an imported SleepRecord into the shape of a sleep Task so the
 * timeline renders it via the same pipeline as planned sleep blocks.
 * Synthetic id (`sleep-record:<id>`) lets renderers + delete handlers
 * tell it apart. `locked: true` blocks drag/resize; the planner adds a
 * separate ✕ affordance for deleting imported records.
 *
 * The title bakes in the duration and source so users can read it
 * directly on the block: e.g., "Sleep · 7h32m · Pillow".
 */
function sleepRecordToSyntheticTask(record: SleepRecord): Task {
  const totalMin = record.duration_minutes;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  const durLabel = m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}m`;
  const source = record.source || "Apple Health";
  return {
    id: `sleep-record:${record.id}`,
    schema_version: SCHEMA_VERSION,
    title: `Sleep · ${durLabel} · ${source}`,
    category: "T0",
    kind: "sleep",
    status: "pending",
    duration_minutes: totalMin,
    start_time: record.started_at,
    locked: true,
    source_id: record.id,
    commute_config: null,
    commute_estimate: null,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };
}

export function visibleTasksForDate(
  dateKey: string,
  tasksForDay: Task[],
  previousDayTasks: Task[],
  todoById: Map<string, TodoItem>,
  todoListById: Map<string, TodoList>,
  templateById: Map<string, RoutineTemplate>,
  /**
   * Events that might project into this day. Caller can pass all events
   * (we filter by cancelled status here); the overlap check inside toVisible
   * handles the date filtering.
   */
  events: EventItem[] = [],
  /**
   * Imported sleep records (Apple Health / Pillow / etc). Each becomes a
   * synthetic sleep Task on the timeline, REPLACING any same-night
   * planned sleep block whose window overlaps it. Planned blocks that
   * don't overlap (e.g. an afternoon nap plan vs only night actual data)
   * coexist with their respective actual blocks.
   */
  sleepRecords: SleepRecord[] = [],
) {
  // Event lookup so synthetic Task projections can grab back their original
  // EventItem (for the duration_uncertain flag → bottom-fade visual).
  const eventById = new Map(events.map((event) => [event.id, event]));
  const sleepRecordById = new Map(
    sleepRecords.map((record) => [record.id, record]),
  );

  const toVisible = (task: Task, storageDateKey: string): VisibleTask | null => {
    if (!overlapsTimeline(task.start_time, task.duration_minutes, dateKey)) {
      return null;
    }

    const range = visibleRange(task.start_time!, task.duration_minutes, dateKey);
    const linkedTodo = task.source_id ? todoById.get(task.source_id) : null;
    const linkedList = linkedTodo ? todoListById.get(linkedTodo.list_id) : null;
    const linkedTemplate =
      task.source_id && (task.kind === "routine" || task.kind === "sleep")
        ? templateById.get(task.source_id)
        : null;
    // For synthetic event-projected blocks, look up the source EventItem
    // and surface duration_uncertain to the renderer. Identified by the
    // "event:" id prefix set in eventToSyntheticTask above.
    const linkedEvent =
      task.kind === "calendar" && task.id.startsWith("event:") && task.source_id
        ? eventById.get(task.source_id)
        : null;
    const linkedSleepRecord =
      task.kind === "sleep" &&
      task.id.startsWith("sleep-record:") &&
      task.source_id
        ? sleepRecordById.get(task.source_id)
        : null;
    return {
      ...task,
      title: linkedTodo?.title ?? task.title,
      category: linkedTodo?.category ?? task.category,
      displayColor: linkedList?.color ?? linkedTemplate?.color,
      displayIcon: linkedTemplate?.icon,
      displayListName: linkedList?.name,
      commuteEnabled:
        Boolean(linkedTemplate && isCommuteTemplate(linkedTemplate)) ||
        Boolean(task.commute_config) ||
        Boolean(task.commute_estimate),
      storageDateKey,
      topMinutes: range.topMinutes,
      visibleDurationMinutes: range.durationMinutes,
      continuesBefore: range.continuesBefore,
      continuesAfter: range.continuesAfter,
      displayDurationUncertain: linkedEvent?.duration_uncertain ?? false,
      displayIsEvent: linkedEvent !== null,
      displayIsActualSleep: linkedSleepRecord !== null,
    };
  };

  // Build synthetic actual-sleep tasks first so we can use their absolute
  // time windows to filter out same-night planned sleep blocks.
  const syntheticSleepTasks = sleepRecords.map(sleepRecordToSyntheticTask);

  // Absolute [startMs, endMs] window for each actual sleep block.
  const actualSleepWindows = syntheticSleepTasks
    .map((task) => {
      const startMs = task.start_time ? Date.parse(task.start_time) : NaN;
      if (!Number.isFinite(startMs)) return null;
      return { startMs, endMs: startMs + task.duration_minutes * 60_000 };
    })
    .filter((window): window is { startMs: number; endMs: number } =>
      window !== null,
    );

  // A planned sleep task is "same-night" with an actual session when their
  // time windows overlap by any amount. Afternoon naps that don't overlap
  // a night session stay visible alongside whatever actual data exists.
  const isReplacedByActualSleep = (task: Task): boolean => {
    if (task.kind !== "sleep") return false;
    if (task.id.startsWith("sleep-record:")) return false; // already synthetic
    if (!task.start_time) return false;
    const startMs = Date.parse(task.start_time);
    if (!Number.isFinite(startMs)) return false;
    const endMs = startMs + task.duration_minutes * 60_000;
    return actualSleepWindows.some(
      (w) => Math.max(startMs, w.startMs) < Math.min(endMs, w.endMs),
    );
  };

  // Project events into the same pipeline as their synthetic Task form.
  // Cancelled events drop here so they never reach the timeline at all.
  const syntheticEventTasks = events
    .filter((event) => event.status !== "cancelled")
    .map(eventToSyntheticTask);

  // Dedupe by id BEFORE toVisible: between selectedDate changes and the
  // queueMicrotask hydration completing, a stale `currentTasks` /
  // `previousTasks` cache can route the same stored task into both
  // `previousDayTasks` and `tasksForDay` for the same cell, which would
  // produce duplicate React keys when the cell renders. previousDayTasks
  // comes first so it wins on collision (the "earlier owner" semantics).
  const filteredPrevious = previousDayTasks.filter(
    (task) => !isReplacedByActualSleep(task),
  );
  const filteredCurrent = tasksForDay.filter(
    (task) => !isReplacedByActualSleep(task),
  );

  const seenIds = new Set<string>();
  return [
    ...filteredPrevious,
    ...filteredCurrent,
    ...syntheticEventTasks,
    ...syntheticSleepTasks,
  ]
    .filter((task) => {
      if (seenIds.has(task.id)) return false;
      seenIds.add(task.id);
      return true;
    })
    .map((task) =>
      toVisible(
        task,
        ownerDateKey(task.start_time ?? dateForTimelineMinutes(dateKey, 0)),
      ),
    )
    .filter((task): task is VisibleTask => Boolean(task))
    .sort((a, b) => a.topMinutes - b.topMinutes);
}

// ── Stats + routine backfill ────────────────────────────────────────────

function normalizeStatsKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function routineSourceIdForTask(
  task: Task,
  templates: RoutineTemplate[],
) {
  if (task.source_id || (task.kind !== "routine" && task.kind !== "sleep")) {
    return null;
  }

  if (task.kind === "sleep") {
    return templates.find((template) => template.kind === "sleep")?.id ?? null;
  }

  const normalizedTitle = normalizeStatsKey(task.title);
  const titleMatch = templates.find(
    (template) =>
      template.kind === "routine" &&
      normalizeStatsKey(template.title) === normalizedTitle,
  );
  if (titleMatch) return titleMatch.id;

  const shapeMatch = templates.find(
    (template) =>
      template.kind === "routine" &&
      template.category === task.category &&
      template.default_duration_minutes === task.duration_minutes,
  );

  return shapeMatch?.id ?? null;
}

export function backfillRoutineSourceIds(templates: RoutineTemplate[]) {
  // Skip after the first successful pass — older installs had tasks without
  // source_id, but anything created since the schema bump already has one.
  if (
    typeof window !== "undefined" &&
    window.localStorage.getItem(ROUTINE_SOURCE_IDS_BACKFILLED_KEY) === "1"
  ) {
    return new Set<string>();
  }

  const changedDates = new Set<string>();

  for (const day of loadAllDays()) {
    let changed = false;
    const tasks = day.tasks.map((task) => {
      const sourceId = routineSourceIdForTask(task, templates);
      if (!sourceId) return task;
      changed = true;
      return patchTask(task, { source_id: sourceId });
    });

    if (changed) {
      saveDay(day.dateKey, tasks);
      changedDates.add(day.dateKey);
    }
  }

  if (typeof window !== "undefined") {
    window.localStorage.setItem(ROUTINE_SOURCE_IDS_BACKFILLED_KEY, "1");
  }
  return changedDates;
}

export function buildStatsSummary({
  startDate,
  endDate,
  todos,
  todoLists,
  templates,
}: {
  startDate: string;
  endDate: string;
  todos: TodoItem[];
  todoLists: TodoList[];
  templates: RoutineTemplate[];
}): StatsSummary {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  const templateById = new Map(
    templates.map((template) => [template.id, template]),
  );
  const listById = new Map(todoLists.map((list) => [list.id, list]));
  const routineRows = new Map<string, StatsRoutineRow>();
  const todoRows = new Map<string, StatsTodoRow>();
  const listRows = new Map<string, StatsListRow>();

  for (const dateKey of dateKeysBetween(start, end)) {
    const visible = visibleTasksForDate(
      dateKey,
      loadDay(dateKey),
      loadDay(addDays(dateKey, -1)),
      todoById,
      listById,
      templateById,
    );

    for (const task of visible) {
      if (task.kind === "routine" || task.kind === "sleep") {
        const template = task.source_id
          ? templateById.get(task.source_id)
          : null;
        const rowId =
          task.source_id ?? `unlinked:${task.kind}:${task.title}:${task.category}`;
        const existing = routineRows.get(rowId);
        routineRows.set(rowId, {
          id: rowId,
          title: template?.title ?? task.title,
          category: template?.category ?? task.category,
          kind: task.kind,
          linked: Boolean(template),
          minutes: (existing?.minutes ?? 0) + task.visibleDurationMinutes,
        });
        continue;
      }

      if (task.kind !== "task") continue;

      const todo = task.source_id ? todoById.get(task.source_id) : null;
      const rowId =
        task.source_id ?? `unlinked:todo:${task.title}:${task.category}`;
      const list = todo ? listById.get(todo.list_id) : null;
      const existing = todoRows.get(rowId);
      todoRows.set(rowId, {
        id: rowId,
        title: todo?.title ?? task.title,
        category: todo?.category ?? task.category,
        listName: list?.name ?? "Unlinked",
        linked: Boolean(todo),
        minutes: (existing?.minutes ?? 0) + task.visibleDurationMinutes,
      });

      const listId = list?.id ?? "unlinked";
      const existingList = listRows.get(listId);
      listRows.set(listId, {
        id: listId,
        name: list?.name ?? "Unlinked",
        minutes: (existingList?.minutes ?? 0) + task.visibleDurationMinutes,
      });
    }
  }

  const byMinutesThenTitle = <
    T extends { minutes: number; title?: string; name?: string },
  >(
    a: T,
    b: T,
  ) =>
    b.minutes - a.minutes ||
    (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? "");

  const routineList = [...routineRows.values()].sort(byMinutesThenTitle);
  const todoList = [...todoRows.values()].sort(byMinutesThenTitle);
  const listList = [...listRows.values()].sort(byMinutesThenTitle);

  return {
    routineRows: routineList,
    todoRows: todoList,
    listRows: listList,
    routineMinutes: routineList.reduce((total, row) => total + row.minutes, 0),
    todoMinutes: todoList.reduce((total, row) => total + row.minutes, 0),
  };
}

/**
 * Build the "Reminder completion" summary for the stats view.
 *
 * Counts a todo as "completed in range" when its `completed_at` ISO timestamp
 * falls within [startDate, endDate]. Falls back to `updated_at` only when
 * `completed_at` is missing AND the todo is currently completed — this matches
 * the migration in lib/storage.ts so legacy data isn't silently zeroed out.
 *
 * On-time: of completions with a due_date, those whose date-part is ≤ due_date.
 * Overdue: pending todos with due_date strictly before today (range-independent;
 * this is "currently overdue", not "fell overdue in this period").
 */
export function buildCompletionStats({
  startDate,
  endDate,
  todos,
  todoLists,
}: {
  startDate: string;
  endDate: string;
  todos: TodoItem[];
  todoLists: TodoList[];
}): StatsCompletionSummary {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const listById = new Map(todoLists.map((list) => [list.id, list]));

  const byList = new Map<string, StatsCompletionListRow>();
  const byCategory: Record<Category, number> = { T0: 0, T1: 0, T2: 0 };
  const dailyMap = new Map<string, number>();
  for (const dateKey of dateKeysBetween(start, end)) {
    dailyMap.set(dateKey, 0);
  }

  let completedCount = 0;
  let completedWithDueCount = 0;
  let onTimeCount = 0;

  for (const todo of todos) {
    if (todo.status !== "completed") continue;

    const stamp = todo.completed_at ?? todo.updated_at;
    if (!stamp) continue;
    // Strip the time portion so a 23:59-local completion still bins into the
    // right calendar day. Date.parse handles both ISO with offset and naive.
    const stampDate = new Date(stamp);
    if (Number.isNaN(stampDate.getTime())) continue;
    const stampDateKey = formatDateKey(stampDate);
    if (stampDateKey < start || stampDateKey > end) continue;

    completedCount += 1;
    byCategory[todo.category] += 1;
    dailyMap.set(stampDateKey, (dailyMap.get(stampDateKey) ?? 0) + 1);

    const list = listById.get(todo.list_id);
    if (list) {
      const row = byList.get(list.id);
      byList.set(list.id, {
        id: list.id,
        name: list.name,
        color: list.color,
        completed: (row?.completed ?? 0) + 1,
      });
    } else {
      const row = byList.get("unlinked");
      byList.set("unlinked", {
        id: "unlinked",
        name: "Unlinked",
        color: "zinc",
        completed: (row?.completed ?? 0) + 1,
      });
    }

    if (todo.due_date) {
      completedWithDueCount += 1;
      if (stampDateKey <= todo.due_date) onTimeCount += 1;
    }
  }

  const today = todayKey();
  let overdueCount = 0;
  for (const todo of todos) {
    if (todo.status === "completed") continue;
    if (!todo.due_date) continue;
    if (todo.due_date < today) overdueCount += 1;
  }

  const byListSorted = [...byList.values()].sort(
    (a, b) => b.completed - a.completed || a.name.localeCompare(b.name),
  );

  const daily = [...dailyMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, count]) => ({ dateKey, count }));

  return {
    completedCount,
    completedWithDueCount,
    onTimeCount,
    overdueCount,
    byList: byListSorted,
    byCategory,
    daily,
  };
}

/**
 * Pure median helper — sorts a copy, picks the middle (avg of two when even).
 * Returns null on empty input to keep the caller's "no data" branch obvious.
 */
function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Estimate-accuracy summary for the stats view.
 *
 * Pulls every completed todo whose:
 *   - completed_at is in [startDate, endDate]
 *   - estimate_snapshot is set (a real prediction was standing at completion)
 *   - actual_minutes > 0 (we have an actual to compare against)
 *
 * Then aggregates:
 *   - Median actual/estimated ratio (the headline calibration number)
 *   - MAPE (mean absolute percentage error) for accuracy magnitude
 *   - Signed mean error so the user can see if they systematically over- or
 *     under-estimate (positive = the estimate was too low)
 *   - Range coverage: of the points whose snapshot included optimistic AND
 *     pessimistic bounds, fraction whose actual fell inside the range
 *   - Per-list breakdown (median ratio + sample count)
 *
 * Returns null-ish fields (medianRatio = null etc.) when there's no data,
 * so the UI can render an empty state instead of misleading zeros.
 */
export function buildEstimateAccuracyStats({
  startDate,
  endDate,
  todos,
  todoLists,
}: {
  startDate: string;
  endDate: string;
  todos: TodoItem[];
  todoLists: TodoList[];
}): StatsEstimateAccuracySummary {
  const start = startDate <= endDate ? startDate : endDate;
  const end = startDate <= endDate ? endDate : startDate;
  const listById = new Map(todoLists.map((list) => [list.id, list]));

  const points: StatsAccuracyPoint[] = [];

  for (const todo of todos) {
    if (todo.status !== "completed") continue;
    if (!todo.estimate_snapshot) continue;
    if (todo.actual_minutes == null || todo.actual_minutes <= 0) continue;

    const stamp = todo.completed_at ?? todo.updated_at;
    if (!stamp) continue;
    const stampDate = new Date(stamp);
    if (Number.isNaN(stampDate.getTime())) continue;
    const stampDateKey = formatDateKey(stampDate);
    if (stampDateKey < start || stampDateKey > end) continue;

    const estimated = Math.max(1, todo.estimate_snapshot.minutes);
    const actual = todo.actual_minutes;
    const ratio = actual / estimated;

    // Range coverage from the LIVE estimate's optimistic/pessimistic bounds.
    // (Phase-1 snapshot only froze `minutes`; the wider range stays on the
    // live estimate field. Falls back to null if no range exists.)
    let withinRange: boolean | null = null;
    const opt = todo.estimate?.minutes_optimistic;
    const pes = todo.estimate?.minutes_pessimistic;
    if (typeof opt === "number" && typeof pes === "number") {
      withinRange = actual >= opt && actual <= pes;
    }

    const list = listById.get(todo.list_id);
    points.push({
      id: todo.id,
      title: todo.title,
      listName: list?.name ?? "Unlinked",
      category: todo.category,
      estimatedMinutes: estimated,
      actualMinutes: actual,
      ratio,
      withinRange,
      completedAt: stamp,
    });
  }

  if (!points.length) {
    return {
      points: [],
      medianRatio: null,
      mapePct: null,
      meanSignedErrorMinutes: null,
      rangeCoverage: null,
      byList: [],
    };
  }

  const medianRatio = median(points.map((p) => p.ratio));
  const mapePct =
    points.reduce(
      (sum, p) => sum + Math.abs(p.actualMinutes - p.estimatedMinutes) / p.actualMinutes,
      0,
    ) /
    points.length *
    100;
  const meanSignedErrorMinutes =
    points.reduce((sum, p) => sum + (p.actualMinutes - p.estimatedMinutes), 0) /
    points.length;

  const withRange = points.filter((p) => p.withinRange !== null);
  const rangeCoverage = withRange.length
    ? {
        withRange: withRange.length,
        withinRange: withRange.filter((p) => p.withinRange).length,
      }
    : null;

  // Per-list aggregation: median ratio, only emit lists with ≥1 sample.
  const grouped = new Map<string, StatsAccuracyPoint[]>();
  for (const p of points) {
    const todo = todos.find((t) => t.id === p.id);
    const listId = todo?.list_id ?? "unlinked";
    const arr = grouped.get(listId);
    if (arr) arr.push(p);
    else grouped.set(listId, [p]);
  }
  const byList: StatsAccuracyListRow[] = [];
  for (const [listId, items] of grouped) {
    const list = listById.get(listId);
    const ratios = items.map((i) => i.ratio);
    byList.push({
      id: listId,
      name: list?.name ?? "Unlinked",
      color: list?.color ?? "zinc",
      samples: items.length,
      medianRatio: median(ratios) ?? 1,
    });
  }
  byList.sort((a, b) => b.samples - a.samples || a.name.localeCompare(b.name));

  return {
    points,
    medianRatio,
    mapePct,
    meanSignedErrorMinutes,
    rangeCoverage,
    byList,
  };
}

// ── Commute ─────────────────────────────────────────────────────────────

export async function estimateCommute(
  config: CommuteConfig,
): Promise<CommuteEstimate> {
  const response = await fetch("/api/commute-estimate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: config.origin,
      destination: config.destination,
      mode: config.mode,
      buffer_minutes: config.buffer_minutes,
      provider: config.provider,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | (Partial<CommuteEstimateResponse> & { error?: string })
    | null;
  if (!response.ok || !payload?.estimate) {
    throw new Error(payload?.error || "Unable to estimate commute.");
  }

  return payload.estimate;
}

export function commuteConfigFromEstimate(
  estimate: CommuteEstimate,
  timeStrategy: CommuteTimeStrategy = "depart_at_start",
): CommuteConfig {
  return {
    origin: estimate.origin,
    destination: estimate.destination,
    mode: estimate.mode,
    buffer_minutes: estimate.buffer_minutes,
    time_strategy: timeStrategy,
    provider: estimate.provider,
  };
}

export function commuteEstimateMatchesConfig(
  estimate: CommuteEstimate | null,
  config: CommuteConfig | null,
) {
  if (!estimate || !config) return false;
  return (
    estimate.origin === config.origin &&
    estimate.destination === config.destination &&
    estimate.mode === config.mode &&
    estimate.buffer_minutes === config.buffer_minutes &&
    estimate.provider === config.provider
  );
}

// ── Todo formatters ─────────────────────────────────────────────────────

export function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function listNameKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function colorForImportedList(name: string): TodoListColor {
  const total = Array.from(name).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return TODO_LIST_COLOR_PALETTE[total % TODO_LIST_COLOR_PALETTE.length];
}

export function formatTodoDue(todo: TodoItem) {
  if (!todo.due_date && !todo.due_time) return null;
  let date = "Any day";

  if (todo.due_date) {
    const daysLeft = Math.round(
      (parseDateKey(todo.due_date).getTime() -
        parseDateKey(todayKey()).getTime()) /
        86400000,
    );

    if (daysLeft >= 0 && daysLeft <= 7) {
      date =
        daysLeft === 0
          ? "today"
          : daysLeft === 1
            ? "tomorrow"
            : `in ${daysLeft} days`;
    } else {
      date = new Intl.DateTimeFormat("en-AU", {
        month: "short",
        day: "numeric",
      }).format(parseDateKey(todo.due_date));
    }
  }

  return todo.due_time ? `${date} at ${todo.due_time}` : date;
}

export function daysUntilTodoDue(todo: TodoItem) {
  if (!todo.due_date) return null;
  return Math.round(
    (parseDateKey(todo.due_date).getTime() - parseDateKey(todayKey()).getTime()) /
      86400000,
  );
}

export function todoDueUrgencyTokens(todo: TodoItem) {
  if (todo.status === "completed") return null;
  const daysLeft = daysUntilTodoDue(todo);
  if (daysLeft === null || daysLeft > 7) return null;

  if (daysLeft <= 0) {
    return {
      card: "",
      pill: "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/30",
    };
  }

  if (daysLeft === 1) {
    return {
      card: "",
      pill: "bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-500/30",
    };
  }

  if (daysLeft <= 3) {
    return {
      card: "",
      pill: "bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/30",
    };
  }

  return {
    card: "",
    pill: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-100 dark:ring-yellow-500/25",
  };
}

/**
 * How urgent an upcoming event is, on the same red→amber→yellow scale used
 * for task deadlines. Closer events get hotter pills. Returns null when the
 * event is more than a week out (no styling — keeps the list calm) OR when
 * the event has already started (callers usually filter those out).
 *
 * Granularity is finer than tasks because events have an actual clock time:
 * "2 hours away" is meaningfully different from "today, evening".
 */
export function eventUrgencyTokens(event: EventItem, now: Date = new Date()) {
  const start = new Date(event.starts_at);
  if (Number.isNaN(start.getTime())) return null;
  const minutesUntil = (start.getTime() - now.getTime()) / 60_000;
  if (minutesUntil < 0) return null; // already started
  if (minutesUntil > 7 * 24 * 60) return null; // > a week out

  // < 1 hour: red
  if (minutesUntil <= 60) {
    return {
      pill: "bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-200 dark:ring-rose-500/30",
    };
  }
  // < 4 hours: orange
  if (minutesUntil <= 4 * 60) {
    return {
      pill: "bg-orange-100 text-orange-700 ring-1 ring-orange-200 dark:bg-orange-500/20 dark:text-orange-200 dark:ring-orange-500/30",
    };
  }
  // Today (< 24h): amber
  if (minutesUntil <= 24 * 60) {
    return {
      pill: "bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/30",
    };
  }
  // Within 3 days: yellow
  if (minutesUntil <= 3 * 24 * 60) {
    return {
      pill: "bg-yellow-100 text-yellow-800 ring-1 ring-yellow-200 dark:bg-yellow-500/20 dark:text-yellow-100 dark:ring-yellow-500/25",
    };
  }
  // 3-7 days: no pill (keeps the list quiet for distant events).
  return null;
}

export function todoDueSortKey(todo: TodoItem) {
  if (!todo.due_date && !todo.due_time) return "9999-12-31T99:99";
  return `${todo.due_date ?? "9999-12-31"}T${todo.due_time ?? "24:00"}`;
}

export function compareTodosByDueDate(a: TodoWithMeta, b: TodoWithMeta) {
  const dueSort = todoDueSortKey(a).localeCompare(todoDueSortKey(b));
  if (dueSort !== 0) return dueSort;
  const createdSort = a.created_at.localeCompare(b.created_at);
  if (createdSort !== 0) return createdSort;
  return a.title.localeCompare(b.title);
}

export function todoHoverTitle(task: TodoWithMeta) {
  const lines = [
    task.title,
    `${task.category} · ${task.list.name}`,
    `Status: ${task.status === "completed" ? "completed" : "pending"}`,
  ];
  const due = formatTodoDue(task);
  if (due) lines.push(`Deadline: ${due}`);
  if (task.tags.length > 0) lines.push(`Tags: ${task.tags.join(", ")}`);
  return lines.join("\n");
}

export function deadlineHoverTitle(marker: DeadlineMarker) {
  return [
    marker.title,
    `${marker.category} · deadline`,
    `Time: ${marker.timeLabel}${marker.hasExplicitTime ? "" : " (no time set)"}`,
  ].join("\n");
}

export function monthTaskHoverTitle(task: VisibleTask) {
  const lines = [
    task.title,
    `${task.category} · ${task.kind}`,
    `Time: ${formatTimeFromMinutes(task.topMinutes)} - ${formatTimeFromMinutes(
      task.topMinutes + task.visibleDurationMinutes,
    )}`,
    `Duration: ${formatDuration(task.duration_minutes)}`,
  ];
  if (task.displayListName) lines.push(`List: ${task.displayListName}`);
  if (task.status === "completed") lines.push("Status: completed");
  if (task.continuesBefore || task.continuesAfter) {
    lines.push("Continues across day boundary");
  }
  return lines.join("\n");
}

// ── Imported sleep records ─────────────────────────────────────────────

/**
 * The visible slice of one imported sleep session for the day timeline at
 * `dateKey`. Sleep sessions cross midnight and (since the timeline starts
 * at DAY_START_HOUR not 00:00) also cross the timeline boundary at 5am —
 * so the same SleepRecord can produce a block on two consecutive days.
 *
 * `continuesBefore` / `continuesAfter` lets renderers strip the rounded
 * top/bottom corner on the cut side, matching how cross-day task blocks
 * already render.
 */
export type VisibleSleepBlock = {
  id: string;
  /** Minutes from the top of the day timeline (DAY_START_HOUR). */
  topMinutes: number;
  /** Height in minutes — clipped to the visible portion. */
  visibleDurationMinutes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  /** Full session duration regardless of clipping — for tooltips. */
  totalDurationMinutes: number;
  startedAt: string;
  endedAt: string;
  source: string;
};

/**
 * Compute the slices of imported sleep records that intersect a given
 * day's timeline window. Pure; safe to call inside a useMemo.
 *
 * The day timeline for `dateKey` covers
 *   [dateKey 05:00 (local), nextDay 05:00 (local))
 * because DAY_START_HOUR = 5. A session starting at 23:30 on day N renders
 * on day N (clipped to 23:30 → 29:00) AND on day N+1 (clipped to 05:00 →
 * wake time).
 */
export function actualSleepBlocksForDate(
  dateKey: string,
  records: ReadonlyArray<SleepRecord>,
): VisibleSleepBlock[] {
  const dayStart = parseDateKey(dateKey);
  if (!dayStart) return [];
  dayStart.setHours(DAY_START_HOUR, 0, 0, 0);
  const dayStartMs = dayStart.getTime();
  const dayEndMs = dayStartMs + TOTAL_MINUTES * 60_000;

  const blocks: VisibleSleepBlock[] = [];
  for (const record of records) {
    const startMs = Date.parse(record.started_at);
    const endMs = Date.parse(record.ended_at);
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    ) {
      continue;
    }

    const overlapStart = Math.max(startMs, dayStartMs);
    const overlapEnd = Math.min(endMs, dayEndMs);
    if (overlapEnd <= overlapStart) continue;

    const topMinutes = Math.max(
      0,
      Math.round((overlapStart - dayStartMs) / 60_000),
    );
    const visibleDurationMinutes = Math.max(
      1,
      Math.round((overlapEnd - overlapStart) / 60_000),
    );

    blocks.push({
      id: record.id,
      topMinutes,
      visibleDurationMinutes,
      continuesBefore: startMs < dayStartMs,
      continuesAfter: endMs > dayEndMs,
      totalDurationMinutes: record.duration_minutes,
      startedAt: record.started_at,
      endedAt: record.ended_at,
      source: record.source,
    });
  }
  return blocks.sort((a, b) => a.topMinutes - b.topMinutes);
}

export function buildSleepStats({
  startDate,
  endDate,
  sleepRecords,
  sleepTargetMinutes,
}: {
  startDate: string;
  endDate: string;
  sleepRecords: ReadonlyArray<SleepRecord>;
  sleepTargetMinutes: number;
}): SleepStatsSummary {
  const dateKeys = dateKeysBetween(startDate, endDate);
  const byDay = new Map<string, number>();
  for (const dateKey of dateKeys) byDay.set(dateKey, 0);

  for (const record of sleepRecords) {
    const endMs = Date.parse(record.ended_at);
    if (!Number.isFinite(endMs)) continue;
    const wakeDateKey = formatDateKey(new Date(endMs));
    if (!byDay.has(wakeDateKey)) continue; // outside range
    byDay.set(wakeDateKey, (byDay.get(wakeDateKey) ?? 0) + record.duration_minutes);
  }

  const daily: SleepStatsRow[] = dateKeys.map((dateKey) => ({
    dateKey,
    minutes: byDay.get(dateKey) ?? 0,
  }));

  const withData = daily.filter((row) => row.minutes > 0);
  const daysWithData = withData.length;

  let averageMinutes: number | null = null;
  let medianMinutes: number | null = null;
  if (withData.length) {
    const total = withData.reduce((sum, row) => sum + row.minutes, 0);
    averageMinutes = Math.round(total / withData.length);
    const sorted = withData.map((row) => row.minutes).sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    medianMinutes =
      sorted.length % 2 === 0
        ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
        : sorted[mid];
  }

  // Threshold for "deficit" — 80% of target. Using a hard cutoff rather
  // than "below target by N minutes" keeps the metric stable when the user
  // adjusts their target.
  const deficitThreshold = Math.round(sleepTargetMinutes * 0.8);
  const daysBelowTargetCount = withData.filter(
    (row) => row.minutes < deficitThreshold,
  ).length;

  return {
    daily,
    averageMinutes,
    medianMinutes,
    daysWithData,
    daysBelowTargetCount,
  };
}

// Suppress unused-warning for Category import (referenced by exported types
// via inference). Direct re-export keeps the type accessible to consumers
// that want to import everything planner-related from this file.
export type { Category };
