"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import {
  CollisionDetection,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  pointerWithin,
  rectIntersection,
  useDroppable,
  useDraggable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  BookOpen,
  Briefcase,
  CalendarDays,
  CalendarPlus,
  CalendarRange,
  Check,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock,
  Coffee,
  Dumbbell,
  Flame,
  Flag,
  Lock,
  Link,
  Laptop,
  Moon,
  MoveVertical,
  Pencil,
  RotateCcw,
  ShowerHead,
  Sun,
  Trash2,
  Utensils,
  Upload,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { DraggableBlock } from "@/components/draggable-block";
import { parseIcsCalendar } from "@/lib/calendar-import";
import type { ImportedCalendarEvent } from "@/lib/calendar-import";
import type {
  ParsedTodoCandidate,
  ParseTodosResponse,
} from "@/lib/ai-todo-parser";
import type {
  BlockKind,
  Category,
  DragPayload,
  Period,
  RoutineTemplate,
  RoutineIconName,
  Task,
  TodoItem,
  TodoList,
  TodoListColor,
} from "@/lib/schema";
import {
  createTodo,
  createTodoList,
  createTask,
  createTemplate,
  patchPeriod,
  patchTodo,
  patchTodoList,
  patchTask,
  patchTemplate,
} from "@/lib/factories";
import {
  loadAllDays,
  loadDay,
  loadPeriods,
  loadPreferences,
  loadTemplates,
  loadTodoLists,
  loadTodos,
  savePeriods,
  savePreferences,
  saveDay,
  saveTemplates,
  saveTodoLists,
  saveTodos,
} from "@/lib/storage";
import {
  periodActiveOnDate,
  periodHoverDetails,
  periodHoverTitle,
  periodSegmentsForDay,
} from "@/lib/period";
import {
  categoryTokens,
  periodColorTokens,
  routineColorTokens,
  todoListColorTokens,
} from "@/lib/colors";
import {
  EmptyState,
  SectionHeader,
} from "@/components/planner/primitives";
import { PeriodsPanel } from "@/components/planner/PeriodsPanel";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { AccountButton } from "@/components/auth/AccountButton";
import { useAuth } from "@/lib/auth";
import {
  DAY_START_HOUR,
  SNAP_MINUTES,
  TIMELINE_HEIGHT,
  TOTAL_MINUTES,
  addDays,
  dateForTimelineMinutes,
  dateKeysBetween,
  formatDateKey,
  formatDuration,
  formatTimeFromMinutes,
  minutesFromStart,
  minutesToPixels,
  overlapsTimeline,
  parseHmToMinutes,
  wallTimeToTimelineMinutes,
  parseDateKey,
  pixelsToMinutes,
  snapMinutes,
  timelineHours,
  todayKey,
  visibleRange,
} from "@/lib/time";
import { cn } from "@/lib/utils";

const FIRE_TARGET_MINUTES = 6 * 60;
const DEFAULT_ALLOCATION_MINUTES = 30;
const LEFT_RAIL_DEFAULT_WIDTH = 360;
const RIGHT_RAIL_DEFAULT_WIDTH = 360;
const LEFT_RAIL_MIN_WIDTH = 320;
const LEFT_RAIL_MAX_WIDTH = 520;
const RIGHT_RAIL_MIN_WIDTH = 320;
const RIGHT_RAIL_MAX_WIDTH = 500;
const CENTER_MIN_WIDTH = 620;
const PANE_WIDTHS_STORAGE_KEY = "lizhi-routine:pane-widths";
const THEME_STORAGE_KEY = "lizhi-routine:theme";
const CATEGORY_OPTIONS: Category[] = ["T0", "T1", "T2"];
const TODO_LIST_COLORS: TodoListColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];
const CALENDAR_BLOCK_CLASS =
  "border-violet-300 bg-violet-100/90 dark:border-violet-400/45 dark:bg-violet-500/25";
const SLEEP_BLOCK_CLASS =
  "border-purple-950 bg-purple-950 text-white shadow-purple-950/20 hover:border-purple-900 hover:bg-purple-900 dark:border-purple-700 dark:bg-purple-950 dark:text-white dark:hover:bg-purple-900";
const SLEEP_MONTH_BLOCK_CLASS =
  "border border-purple-950 bg-purple-950 text-white dark:border-purple-700 dark:bg-purple-950 dark:text-white";
const BLOCK_EDITOR_INPUT_CLASS =
  "mt-1 h-8 w-full rounded-md border border-zinc-200 bg-white px-2 text-xs text-zinc-900 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 dark:placeholder:text-zinc-500";
const WEATHER_LOCATION = {
  latitude: -33.8688,
  longitude: 151.2093,
  label: "Sydney",
};
const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const newTaskDefaults = {
  title: "New todo",
  category: "T0" as Category,
};
const ROUTINE_COLORS: TodoListColor[] = [
  "blue",
  "emerald",
  "amber",
  "rose",
  "violet",
  "zinc",
];
const ROUTINE_ICON_OPTIONS: Array<{
  value: RoutineIconName;
  label: string;
}> = [
  { value: "zap", label: "Energy" },
  { value: "dumbbell", label: "Fitness" },
  { value: "utensils", label: "Meal" },
  { value: "book", label: "Study" },
  { value: "briefcase", label: "Work" },
  { value: "laptop", label: "Digital" },
  { value: "coffee", label: "Break" },
  { value: "shower", label: "Shower" },
];

const timelineCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) return pointerCollisions;

  return rectIntersection(args);
};

type VisibleTask = Task & {
  storageDateKey: string;
  topMinutes: number;
  visibleDurationMinutes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  displayColor?: TodoListColor;
  displayIcon?: RoutineIconName;
  displayListName?: string;
};

type DeadlineMarker = {
  id: string;
  todoId: string;
  title: string;
  category: Category;
  dateKey: string;
  topMinutes: number;
  timeLabel: string;
  hasExplicitTime: boolean;
  stackIndex: number;
};

type CurrentTimeMarker = {
  topMinutes: number;
  label: string;
};

type LeftRailView = "calendar" | "reminders" | "periods";
type CalendarView = "day" | "week" | "month" | "stats";

type CalendarDay = {
  dateKey: string;
  tasks: VisibleTask[];
  deadlines: DeadlineMarker[];
};

type TodoWithMeta = TodoItem & {
  allocatedMinutes: number;
  list: TodoList;
};

type StatsRoutineRow = {
  id: string;
  title: string;
  category: Category;
  minutes: number;
  kind: Task["kind"];
  linked: boolean;
};

type StatsTodoRow = {
  id: string;
  title: string;
  listName: string;
  category: Category;
  minutes: number;
  linked: boolean;
};

type StatsListRow = {
  id: string;
  name: string;
  minutes: number;
};

type StatsSummary = {
  routineRows: StatsRoutineRow[];
  todoRows: StatsTodoRow[];
  listRows: StatsListRow[];
  routineMinutes: number;
  todoMinutes: number;
};

type SunTimes = {
  sunriseLabel: string;
  sunsetLabel: string;
  sunriseOffsetMinutes: number;
  sunsetOffsetMinutes: number;
  locationLabel: string;
  source: "open-meteo" | "fallback";
};

type OpenMeteoSunResponse = {
  daily?: {
    sunrise?: string[];
    sunset?: string[];
  };
};

function addMonths(dateKey: string, months: number) {
  const date = parseDateKey(dateKey);
  const originalDay = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);

  const lastDay = new Date(
    date.getFullYear(),
    date.getMonth() + 1,
    0,
  ).getDate();
  date.setDate(Math.min(originalDay, lastDay));
  return formatDateKey(date);
}

function startOfWeek(dateKey: string) {
  const date = parseDateKey(dateKey);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + mondayOffset);
  return formatDateKey(date);
}

function weekDateKeys(dateKey: string) {
  const start = startOfWeek(dateKey);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function monthDateKeys(dateKey: string) {
  const date = parseDateKey(dateKey);
  date.setDate(1);
  const gridStart = startOfWeek(formatDateKey(date));
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
}

function isSameMonth(dateKey: string, referenceDateKey: string) {
  const date = parseDateKey(dateKey);
  const reference = parseDateKey(referenceDateKey);
  return (
    date.getMonth() === reference.getMonth() &&
    date.getFullYear() === reference.getFullYear()
  );
}

function formatDayNumber(dateKey: string) {
  return new Intl.DateTimeFormat("en-AU", { day: "numeric" }).format(
    parseDateKey(dateKey),
  );
}

function formatCompactDate(dateKey: string) {
  return new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  }).format(parseDateKey(dateKey));
}

function formatCalendarTitle(dateKey: string, view: CalendarView) {
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

function deadlineMarkersForDate(
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

function parseHourLabelToWallMinutes(label: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(label);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return Math.max(0, Math.min(24 * 60, hours * 60 + minutes));
}

function formatRoundedHourLabel(minutes: number) {
  const rounded = Math.max(0, Math.min(24 * 60, Math.round(minutes / 60) * 60));
  if (rounded === 24 * 60) return "24:00";
  const hours = Math.floor(rounded / 60);
  return `${String(hours).padStart(2, "0")}:00`;
}

function roundLocalIsoToHourLabel(value: string) {
  const match = /T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return formatRoundedHourLabel(Number(match[1]) * 60 + Number(match[2]));
}

function wallLabelToSameDayTimelineOffset(label: string) {
  const wallMinutes = parseHourLabelToWallMinutes(label);
  if (wallMinutes === null) return 0;
  const dayStartMinutes = DAY_START_HOUR * 60;
  return clampNumber(wallMinutes - dayStartMinutes, 0, TOTAL_MINUTES);
}

function sunTimesFromLabels(
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

function fallbackSunTimes() {
  return sunTimesFromLabels("06:00", "22:00", "fallback");
}

async function fetchSunTimes(dateKey: string, signal: AbortSignal) {
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

function visibleTasksForDate(
  dateKey: string,
  tasksForDay: Task[],
  previousDayTasks: Task[],
  todoById: Map<string, TodoItem>,
  todoListById: Map<string, TodoList>,
  templateById: Map<string, RoutineTemplate>,
) {
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
    return {
      ...task,
      title: linkedTodo?.title ?? task.title,
      category: linkedTodo?.category ?? task.category,
      displayColor: linkedList?.color ?? linkedTemplate?.color,
      displayIcon: linkedTemplate?.icon,
      displayListName: linkedList?.name,
      storageDateKey,
      topMinutes: range.topMinutes,
      visibleDurationMinutes: range.durationMinutes,
      continuesBefore: range.continuesBefore,
      continuesAfter: range.continuesAfter,
    };
  };

  // Dedupe by id BEFORE toVisible: between selectedDate changes and the
  // queueMicrotask hydration completing, a stale `currentTasks` /
  // `previousTasks` cache can route the same stored task into both
  // `previousDayTasks` and `tasksForDay` for the same cell, which would
  // produce duplicate React keys when the cell renders. previousDayTasks
  // comes first so it wins on collision (the "earlier owner" semantics).
  const seenIds = new Set<string>();
  return [...previousDayTasks, ...tasksForDay]
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

function normalizeStatsKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function routineSourceIdForTask(task: Task, templates: RoutineTemplate[]) {
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

function backfillRoutineSourceIds(templates: RoutineTemplate[]) {
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

  return changedDates;
}

function buildStatsSummary({
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
  const templateById = new Map(templates.map((template) => [template.id, template]));
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
        const template = task.source_id ? templateById.get(task.source_id) : null;
        const rowId = task.source_id ?? `unlinked:${task.kind}:${task.title}:${task.category}`;
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
      const rowId = task.source_id ?? `unlinked:todo:${task.title}:${task.category}`;
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

  const byMinutesThenTitle = <T extends { minutes: number; title?: string; name?: string }>(
    a: T,
    b: T,
  ) => b.minutes - a.minutes || (a.title ?? a.name ?? "").localeCompare(b.title ?? b.name ?? "");

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

function isDragPayload(value: unknown): value is DragPayload {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  return ["task", "template", "placed-task"].includes(
    String((value as { type: unknown }).type),
  );
}

function hasPointerCoordinates(
  event: Event,
): event is Event & { clientX: number; clientY: number } {
  return "clientX" in event && "clientY" in event;
}

function ownerDateKey(startTime: string) {
  const date = new Date(startTime);
  if (date.getHours() < DAY_START_HOUR) {
    date.setDate(date.getDate() - 1);
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function currentTimeMarkerForDate(dateKey: string, now: Date): CurrentTimeMarker | null {
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

function calendarTaskId(sourceId: string) {
  return `calendar-${sourceId.replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 120)}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function endTimeToTimelineMinutes(value: string, startMinutes: number) {
  const dayStartMinutes = DAY_START_HOUR * 60;
  const raw = parseHmToMinutes(value);
  const wrapped = raw < dayStartMinutes ? raw + 24 * 60 : raw;
  let offset = wrapped - dayStartMinutes;

  if (offset <= startMinutes) {
    offset += 24 * 60;
  }

  return offset;
}

function loadSavedPaneWidths() {
  const fallback = {
    left: LEFT_RAIL_DEFAULT_WIDTH,
    right: RIGHT_RAIL_DEFAULT_WIDTH,
  };

  if (typeof window === "undefined") return fallback;

  const raw = window.localStorage.getItem(PANE_WIDTHS_STORAGE_KEY);
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw) as { left?: unknown; right?: unknown };
    return {
      left:
        typeof parsed.left === "number"
          ? clampNumber(parsed.left, LEFT_RAIL_MIN_WIDTH, LEFT_RAIL_MAX_WIDTH)
          : fallback.left,
      right:
        typeof parsed.right === "number"
          ? clampNumber(parsed.right, RIGHT_RAIL_MIN_WIDTH, RIGHT_RAIL_MAX_WIDTH)
          : fallback.right,
    };
  } catch {
    window.localStorage.removeItem(PANE_WIDTHS_STORAGE_KEY);
    return fallback;
  }
}

function loadSavedTheme() {
  if (typeof window === "undefined") return false;
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function applyTheme(isDarkMode: boolean) {
  if (typeof document === "undefined") return;

  document.documentElement.classList.toggle("dark", isDarkMode);
  document.documentElement.dataset.theme = isDarkMode ? "dark" : "light";
  document.documentElement.style.colorScheme = isDarkMode ? "dark" : "light";

  try {
    window.localStorage.setItem(
      THEME_STORAGE_KEY,
      isDarkMode ? "dark" : "light",
    );
  } catch {
    // Theme still works for the current session if storage is unavailable.
  }
}

export function RoutinePlanner() {
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [calendarView, setCalendarView] = useState<CalendarView>("day");
  const [currentTasks, setCurrentTasks] = useState<Task[]>([]);
  const [previousTasks, setPreviousTasks] = useState<Task[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [templates, setTemplates] = useState<RoutineTemplate[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [sleepTargetMinutes, setSleepTargetMinutes] = useState(8 * 60);
  const [resetArmed, setResetArmed] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  const [calendarImportMessage, setCalendarImportMessage] = useState("");
  const [dataRevision, setDataRevision] = useState(0);
  const [sunTimes, setSunTimes] = useState<SunTimes>(fallbackSunTimes);
  const [now, setNow] = useState(() => new Date());
  const [leftRailWidth, setLeftRailWidth] = useState(
    () => loadSavedPaneWidths().left,
  );
  const [rightRailWidth, setRightRailWidth] = useState(
    () => loadSavedPaneWidths().right,
  );
  const [isDarkMode, setIsDarkMode] = useState(loadSavedTheme);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const auth = useAuth();
  const cloudRevision = auth.dataRevision;
  const dragAnchorOffsetRef = useRef(0);
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: "timeline",
  });

  const previousDate = addDays(selectedDate, -1);

  const setTimelineNode = useCallback(
    (node: HTMLDivElement | null) => {
      timelineRef.current = node;
      setDroppableRef(node);
    },
    [setDroppableRef],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  useEffect(() => {
    applyTheme(isDarkMode);
  }, [isDarkMode]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetchSunTimes(selectedDate, controller.signal)
      .then((nextSunTimes) => setSunTimes(nextSunTimes))
      .catch((error: unknown) => {
        if ((error as { name?: string }).name === "AbortError") return;
        setSunTimes(fallbackSunTimes());
      });

    return () => controller.abort();
  }, [selectedDate]);

  const toggleTheme = useCallback(() => {
    setIsDarkMode((current) => !current);
  }, []);

  const savePaneWidths = useCallback((left: number, right: number) => {
    window.localStorage.setItem(
      PANE_WIDTHS_STORAGE_KEY,
      JSON.stringify({ left, right }),
    );
  }, []);

  // Keyboard adjust: `delta` is in pixels of pointer-direction
  // (positive = handle moves right). The left handle widens the left pane
  // when delta > 0; the right handle narrows the right pane when delta > 0.
  const adjustPane = useCallback(
    (pane: "left" | "right", delta: number) => {
      if (pane === "left") {
        setLeftRailWidth((current) => {
          const next = clampNumber(
            current + delta,
            LEFT_RAIL_MIN_WIDTH,
            LEFT_RAIL_MAX_WIDTH,
          );
          savePaneWidths(next, rightRailWidth);
          return next;
        });
      } else {
        setRightRailWidth((current) => {
          const next = clampNumber(
            current - delta,
            RIGHT_RAIL_MIN_WIDTH,
            RIGHT_RAIL_MAX_WIDTH,
          );
          savePaneWidths(leftRailWidth, next);
          return next;
        });
      }
    },
    [leftRailWidth, rightRailWidth, savePaneWidths],
  );

  const resetPane = useCallback(
    (pane: "left" | "right") => {
      if (pane === "left") {
        setLeftRailWidth(LEFT_RAIL_DEFAULT_WIDTH);
        savePaneWidths(LEFT_RAIL_DEFAULT_WIDTH, rightRailWidth);
      } else {
        setRightRailWidth(RIGHT_RAIL_DEFAULT_WIDTH);
        savePaneWidths(leftRailWidth, RIGHT_RAIL_DEFAULT_WIDTH);
      }
    },
    [leftRailWidth, rightRailWidth, savePaneWidths],
  );

  const beginPaneResize = useCallback(
    (pane: "left" | "right", event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();

      const startX = event.clientX;
      const startLeftWidth = leftRailWidth;
      const startRightWidth = rightRailWidth;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const maxLeft = () =>
        Math.max(
          LEFT_RAIL_MIN_WIDTH,
          Math.min(
            LEFT_RAIL_MAX_WIDTH,
            window.innerWidth - rightRailWidth - CENTER_MIN_WIDTH,
          ),
        );
      const maxRight = () =>
        Math.max(
          RIGHT_RAIL_MIN_WIDTH,
          Math.min(
            RIGHT_RAIL_MAX_WIDTH,
            window.innerWidth - leftRailWidth - CENTER_MIN_WIDTH,
          ),
        );

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (pane === "left") {
          const nextLeft = clampNumber(
            startLeftWidth + pointerEvent.clientX - startX,
            LEFT_RAIL_MIN_WIDTH,
            maxLeft(),
          );
          setLeftRailWidth(nextLeft);
          return;
        }

        const nextRight = clampNumber(
          startRightWidth + startX - pointerEvent.clientX,
          RIGHT_RAIL_MIN_WIDTH,
          maxRight(),
        );
        setRightRailWidth(nextRight);
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        let nextLeft = leftRailWidth;
        let nextRight = rightRailWidth;

        if (pane === "left") {
          nextLeft = clampNumber(
            startLeftWidth + pointerEvent.clientX - startX,
            LEFT_RAIL_MIN_WIDTH,
            maxLeft(),
          );
          setLeftRailWidth(nextLeft);
        } else {
          nextRight = clampNumber(
            startRightWidth + startX - pointerEvent.clientX,
            RIGHT_RAIL_MIN_WIDTH,
            maxRight(),
          );
          setRightRailWidth(nextRight);
        }

        savePaneWidths(nextLeft, nextRight);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [leftRailWidth, rightRailWidth, savePaneWidths],
  );

  useEffect(() => {
    queueMicrotask(() => {
      let loadedCurrentTasks = loadDay(selectedDate);
      let loadedTodos = loadTodos();
      const legacyTodos = loadedCurrentTasks.filter(
        (task) => task.kind === "task" && !task.start_time && !task.source_id,
      );
      if (legacyTodos.length) {
        const existingTodoIds = new Set(loadedTodos.map((todo) => todo.id));
        const migratedTodos = legacyTodos
          .filter((task) => !existingTodoIds.has(task.id))
          .map((task) =>
            createTodo({
              id: task.id,
              title: task.title,
              category: task.category,
              status: task.status,
              list_id: "list-inbox",
            }),
          );
        loadedTodos = [...migratedTodos, ...loadedTodos];
        saveTodos(loadedTodos);
        saveDay(
          selectedDate,
          loadedCurrentTasks.filter((task) => !legacyTodos.includes(task)),
        );
      }

      const loadedTemplates = loadTemplates();
      const backfilledRoutineDates = backfillRoutineSourceIds(loadedTemplates);
      if (backfilledRoutineDates.has(selectedDate)) {
        loadedCurrentTasks = loadDay(selectedDate);
      }

      setCurrentTasks(
        loadedCurrentTasks.filter((task) => !legacyTodos.includes(task)),
      );
      setPreviousTasks(loadDay(addDays(selectedDate, -1)));
      setTodos(loadedTodos);
      setTodoLists(loadTodoLists());
      setTemplates(loadedTemplates);
      setPeriods(loadPeriods());
      const prefs = loadPreferences();
      setSleepTargetMinutes(prefs.sleep_target_minutes);
      setResetArmed(false);
      setIsHydrated(true);
    });
  }, [selectedDate, cloudRevision]);

  const persistSleepTarget = useCallback((value: number) => {
    setSleepTargetMinutes(value);
    const prefs = loadPreferences();
    savePreferences({ ...prefs, sleep_target_minutes: value });
  }, []);

  const todoById = useMemo(
    () => new Map(todos.map((todo) => [todo.id, todo])),
    [todos],
  );
  const todoListById = useMemo(
    () => new Map(todoLists.map((list) => [list.id, list])),
    [todoLists],
  );
  const templateById = useMemo(
    () => new Map(templates.map((template) => [template.id, template])),
    [templates],
  );

  const getTasksForDate = useCallback(
    (dateKey: string) => {
      void dataRevision;
      if (dateKey === selectedDate) return currentTasks;
      if (dateKey === previousDate) return previousTasks;
      return loadDay(dateKey);
    },
    [currentTasks, dataRevision, previousDate, previousTasks, selectedDate],
  );

  const getVisibleTasksForDate = useCallback(
    (dateKey: string) =>
      visibleTasksForDate(
        dateKey,
        getTasksForDate(dateKey),
        getTasksForDate(addDays(dateKey, -1)),
        todoById,
        todoListById,
        templateById,
      ),
    [getTasksForDate, templateById, todoById, todoListById],
  );

  const visibleTasks = useMemo<VisibleTask[]>(
    () => getVisibleTasksForDate(selectedDate),
    [getVisibleTasksForDate, selectedDate],
  );

  const deadlineMarkers = useMemo(
    () => deadlineMarkersForDate(selectedDate, todos),
    [selectedDate, todos],
  );

  const weekDays = useMemo<CalendarDay[]>(
    () =>
      weekDateKeys(selectedDate).map((dateKey) => ({
        dateKey,
        tasks: getVisibleTasksForDate(dateKey),
        deadlines: deadlineMarkersForDate(dateKey, todos),
      })),
    [getVisibleTasksForDate, selectedDate, todos],
  );

  const monthDays = useMemo<CalendarDay[]>(
    () =>
      monthDateKeys(selectedDate).map((dateKey) => ({
        dateKey,
        tasks: getVisibleTasksForDate(dateKey),
        deadlines: deadlineMarkersForDate(dateKey, todos),
      })),
    [getVisibleTasksForDate, selectedDate, todos],
  );

  const draggableVisibleTasks = useMemo(
    () =>
      calendarView === "week"
        ? weekDays.flatMap((day) => day.tasks)
        : visibleTasks,
    [calendarView, visibleTasks, weekDays],
  );

  const allocatedMinutesByTodo = useMemo(() => {
    void dataRevision;
    const totals = new Map<string, number>();
    for (const day of loadAllDays()) {
      for (const task of day.tasks) {
        if (task.kind !== "task" || !task.source_id) continue;
        totals.set(
          task.source_id,
          (totals.get(task.source_id) ?? 0) + task.duration_minutes,
        );
      }
    }
    return totals;
  }, [dataRevision]);

  const defaultTodoList = todoLists[0];
  const todoTasks = useMemo<TodoWithMeta[]>(
    () =>
      todos
        .map((todo) => {
          const list =
            todoLists.find((item) => item.id === todo.list_id) ??
            defaultTodoList;
          return {
            ...todo,
            list_id: list?.id ?? todo.list_id,
            allocatedMinutes: allocatedMinutesByTodo.get(todo.id) ?? 0,
            list,
          };
        })
        .filter((todo): todo is TodoWithMeta => Boolean(todo.list))
        .sort((a, b) => {
          if (a.status !== b.status) return a.status === "completed" ? 1 : -1;
          if (a.due_date && b.due_date) {
            const dateCompare = a.due_date.localeCompare(b.due_date);
            if (dateCompare !== 0) return dateCompare;
          }
          if (a.due_date) return -1;
          if (b.due_date) return 1;
          return a.title.localeCompare(b.title);
        }),
    [allocatedMinutesByTodo, defaultTodoList, todoLists, todos],
  );
  const inboxTasks = useMemo(
    () => todoTasks.filter((task) => task.status !== "completed"),
    [todoTasks],
  );

  const focusMinutes = useMemo(
    () =>
      visibleTasks
        .filter(
          (task) =>
            task.kind === "calendar" ||
            task.kind === "routine" ||
            task.category === "T0" ||
            task.category === "T1",
        )
        .reduce((total, task) => total + task.visibleDurationMinutes, 0),
    [visibleTasks],
  );
  const focusProgress = (focusMinutes / FIRE_TARGET_MINUTES) * 100;

  const sleepTemplate = templates.find((template) => template.kind === "sleep");
  const scheduledSleep = visibleTasks.find((task) => task.kind === "sleep");

  const activeDragPreview = useMemo(() => {
    if (!activeDrag) return null;

    if (activeDrag.type === "template") {
      const template = templates.find((item) => item.id === activeDrag.templateId);
      if (!template) return null;

      return {
        title: template.title,
        category: template.category,
        kind: template.kind,
        displayColor: template.color,
        displayIcon: template.icon,
        durationMinutes:
          template.kind === "sleep"
            ? sleepTargetMinutes
            : template.default_duration_minutes,
      };
    }

    if (activeDrag.type === "task") {
      const todo = todoById.get(activeDrag.taskId);
      if (!todo) return null;
      const list = todoListById.get(todo.list_id);

      return {
        title: todo.title,
        category: todo.category,
        kind: "task" as const,
        displayColor: list?.color,
        durationMinutes: DEFAULT_ALLOCATION_MINUTES,
      };
    }

    const task = draggableVisibleTasks.find(
      (item) => item.id === activeDrag.taskId,
    );
    if (!task) return null;

    return {
      title: task.title,
      category: task.category,
      kind: task.kind,
      displayColor: task.displayColor,
      displayIcon: task.displayIcon,
      durationMinutes: task.duration_minutes,
    };
  }, [
    activeDrag,
    draggableVisibleTasks,
    sleepTargetMinutes,
    templates,
    todoById,
    todoListById,
  ]);

  const updateTasksForDay = useCallback(
    (dateKey: string, updater: (tasks: Task[]) => Task[]) => {
      const apply = (tasks: Task[]) => {
        const next = updater(tasks);
        saveDay(dateKey, next);
        return next;
      };

      if (dateKey === selectedDate) {
        setCurrentTasks(apply);
      } else if (dateKey === previousDate) {
        setPreviousTasks(apply);
      } else {
        saveDay(dateKey, updater(loadDay(dateKey)));
      }
      setDataRevision((revision) => revision + 1);
    },
    [previousDate, selectedDate],
  );

  const moveTaskToDate = useCallback(
    (task: Task, fromDateKey: string, toDateKey: string, startTime: string) => {
      if (fromDateKey !== toDateKey) {
        updateTasksForDay(fromDateKey, (tasks) =>
          tasks.filter((item) => item.id !== task.id),
        );
        updateTasksForDay(toDateKey, (tasks) => [
          ...tasks,
          patchTask(task, { start_time: startTime }),
        ]);
        return;
      }

      updateTasksForDay(fromDateKey, (tasks) =>
        tasks.map((item) =>
          item.id === task.id ? patchTask(item, { start_time: startTime }) : item,
        ),
      );
    },
    [updateTasksForDay],
  );

  const updateTask = useCallback(
    (task: VisibleTask | Task, storageDateKey: string, values: Partial<Task>) => {
      updateTasksForDay(storageDateKey, (tasks) =>
        tasks.map((item) =>
          item.id === task.id ? patchTask(item, values) : item,
        ),
      );
    },
    [updateTasksForDay],
  );

  const persistTodos = useCallback((updater: (items: TodoItem[]) => TodoItem[]) => {
    setTodos((current) => {
      const next = updater(current);
      saveTodos(next);
      return next;
    });
    setDataRevision((revision) => revision + 1);
  }, []);

  const persistTodoLists = useCallback(
    (updater: (items: TodoList[]) => TodoList[]) => {
      setTodoLists((current) => {
        const next = updater(current);
        saveTodoLists(next);
        return next;
      });
    },
    [],
  );

  const addInboxTask = useCallback(
    (
      title = newTaskDefaults.title,
      category = newTaskDefaults.category,
      dueDate: string | null = null,
      dueTime: string | null = null,
      tags: string[] = [],
      listId = "list-inbox",
    ) => {
      const todo = createTodo({
        title: title.trim() || newTaskDefaults.title,
        category,
        due_date: dueDate || null,
        due_time: dueTime || null,
        tags,
        list_id: listId,
      });

      persistTodos((items) => [todo, ...items]);
    },
    [persistTodos],
  );

  const updateReminder = useCallback(
    (todoId: string, values: Partial<TodoItem>) => {
      persistTodos((items) =>
        items.map((todo) => (todo.id === todoId ? patchTodo(todo, values) : todo)),
      );
    },
    [persistTodos],
  );

  const deleteReminder = useCallback(
    (todoId: string) => {
      persistTodos((items) => items.filter((todo) => todo.id !== todoId));
      for (const day of loadAllDays()) {
        updateTasksForDay(day.dateKey, (tasks) =>
          tasks.filter((task) => task.source_id !== todoId),
        );
      }
    },
    [persistTodos, updateTasksForDay],
  );

  const upsertTodoList = useCallback(
    (list: TodoList) => {
      persistTodoLists((current) => {
        const exists = current.some((item) => item.id === list.id);
        return exists
          ? current.map((item) => (item.id === list.id ? patchTodoList(item, list) : item))
          : [...current, list];
      });
    },
    [persistTodoLists],
  );

  const deleteTodoList = useCallback(
    (listId: string) => {
      const fallbackId = "list-inbox";
      persistTodoLists((current) =>
        current.filter((list) => list.id !== listId || list.built_in),
      );
      persistTodos((items) =>
        items.map((todo) =>
          todo.list_id === listId ? patchTodo(todo, { list_id: fallbackId }) : todo,
        ),
      );
    },
    [persistTodoLists, persistTodos],
  );

  const upsertTemplate = useCallback((template: RoutineTemplate) => {
    setTemplates((current) => {
      const exists = current.some((item) => item.id === template.id);
      const next = exists
        ? current.map((item) =>
            item.id === template.id ? patchTemplate(item, template) : item,
          )
        : [...current, template];
      saveTemplates(next);
      return next;
    });
  }, []);

  const deleteTemplate = useCallback((templateId: string) => {
    setTemplates((current) => {
      const next = current.filter((template) => {
        if (template.id !== templateId) return true;
        return template.built_in;
      });
      saveTemplates(next);
      return next;
    });
  }, []);

  const upsertPeriod = useCallback((period: Period) => {
    setPeriods((current) => {
      const exists = current.some((item) => item.id === period.id);
      const next = exists
        ? current.map((item) =>
            item.id === period.id ? patchPeriod(item, period) : item,
          )
        : [...current, period];
      savePeriods(next);
      return next;
    });
  }, []);

  const deletePeriod = useCallback((periodId: string) => {
    setPeriods((current) => {
      const next = current.filter((period) => period.id !== periodId);
      savePeriods(next);
      return next;
    });
  }, []);

  const importCalendarEvents = useCallback(
    (events: ImportedCalendarEvent[]) => {
      const grouped = new Map<string, Task[]>();

      for (const event of events) {
        const dateKey = ownerDateKey(event.startTime);
        const task = createTask({
          id: calendarTaskId(event.sourceId),
          title: event.title,
          category: "T1",
          kind: "calendar",
          duration_minutes: event.durationMinutes,
          start_time: event.startTime,
          locked: true,
          source_id: event.sourceId,
        });
        grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), task]);
      }

      let importedCount = 0;
      for (const [dateKey, tasksForDay] of grouped) {
        updateTasksForDay(dateKey, (existingTasks) => {
          // Reject anything whose source_id OR task id already exists in
          // storage, AND collapse intra-batch duplicates (two events that
          // sanitize to the same calendarTaskId, or two VEVENTs with the
          // same UID + start time).
          const existingSources = new Set(
            existingTasks
              .map((task) => task.source_id)
              .filter((value): value is string => Boolean(value)),
          );
          const existingIds = new Set(existingTasks.map((task) => task.id));
          const seenSources = new Set<string>();
          const seenIds = new Set<string>();
          const freshTasks = tasksForDay.filter((task) => {
            if (existingIds.has(task.id)) return false;
            if (seenIds.has(task.id)) return false;
            if (task.source_id && existingSources.has(task.source_id)) return false;
            if (task.source_id && seenSources.has(task.source_id)) return false;
            seenIds.add(task.id);
            if (task.source_id) seenSources.add(task.source_id);
            return true;
          });
          importedCount += freshTasks.length;
          return [...existingTasks, ...freshTasks];
        });
      }

      return importedCount;
    },
    [updateTasksForDay],
  );

  const importCalendarText = useCallback(
    (text: string) => {
      const events = parseIcsCalendar(text, parseDateKey(selectedDate));
      if (!events.length) {
        setCalendarImportMessage("No timed events found in that calendar.");
        return;
      }

      const importedCount = importCalendarEvents(events);
      setCalendarImportMessage(
        importedCount
          ? `Imported ${importedCount} fixed event${importedCount === 1 ? "" : "s"}.`
          : "Calendar already imported.",
      );
    },
    [importCalendarEvents, selectedDate],
  );

  const deleteTask = useCallback(
    (task: VisibleTask) => {
      updateTasksForDay(task.storageDateKey, (tasks) =>
        tasks.filter((item) => item.id !== task.id),
      );
    },
    [updateTasksForDay],
  );

  const resetDay = useCallback(() => {
    if (!resetArmed) {
      setResetArmed(true);
      window.setTimeout(() => setResetArmed(false), 3000);
      return;
    }

    updateTasksForDay(selectedDate, (tasks) =>
      tasks.filter((task) => task.locked),
    );
    setResetArmed(false);
  }, [resetArmed, selectedDate, updateTasksForDay]);

  const getPointerPosition = useCallback((event: DragEndEvent) => {
    const activatorEvent = event.activatorEvent;

    if (hasPointerCoordinates(activatorEvent)) {
      return {
        x: activatorEvent.clientX + event.delta.x,
        y: activatorEvent.clientY + event.delta.y,
      };
    }

    return null;
  }, []);

  const calculateDropTarget = useCallback(
    (event: DragEndEvent) => {
      const timeline = timelineRef.current;
      const pointer = getPointerPosition(event);
      if (!timeline || !pointer) return null;

      const timelineRect = timeline.getBoundingClientRect();
      const isInsideTimeline =
        pointer.x >= timelineRect.left &&
        pointer.x <= timelineRect.right &&
        pointer.y >= timelineRect.top &&
        pointer.y <= timelineRect.bottom;

      if (!isInsideTimeline) return null;

      let destinationDate = selectedDate;
      let yOffset = pointer.y - timelineRect.top - dragAnchorOffsetRef.current;

      if (calendarView === "week") {
        const gutterWidth = 60;
        const gridWidth = timelineRect.width - gutterWidth;
        const xOffset = pointer.x - timelineRect.left - gutterWidth;
        if (gridWidth <= 0 || xOffset < 0) return null;

        const dayIndex = Math.floor(xOffset / (gridWidth / 7));
        const dateKey = weekDateKeys(selectedDate)[dayIndex];
        if (!dateKey) return null;
        destinationDate = dateKey;
      }

      const rawMinutes = pixelsToMinutes(yOffset);
      const snapped = snapMinutes(rawMinutes);
      const startMinutes = Math.max(
        0,
        Math.min(TOTAL_MINUTES - SNAP_MINUTES, snapped),
      );

      return {
        dateKey: destinationDate,
        startMinutes,
      };
    },
    [calendarView, getPointerPosition, selectedDate],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      const payload = event.active.data.current;
      if (!isDragPayload(payload)) {
        dragAnchorOffsetRef.current = 0;
        return;
      }

      const dropTarget = calculateDropTarget(event);
      dragAnchorOffsetRef.current = 0;
      if (dropTarget === null) return;
      const startTime = dateForTimelineMinutes(
        dropTarget.dateKey,
        dropTarget.startMinutes,
      );
      const destinationDate = ownerDateKey(startTime);

      if (payload.type === "template") {
        const template = templates.find((item) => item.id === payload.templateId);
        if (!template) return;

        const task = createTask({
          title: template.title,
          category: template.category,
          kind: template.kind,
          duration_minutes:
            template.kind === "sleep"
              ? sleepTargetMinutes
              : template.default_duration_minutes,
          start_time: startTime,
          source_id: template.id,
        });

        updateTasksForDay(destinationDate, (tasks) => [...tasks, task]);
        return;
      }

      if (payload.type === "task") {
        const todo = todoById.get(payload.taskId);
        if (!todo || todo.status === "completed") return;
        const task = createTask({
          title: todo.title,
          category: todo.category,
          kind: "task",
          duration_minutes: DEFAULT_ALLOCATION_MINUTES,
          start_time: startTime,
          source_id: todo.id,
        });
        updateTasksForDay(destinationDate, (tasks) => [...tasks, task]);
        return;
      }

      if (payload.type === "placed-task") {
        const task = draggableVisibleTasks.find(
          (item) => item.id === payload.taskId,
        );
        if (!task || task.locked || task.continuesBefore) return;
        moveTaskToDate(task, task.storageDateKey, destinationDate, startTime);
      }
    },
    [
      calculateDropTarget,
      draggableVisibleTasks,
      moveTaskToDate,
      sleepTargetMinutes,
      templates,
      todoById,
      updateTasksForDay,
    ],
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    const payload = event.active.data.current;
    dragAnchorOffsetRef.current = 0;

    if (!isDragPayload(payload)) {
      setActiveDrag(null);
      return;
    }

    if (hasPointerCoordinates(event.activatorEvent)) {
      const activeRect = event.active.rect.current.initial;

      if (activeRect) {
        dragAnchorOffsetRef.current = clampNumber(
          event.activatorEvent.clientY - activeRect.top,
          0,
          activeRect.height,
        );
      }
    }

    if (payload.type === "placed-task" && dragAnchorOffsetRef.current === 0) {
      const timeline = timelineRef.current;
      const task = draggableVisibleTasks.find(
        (item) => item.id === payload.taskId,
      );

      if (timeline && task && hasPointerCoordinates(event.activatorEvent)) {
        const timelineRect = timeline.getBoundingClientRect();
        const taskTop = minutesToPixels(task.topMinutes);
        const taskHeight = Math.max(
          1,
          minutesToPixels(task.visibleDurationMinutes),
        );
        const grabOffset =
          event.activatorEvent.clientY - timelineRect.top - taskTop;
        dragAnchorOffsetRef.current = clampNumber(grabOffset, 0, taskHeight);
      }
    }

    setActiveDrag(payload);
  }, [draggableVisibleTasks]);

  const handleDragCancel = useCallback(() => {
    setActiveDrag(null);
    dragAnchorOffsetRef.current = 0;
  }, []);

  const beginResize = useCallback(
    (
      task: VisibleTask,
      pointerStartY: number,
      edge: "top" | "bottom",
    ) => {
      if (task.locked) return;

      const startDuration = task.duration_minutes;
      const startDate = new Date(task.start_time!).getTime();
      const startTimelineMinutes = minutesFromStart(
        task.start_time!,
        task.storageDateKey,
      );
      const endTimelineMinutes = startTimelineMinutes + startDuration;

      const applyResize = (clientY: number, persist: boolean) => {
        const delta = pixelsToMinutes(clientY - pointerStartY);

        if (edge === "bottom") {
          const nextEndMinutes = snapMinutes(endTimelineMinutes + delta);
          const nextDuration = Math.max(
            SNAP_MINUTES,
            Math.min(16 * 60, nextEndMinutes - startTimelineMinutes),
          );
          const values = { duration_minutes: nextDuration };
          updateTask(task, task.storageDateKey, values);
          return values;
        }

        const nextStartMinutes = clampNumber(
          snapMinutes(startTimelineMinutes + delta),
          0,
          endTimelineMinutes - SNAP_MINUTES,
        );
        const nextStart =
          startDate + (nextStartMinutes - startTimelineMinutes) * 60000;
        const nextDuration = Math.max(
          SNAP_MINUTES,
          endTimelineMinutes - nextStartMinutes,
        );
        const startTime = new Date(nextStart).toISOString();
        const destinationDate = ownerDateKey(startTime);
        const values = { start_time: startTime, duration_minutes: nextDuration };

        if (destinationDate !== task.storageDateKey && persist) {
          moveTaskToDate(task, task.storageDateKey, destinationDate, startTime);
          updateTasksForDay(destinationDate, (tasks) =>
            tasks.map((item) =>
              item.id === task.id
                ? patchTask(item, { duration_minutes: nextDuration })
                : item,
            ),
          );
          return values;
        }

        updateTask(task, task.storageDateKey, values);
        return values;
      };

      const handlePointerMove = (event: PointerEvent) => {
        applyResize(event.clientY, false);
      };

      const handlePointerUp = (event: PointerEvent) => {
        applyResize(event.clientY, true);
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [moveTaskToDate, updateTask, updateTasksForDay],
  );

  const moveCalendar = useCallback(
    (direction: -1 | 1) => {
      setSelectedDate((dateKey) => {
        if (calendarView === "month") return addMonths(dateKey, direction);
        if (calendarView === "week") return addDays(dateKey, direction * 7);
        return addDays(dateKey, direction);
      });
    },
    [calendarView],
  );

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-zinc-950 px-6 py-6 text-zinc-900 dark:text-zinc-100">
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 text-sm text-zinc-500 dark:text-zinc-400">
          Loading routine…
        </div>
      </main>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={timelineCollisionDetection}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
    >
      <main className="h-screen overflow-hidden bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
        <div className="flex h-full min-w-0">
          <div
            className="hidden min-h-0 shrink-0 lg:flex"
            style={{ width: leftRailWidth }}
          >
            <LeftRail
              inboxTasks={inboxTasks}
              todoTasks={todoTasks}
              todoLists={todoLists}
              selectedDate={selectedDate}
              addInboxTask={addInboxTask}
              updateReminder={updateReminder}
              deleteReminder={deleteReminder}
              upsertTodoList={upsertTodoList}
              deleteTodoList={deleteTodoList}
              importCalendarText={importCalendarText}
              calendarImportMessage={calendarImportMessage}
              setCalendarImportMessage={setCalendarImportMessage}
              periods={periods}
              upsertPeriod={upsertPeriod}
              deletePeriod={deletePeriod}
            />
          </div>

          <PaneResizeHandle
            label="Resize left pane"
            onPointerDown={(event) => beginPaneResize("left", event)}
            onKeyAdjust={(delta) => adjustPane("left", delta)}
            onReset={() => resetPane("left")}
          />

          <section className="flex min-h-0 min-w-[520px] flex-1 flex-col border-x border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
            <TopBar
              selectedDate={selectedDate}
              calendarView={calendarView}
              setCalendarView={setCalendarView}
              onSelectDate={setSelectedDate}
              sunTimes={sunTimes}
              isDarkMode={isDarkMode}
              onToggleTheme={toggleTheme}
              resetArmed={resetArmed}
              onReset={resetDay}
              onPrevious={() => moveCalendar(-1)}
              onNext={() => moveCalendar(1)}
              onToday={() => setSelectedDate(todayKey())}
              accountSlot={
                <AccountButton
                  status={auth.status}
                  user={auth.user}
                  onOpenAuth={() => setIsAuthOpen(true)}
                  onSignOut={() => void auth.signOut()}
                />
              }
            />
            {calendarView === "day" && (
              <Timeline
                tasks={visibleTasks}
                deadlines={deadlineMarkers}
                periods={periods}
                dateKey={selectedDate}
                sunTimes={sunTimes}
                now={now}
                isOver={isOver}
                setTimelineNode={setTimelineNode}
                updateTask={updateTask}
                deleteTask={deleteTask}
                beginResize={beginResize}
              />
            )}
            {calendarView === "week" && (
              <WeekView
                days={weekDays}
                periods={periods}
                selectedDate={selectedDate}
                sunTimes={sunTimes}
                now={now}
                isOver={isOver}
                setTimelineNode={setTimelineNode}
                setSelectedDate={setSelectedDate}
                updateTask={updateTask}
                deleteTask={deleteTask}
                beginResize={beginResize}
              />
            )}
            {calendarView === "month" && (
              <MonthView
                days={monthDays}
                periods={periods}
                selectedDate={selectedDate}
                setSelectedDate={setSelectedDate}
                setCalendarView={setCalendarView}
              />
            )}
            {calendarView === "stats" && (
              <StatsView
                selectedDate={selectedDate}
                todos={todos}
                todoLists={todoLists}
                templates={templates}
                dataRevision={dataRevision}
              />
            )}
          </section>

          <PaneResizeHandle
            label="Resize right pane"
            onPointerDown={(event) => beginPaneResize("right", event)}
            onKeyAdjust={(delta) => adjustPane("right", delta)}
            onReset={() => resetPane("right")}
          />

          <div
            className="hidden min-h-0 shrink-0 lg:flex"
            style={{ width: rightRailWidth }}
          >
            <RightRail
              sleepTemplate={sleepTemplate}
              scheduledSleep={scheduledSleep}
              sleepTargetMinutes={sleepTargetMinutes}
              setSleepTargetMinutes={persistSleepTarget}
              updateTask={updateTask}
              templates={templates}
              upsertTemplate={upsertTemplate}
              deleteTemplate={deleteTemplate}
              focusMinutes={focusMinutes}
              focusProgress={focusProgress}
            />
          </div>
        </div>
        <DragOverlay dropAnimation={null}>
          {activeDragPreview ? (
            <DragOverlayCard
              title={activeDragPreview.title}
              category={activeDragPreview.category}
              kind={activeDragPreview.kind}
              displayColor={activeDragPreview.displayColor}
              displayIcon={activeDragPreview.displayIcon}
              durationMinutes={activeDragPreview.durationMinutes}
            />
          ) : null}
        </DragOverlay>
      </main>
      <AuthDialog
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        authError={auth.authError}
        clearError={auth.clearError}
      />
    </DndContext>
  );
}

function PaneResizeHandle({
  label,
  onPointerDown,
  onKeyAdjust,
  onReset,
}: {
  label: string;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
  onKeyAdjust: (delta: number) => void;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      className="group hidden w-2 shrink-0 cursor-col-resize items-stretch justify-center bg-zinc-50 dark:bg-zinc-950 transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/40 lg:flex"
      title={`${label} — drag, double-click to reset, or use ← / →`}
      aria-label={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          onKeyAdjust(event.shiftKey ? -32 : -8);
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          onKeyAdjust(event.shiftKey ? 32 : 8);
        } else if (
          event.key === "Home" ||
          event.key === "Enter" ||
          event.key === " " ||
          event.key === "Backspace"
        ) {
          event.preventDefault();
          onReset();
        }
      }}
    >
      <span className="my-4 w-px rounded-full bg-zinc-200 dark:bg-zinc-700 transition-colors group-hover:bg-indigo-300" />
    </button>
  );
}

type TopBarProps = {
  selectedDate: string;
  calendarView: CalendarView;
  setCalendarView: (view: CalendarView) => void;
  onSelectDate: (dateKey: string) => void;
  sunTimes: SunTimes;
  isDarkMode: boolean;
  onToggleTheme: () => void;
  resetArmed: boolean;
  onReset: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  accountSlot?: React.ReactNode;
};

function TopBar({
  selectedDate,
  calendarView,
  setCalendarView,
  onSelectDate,
  sunTimes,
  isDarkMode,
  onToggleTheme,
  resetArmed,
  onReset,
  onPrevious,
  onNext,
  onToday,
  accountSlot,
}: TopBarProps) {
  const title = formatCalendarTitle(selectedDate, calendarView);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [pickerMonth, setPickerMonth] = useState(selectedDate);
  const datePickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isDatePickerOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (
        datePickerRef.current &&
        !datePickerRef.current.contains(event.target as Node)
      ) {
        setIsDatePickerOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsDatePickerOpen(false);
      }
    };

    window.addEventListener("pointerdown", closeOnOutsidePointer);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("pointerdown", closeOnOutsidePointer);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isDatePickerOpen]);

  return (
    <header className="flex min-h-24 shrink-0 flex-col justify-center gap-2 border-b border-zinc-200 px-6 py-3 dark:border-zinc-800">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <div ref={datePickerRef} className="relative min-w-0">
            <button
              type="button"
              className="flex max-w-[min(54vw,34rem)] items-center gap-2 rounded-lg px-2 py-1.5 text-left text-base font-semibold tracking-tight text-zinc-900 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:text-zinc-100 dark:hover:bg-zinc-800"
              aria-expanded={isDatePickerOpen}
              aria-haspopup="dialog"
              onClick={() => {
                if (!isDatePickerOpen) {
                  setPickerMonth(selectedDate);
                }
                setIsDatePickerOpen(!isDatePickerOpen);
              }}
            >
              <CalendarDays className="h-4 w-4 shrink-0 text-indigo-500" />
              <span className="truncate">{title}</span>
            </button>
            {isDatePickerOpen && (
              <DatePickerPopover
                selectedDate={selectedDate}
                visibleMonth={pickerMonth}
                onVisibleMonthChange={setPickerMonth}
                onSelect={(dateKey) => {
                  onSelectDate(dateKey);
                  setIsDatePickerOpen(false);
                }}
              />
            )}
          </div>
          <div className="flex items-center gap-0.5 rounded-lg bg-zinc-100/70 p-0.5 dark:bg-zinc-800/60">
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onPrevious}
              aria-label="Previous"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onNext}
              aria-label="Next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
        {accountSlot ? (
          <div className="shrink-0 border-l border-zinc-200 pl-3 dark:border-zinc-800">
            {accountSlot}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <ViewSwitcher value={calendarView} onChange={setCalendarView} />
          <div
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5 text-[11px] font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
            title={`${sunTimes.locationLabel} sunrise ${sunTimes.sunriseLabel}, sunset ${sunTimes.sunsetLabel}. Rounded to the nearest hour from ${sunTimes.source === "open-meteo" ? "Open-Meteo" : "fallback"} data.`}
          >
            <Sun className="h-3.5 w-3.5 text-amber-500" />
            <span className="tabular-nums">
              {sunTimes.sunriseLabel} / {sunTimes.sunsetLabel}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onToggleTheme}
            aria-label={isDarkMode ? "Use light mode" : "Use dark mode"}
            title={isDarkMode ? "Light mode" : "Dark mode"}
          >
            {isDarkMode ? (
              <Sun className="h-4 w-4" />
            ) : (
              <Moon className="h-4 w-4" />
            )}
          </Button>
          <Button
            type="button"
            variant={resetArmed ? "primary" : "ghost"}
            size="sm"
            onClick={onReset}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {resetArmed ? "Confirm reset" : "Reset"}
          </Button>
          <Button type="button" variant="primary" size="sm" onClick={onToday}>
            Today
          </Button>
        </div>
      </div>
    </header>
  );
}

function DatePickerPopover({
  selectedDate,
  visibleMonth,
  onVisibleMonthChange,
  onSelect,
}: {
  selectedDate: string;
  visibleMonth: string;
  onVisibleMonthChange: (dateKey: string) => void;
  onSelect: (dateKey: string) => void;
}) {
  const monthTitle = new Intl.DateTimeFormat("en-AU", {
    month: "long",
    year: "numeric",
  }).format(parseDateKey(visibleMonth));
  const days = monthDateKeys(visibleMonth);
  const today = todayKey();
  const weekdays = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <div
      role="dialog"
      aria-label="Choose display date"
      className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-xl border border-zinc-200 bg-white p-3 text-zinc-900 shadow-xl shadow-zinc-900/15 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-sm font-semibold">{monthTitle}</div>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold uppercase text-zinc-400 dark:text-zinc-500">
        {weekdays.map((weekday) => (
          <div key={weekday} className="py-1">
            {weekday}
          </div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {days.map((dateKey) => {
          const inMonth = isSameMonth(dateKey, visibleMonth);
          const isSelected = dateKey === selectedDate;
          const isToday = dateKey === today;

          return (
            <button
              key={dateKey}
              type="button"
              className={cn(
                "flex h-8 items-center justify-center rounded-lg text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30",
                inMonth
                  ? "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800"
                  : "text-zinc-300 hover:bg-zinc-50 dark:text-zinc-600 dark:hover:bg-zinc-900",
                isToday &&
                  "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-200",
                isSelected &&
                  "bg-indigo-600 text-white hover:bg-indigo-600 dark:bg-indigo-500 dark:text-white",
              )}
              onClick={() => onSelect(dateKey)}
            >
              {formatDayNumber(dateKey)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="soft" size="sm" onClick={() => onSelect(today)}>
          Today
        </Button>
      </div>
    </div>
  );
}

function ViewSwitcher({
  value,
  onChange,
}: {
  value: CalendarView;
  onChange: (view: CalendarView) => void;
}) {
  const views: CalendarView[] = ["day", "week", "month", "stats"];

  return (
    <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-0.5">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          className={cn(
            "h-7 rounded-md px-3 text-xs font-medium capitalize text-zinc-500 dark:text-zinc-400 transition-colors",
            value === view
              ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm"
              : "hover:text-zinc-700 dark:hover:text-zinc-200",
          )}
          onClick={() => onChange(view)}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

function formatStatsHours(minutes: number) {
  const hours = minutes / 60;
  const label = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `${label}h`;
}

function monthRange(dateKey: string) {
  const date = parseDateKey(dateKey);
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {
    start: formatDateKey(start),
    end: formatDateKey(end),
  };
}

function StatsView({
  selectedDate,
  todos,
  todoLists,
  templates,
  dataRevision,
}: {
  selectedDate: string;
  todos: TodoItem[];
  todoLists: TodoList[];
  templates: RoutineTemplate[];
  dataRevision: number;
}) {
  const initialStart = startOfWeek(selectedDate);
  const initialEnd = addDays(initialStart, 6);
  const [startDate, setStartDate] = useState(initialStart);
  const [endDate, setEndDate] = useState(initialEnd);

  const summary = useMemo(() => {
    void dataRevision;
    return buildStatsSummary({
      startDate,
      endDate,
      todos,
      todoLists,
      templates,
    });
  }, [dataRevision, endDate, startDate, templates, todoLists, todos]);

  const totalMinutes = summary.routineMinutes + summary.todoMinutes;
  const maxRoutineMinutes = Math.max(
    1,
    ...summary.routineRows.map((row) => row.minutes),
  );
  const maxTodoMinutes = Math.max(1, ...summary.todoRows.map((row) => row.minutes));
  const maxListMinutes = Math.max(1, ...summary.listRows.map((row) => row.minutes));

  const setThisWeek = () => {
    const weekStart = startOfWeek(selectedDate);
    setStartDate(weekStart);
    setEndDate(addDays(weekStart, 6));
  };

  const setThisMonth = () => {
    const range = monthRange(selectedDate);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-white p-6 dark:bg-zinc-900">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
              Time statistics
            </div>
            <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              Routine blocks are grouped by their library source. Todo blocks are grouped by their original todo item.
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <StatsDateField
              label="Start"
              value={startDate}
              onChange={setStartDate}
            />
            <StatsDateField
              label="End"
              value={endDate}
              onChange={setEndDate}
            />
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => {
                setStartDate(selectedDate);
                setEndDate(selectedDate);
              }}
            >
              Today
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={setThisWeek}>
              Week
            </Button>
            <Button type="button" variant="soft" size="sm" onClick={setThisMonth}>
              Month
            </Button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <StatsMetric label="Total allocated" value={formatStatsHours(totalMinutes)} />
          <StatsMetric label="Routine library" value={formatStatsHours(summary.routineMinutes)} />
          <StatsMetric label="Todo items" value={formatStatsHours(summary.todoMinutes)} />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <StatsPanel title="Routine blocks">
            {summary.routineRows.length ? (
              summary.routineRows.map((row) => (
                <StatsRow
                  key={row.id}
                  title={row.title}
                  meta={`${row.kind === "sleep" ? "Sleep" : "Routine"} · ${row.category}${row.linked ? "" : " · unlinked"}`}
                  minutes={row.minutes}
                  maxMinutes={maxRoutineMinutes}
                />
              ))
            ) : (
              <StatsEmpty text="No routine blocks in this range." />
            )}
          </StatsPanel>

          <StatsPanel title="Todo items">
            {summary.todoRows.length ? (
              summary.todoRows.map((row) => (
                <StatsRow
                  key={row.id}
                  title={row.title}
                  meta={`${row.listName} · ${row.category}${row.linked ? "" : " · unlinked"}`}
                  minutes={row.minutes}
                  maxMinutes={maxTodoMinutes}
                />
              ))
            ) : (
              <StatsEmpty text="No todo blocks in this range." />
            )}
          </StatsPanel>
        </div>

        <StatsPanel title="Todo lists">
          {summary.listRows.length ? (
            summary.listRows.map((row) => (
              <StatsRow
                key={row.id}
                title={row.name}
                meta="List total"
                minutes={row.minutes}
                maxMinutes={maxListMinutes}
              />
            ))
          ) : (
            <StatsEmpty text="No todo list activity in this range." />
          )}
        </StatsPanel>
      </div>
    </section>
  );
}

function StatsDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
      {label}
      <span className="relative mt-1 flex h-8 w-[132px] items-center rounded-md border border-zinc-200 bg-white px-2 text-left text-xs font-medium leading-none tabular-nums text-zinc-800 transition-colors focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200">
        <span className="flex h-full items-center leading-none" aria-hidden="true">
          {value.replace(/-/g, "/")}
        </span>
        <input
          type="date"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
        />
      </span>
    </label>
  );
}

function StatsMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-[11px] font-medium uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
        {value}
      </div>
    </div>
  );
}

function StatsPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function StatsRow({
  title,
  meta,
  minutes,
  maxMinutes,
}: {
  title: string;
  meta: string;
  minutes: number;
  maxMinutes: number;
}) {
  const width = `${Math.max(4, Math.round((minutes / maxMinutes) * 100))}%`;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <div className="min-w-0">
          <div className="truncate font-medium text-zinc-800 dark:text-zinc-200">
            {title}
          </div>
          <div className="truncate text-[11px] text-zinc-400 dark:text-zinc-500">
            {meta}
          </div>
        </div>
        <div className="shrink-0 font-semibold tabular-nums text-zinc-700 dark:text-zinc-200">
          {formatStatsHours(minutes)}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className="h-full rounded-full bg-indigo-500" style={{ width }} />
      </div>
    </div>
  );
}

function StatsEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-md border border-dashed border-zinc-200 px-3 py-5 text-center text-xs text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
      {text}
    </div>
  );
}

type LeftRailProps = {
  inboxTasks: TodoWithMeta[];
  todoTasks: TodoWithMeta[];
  todoLists: TodoList[];
  selectedDate: string;
  addInboxTask: (
    title?: string,
    category?: Category,
    dueDate?: string | null,
    dueTime?: string | null,
    tags?: string[],
    listId?: string,
  ) => void;
  updateReminder: (taskId: string, values: Partial<TodoItem>) => void;
  deleteReminder: (taskId: string) => void;
  upsertTodoList: (list: TodoList) => void;
  deleteTodoList: (listId: string) => void;
  importCalendarText: (text: string) => void;
  calendarImportMessage: string;
  setCalendarImportMessage: (message: string) => void;
  periods: Period[];
  upsertPeriod: (period: Period) => void;
  deletePeriod: (periodId: string) => void;
};

function parseTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function listNameKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function colorForImportedList(name: string) {
  const total = Array.from(name).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0,
  );
  return TODO_LIST_COLORS[total % TODO_LIST_COLORS.length];
}

function formatTodoDue(todo: TodoItem) {
  if (!todo.due_date && !todo.due_time) return null;
  const date = todo.due_date
    ? new Intl.DateTimeFormat("en-AU", {
        month: "short",
        day: "numeric",
      }).format(parseDateKey(todo.due_date))
    : "Any day";
  return todo.due_time ? `${date} ${todo.due_time}` : date;
}

function todoHoverTitle(task: TodoWithMeta) {
  const lines = [
    task.title,
    `${task.category} · ${task.list.name}`,
    `Status: ${task.status === "completed" ? "completed" : "pending"}`,
  ];
  const due = formatTodoDue(task);
  if (due) lines.push(`Deadline: ${due}`);
  if (task.allocatedMinutes > 0) {
    lines.push(`Allocated: ${formatDuration(task.allocatedMinutes)}`);
  }
  if (task.tags.length > 0) lines.push(`Tags: ${task.tags.join(", ")}`);
  return lines.join("\n");
}

function deadlineHoverTitle(marker: DeadlineMarker) {
  return [
    marker.title,
    `${marker.category} · deadline`,
    `Time: ${marker.timeLabel}${marker.hasExplicitTime ? "" : " (no time set)"}`,
  ].join("\n");
}

function monthTaskHoverTitle(task: VisibleTask) {
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

function LeftRail({
  inboxTasks,
  todoTasks,
  todoLists,
  selectedDate,
  addInboxTask,
  updateReminder,
  deleteReminder,
  upsertTodoList,
  deleteTodoList,
  importCalendarText,
  calendarImportMessage,
  setCalendarImportMessage,
  periods,
  upsertPeriod,
  deletePeriod,
}: LeftRailProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<Category>("T0");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [tags, setTags] = useState("");
  const [listId, setListId] = useState("list-inbox");
  const [isAddingList, setIsAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListColor, setNewListColor] = useState<TodoListColor>("emerald");
  const [activeView, setActiveView] = useState<LeftRailView>("calendar");

  const submitReminder = () => {
    addInboxTask(
      title,
      category,
      dueDate || null,
      dueTime || null,
      parseTags(tags),
      listId,
    );
    setTitle("");
    setCategory("T0");
    setDueDate("");
    setDueTime("");
    setTags("");
    setListId("list-inbox");
    setIsAdding(false);
  };

  const importParsedTodos = useCallback(
    (items: ParsedTodoCandidate[]) => {
      const listByName = new Map(
        todoLists.map((list) => [listNameKey(list.name), list]),
      );

      for (const item of items) {
        const key = listNameKey(item.listName);
        if (listByName.has(key)) continue;

        const list = createTodoList({
          name: item.listName,
          color: colorForImportedList(item.listName),
        });
        listByName.set(key, list);
        upsertTodoList(list);
      }

      for (const item of [...items].reverse()) {
        const list =
          listByName.get(listNameKey(item.listName)) ??
          listByName.get("inbox") ??
          todoLists[0];
        addInboxTask(
          item.title,
          item.category,
          item.dueDate,
          item.dueTime,
          item.tags,
          list?.id ?? "list-inbox",
        );
      }
    },
    [addInboxTask, todoLists, upsertTodoList],
  );

  const reminderComposer = isAdding ? (
    <ReminderEditor
      title={title}
      category={category}
      dueDate={dueDate}
      dueTime={dueTime}
      tags={tags}
      listId={listId}
      todoLists={todoLists}
      submitLabel="Add"
      onTitleChange={setTitle}
      onCategoryChange={setCategory}
      onDueDateChange={setDueDate}
      onDueTimeChange={setDueTime}
      onTagsChange={setTags}
      onListIdChange={setListId}
      onCancel={() => setIsAdding(false)}
      onSubmit={submitReminder}
    />
  ) : (
    <button
      type="button"
      className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 dark:border-zinc-700 px-3 py-2.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 transition-colors hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-white dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
      onClick={() => setIsAdding(true)}
    >
      <CirclePlus className="h-3.5 w-3.5" />
      New todo
    </button>
  );

  const renderReminderList = (
    tasks: TodoWithMeta[],
    emptyText: string,
    showScheduleState: boolean,
    showComposer: boolean,
  ) => (
    <div className="mt-3 space-y-2 overflow-visible pb-4">
      {showComposer && reminderComposer}
      <TodoListGroups
        tasks={tasks}
        todoLists={todoLists}
        showScheduleState={showScheduleState}
        updateReminder={updateReminder}
        deleteReminder={deleteReminder}
      />
      {!tasks.length && <EmptyState text={emptyText} />}
    </div>
  );

  return (
    <aside className="flex h-full w-full min-h-0 flex-col overflow-y-auto border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 px-5 py-5">
      <nav className="space-y-0.5">
        <NavItem
          active={activeView === "calendar"}
          icon={<CalendarDays className="h-4 w-4" />}
          label="Calendar"
          onClick={() => setActiveView("calendar")}
        />
        <NavItem
          active={activeView === "reminders"}
          icon={<CheckSquare className="h-4 w-4" />}
          label="Reminders"
          onClick={() => setActiveView("reminders")}
        />
        <NavItem
          active={activeView === "periods"}
          icon={<CalendarRange className="h-4 w-4" />}
          label="Periods"
          onClick={() => setActiveView("periods")}
        />
      </nav>

      {activeView === "calendar" && (
        <>
          <CalendarImportPanel
            importCalendarText={importCalendarText}
            message={calendarImportMessage}
            setMessage={setCalendarImportMessage}
          />

          <SectionHeader title="Today's Input" />
          {renderReminderList(
            inboxTasks,
            "All open todos are complete.",
            true,
            false,
          )}
        </>
      )}

      {activeView === "reminders" && (
        <>
          <SectionHeader title="Todo List" />
          <AiTodoImportPanel
            selectedDate={selectedDate}
            todoLists={todoLists}
            onImport={importParsedTodos}
          />
          <TodoListsManager
            todoLists={todoLists}
            isAddingList={isAddingList}
            name={newListName}
            color={newListColor}
            onNameChange={setNewListName}
            onColorChange={setNewListColor}
            onAddStart={() => setIsAddingList(true)}
            onCancel={() => setIsAddingList(false)}
            onSubmit={() => {
              upsertTodoList(
                createTodoList({
                  name: newListName,
                  color: newListColor,
                }),
              );
              setNewListName("");
              setNewListColor("emerald");
              setIsAddingList(false);
            }}
            onDelete={deleteTodoList}
          />
          {renderReminderList(todoTasks, "No todos yet.", true, true)}
        </>
      )}

      {activeView === "periods" && (
        <PeriodsPanel
          periods={periods}
          upsertPeriod={upsertPeriod}
          deletePeriod={deletePeriod}
        />
      )}
    </aside>
  );
}

function AiTodoImportPanel({
  selectedDate,
  todoLists,
  onImport,
}: {
  selectedDate: string;
  todoLists: TodoList[];
  onImport: (items: ParsedTodoCandidate[]) => void;
}) {
  const [text, setText] = useState("");
  const [message, setMessage] = useState("");
  const [isParsing, setIsParsing] = useState(false);

  const parseTodos = async () => {
    const trimmed = text.trim();
    if (!trimmed || isParsing) return;

    setIsParsing(true);
    setMessage("");

    try {
      const response = await fetch("/api/parse-todos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: trimmed,
          selectedDate,
          existingLists: todoLists.map((list) => ({
            id: list.id,
            name: list.name,
          })),
        }),
      });

      const payload = (await response.json()) as
        | ParseTodosResponse
        | { error?: string };

      if (!response.ok) {
        setMessage(
          "error" in payload && payload.error
            ? payload.error
            : "Could not parse todos.",
        );
        return;
      }

      const todos = "todos" in payload ? payload.todos : [];
      if (!todos.length) {
        setMessage("No todos found.");
        return;
      }

      onImport(todos);
      setText("");
      const warningText =
        "warnings" in payload && payload.warnings.length
          ? ` ${payload.warnings.join(" ")}`
          : "";
      setMessage(`Added ${todos.length} todo${todos.length === 1 ? "" : "s"}.${warningText}`);
    } catch {
      setMessage("Could not reach the AI parser.");
    } finally {
      setIsParsing(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
        <Zap className="h-3.5 w-3.5" />
        AI import
      </div>
      <textarea
        className="min-h-20 w-full resize-none rounded-md border border-zinc-200 bg-white px-2.5 py-2 text-xs text-zinc-800 outline-none transition-colors placeholder:text-zinc-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:placeholder:text-zinc-500"
        placeholder="BPS3071: lab report due Friday 17:00; book dentist tomorrow"
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-2 flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
          {message}
        </div>
        <Button
          type="button"
          variant="soft"
          size="sm"
          onClick={parseTodos}
          disabled={!text.trim() || isParsing}
        >
          {isParsing ? "Parsing" : "Parse & add"}
        </Button>
      </div>
    </div>
  );
}

function NavItem({
  icon,
  label,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={cn("transition-colors", active ? "text-indigo-600 dark:text-indigo-300" : "text-zinc-500 dark:text-zinc-400")}>
        {icon}
      </span>
      {label}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "flex h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-sm font-medium transition-colors",
          active
            ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/70"
            : "text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800/70 dark:hover:bg-zinc-800/70 hover:text-zinc-900 dark:hover:text-zinc-100",
        )}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium",
        active ? "bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-sm ring-1 ring-zinc-200/70" : "text-zinc-600 dark:text-zinc-300",
      )}
    >
      {content}
    </div>
  );
}

function CalendarImportPanel({
  importCalendarText,
  message,
  setMessage,
}: {
  importCalendarText: (text: string) => void;
  message: string;
  setMessage: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file?: File) => {
    if (!file) return;
    const text = await file.text();
    importCalendarText(text);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUrlImport = async () => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) return;

    setIsLoading(true);
    setMessage("Importing calendar link...");

    try {
      const response = await fetch(trimmedUrl);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      importCalendarText(text);
      setUrl("");
    } catch {
      setMessage(
        "Could not fetch that link. Try downloading the .ics file and importing it.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mt-5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3">
      <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
        <CalendarPlus className="h-3 w-3" />
        Import calendar
      </div>
      <input
        ref={fileInputRef}
        className="hidden"
        type="file"
        accept=".ics,text/calendar"
        onChange={(event) => void handleFile(event.target.files?.[0])}
      />
      <div className="flex gap-1.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload className="h-3.5 w-3.5" />
          File
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={isLoading || !url.trim()}
          onClick={() => void handleUrlImport()}
        >
          <Link className="h-3.5 w-3.5" />
          URL
        </Button>
      </div>
      <input
        className="mt-2 w-full rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        placeholder="Paste .ics URL"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
      />
      {message && (
        <div className="mt-2 rounded-md bg-zinc-50 dark:bg-zinc-950 px-2.5 py-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          {message}
        </div>
      )}
    </div>
  );
}

type ReminderEditorProps = {
  title: string;
  category: Category;
  dueDate: string;
  dueTime: string;
  tags: string;
  listId: string;
  todoLists: TodoList[];
  submitLabel: string;
  onTitleChange: (value: string) => void;
  onCategoryChange: (value: Category) => void;
  onDueDateChange: (value: string) => void;
  onDueTimeChange: (value: string) => void;
  onTagsChange: (value: string) => void;
  onListIdChange: (value: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

function ReminderEditor({
  title,
  category,
  dueDate,
  dueTime,
  tags,
  listId,
  todoLists,
  submitLabel,
  onTitleChange,
  onCategoryChange,
  onDueDateChange,
  onDueTimeChange,
  onTagsChange,
  onListIdChange,
  onCancel,
  onSubmit,
}: ReminderEditorProps) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm">
      <input
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        placeholder="What needs doing?"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        autoFocus
      />
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <select
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as Category)}
        >
          <option value="T0">T0</option>
          <option value="T1">T1</option>
          <option value="T2">T2</option>
        </select>
        <select
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          value={listId}
          onChange={(event) => onListIdChange(event.target.value)}
        >
          {todoLists.map((list) => (
            <option key={list.id} value={list.id}>
              {list.name}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <input
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          type="date"
          value={dueDate}
          onChange={(event) => onDueDateChange(event.target.value)}
        />
        <input
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          type="time"
          value={dueTime}
          onChange={(event) => onDueTimeChange(event.target.value)}
        />
      </div>
      <input
        className="mt-2 w-full rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-700 dark:text-zinc-300 outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        placeholder="Tags, comma separated"
        value={tags}
        onChange={(event) => onTagsChange(event.target.value)}
      />
      <div className="mt-2.5 flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={onSubmit}
          disabled={!title.trim()}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

type ReminderCardProps = {
  task: TodoWithMeta;
  showScheduleState?: boolean;
  todoLists: TodoList[];
  updateReminder: (taskId: string, values: Partial<TodoItem>) => void;
  deleteReminder: (taskId: string) => void;
};

function TodoListGroups({
  tasks,
  todoLists,
  showScheduleState,
  updateReminder,
  deleteReminder,
}: {
  tasks: TodoWithMeta[];
  todoLists: TodoList[];
  showScheduleState: boolean;
  updateReminder: (taskId: string, values: Partial<TodoItem>) => void;
  deleteReminder: (taskId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {todoLists
        .map((list) => ({
          list,
          tasks: tasks.filter((task) => task.list_id === list.id),
        }))
        .filter((group) => group.tasks.length > 0)
        .map((group) => {
          const styles = todoListColorTokens(group.list.color);

          return (
            <div key={group.list.id}>
              <div className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <span className={cn("h-2 w-2 rounded-full", styles.accent)} />
                {group.list.name}
              </div>
              <div className="space-y-2">
                {group.tasks.map((task) => (
                  <ReminderCard
                    key={task.id}
                    task={task}
                    showScheduleState={showScheduleState}
                    todoLists={todoLists}
                    updateReminder={updateReminder}
                    deleteReminder={deleteReminder}
                  />
                ))}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function TodoListsManager({
  todoLists,
  isAddingList,
  name,
  color,
  onNameChange,
  onColorChange,
  onAddStart,
  onCancel,
  onSubmit,
  onDelete,
}: {
  todoLists: TodoList[];
  isAddingList: boolean;
  name: string;
  color: TodoListColor;
  onNameChange: (value: string) => void;
  onColorChange: (value: TodoListColor) => void;
  onAddStart: () => void;
  onCancel: () => void;
  onSubmit: () => void;
  onDelete: (listId: string) => void;
}) {
  const colors: TodoListColor[] = [
    "blue",
    "emerald",
    "amber",
    "rose",
    "violet",
    "zinc",
  ];

  return (
    <div className="mt-3 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Sublists
        </div>
        <button
          type="button"
          className="rounded p-1 text-zinc-400 dark:text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="Add list"
          aria-label="Add list"
          onClick={onAddStart}
        >
          <CirclePlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {todoLists.map((list) => {
          const styles = todoListColorTokens(list.color);
          return (
            <div
              key={list.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium",
                styles.block,
                styles.text,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", styles.accent)} />
              {list.name}
              {!list.built_in && (
                <button
                  type="button"
                  className="ml-0.5 text-zinc-400 dark:text-zinc-500 hover:text-rose-600 dark:hover:text-rose-400"
                  title={`Delete ${list.name}`}
                  aria-label={`Delete ${list.name}`}
                  onClick={() => onDelete(list.id)}
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {isAddingList && (
        <div className="mt-2 space-y-2 rounded-md bg-zinc-50 dark:bg-zinc-950 p-2">
          <input
            className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
            placeholder="List name"
            value={name}
            onChange={(event) => onNameChange(event.target.value)}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <div className="flex gap-1">
              {colors.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={cn(
                    "h-5 w-5 rounded-full ring-offset-2",
                    todoListColorTokens(item).accent,
                    color === item && "ring-2 ring-zinc-400",
                  )}
                  title={item}
                  aria-label={item}
                  onClick={() => onColorChange(item)}
                />
              ))}
            </div>
            <div className="flex gap-1">
              <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
                Cancel
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={!name.trim()}
                onClick={onSubmit}
              >
                Add
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function reminderScheduleLabel(task: TodoWithMeta) {
  if (task.status === "completed") return null;
  if (task.allocatedMinutes <= 0) {
    return task.due_date || task.due_time ? "Deadline only" : "No time allocated";
  }
  return `${formatDuration(task.allocatedMinutes)} allocated`;
}

function ReminderCard({
  task,
  showScheduleState = false,
  todoLists,
  updateReminder,
  deleteReminder,
}: ReminderCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<Category>(task.category);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const [tags, setTags] = useState(task.tags.join(", "));
  const [listId, setListId] = useState(task.list_id);
  const styles = categoryTokens(task.category);
  const listStyles = todoListColorTokens(task.list.color);
  const dueLabel = formatTodoDue(task);
  const scheduleLabel = reminderScheduleLabel(task);
  const canDrag = task.status !== "completed";
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `task:${task.id}`,
      data: { type: "task", taskId: task.id } satisfies DragPayload,
      disabled: !canDrag,
    });
  const transformStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  const saveReminder = () => {
    updateReminder(task.id, {
      title: title.trim() || task.title,
      category,
      due_date: dueDate || null,
      due_time: dueTime || null,
      tags: parseTags(tags),
      list_id: listId,
    });
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <ReminderEditor
        title={title}
        category={category}
        dueDate={dueDate}
        dueTime={dueTime}
        tags={tags}
        listId={listId}
        todoLists={todoLists}
        submitLabel="Save"
        onTitleChange={setTitle}
        onCategoryChange={setCategory}
        onDueDateChange={setDueDate}
        onDueTimeChange={setDueTime}
        onTagsChange={setTags}
        onListIdChange={setListId}
        onCancel={() => {
          setTitle(task.title);
          setCategory(task.category);
          setDueDate(task.due_date ?? "");
          setDueTime(task.due_time ?? "");
          setTags(task.tags.join(", "));
          setListId(task.list_id);
          setIsEditing(false);
        }}
        onSubmit={saveReminder}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={transformStyle}
      className={cn(
        "group relative rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 transition-all duration-150 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm",
        canDrag
          ? "cursor-grab select-none touch-none active:cursor-grabbing"
          : "cursor-default opacity-50",
        isDragging && "z-50 opacity-90 shadow-md",
      )}
      {...(canDrag ? listeners : {})}
      {...attributes}
      title={todoHoverTitle(task)}
    >
      <div className="min-w-0 pr-6 pt-px">
        <div className="flex min-w-0 items-start gap-2">
          <div
            className={cn(
              "min-w-0 flex-1 truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100",
              task.status === "completed" && "line-through text-zinc-400 dark:text-zinc-500",
            )}
          >
            {task.title}
          </div>
        </div>
        <div className="mt-1 flex min-w-0 items-center gap-1.5 pr-10 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={cn("shrink-0 rounded px-1.5 py-0.5 font-semibold tracking-wide", styles.chip)}>
            {task.category}
          </span>
          <span className={cn("min-w-0 shrink truncate rounded border px-1.5 py-0.5", listStyles.block, listStyles.text)}>
            {task.list.name}
          </span>
          {showScheduleState && scheduleLabel && scheduleLabel !== "Deadline only" && (
            <span className="shrink-0 rounded bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 text-zinc-500 dark:text-zinc-400">
              {scheduleLabel}
            </span>
          )}
          {dueLabel && (
            <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
              {dueLabel}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className={cn(
          "absolute right-2.5 top-2.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          task.status === "completed"
            ? "border-indigo-500 bg-indigo-500 text-white"
            : "border-zinc-300 dark:border-zinc-700 text-transparent hover:border-zinc-400 dark:hover:border-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
        )}
        title={task.status === "completed" ? "Mark incomplete" : "Complete"}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={() =>
          updateReminder(task.id, {
            status: task.status === "completed" ? "pending" : "completed",
          })
        }
      >
        <Check className="h-2.5 w-2.5" strokeWidth={3} />
      </button>
      <div className="absolute bottom-2 right-2 flex opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-0.5 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="Edit reminder"
          aria-label={`Edit ${task.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-3 w-3" />
        </button>
        <button
          type="button"
          className="rounded p-0.5 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
          title="Delete reminder"
          aria-label={`Delete ${task.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => deleteReminder(task.id)}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}

function DragOverlayCard({
  title,
  category,
  kind,
  displayColor,
  displayIcon,
  durationMinutes,
}: {
  title: string;
  category: Category;
  kind: BlockKind;
  displayColor?: TodoListColor;
  displayIcon?: RoutineIconName;
  durationMinutes: number;
}) {
  const styles = displayColor
    ? todoListColorTokens(displayColor)
    : categoryTokens(category);
  const isSleep = kind === "sleep";
  const iconClassName = cn(
    "h-3.5 w-3.5 shrink-0",
    isSleep ? "text-white/85" : styles.text,
  );
  const overlayIcon = displayIcon ? (
    <RoutineIcon icon={displayIcon} className={iconClassName} />
  ) : kind === "calendar" ? (
    <CalendarDays className={iconClassName} />
  ) : kind === "task" ? (
    <CheckSquare className={iconClassName} />
  ) : kind === "sleep" ? (
    <Moon className={iconClassName} />
  ) : (
    <Zap className={iconClassName} />
  );

  return (
    <div
      className={cn(
        "relative w-64 overflow-hidden rounded-lg border p-3 pl-3.5 shadow-xl shadow-zinc-900/15 backdrop-blur",
        styles.block,
        isSleep && SLEEP_BLOCK_CLASS,
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1.5 left-1.5 w-0.5 rounded-full",
          isSleep ? "bg-white/70" : styles.accent,
        )}
      />
      <div
        className={cn(
          "ml-1 flex min-w-0 items-center gap-1.5 text-[13px]",
          isSleep ? "text-white" : "text-zinc-900 dark:text-zinc-100",
        )}
      >
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide",
            isSleep ? "bg-white/15 text-white" : styles.chip,
          )}
        >
          {category}
        </span>
        <span className="flex shrink-0 items-center" aria-hidden="true">
          {overlayIcon}
        </span>
        <span className="min-w-0 truncate font-semibold">{title}</span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium",
            isSleep ? "text-white/75" : "text-zinc-500 dark:text-zinc-400",
          )}
        >
          <Clock className="h-3 w-3" aria-hidden="true" />
          {formatDuration(durationMinutes)}
        </span>
      </div>
    </div>
  );
}

type RightRailProps = {
  sleepTemplate?: RoutineTemplate;
  scheduledSleep?: VisibleTask;
  sleepTargetMinutes: number;
  setSleepTargetMinutes: (value: number) => void;
  updateTask: (
    task: VisibleTask | Task,
    storageDateKey: string,
    values: Partial<Task>,
  ) => void;
  templates: RoutineTemplate[];
  upsertTemplate: (template: RoutineTemplate) => void;
  deleteTemplate: (templateId: string) => void;
  focusMinutes: number;
  focusProgress: number;
};

function RightRail({
  sleepTemplate,
  scheduledSleep,
  sleepTargetMinutes,
  setSleepTargetMinutes,
  updateTask,
  templates,
  upsertTemplate,
  deleteTemplate,
  focusMinutes,
  focusProgress,
}: RightRailProps) {
  const [isAdding, setIsAdding] = useState(false);
  const routineTemplates = templates.filter((template) => template.kind !== "sleep");

  return (
    <aside className="flex h-full w-full min-h-0 flex-col border-l border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <SectionLabel>Sleep</SectionLabel>
        <SleepControl
          template={sleepTemplate}
          scheduledSleep={scheduledSleep}
          sleepTargetMinutes={sleepTargetMinutes}
          setSleepTargetMinutes={setSleepTargetMinutes}
          updateTask={updateTask}
        />

        <div className="mt-7 flex items-center justify-between">
          <SectionLabel className="mb-0">Routines</SectionLabel>
          <button
            type="button"
            className="rounded-md p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
            title="Add routine"
            aria-label="Add routine"
            onClick={() => setIsAdding(true)}
          >
            <CirclePlus className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 space-y-2">
          {isAdding && (
            <RoutineTemplateEditor
              submitLabel="Add"
              onCancel={() => setIsAdding(false)}
              onSubmit={(draft) => {
                upsertTemplate(
                  createTemplate({
                    title: draft.title,
                    category: draft.category,
                    color: draft.color,
                    icon: draft.icon,
                    default_duration_minutes: draft.default_duration_minutes,
                    kind: "routine",
                  }),
                );
                setIsAdding(false);
              }}
            />
          )}
          {routineTemplates.map((template) => (
            <RoutineTemplateCard
              key={template.id}
              template={template}
              upsertTemplate={upsertTemplate}
              deleteTemplate={deleteTemplate}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-5 py-4">
        <div className="mb-2 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            <Flame className="h-3.5 w-3.5 text-indigo-500" />
            Focus
          </div>
          <div className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            {Math.round(Math.min(100, focusProgress))}%
          </div>
        </div>
        <Progress value={focusProgress} />
        <div className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
          {formatDuration(focusMinutes)} of {formatDuration(FIRE_TARGET_MINUTES)} target
        </div>
      </div>
    </aside>
  );
}

function SectionLabel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500",
        className,
      )}
    >
      {children}
    </div>
  );
}

type RoutineDraft = {
  id?: string;
  title: string;
  default_duration_minutes: number;
  category: Category;
  color: TodoListColor;
  icon: RoutineIconName;
  kind?: "routine";
};

function RoutineTemplateEditor({
  template,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  template?: RoutineTemplate;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (template: RoutineDraft) => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [duration, setDuration] = useState(
    template?.default_duration_minutes ?? 60,
  );
  const [category, setCategory] = useState<Category>(template?.category ?? "T0");
  const [color, setColor] = useState<TodoListColor>(template?.color ?? "blue");
  const [icon, setIcon] = useState<RoutineIconName>(template?.icon ?? "zap");

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-3 shadow-sm">
      <input
        className="w-full rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-900 dark:text-zinc-100 outline-none transition-colors placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
        placeholder="Routine name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        autoFocus
      />
      <div className="mt-2 grid grid-cols-[1fr_88px] gap-1.5">
        <select
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          value={category}
          onChange={(event) => setCategory(event.target.value as Category)}
        >
          <option value="T0">T0</option>
          <option value="T1">T1</option>
          <option value="T2">T2</option>
        </select>
        <input
          className="rounded-md border border-zinc-200 dark:border-zinc-800 px-2.5 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-300 outline-none transition-colors focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20"
          min={30}
          step={30}
          type="number"
          value={duration}
          onChange={(event) =>
            setDuration(Math.max(30, Number(event.target.value) || 30))
          }
        />
      </div>
      <div className="mt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Icon
        </div>
        <div className="grid grid-cols-4 gap-1">
          {ROUTINE_ICON_OPTIONS.map((option) => {
            const selected = icon === option.value;
            return (
              <button
                key={option.value}
                type="button"
                className={cn(
                  "flex h-7 items-center justify-center rounded-md border text-zinc-500 transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:border-zinc-800 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
                  selected &&
                    "border-indigo-400 bg-indigo-50 text-indigo-700 dark:border-indigo-400/70 dark:bg-indigo-500/20 dark:text-indigo-200",
                )}
                title={option.label}
                aria-label={option.label}
                onClick={() => setIcon(option.value)}
              >
                <RoutineIcon icon={option.value} className="h-3.5 w-3.5" />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2">
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          Colour
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ROUTINE_COLORS.map((item) => {
            const tokens = routineColorTokens(item);
            return (
              <button
                key={item}
                type="button"
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 transition-colors hover:border-zinc-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/30 dark:border-zinc-800 dark:hover:border-zinc-600",
                  color === item && "ring-2 ring-zinc-400 dark:ring-zinc-500",
                )}
                title={item}
                aria-label={`Use ${item}`}
                onClick={() => setColor(item)}
              >
                <span
                  aria-hidden="true"
                  className={cn("h-4 w-4 rounded-full", tokens.accent)}
                />
              </button>
            );
          })}
        </div>
      </div>
      <div className="mt-2.5 flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={!title.trim()}
          onClick={() =>
            onSubmit({
              id: template?.id,
              title: title.trim(),
              default_duration_minutes: duration,
              category,
              color,
              icon,
              kind: "routine",
            })
          }
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

function RoutineIcon({
  icon,
  className,
}: {
  icon: RoutineIconName;
  className?: string;
}) {
  if (icon === "dumbbell") return <Dumbbell className={className} />;
  if (icon === "utensils") return <Utensils className={className} />;
  if (icon === "book") return <BookOpen className={className} />;
  if (icon === "briefcase") return <Briefcase className={className} />;
  if (icon === "laptop") return <Laptop className={className} />;
  if (icon === "coffee") return <Coffee className={className} />;
  if (icon === "shower") return <ShowerHead className={className} />;
  if (icon === "moon") {
    return <Moon className={className} />;
  }

  return <Zap className={className} />;
}

function RoutineTemplateCard({
  template,
  upsertTemplate,
  deleteTemplate,
}: {
  template: RoutineTemplate;
  upsertTemplate: (template: RoutineTemplate) => void;
  deleteTemplate: (templateId: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const styles = routineColorTokens(template.color);
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: `template:${template.id}`,
      data: { type: "template", templateId: template.id } satisfies DragPayload,
    });
  const transformStyle = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  if (isEditing) {
    return (
      <RoutineTemplateEditor
        template={template}
        submitLabel="Save"
        onCancel={() => setIsEditing(false)}
        onSubmit={(nextTemplate) => {
          upsertTemplate(
            patchTemplate(template, {
              title: nextTemplate.title,
              default_duration_minutes: nextTemplate.default_duration_minutes,
              category: nextTemplate.category,
              color: nextTemplate.color,
              icon: nextTemplate.icon,
            }),
          );
          setIsEditing(false);
        }}
      />
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={transformStyle}
      className={cn(
        "group flex cursor-grab select-none touch-none items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-2.5 transition-all duration-150 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm active:cursor-grabbing",
        isDragging && "z-50 opacity-90 shadow-md",
      )}
      {...listeners}
      {...attributes}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-md",
          styles.block,
        )}
        aria-hidden="true"
      >
        <RoutineIcon icon={template.icon} className={cn("h-4 w-4", styles.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          {template.title}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide", styles.chip)}>
            {template.category}
          </span>
          <span>{formatDuration(template.default_duration_minutes)}</span>
        </div>
      </div>
      <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          className="rounded p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-700 dark:hover:text-zinc-200"
          title="Edit routine"
          aria-label={`Edit ${template.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => setIsEditing(true)}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-zinc-400 dark:text-zinc-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/15 hover:text-rose-600 dark:hover:text-rose-400"
          title="Delete routine"
          aria-label={`Delete ${template.title}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={() => deleteTemplate(template.id)}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

type SleepControlProps = {
  template?: RoutineTemplate;
  scheduledSleep?: VisibleTask;
  sleepTargetMinutes: number;
  setSleepTargetMinutes: (value: number) => void;
  updateTask: (
    task: VisibleTask | Task,
    storageDateKey: string,
    values: Partial<Task>,
  ) => void;
};

function SleepControl({
  template,
  scheduledSleep,
  sleepTargetMinutes,
  setSleepTargetMinutes,
  updateTask,
}: SleepControlProps) {
  if (!template) return null;

  const duration = scheduledSleep?.duration_minutes ?? sleepTargetMinutes;

  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          <Moon className="h-3.5 w-3.5 text-indigo-500" />
          Target duration
        </span>
        <span className="text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100">
          {formatDuration(duration)}
        </span>
      </div>
      <input
        aria-label="Sleep target duration"
        className="mb-3 w-full accent-indigo-600"
        type="range"
        min={5 * 60}
        max={10 * 60}
        step={30}
        value={duration}
        onChange={(event) => {
          const nextValue = Number(event.target.value);
          setSleepTargetMinutes(nextValue);
          if (!scheduledSleep) return;
          updateTask(scheduledSleep, scheduledSleep.storageDateKey, {
            duration_minutes: nextValue,
          });
        }}
      />
      <DraggableBlock
        id={`template:${template.id}`}
        title="Sleep"
        category={template.category}
        durationMinutes={duration}
        dragData={{ type: "template", templateId: template.id }}
        className={SLEEP_BLOCK_CLASS}
        icon={<RoutineIcon icon={template.icon} className="h-3.5 w-3.5 text-white/85" />}
        inverse
      />
    </div>
  );
}

type TimelineProps = {
  tasks: VisibleTask[];
  deadlines: DeadlineMarker[];
  periods: Period[];
  dateKey: string;
  sunTimes: SunTimes;
  now: Date;
  isOver: boolean;
  setTimelineNode: (node: HTMLDivElement | null) => void;
  updateTask: (
    task: VisibleTask | Task,
    storageDateKey: string,
    values: Partial<Task>,
  ) => void;
  deleteTask: (task: VisibleTask) => void;
  beginResize: (
    task: VisibleTask,
    pointerStartY: number,
    edge: "top" | "bottom",
  ) => void;
};

function Timeline({
  tasks,
  deadlines,
  periods,
  dateKey,
  sunTimes,
  now,
  isOver,
  setTimelineNode,
  updateTask,
  deleteTask,
  beginResize,
}: TimelineProps) {
  const currentTimeMarker = currentTimeMarkerForDate(dateKey, now);

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <div className="min-h-0 flex-1 overflow-y-scroll pb-32">
        <div
          ref={setTimelineNode}
          className={cn(
            "relative min-w-[520px] transition-colors",
            isOver && "bg-indigo-50/30 dark:bg-indigo-500/15",
          )}
          style={{ height: TIMELINE_HEIGHT }}
        >
          <TimelineGrid sunTimes={sunTimes} />
          <div className="absolute inset-y-0 left-[72px] right-6">
            <PeriodColumnBackground periods={periods} dateKey={dateKey} layout="day" />
          </div>

          {tasks.map((task) => (
            <PlacedTask
              key={`${task.storageDateKey}:${task.id}`}
              task={task}
              hasTopDeadline={deadlines.some(
                (marker) => marker.topMinutes === task.topMinutes,
              )}
              updateTask={updateTask}
              deleteTask={deleteTask}
              beginResize={beginResize}
            />
          ))}
          <DeadlineMarkers markers={deadlines} layout="day" />
          <CurrentTimeLine marker={currentTimeMarker} layout="day" />
        </div>
      </div>
    </section>
  );
}

function TimelineGrid({ sunTimes }: { sunTimes: SunTimes }) {
  return <TimeGrid gutterWidth={72} labelClassName="px-4 text-[11px]" sunTimes={sunTimes} />;
}

function TimeGrid({
  gutterWidth,
  labelClassName,
  sunTimes,
}: {
  gutterWidth: number;
  labelClassName: string;
  sunTimes: SunTimes;
}) {
  const nightBands = [
    { start: 0, end: sunTimes.sunriseOffsetMinutes },
    { start: sunTimes.sunsetOffsetMinutes, end: TOTAL_MINUTES },
  ].filter((band) => band.end > band.start);

  return (
    <div className="absolute inset-0">
      {nightBands.map((band) => (
        <div
          key={`${band.start}-${band.end}`}
          className="pointer-events-none absolute right-0 border-y border-indigo-100/50 bg-indigo-50/35 dark:border-purple-400/10 dark:bg-purple-950/15"
          style={{
            left: gutterWidth,
            top: minutesToPixels(band.start),
            height: minutesToPixels(band.end - band.start),
          }}
        />
      ))}
      {timelineHours().map((hour) => {
        const minutes = (hour - DAY_START_HOUR) * 60;
        const top = minutesToPixels(minutes);
        const label = formatTimeFromMinutes(minutes);

        return (
          <div key={hour} className="absolute left-0 right-0" style={{ top }}>
            <div
              className="grid items-start"
              style={{ gridTemplateColumns: `${gutterWidth}px 1fr` }}
            >
              <div
                className={cn(
                  "-mt-2 font-medium tabular-nums text-zinc-400 dark:text-zinc-500",
                  labelClassName,
                )}
              >
                {label}
              </div>
              <div className="border-t border-zinc-100 dark:border-zinc-800" />
            </div>
          </div>
        );
      })}
      {Array.from({ length: TOTAL_MINUTES / SNAP_MINUTES }).map((_, index) => {
        const top = minutesToPixels(index * SNAP_MINUTES);
        return (
          <div
            key={index}
            className="absolute right-0 border-t border-zinc-100/50 dark:border-zinc-800/50"
            style={{ top, left: gutterWidth }}
          />
        );
      })}
    </div>
  );
}

type WeekViewProps = {
  days: CalendarDay[];
  periods: Period[];
  selectedDate: string;
  sunTimes: SunTimes;
  now: Date;
  isOver: boolean;
  setTimelineNode: (node: HTMLDivElement | null) => void;
  setSelectedDate: (dateKey: string) => void;
  updateTask: (
    task: VisibleTask | Task,
    storageDateKey: string,
    values: Partial<Task>,
  ) => void;
  deleteTask: (task: VisibleTask) => void;
  beginResize: (
    task: VisibleTask,
    pointerStartY: number,
    edge: "top" | "bottom",
  ) => void;
};

function WeekView({
  days,
  periods,
  selectedDate,
  sunTimes,
  now,
  isOver,
  setTimelineNode,
  setSelectedDate,
  updateTask,
  deleteTask,
  beginResize,
}: WeekViewProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white dark:bg-zinc-900">
      <div className="min-h-0 flex-1 overflow-y-scroll pb-32">
        <div className="sticky top-0 z-20 grid min-w-[900px] grid-cols-[60px_repeat(7,minmax(110px,1fr))] border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
          <div />
          {days.map((day) => {
            const isSelected = day.dateKey === selectedDate;
            const isToday = day.dateKey === todayKey();

            return (
              <button
                key={day.dateKey}
                type="button"
                className={cn(
                  "border-l border-zinc-100 dark:border-zinc-800 px-2.5 py-2 text-left transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                  isSelected && "bg-indigo-50/40 dark:bg-indigo-500/15",
                )}
                onClick={() => setSelectedDate(day.dateKey)}
              >
                <div className="text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  {new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(
                    parseDateKey(day.dateKey),
                  )}
                </div>
                <div
                  className={cn(
                    "mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-sm font-semibold tabular-nums text-zinc-900 dark:text-zinc-100",
                    isToday && "bg-indigo-600 text-white",
                  )}
                >
                  {formatDayNumber(day.dateKey)}
                </div>
              </button>
            );
          })}
        </div>
        <div
          ref={setTimelineNode}
          className={cn(
            "relative min-w-[900px] transition-colors",
            isOver && "bg-indigo-50/30 dark:bg-indigo-500/15",
          )}
          style={{ height: TIMELINE_HEIGHT }}
        >
          <TimeGrid gutterWidth={60} labelClassName="px-2 text-[11px]" sunTimes={sunTimes} />
          <div className="absolute inset-0 grid grid-cols-[60px_repeat(7,minmax(110px,1fr))]">
            <div />
            {days.map((day) => (
              <div
                key={day.dateKey}
                className="relative border-l border-zinc-100 dark:border-zinc-800"
              >
                <PeriodColumnBackground
                  periods={periods}
                  dateKey={day.dateKey}
                  layout="week"
                />
                {day.tasks.map((task) => (
                  <PlacedTask
                    key={`${task.storageDateKey}:${task.id}`}
                    task={task}
                    layout="week"
                    hasTopDeadline={day.deadlines.some(
                      (marker) => marker.topMinutes === task.topMinutes,
                    )}
                    updateTask={updateTask}
                    deleteTask={deleteTask}
                    beginResize={beginResize}
                  />
                ))}
                <DeadlineMarkers markers={day.deadlines} layout="week" />
                <CurrentTimeLine
                  marker={currentTimeMarkerForDate(day.dateKey, now)}
                  layout="week"
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

type MonthViewProps = {
  days: CalendarDay[];
  selectedDate: string;
  setSelectedDate: (dateKey: string) => void;
  setCalendarView: (view: CalendarView) => void;
  periods: Period[];
};

function MonthView({
  days,
  selectedDate,
  setSelectedDate,
  setCalendarView,
  periods,
}: MonthViewProps) {
  const weekLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  return (
    <section className="min-h-0 flex-1 overflow-y-auto bg-white dark:bg-zinc-900 p-4">
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-l border-zinc-200 dark:border-zinc-800">
        {weekLabels.map((label) => (
          <div
            key={label}
            className="border-b border-r border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/60 px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500"
          >
            {label}
          </div>
        ))}
        {days.map((day) => {
          const isSelected = day.dateKey === selectedDate;
          const isToday = day.dateKey === todayKey();
          const inMonth = isSameMonth(day.dateKey, selectedDate);
          const visibleEvents = day.tasks.slice(0, 3);
          const visibleDeadlines = day.deadlines.slice(
            0,
            Math.max(0, 3 - visibleEvents.length),
          );
          const hiddenCount = Math.max(
            0,
            day.tasks.length +
              day.deadlines.length -
              visibleEvents.length -
              visibleDeadlines.length,
          );
          const activePeriods = periods.filter((period) =>
            periodActiveOnDate(period, day.dateKey),
          );

          return (
            <button
              key={day.dateKey}
              type="button"
              className={cn(
                "relative min-h-28 overflow-visible border-b border-r border-zinc-100 dark:border-zinc-800 p-2 text-left align-top transition-colors hover:z-20 hover:bg-zinc-50 dark:hover:bg-zinc-800/60/60 dark:hover:bg-zinc-800/60",
                !inMonth && "bg-zinc-50/40 dark:bg-zinc-900/40 text-zinc-400 dark:text-zinc-500",
                isSelected && "ring-1 ring-inset ring-indigo-400 z-10",
              )}
              onClick={() => setSelectedDate(day.dateKey)}
              onDoubleClick={() => {
                setSelectedDate(day.dateKey);
                setCalendarView("day");
              }}
            >
              {activePeriods.length > 0 && (
                <div
                  className={cn(
                    "absolute inset-x-0 top-0",
                    inMonth ? "opacity-100" : "opacity-50",
                  )}
                >
                  {activePeriods.map((period, index) => {
                    const tokens = periodColorTokens(period.color);
                    const details = periodHoverDetails(period);
                    return (
                      <div
                        key={period.id}
                        className="group/period-ribbon relative h-2.5"
                        style={{ marginTop: index === 0 ? 0 : -1 }}
                        title={periodHoverTitle(period)}
                      >
                        <div className={cn("h-1.5 rounded-sm", tokens.ribbon)} />
                        <div className="pointer-events-none absolute left-1 top-2 z-50 hidden w-60 rounded-lg border border-zinc-200 bg-white/95 p-2.5 text-left text-[11px] text-zinc-600 shadow-xl shadow-zinc-900/15 backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 dark:text-zinc-300 group-hover/period-ribbon:block">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-zinc-900 dark:text-zinc-100">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", tokens.accent)} />
                            <span className="truncate">{period.title}</span>
                          </div>
                          <div className="space-y-0.5">
                            <div>{details.kindLabel} · {details.range}</div>
                            <div>{details.schedule}</div>
                            <div>{details.days}</div>
                            {details.breaks && <div>{details.breaks}</div>}
                            {details.notes && (
                              <div className="mt-1 line-clamp-2 text-zinc-500 dark:text-zinc-400">
                                {details.notes}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div
                className={cn(
                  "relative mb-1 mt-2 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-xs font-semibold tabular-nums",
                  isToday
                    ? "bg-indigo-600 text-white"
                    : inMonth
                      ? "text-zinc-700 dark:text-zinc-300"
                      : "text-zinc-400 dark:text-zinc-500",
                )}
              >
                {formatDayNumber(day.dateKey)}
              </div>
              <div className="relative space-y-0.5">
                {visibleEvents.map((task) => {
                  const styles = task.displayColor
                    ? todoListColorTokens(task.displayColor)
                    : categoryTokens(task.category);

                  return (
                    <div
                      key={`${task.storageDateKey}:${task.id}`}
                      className={cn(
                        "truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-zinc-700 dark:text-zinc-300",
                        styles.block,
                        task.kind === "calendar" && CALENDAR_BLOCK_CLASS,
                        task.kind === "sleep" && SLEEP_MONTH_BLOCK_CLASS,
                      )}
                      title={monthTaskHoverTitle(task)}
                    >
                      <span
                        className={cn(
                          "mr-1 tabular-nums",
                          task.kind === "sleep"
                            ? "text-white/65"
                            : "text-zinc-400 dark:text-zinc-500",
                        )}
                      >
                        {formatTimeFromMinutes(task.topMinutes)}
                      </span>
                      {task.displayIcon ? (
                        <RoutineIcon
                          icon={task.displayIcon}
                          className={cn(
                            "mr-1 inline h-3 w-3 align-[-2px]",
                            task.kind === "sleep" ? "text-white/75" : styles.text,
                          )}
                        />
                      ) : null}
                      {task.title}
                    </div>
                  );
                })}
                {visibleDeadlines.map((marker) => (
                  <div
                    key={marker.id}
                    className="flex items-center gap-1 truncate rounded border border-rose-100 dark:border-rose-500/30 bg-rose-50 dark:bg-rose-500/15 px-1.5 py-0.5 text-[11px] font-medium text-rose-700 dark:text-rose-300"
                    title={deadlineHoverTitle(marker)}
                  >
                    <Flag className="h-3 w-3 shrink-0" />
                    <span className="shrink-0 tabular-nums">
                      {marker.timeLabel}
                    </span>
                    <span className="truncate">{marker.title}</span>
                  </div>
                ))}
                {hiddenCount > 0 && (
                  <div className="px-1.5 text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
                    +{hiddenCount} more
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

type PlacedTaskProps = {
  task: VisibleTask;
  layout?: "day" | "week";
  hasTopDeadline?: boolean;
  updateTask: (
    task: VisibleTask | Task,
    storageDateKey: string,
    values: Partial<Task>,
  ) => void;
  deleteTask: (task: VisibleTask) => void;
  beginResize: (
    task: VisibleTask,
    pointerStartY: number,
    edge: "top" | "bottom",
  ) => void;
};

function PeriodColumnBackground({
  periods,
  dateKey,
  layout,
}: {
  periods: Period[];
  dateKey: string;
  layout: "day" | "week";
}) {
  const active = useMemo(
    () => periods.filter((period) => periodActiveOnDate(period, dateKey)),
    [periods, dateKey],
  );

  if (!active.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-0">
      {active.map((period) => {
        const tokens = periodColorTokens(period.color);
        const segments = periodSegmentsForDay(period);
        return (
          <div key={period.id} className="absolute inset-0">
            {segments.map((segment, index) => {
              const top = minutesToPixels(segment.startMinutes);
              const height = Math.max(
                4,
                minutesToPixels(segment.endMinutes - segment.startMinutes),
              );
              return (
                <div
                  key={`${period.id}-${index}`}
                  className={cn(
                    "absolute inset-x-0 overflow-hidden rounded-md",
                    tokens.block,
                  )}
                  style={{ top, height }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute inset-y-1 left-0.5 w-0.5 rounded-full",
                      tokens.accent,
                    )}
                  />
                  {index === 0 && (
                    <span
                      className={cn(
                        "absolute left-2.5 top-1 truncate text-[10px] font-semibold uppercase tracking-wide",
                        tokens.text,
                        layout === "week" && "right-1",
                      )}
                    >
                      {period.title}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

function DeadlineMarkers({
  markers,
  layout,
}: {
  markers: DeadlineMarker[];
  layout: "day" | "week";
}) {
  if (!markers.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {markers.map((marker) => {
        const styles = categoryTokens(marker.category);
        const top = minutesToPixels(marker.topMinutes) + marker.stackIndex * 22;

        return (
          <div
            key={marker.id}
            className={cn(
              "absolute",
              layout === "week" ? "left-1 right-1" : "left-[80px] right-6",
            )}
            style={{ top }}
            title={`${marker.title} deadline at ${marker.timeLabel}${marker.hasExplicitTime ? "" : " (no time set)"}`}
          >
            <div className="absolute left-0 right-0 top-0 border-t border-dashed border-rose-300 dark:border-rose-500/40" />
            <div
              className={cn(
                "inline-flex max-w-full -translate-y-1/2 items-center gap-1.5 rounded-md border border-rose-200 dark:border-rose-500/30 bg-white/95 dark:bg-zinc-900/95 px-2 py-1 text-[10px] font-medium text-rose-700 dark:text-rose-300 shadow-sm backdrop-blur",
                layout === "week" && "px-1.5",
              )}
            >
              <Flag className="h-3 w-3 shrink-0" />
              <span className="shrink-0 font-semibold tabular-nums">
                {marker.timeLabel}
              </span>
              <span className={cn("shrink-0 rounded px-1 py-0.5 text-[9px] font-semibold", styles.chip)}>
                {marker.category}
              </span>
              <span className="truncate">
                {layout === "day" ? "Deadline: " : ""}
                {marker.title}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CurrentTimeLine({
  marker,
  layout,
}: {
  marker: CurrentTimeMarker | null;
  layout: "day" | "week";
}) {
  if (!marker) return null;

  const top = minutesToPixels(marker.topMinutes);

  if (layout === "week") {
    return (
      <div
        className="pointer-events-none absolute left-0 right-0 z-40 flex -translate-y-1/2 items-center"
        style={{ top }}
        aria-label={`Current time ${marker.label}`}
      >
        <span className="h-2 w-2 -translate-x-1/2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.18)] dark:bg-rose-400" />
        <span className="h-px flex-1 bg-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.16)] dark:bg-rose-400" />
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute left-[72px] right-6 z-40 flex -translate-y-1/2 items-center"
      style={{ top }}
      aria-label={`Current time ${marker.label}`}
    >
      <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.18)] dark:bg-rose-400" />
      <span className="h-px flex-1 bg-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.16)] dark:bg-rose-400" />
      <div className="absolute right-0 translate-x-[70%]">
        <span className="inline-flex rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm dark:bg-rose-400 dark:text-zinc-950">
          {marker.label}
        </span>
      </div>
    </div>
  );
}

function PlacedTask({
  task,
  layout = "day",
  hasTopDeadline = false,
  updateTask,
  deleteTask,
  beginResize,
}: PlacedTaskProps) {
  const [isEditing, setIsEditing] = useState(false);
  const top = minutesToPixels(task.topMinutes);
  const height = Math.max(
    1,
    minutesToPixels(task.visibleDurationMinutes),
  );
  const styles = task.displayColor
    ? todoListColorTokens(task.displayColor)
    : categoryTokens(task.category);
  const isLocked = Boolean(task.locked || task.kind === "calendar");
  const isSleep = task.kind === "sleep";
  const isContinuation = task.continuesBefore || task.continuesAfter;
  const canEdit = !isLocked;
  const isWeekLayout = layout === "week";
  const startLabel = formatTimeFromMinutes(task.topMinutes);
  const endLabel = formatTimeFromMinutes(
    task.topMinutes + task.visibleDurationMinutes,
  );
  const mutedTextClass = isSleep
    ? "text-white/70"
    : "text-zinc-500 dark:text-zinc-400";
  const titleTextClass = isSleep
    ? "text-white"
    : "text-zinc-900 dark:text-zinc-100";
  const inlineIconClass = cn(
    "h-3.5 w-3.5 shrink-0",
    isSleep ? "text-white/85" : styles.text,
  );
  const inlineIcon = task.displayIcon ? (
    <RoutineIcon icon={task.displayIcon} className={inlineIconClass} />
  ) : task.kind === "calendar" ? (
    <CalendarDays className={inlineIconClass} />
  ) : task.kind === "task" ? (
    <CheckSquare className={inlineIconClass} />
  ) : task.kind === "sleep" ? (
    <Moon className={inlineIconClass} />
  ) : (
    <Zap className={inlineIconClass} />
  );

  return (
    <div
      className={cn(
        "group absolute",
        layout === "week" ? "left-1 right-1" : "left-[80px] right-6",
      )}
      style={{
        top,
        height,
      }}
    >
      {!isLocked && (
        <button
          type="button"
          className="absolute -top-1 left-8 right-8 z-20 h-2 cursor-ns-resize rounded-full opacity-0 transition-opacity group-hover:opacity-100"
          title="Resize from start"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginResize(task, event.clientY, "top");
          }}
        />
      )}
      <DraggableBlock
        id={`placed:${task.id}`}
        title={task.title}
        category={task.category}
        durationMinutes={task.duration_minutes}
        dragData={{ type: "placed-task", taskId: task.id }}
        compact
        disabled={isLocked || task.continuesBefore}
        inverse={isSleep}
        colorTokens={styles}
        onDoubleClick={(event) => {
          if (!canEdit) return;
          event.preventDefault();
          event.stopPropagation();
          setIsEditing(true);
        }}
        className={cn(
          "h-full overflow-hidden",
          isWeekLayout ? "pr-1.5" : "pr-8",
          hasTopDeadline ? "pb-1.5 pt-5" : "py-1.5",
          task.kind === "calendar" && CALENDAR_BLOCK_CLASS,
          isSleep && SLEEP_BLOCK_CLASS,
          isContinuation && "border-dashed",
          isLocked && "cursor-default",
        )}
      >
        {isWeekLayout ? (
          <div className="flex min-w-0 items-center gap-1 leading-none">
            {isLocked && (
              <Lock
                aria-hidden="true"
                className={cn("h-2.5 w-2.5 shrink-0", mutedTextClass)}
              />
            )}
            <span
              className={cn(
                "shrink-0 text-[9px] font-medium tabular-nums",
                mutedTextClass,
              )}
            >
              {startLabel}
            </span>
            <span
              className={cn(
                "min-w-0 truncate text-[11px] font-semibold",
                titleTextClass,
              )}
            >
              {task.title}
            </span>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 leading-none">
            <div className="flex min-w-0 items-center gap-1.5">
              <span
                className={cn(
                  "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-semibold tracking-wide",
                  isSleep ? "bg-white/15 text-white" : styles.chip,
                )}
              >
                {task.category}
              </span>
              <span className="flex shrink-0 items-center" aria-hidden="true">
                {inlineIcon}
              </span>
              <span
                className={cn(
                  "min-w-0 truncate text-[11px] font-semibold",
                  titleTextClass,
                )}
              >
                {task.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-[10px] font-medium",
                  mutedTextClass,
                )}
              >
                <Clock className="h-3 w-3" aria-hidden="true" />
                {formatDuration(task.duration_minutes)}
              </span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "shrink-0 text-[10px] font-medium tabular-nums",
                  mutedTextClass,
                )}
              >
                {startLabel} - {endLabel}
              </span>
              {task.kind === "calendar" ? (
                <span
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                    isSleep
                      ? "border-white/25 bg-white/10 text-white/75"
                      : "border-zinc-200 bg-white/75 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/75 dark:text-zinc-500",
                  )}
                  title="Fixed block"
                >
                  <Lock className="h-2.5 w-2.5" />
                </span>
              ) : (
                <button
                  type="button"
                  className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded border shadow-sm transition-colors",
                    isSleep
                      ? "border-white/30 bg-white/10 text-white hover:border-white/50"
                      : "border-zinc-300 bg-white/80 text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 dark:border-zinc-700 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:border-zinc-500 dark:hover:text-zinc-100",
                    task.status === "completed" &&
                      "border-indigo-500 bg-indigo-500 text-white hover:border-indigo-600 hover:bg-indigo-600 hover:text-white dark:hover:border-indigo-400",
                  )}
                  title={
                    task.status === "completed"
                      ? "Mark pending"
                      : "Mark completed"
                  }
                  onPointerDown={(event) => event.stopPropagation()}
                  onDoubleClick={(event) => event.stopPropagation()}
                  onClick={() =>
                    updateTask(task, task.storageDateKey, {
                      status:
                        task.status === "completed" ? "pending" : "completed",
                    })
                  }
                >
                  <Check
                    className={cn(
                      "h-2.5 w-2.5",
                      task.status !== "completed" && "opacity-0",
                    )}
                    strokeWidth={3}
                  />
                </button>
              )}
            </div>
          </div>
        )}
      </DraggableBlock>
      {!isLocked && (
        <>
          <button
            type="button"
            className="absolute right-1.5 top-1.5 z-20 flex h-5 w-5 items-center justify-center rounded bg-white/90 dark:bg-zinc-900/90 text-zinc-400 dark:text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-all hover:text-rose-600 dark:hover:text-rose-400 group-hover:opacity-100"
            title="Delete block"
            onClick={() => deleteTask(task)}
          >
            <Trash2 className="h-3 w-3" />
          </button>
          <button
            type="button"
            className="absolute bottom-0.5 left-1/2 z-20 flex h-4 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded bg-white/85 dark:bg-zinc-900/85 text-zinc-400 dark:text-zinc-500 opacity-0 shadow-sm backdrop-blur transition-all hover:text-zinc-700 dark:hover:text-zinc-200 group-hover:opacity-100"
            title="Resize duration"
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              beginResize(task, event.clientY, "bottom");
            }}
          >
            <MoveVertical className="h-3 w-3" />
          </button>
        </>
      )}
      {isEditing && canEdit && (
        <PlacedTaskEditor
          task={task}
          onCancel={() => setIsEditing(false)}
          onSave={(values) => {
            updateTask(task, task.storageDateKey, values);
            setIsEditing(false);
          }}
        />
      )}
    </div>
  );
}

function PlacedTaskEditor({
  task,
  onCancel,
  onSave,
}: {
  task: VisibleTask;
  onCancel: () => void;
  onSave: (values: Partial<Task>) => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<Category>(task.category);
  const startOffsetMinutes = Math.max(
    0,
    minutesFromStart(task.start_time!, task.storageDateKey),
  );
  const [startTime, setStartTime] = useState(
    formatTimeFromMinutes(startOffsetMinutes),
  );
  const [endTime, setEndTime] = useState(
    formatTimeFromMinutes(startOffsetMinutes + task.duration_minutes),
  );

  const editedStartMinutes = startTime
    ? wallTimeToTimelineMinutes(startTime)
    : startOffsetMinutes;
  const editedEndMinutes = endTimeToTimelineMinutes(
    endTime || formatTimeFromMinutes(startOffsetMinutes + task.duration_minutes),
    editedStartMinutes,
  );
  const editedDurationMinutes = Math.max(
    1,
    Math.min(
      TOTAL_MINUTES,
      Math.round(editedEndMinutes - editedStartMinutes),
    ),
  );

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      category,
      start_time: dateForTimelineMinutes(
        task.storageDateKey,
        editedStartMinutes,
      ),
      duration_minutes: editedDurationMinutes,
    });
  };

  return (
    <div
      className="absolute left-0 top-[calc(100%+0.375rem)] z-50 w-72 rounded-lg border border-zinc-200 bg-white p-3 text-left shadow-xl shadow-zinc-900/15 dark:border-zinc-800 dark:bg-zinc-950"
      onDoubleClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onCancel();
        }
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
          Edit block
        </div>
        <div className="text-[10px] font-medium text-zinc-400 dark:text-zinc-500">
          {formatTimeFromMinutes(task.topMinutes)}
        </div>
      </div>

      <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
        Title
        <input
          autoFocus
          className={BLOCK_EDITOR_INPUT_CLASS}
          value={title}
          placeholder="Block title"
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Category
          <select
            className={BLOCK_EDITOR_INPUT_CLASS}
            value={category}
            onChange={(event) => setCategory(event.target.value as Category)}
          >
            {CATEGORY_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Duration
          <div className="mt-1 flex h-8 items-center rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200">
            {formatDuration(editedDurationMinutes)}
          </div>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          Start
          <input
            className={BLOCK_EDITOR_INPUT_CLASS}
            type="time"
            step={60}
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
          />
        </label>
        <label className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
          End
          <input
            className={BLOCK_EDITOR_INPUT_CLASS}
            type="time"
            step={60}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
          />
        </label>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={save}>
          Save
        </Button>
      </div>
    </div>
  );
}
