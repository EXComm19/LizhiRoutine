"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { createPortal } from "react-dom";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
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
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CirclePlus,
  Clock,
  Coffee,
  Dumbbell,
  Eye,
  EyeOff,
  Flag,
  Laptop,
  MapPin,
  Minus,
  Moon,
  MoveVertical,
  Navigation,
  Paperclip,
  Plus,
  RefreshCcw,
  Settings,
  ShowerHead,
  Sparkles,
  Sun,
  Trash2,
  Utensils,
  X,
  Zap,
} from "lucide-react";
import NextLink from "next/link";
import { Button } from "@/components/ui/button";
import { DraggableBlock } from "@/components/draggable-block";
import type { ParsedTodoCandidate } from "@/lib/ai-todo-parser";
import type {
  BlockKind,
  Category,
  CommuteConfig,
  CommuteEstimate,
  CommuteMode,
  CommuteTimeStrategy,
  DragPayload,
  EventItem,
  Period,
  RoutineTemplate,
  RoutineIconName,
  SleepRecord,
  Task,
  TodoItem,
  TodoList,
  TodoListColor,
} from "@/lib/schema";
import type { CommuteEstimateResponse } from "@/lib/commute";
import {
  COMMUTE_MODES,
  COMMUTE_TIME_STRATEGIES,
  commuteModeLabel,
  commuteTimeStrategyLabel,
  compactRouteLabel,
  isCommuteTemplate,
} from "@/lib/commute";
import {
  createEvent,
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
  loadEvents,
  loadSleepRecords,
  loadPeriods,
  loadPreferences,
  loadTemplates,
  loadTodoLists,
  loadTodos,
  backfillEstimateActualsOnce,
  migrateLegacyTodosOnce,
  saveEvents,
  saveSleepRecords,
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
} from "@/components/planner/primitives";
import type {
  CalendarDay,
  CalendarView,
  CurrentTimeMarker,
  DeadlineMarker,
  LeftRailView,
  StatsListRow,
  StatsRoutineRow,
  StatsSummary,
  StatsTodoRow,
  SunTimes,
  TodoWithMeta,
  VisibleTask,
} from "@/components/planner/types";
import {
  addMonths,
  backfillRoutineSourceIds,
  buildCompletionStats,
  buildEstimateAccuracyStats,
  buildSleepStats,
  buildStatsSummary,
  clampNumber,
  colorForImportedList,
  commuteConfigFromEstimate,
  commuteEstimateMatchesConfig,
  compareTodosByDueDate,
  currentTimeMarkerForDate,
  daysUntilTodoDue,
  deadlineHoverTitle,
  deadlineMarkersForDate,
  endTimeToTimelineMinutes,
  estimateCommute,
  fallbackSunTimes,
  fetchSunTimes,
  formatCalendarTitle,
  formatCompactDate,
  formatDayNumber,
  formatTimelineScaleLabel,
  formatTodoDue,
  hasPointerCoordinates,
  isDragPayload,
  isSameMonth,
  listNameKey,
  monthDateKeys,
  monthTaskHoverTitle,
  ownerDateKey,
  parseTags,
  startOfWeek,
  timelineCollisionDetection,
  todoDueSortKey,
  eventUrgencyTokens,
  todoDueUrgencyTokens,
  todoHoverTitle,
  visibleTasksForDate,
  weekDateKeys,
} from "@/components/planner/helpers";
import {
  EVENT_TYPE_ICONS,
  EventsPanel,
} from "@/components/planner/EventsPanel";
import { PeriodsPanel } from "@/components/planner/PeriodsPanel";
import { AgentPanel } from "@/components/planner/AgentPanel";
import {
  EstimateAccuracyLine,
  TodoContextPanel,
  TodoEstimateProgressBar,
} from "@/components/planner/TodoContextPanel";
import {
  EDITOR_BODY_CLASS,
  EDITOR_CARD_CLASS,
  EDITOR_DELETE_BUTTON_CLASS,
  EDITOR_INPUT_CLASS,
  EDITOR_LABEL_CLASS,
  EDITOR_META_CLASS,
  EDITOR_PLAIN_INPUT_CLASS,
  EDITOR_PLAIN_VALUE_CLASS,
  EDITOR_ROW_CLASS,
  EditorFooter,
  EditorHeader,
  EditorMetaDot,
  EditorModal,
  EditorTierSegment,
  formatEditorDuration,
} from "@/components/planner/editor";
import { AuthDialog } from "@/components/auth/AuthDialog";
import { AccountButton } from "@/components/auth/AccountButton";
import { SyncConflictDialog } from "@/components/auth/SyncConflictDialog";
import { useAuth } from "@/lib/auth";
import {
  DAY_START_HOUR,
  SNAP_MINUTES,
  TIMELINE_HEIGHT,
  TOTAL_MINUTES,
  activeTimelineDayKey,
  addDays,
  dateForTimelineMinutes,
  formatDateKey,
  formatDayLabel,
  formatDuration,
  formatTimeFromMinutes,
  minutesFromStart,
  minutesToPixels,
  wallTimeToTimelineMinutes,
  parseDateKey,
  pixelsToMinutes,
  snapMinutes,
  timelineHours,
  todayKey,
} from "@/lib/time";
import { cn } from "@/lib/utils";

const DEFAULT_ALLOCATION_MINUTES = 30;
const LEFT_RAIL_DEFAULT_WIDTH = 360;
const RIGHT_RAIL_DEFAULT_WIDTH = 360;
const LEFT_RAIL_MIN_WIDTH = 320;
const LEFT_RAIL_MAX_WIDTH = 520;
const RIGHT_RAIL_MIN_WIDTH = 320;
const RIGHT_RAIL_MAX_WIDTH = 500;
const CENTER_MIN_WIDTH = 620;
const DAY_TIMELINE_GUTTER_WIDTH = 60;
const DAY_TIMELINE_CONTENT_LEFT = 76;
const DAY_TIMELINE_LEFT_CLASS = "left-[76px]";
const DAY_TIMELINE_RIGHT_CLASS = "right-8";
const PANE_WIDTHS_STORAGE_KEY = "lizhi-routine:pane-widths";
const THEME_STORAGE_KEY = "lizhi-routine:theme";
const CALENDAR_TODO_SORT_STORAGE_KEY = "lizhi-routine:calendar-todo-sort";
const CALENDAR_EVENTS_HEIGHT_STORAGE_KEY = "lizhi-routine:calendar-events-height";
const CALENDAR_EVENTS_HEIGHT_DEFAULT = 200;
const CALENDAR_EVENTS_HEIGHT_MIN = 80;
const CALENDAR_EVENTS_HEIGHT_MAX = 480;
const HIDE_DONE_REMINDERS_STORAGE_KEY = "lizhi-routine:hide-done-reminders";

// ── Day-view vertical zoom ────────────────────────────────────────────
// Multiplier applied to pixel positions + container height in the day
// timeline only. 1.0 = the native PIXELS_PER_HOUR layout from lib/time.ts.
// Pulled out of context so leaf renderers (PlacedTask, DeadlineMarkers,
// TimeGrid, etc.) read it without prop-drilling through 4 layers.
const TIMELINE_ZOOM_STORAGE_KEY = "lizhi-routine:timeline-zoom";
const TIMELINE_ZOOM_MIN = 0.4;
const TIMELINE_ZOOM_MAX = 1.5;
const TIMELINE_ZOOM_STEP = 0.1;
const TIMELINE_ZOOM_DEFAULT = 1;
const TimelineZoomContext = createContext<number>(1);
function useTimelineZoom(): number {
  return useContext(TimelineZoomContext);
}

const CATEGORY_OPTIONS: Category[] = ["T0", "T1", "T2"];
const CALENDAR_BLOCK_CLASS =
  "border-violet-300 bg-violet-100/90 dark:border-violet-400/45 dark:bg-violet-500/25";
// Distinct from ICS-imported calendar blocks. User-created Events render in
// the cool-teal palette defined in globals.css.
const EVENT_BLOCK_CLASS =
  "border-[color:var(--block-event-line)] bg-[color:var(--block-event)] text-[color:var(--block-event-ink)] hover:border-[color:var(--block-event-line)] hover:bg-[color:var(--block-event)]";
const SLEEP_BLOCK_CLASS =
  "border-[color:var(--block-sleep)] bg-[color:var(--block-sleep)] text-[color:var(--block-sleep-on)] shadow-[0_8px_22px_-14px_rgba(40,0,70,0.45)] hover:border-[color:var(--block-sleep)] hover:bg-[color:var(--block-sleep)]";
const SLEEP_MONTH_BLOCK_CLASS =
  "border border-[color:var(--block-sleep)] bg-[color:var(--block-sleep)] text-[color:var(--block-sleep-on)]";
// Shared editor primitives + class constants live in
// `@/components/planner/editor` so PeriodEditor (in PeriodsPanel.tsx) can
// reuse them without a circular import.

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
  // The `theme-init` script in app/layout.tsx already resolved the theme
  // synchronously before React hydrated (reading localStorage, falling
  // back to prefers-color-scheme) and toggled the `.dark` class on
  // <html>. Trust that result instead of recomputing — keeps React's
  // initial state in sync with the painted DOM and avoids a hydration
  // mismatch flash if the two ever diverge.
  if (document.documentElement.classList.contains("dark")) return true;
  // Fallback for non-browser contexts that somehow reached here.
  const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === "dark") return true;
  if (saved === "light") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function loadSavedCalendarTodoSort() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(CALENDAR_TODO_SORT_STORAGE_KEY) === "due-date";
}

function saveCalendarTodoSort(sortByDueDate: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_TODO_SORT_STORAGE_KEY,
      sortByDueDate ? "due-date" : "manual",
    );
  } catch {
    // Sorting remains usable for the current session if storage is blocked.
  }
}

function loadSavedHideDoneReminders() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(HIDE_DONE_REMINDERS_STORAGE_KEY) === "1";
}

function saveHideDoneReminders(hide: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (hide) {
      window.localStorage.setItem(HIDE_DONE_REMINDERS_STORAGE_KEY, "1");
    } else {
      window.localStorage.removeItem(HIDE_DONE_REMINDERS_STORAGE_KEY);
    }
  } catch {
    // Toggle still works for the current session if storage is unavailable.
  }
}

function loadSavedTimelineZoom(): number {
  if (typeof window === "undefined") return TIMELINE_ZOOM_DEFAULT;
  const raw = window.localStorage.getItem(TIMELINE_ZOOM_STORAGE_KEY);
  if (!raw) return TIMELINE_ZOOM_DEFAULT;
  const parsed = Number(raw);
  if (
    !Number.isFinite(parsed) ||
    parsed < TIMELINE_ZOOM_MIN ||
    parsed > TIMELINE_ZOOM_MAX
  ) {
    return TIMELINE_ZOOM_DEFAULT;
  }
  return parsed;
}

function saveTimelineZoom(zoom: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TIMELINE_ZOOM_STORAGE_KEY, String(zoom));
  } catch {
    /* per-session zoom still works */
  }
}

function clampTimelineZoom(value: number): number {
  if (!Number.isFinite(value)) return TIMELINE_ZOOM_DEFAULT;
  return Math.max(TIMELINE_ZOOM_MIN, Math.min(TIMELINE_ZOOM_MAX, value));
}

function clampCalendarEventsHeight(value: number) {
  if (!Number.isFinite(value)) return CALENDAR_EVENTS_HEIGHT_DEFAULT;
  return Math.min(
    CALENDAR_EVENTS_HEIGHT_MAX,
    Math.max(CALENDAR_EVENTS_HEIGHT_MIN, Math.round(value)),
  );
}

function loadCalendarEventsHeight() {
  if (typeof window === "undefined") return CALENDAR_EVENTS_HEIGHT_DEFAULT;
  const raw = window.localStorage.getItem(CALENDAR_EVENTS_HEIGHT_STORAGE_KEY);
  if (!raw) return CALENDAR_EVENTS_HEIGHT_DEFAULT;
  const parsed = Number(raw);
  return clampCalendarEventsHeight(parsed);
}

function saveCalendarEventsHeight(height: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      CALENDAR_EVENTS_HEIGHT_STORAGE_KEY,
      String(clampCalendarEventsHeight(height)),
    );
  } catch {
    // Resize still works for the session if storage is unavailable.
  }
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
  // Use the active timeline day (not calendar today) so opening the app
  // after midnight but before DAY_START_HOUR lands on the timeline window
  // the user is conceptually still inside.
  const [selectedDate, setSelectedDate] = useState(activeTimelineDayKey);
  const [calendarView, setCalendarView] = useState<CalendarView>("day");
  const [currentTasks, setCurrentTasks] = useState<Task[]>([]);
  const [previousTasks, setPreviousTasks] = useState<Task[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [templates, setTemplates] = useState<RoutineTemplate[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [sleepRecords, setSleepRecords] = useState<SleepRecord[]>([]);
  const [sleepTargetMinutes, setSleepTargetMinutes] = useState(8 * 60);
  // null = auto-hide off; 0 = hide on completion; positive = hide N days after.
  // Hydrated from loadPreferences() after mount.
  const [autoHideCompletedDays, setAutoHideCompletedDays] = useState<number | null>(
    null,
  );
  const [isHydrated, setIsHydrated] = useState(false);
  const [activeDrag, setActiveDrag] = useState<DragPayload | null>(null);
  // Vertical scale factor for the day-view timeline. 1.0 = native pixel
  // density (88px / hour). Smaller = more of the day fits in one screen;
  // larger = bigger blocks for short tasks. Declared up-front (rather
  // than alongside the other view-pref state below) because drag/drop
  // and resize callbacks defined earlier in this component close over
  // it — TDZ otherwise.
  const [timelineZoom, setTimelineZoom] = useState<number>(
    loadSavedTimelineZoom,
  );
  const persistTimelineZoom = useCallback((value: number) => {
    const clamped = clampTimelineZoom(value);
    setTimelineZoom(clamped);
    saveTimelineZoom(clamped);
  }, []);

  // ── Day-view zoom shortcuts ──
  // Alt + +/= / Alt + - / Alt + 0 for keyboard control; Alt + scroll
  // wheel for mouse zoom. Alt (rather than Ctrl/Cmd) avoids hijacking
  // the browser's own page-zoom shortcut.
  //
  // Skips:
  //  - other views (zoom only applies to the day timeline)
  //  - any other modifier held alongside Alt (so Ctrl-Alt-something
  //    keeps working for OS / IME / accessibility)
  //  - keystrokes while a text input is focused
  useEffect(() => {
    if (calendarView !== "day") return;

    const isEditableTarget = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return false;
      if (el.isContentEditable) return true;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    };

    const handleKeydown = (event: KeyboardEvent) => {
      if (!event.altKey) return;
      if (event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget()) return;
      let next: number | null = null;
      switch (event.key) {
        case "+":
        case "=":
          next = timelineZoom + TIMELINE_ZOOM_STEP;
          break;
        case "-":
        case "_":
          next = timelineZoom - TIMELINE_ZOOM_STEP;
          break;
        case "0":
          next = TIMELINE_ZOOM_DEFAULT;
          break;
        default:
          return;
      }
      event.preventDefault();
      persistTimelineZoom(next);
    };

    const handleWheel = (event: WheelEvent) => {
      if (!event.altKey) return;
      if (isEditableTarget()) return;
      event.preventDefault();
      const direction = event.deltaY < 0 ? 1 : -1;
      persistTimelineZoom(timelineZoom + direction * TIMELINE_ZOOM_STEP);
    };

    window.addEventListener("keydown", handleKeydown);
    // passive:false so we can preventDefault on wheel and stop the page
    // from scrolling while Alt-zooming.
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("keydown", handleKeydown);
      window.removeEventListener("wheel", handleWheel);
    };
  }, [calendarView, persistTimelineZoom, timelineZoom]);

  // Two-step "replace existing sleep on drop" prompt. The first drop sets
  // this; a second drop on the same date within the window confirms a
  // replace. Ref + state both, because handleDragEnd reads it sync (avoid
  // stale closure) but the toast renders from state.
  const sleepReplacePromptRef = useRef<{
    dateKey: string;
    expiresAt: number;
  } | null>(null);
  const [sleepReplacePrompt, setSleepReplacePrompt] = useState<{
    dateKey: string;
    expiresAt: number;
  } | null>(null);
  const sleepReplaceTimerRef = useRef<number | null>(null);

  const SLEEP_REPLACE_WINDOW_MS = 5000;

  const clearSleepReplacePrompt = useCallback(() => {
    if (sleepReplaceTimerRef.current !== null) {
      window.clearTimeout(sleepReplaceTimerRef.current);
      sleepReplaceTimerRef.current = null;
    }
    sleepReplacePromptRef.current = null;
    setSleepReplacePrompt(null);
  }, []);

  const requestSleepReplaceConfirmation = useCallback(
    (dateKey: string) => {
      if (sleepReplaceTimerRef.current !== null) {
        window.clearTimeout(sleepReplaceTimerRef.current);
      }
      const entry = {
        dateKey,
        expiresAt: Date.now() + SLEEP_REPLACE_WINDOW_MS,
      };
      sleepReplacePromptRef.current = entry;
      setSleepReplacePrompt(entry);
      sleepReplaceTimerRef.current = window.setTimeout(() => {
        sleepReplacePromptRef.current = null;
        setSleepReplacePrompt(null);
        sleepReplaceTimerRef.current = null;
      }, SLEEP_REPLACE_WINDOW_MS);
    },
    [SLEEP_REPLACE_WINDOW_MS],
  );

  // Clean up the timer on unmount so a stale tick can't touch state.
  useEffect(() => {
    return () => {
      if (sleepReplaceTimerRef.current !== null) {
        window.clearTimeout(sleepReplaceTimerRef.current);
      }
    };
  }, []);
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

  const refreshPlannerState = useCallback(() => {
    queueMicrotask(() => {
      // One-shot migrations are idempotent after their flag is set; safe to
      // call on every refresh because they early-return.
      migrateLegacyTodosOnce();
      backfillEstimateActualsOnce();

      let loadedCurrentTasks = loadDay(selectedDate);
      const loadedTemplates = loadTemplates();
      const backfilledRoutineDates = backfillRoutineSourceIds(loadedTemplates);
      if (backfilledRoutineDates.has(selectedDate)) {
        loadedCurrentTasks = loadDay(selectedDate);
      }

      setCurrentTasks(loadedCurrentTasks);
      setPreviousTasks(loadDay(addDays(selectedDate, -1)));
      setTodos(loadTodos());
      setTodoLists(loadTodoLists());
      setTemplates(loadedTemplates);
      setPeriods(loadPeriods());
      setEvents(loadEvents());
      setSleepRecords(loadSleepRecords());
      const prefs = loadPreferences();
      setSleepTargetMinutes(prefs.sleep_target_minutes);
      setAutoHideCompletedDays(prefs.auto_hide_completed_days);
      setDataRevision((revision) => revision + 1);
      setIsHydrated(true);
    });
  }, [selectedDate]);

  useEffect(() => {
    refreshPlannerState();
  }, [refreshPlannerState, cloudRevision]);

  /**
   * The toolbar's Refresh button used to only re-read localStorage, which
   * meant changes made on another device (Windows ↔ Mac) never showed up
   * until you signed out and back in. This wrapper pulls from cloud first
   * when signed in; the cloud pull bumps auth.dataRevision which triggers
   * the refreshPlannerState effect above, so we don't need to call it
   * twice. Falls back to a plain local refresh when signed out / cloud has
   * no data.
   */
  const handleRefresh = useCallback(async () => {
    const pulled = await auth.refreshFromCloud();
    if (!pulled) {
      refreshPlannerState();
    }
  }, [auth, refreshPlannerState]);

  // Pull from cloud when the tab regains focus or becomes visible. Cheap
  // way to catch up without standing up a realtime subscription — common
  // case is the user alt-tabs back after editing on another device.
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (auth.status !== "signed-in") return;
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void auth.refreshFromCloud();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [auth]);

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
        events,
        sleepRecords,
      ),
    [events, getTasksForDate, sleepRecords, templateById, todoById, todoListById],
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

  // Sister of allocatedMinutesByTodo, driving the estimate progress bar.
  // "Completed minutes" = past or today blocks linked to the todo, plus any
  // block that's been explicitly marked status="completed" (no UX path sets
  // that today, but the hook is here for when one lands). Future blocks
  // don't count — they're plans, not progress.
  const completedMinutesByTodo = useMemo(() => {
    void dataRevision;
    const today = todayKey();
    const totals = new Map<string, number>();
    for (const day of loadAllDays()) {
      const isPastOrToday = day.dateKey <= today;
      for (const task of day.tasks) {
        if (task.kind !== "task" || !task.source_id) continue;
        if (!isPastOrToday && task.status !== "completed") continue;
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
            completedMinutes: completedMinutesByTodo.get(todo.id) ?? 0,
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
    [
      allocatedMinutesByTodo,
      completedMinutesByTodo,
      defaultTodoList,
      todoLists,
      todos,
    ],
  );
  const inboxTasks = useMemo(
    () => todoTasks.filter((task) => task.status !== "completed"),
    [todoTasks],
  );

  const sleepTemplate = templates.find((template) => template.kind === "sleep");
  // Split sleep into two distinct blocks so the rail can show each
  // unambiguously. "Tonight" = sleep block whose storageDateKey is today
  // (just placed, may carry into tomorrow). "Last night" = sleep block
  // whose storageDateKey is yesterday and is still visible this morning
  // (the carryover that used to be conflated with tonight's block).
  const tonightSleep = visibleTasks.find(
    (task) => task.kind === "sleep" && task.storageDateKey === selectedDate,
  );
  const lastNightSleep = visibleTasks.find(
    (task) => task.kind === "sleep" && task.storageDateKey === previousDate,
  );

  const jumpToTask = useCallback((taskId: string) => {
    if (typeof document === "undefined") return;
    const node = document.querySelector<HTMLElement>(
      `[data-task-id="${CSS.escape(taskId)}"]`,
    );
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    // Flash a soft pulse so the user can spot which block they landed on,
    // then click it to open the placed-task editor. The CSS keyframe lives
    // in app/globals.css (`lr-pulse-once`).
    node.setAttribute("data-task-pulse", "true");
    window.setTimeout(() => {
      node.removeAttribute("data-task-pulse");
    }, 1500);
  }, []);

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
      // Only touch days that actually scheduled an allocation for this todo.
      // updateTasksForDay always calls saveDay (no diff check), so each loop
      // iteration costs a localStorage write — skipping empty days is a real
      // speedup once the user has months of history.
      for (const day of loadAllDays()) {
        if (!day.tasks.some((task) => task.source_id === todoId)) continue;
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

  const upsertEvent = useCallback((event: EventItem) => {
    setEvents((current) => {
      const exists = current.some((item) => item.id === event.id);
      const next = exists
        ? current.map((item) => (item.id === event.id ? event : item))
        : [...current, event];
      saveEvents(next);
      return next;
    });
  }, []);

  const deleteEvent = useCallback((eventId: string) => {
    setEvents((current) => {
      const next = current.filter((event) => event.id !== eventId);
      saveEvents(next);
      return next;
    });
  }, []);

  const deleteTask = useCallback(
    (task: VisibleTask) => {
      // Synthetic actual-sleep blocks live in sleepRecords state, not in
      // the day's task storage. Delete from there instead — the block
      // will return on the next HAE sync if the source data is still
      // present (no soft-delete in v1).
      if (task.id.startsWith("sleep-record:")) {
        const recordId = task.id.slice("sleep-record:".length);
        setSleepRecords((current) => {
          const next = current.filter((record) => record.id !== recordId);
          saveSleepRecords(next);
          return next;
        });
        return;
      }
      updateTasksForDay(task.storageDateKey, (tasks) =>
        tasks.filter((item) => item.id !== task.id),
      );
    },
    [updateTasksForDay],
  );

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

      // Drop target math: when the day view is zoomed, each pixel
      // covers fewer minutes, so divide by the active scale. Week view
      // is unaffected (zoom doesn't apply there).
      const dropZoom = calendarView === "day" ? timelineZoom : 1;
      const rawMinutes = pixelsToMinutes(yOffset) / dropZoom;
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
    [calendarView, getPointerPosition, selectedDate, timelineZoom],
  );

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
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
          commute_config: null,
          commute_estimate: null,
        });

        // Sleep blocks are conceptually one-per-night. Silently appending a
        // second one is almost always a mistake — warn on the first drop,
        // accept a confirming second drop within SLEEP_REPLACE_WINDOW_MS.
        if (template.kind === "sleep") {
          const existingTasks =
            destinationDate === selectedDate
              ? currentTasks
              : destinationDate === previousDate
                ? previousTasks
                : loadDay(destinationDate);
          const hasExistingSleep = existingTasks.some(
            (item) => item.kind === "sleep",
          );

          if (!hasExistingSleep) {
            updateTasksForDay(destinationDate, (tasks) => [...tasks, task]);
            return;
          }

          const pending = sleepReplacePromptRef.current;
          const isConfirmedReplace =
            pending !== null &&
            pending.dateKey === destinationDate &&
            pending.expiresAt > Date.now();

          if (isConfirmedReplace) {
            updateTasksForDay(destinationDate, (tasks) => [
              ...tasks.filter((item) => item.kind !== "sleep"),
              task,
            ]);
            clearSleepReplacePrompt();
          } else {
            requestSleepReplaceConfirmation(destinationDate);
          }
          return;
        }

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
      clearSleepReplacePrompt,
      currentTasks,
      draggableVisibleTasks,
      moveTaskToDate,
      previousDate,
      previousTasks,
      requestSleepReplaceConfirmation,
      selectedDate,
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
        // Drag-anchor: where on the block the cursor grabbed it. Has to
        // use the same scale as the rendered block, otherwise the drop
        // lands offset on a zoomed day timeline.
        const dragZoom = calendarView === "day" ? timelineZoom : 1;
        const taskTop = minutesToPixels(task.topMinutes) * dragZoom;
        const taskHeight = Math.max(
          1,
          minutesToPixels(task.visibleDurationMinutes) * dragZoom,
        );
        const grabOffset =
          event.activatorEvent.clientY - timelineRect.top - taskTop;
        dragAnchorOffsetRef.current = clampNumber(grabOffset, 0, taskHeight);
      }
    }

    setActiveDrag(payload);
  }, [calendarView, draggableVisibleTasks, timelineZoom]);

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
        // Resize math: how many minutes the cursor has moved. Same
        // pixel→minute conversion the rendered block uses, so day-view
        // zoom must divide here for the snap math to feel right.
        const resizeZoom = calendarView === "day" ? timelineZoom : 1;
        const delta = pixelsToMinutes(clientY - pointerStartY) / resizeZoom;

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
    [calendarView, moveTaskToDate, timelineZoom, updateTask, updateTasksForDay],
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

  const showRightRail = calendarView === "day" || calendarView === "week";

  if (!isHydrated) {
    return (
      <main className="min-h-screen bg-[color:var(--canvas)] px-3 py-3 text-[color:var(--ink)]">
        <div className="rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-6 text-[13px] text-[color:var(--ink-3)]">
          Loading routine...
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
      <main className="h-screen overflow-hidden bg-[color:var(--canvas)] p-3 text-[color:var(--ink)]">
        <div className="flex h-full min-w-0 gap-2">
          <div
            className="hidden min-h-0 shrink-0 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] lg:flex"
            style={{ width: leftRailWidth }}
          >
            <LeftRail
              inboxTasks={inboxTasks}
              todoTasks={todoTasks}
              todoLists={todoLists}
              selectedDate={selectedDate}
              autoHideCompletedDays={autoHideCompletedDays}
              addInboxTask={addInboxTask}
              updateReminder={updateReminder}
              deleteReminder={deleteReminder}
              upsertTodoList={upsertTodoList}
              deleteTodoList={deleteTodoList}
              periods={periods}
              upsertPeriod={upsertPeriod}
              deletePeriod={deletePeriod}
              events={events}
              upsertEvent={upsertEvent}
              deleteEvent={deleteEvent}
            />
          </div>

          <PaneResizeHandle
            label="Resize left pane"
            onPointerDown={(event) => beginPaneResize("left", event)}
            onKeyAdjust={(delta) => adjustPane("left", delta)}
            onReset={() => resetPane("left")}
          />

          <section className="flex min-h-0 min-w-[520px] flex-1 flex-col overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)]">
            <TopBar
              selectedDate={selectedDate}
              calendarView={calendarView}
              setCalendarView={setCalendarView}
              onSelectDate={setSelectedDate}
              sunTimes={sunTimes}
              isDarkMode={isDarkMode}
              onToggleTheme={toggleTheme}
              onRefresh={() => void handleRefresh()}
              onPrevious={() => moveCalendar(-1)}
              onNext={() => moveCalendar(1)}
              onToday={() => setSelectedDate(activeTimelineDayKey())}
              timelineZoom={timelineZoom}
              setTimelineZoom={persistTimelineZoom}
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
              <DayBar
                dateKey={selectedDate}
                sunTimes={sunTimes}
                scheduledCount={visibleTasks.length}
              />
            )}
            {calendarView === "day" && (
              <TimelineZoomContext.Provider value={timelineZoom}>
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
              </TimelineZoomContext.Provider>
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
                sleepRecords={sleepRecords}
                sleepTargetMinutes={sleepTargetMinutes}
                dataRevision={dataRevision}
              />
            )}
          </section>

          {showRightRail && (
            <>
              <PaneResizeHandle
                label="Resize right pane"
                onPointerDown={(event) => beginPaneResize("right", event)}
                onKeyAdjust={(delta) => adjustPane("right", delta)}
                onReset={() => resetPane("right")}
              />

              <div
                className="hidden min-h-0 shrink-0 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] lg:flex"
                style={{ width: rightRailWidth }}
              >
                <RightRail
                  sleepTemplate={sleepTemplate}
                  tonightSleep={tonightSleep}
                  lastNightSleep={lastNightSleep}
                  sleepTargetMinutes={sleepTargetMinutes}
                  setSleepTargetMinutes={persistSleepTarget}
                  onJumpToTask={jumpToTask}
                  templates={templates}
                  upsertTemplate={upsertTemplate}
                  deleteTemplate={deleteTemplate}
                />
              </div>
            </>
          )}
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
      {sleepReplacePrompt && (
        <SleepReplaceToast
          dateKey={sleepReplacePrompt.dateKey}
          onDismiss={clearSleepReplacePrompt}
        />
      )}
      <AuthDialog
        open={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        onSignIn={auth.signIn}
        onSignUp={auth.signUp}
        authError={auth.authError}
        clearError={auth.clearError}
      />
      <SyncConflictDialog
        conflict={auth.syncConflict}
        onResolve={auth.resolveConflict}
      />
    </DndContext>
  );
}

/**
 * Horizontal companion to PaneResizeHandle — used between vertically
 * stacked regions (currently the Calendar tab's todos / events split).
 * Drag up/down with the mouse, arrow keys nudge by 8 / 32 px,
 * double-click resets. Kept thin and visually subtle until hover.
 */
function RowResizeHandle({
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
      className="group flex h-1.5 w-full shrink-0 cursor-row-resize items-center justify-center bg-transparent transition-colors hover:bg-[color:var(--sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)]"
      title={`${label} — drag, double-click to reset, or use ↑ / ↓`}
      aria-label={label}
      onPointerDown={onPointerDown}
      onDoubleClick={onReset}
      onKeyDown={(event) => {
        if (event.key === "ArrowUp") {
          event.preventDefault();
          // Up = grow the bottom region (events take more space).
          onKeyAdjust(event.shiftKey ? 32 : 8);
        } else if (event.key === "ArrowDown") {
          event.preventDefault();
          onKeyAdjust(event.shiftKey ? -32 : -8);
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
      <span className="mx-12 h-px w-full rounded-full bg-[color:var(--line-soft)] transition-colors group-hover:bg-[color:var(--line-strong)]" />
    </button>
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
      className="group hidden w-1 shrink-0 cursor-col-resize items-stretch justify-center bg-transparent transition-colors hover:bg-[color:var(--sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[color:var(--ring)] lg:flex"
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
      <span className="my-6 w-px rounded-full bg-transparent transition-colors group-hover:bg-[color:var(--line-strong)]" />
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
  onRefresh: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Vertical zoom for the day timeline. Controls are only rendered when the day view is active. */
  timelineZoom: number;
  setTimelineZoom: (value: number) => void;
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
  onRefresh,
  onPrevious,
  onNext,
  onToday,
  timelineZoom,
  setTimelineZoom,
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
    <header className="flex shrink-0 items-center gap-3.5 border-b border-[color:var(--line-soft)] px-[18px] py-3">
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          onClick={onPrevious}
          aria-label="Previous"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div ref={datePickerRef} className="relative min-w-0">
          <button
            type="button"
            className="inline-flex max-w-[min(46vw,28rem)] items-center gap-2 whitespace-nowrap rounded-full border border-[color:var(--line)] bg-[color:var(--sunken)] px-3 py-1.5 text-[13px] font-medium tracking-[-0.005em] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]"
            aria-expanded={isDatePickerOpen}
            aria-haspopup="dialog"
            onClick={() => {
              if (!isDatePickerOpen) {
                setPickerMonth(selectedDate);
              }
              setIsDatePickerOpen(!isDatePickerOpen);
            }}
          >
            <CalendarDays className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)]" />
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
        <button
          type="button"
          className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          onClick={onNext}
          aria-label="Next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <ViewSwitcher value={calendarView} onChange={setCalendarView} />

      {calendarView === "day" && (
        <TimelineZoomControl
          value={timelineZoom}
          onChange={setTimelineZoom}
        />
      )}

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          aria-label={isDarkMode ? "Use light mode" : "Use dark mode"}
          title={isDarkMode ? "Light mode" : "Dark mode"}
        >
          {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRefresh}
          title="Refresh data"
          aria-label="Refresh data"
        >
          <RefreshCcw className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" variant="primary" onClick={onToday}>
          Today
        </Button>
        {accountSlot}
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
      className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-72 rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-3 text-[color:var(--ink)] shadow-[0_24px_48px_-12px_rgba(20,18,10,0.18)]"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, -1))}
          aria-label="Previous month"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="font-[family-name:var(--font-disp)] text-[15px] font-medium tracking-[-0.01em]">
          <em className="italic font-normal text-[color:var(--ink-2)]">
            {monthTitle.split(" ")[0]}{" "}
          </em>
          {monthTitle.split(" ").slice(1).join(" ")}
        </div>
        <button
          type="button"
          className="inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          onClick={() => onVisibleMonthChange(addMonths(visibleMonth, 1))}
          aria-label="Next month"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center font-[family-name:var(--font-mono)] text-[9.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
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
                "flex h-8 items-center justify-center rounded-[var(--r-sm)] font-[family-name:var(--font-mono)] text-[11.5px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                inMonth
                  ? "text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
                  : "text-[color:var(--ink-4)] hover:bg-[color:var(--sunken)]/60",
                isToday &&
                  !isSelected &&
                  "bg-[color:var(--sunken)] text-[color:var(--ink)] ring-1 ring-inset ring-[color:var(--line)]",
                isSelected &&
                  "bg-[color:var(--ink)] !text-[color:var(--card)] hover:bg-[color:var(--ink)]",
              )}
              onClick={() => onSelect(dateKey)}
            >
              {formatDayNumber(dateKey)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex justify-end border-t border-[color:var(--line-soft)] pt-3">
        <Button type="button" variant="soft" size="sm" onClick={() => onSelect(today)}>
          Jump to today
        </Button>
      </div>
    </div>
  );
}

type DayBarProps = {
  dateKey: string;
  sunTimes: SunTimes;
  scheduledCount: number;
};

function DayBar({ dateKey, sunTimes, scheduledCount }: DayBarProps) {
  const date = parseDateKey(dateKey);
  const weekday = new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
  }).format(date);
  const dayMonth = new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "long",
  }).format(date);

  return (
    <div className="flex shrink-0 items-center gap-3.5 border-b border-[color:var(--line-soft)] bg-[color:var(--bg)] px-[18px] py-2.5">
      <div className="font-[family-name:var(--font-disp)] text-[22px] font-medium tracking-[-0.015em] text-[color:var(--ink)]">
        {weekday}{" "}
        <em className="italic font-normal text-[color:var(--ink-2)]">
          {dayMonth}
        </em>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1 font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.04em] text-[color:var(--ink-2)]"
          title={`${sunTimes.locationLabel} sunrise ${sunTimes.sunriseLabel}, sunset ${sunTimes.sunsetLabel}.`}
        >
          <Sun className="h-3 w-3 text-[oklch(72%_0.14_60)]" />
          <span className="tabular-nums">
            {sunTimes.sunriseLabel} — {sunTimes.sunsetLabel}
          </span>
        </span>
        <span
          aria-hidden="true"
          className="hidden h-1 w-1 rounded-full bg-[color:var(--ink-4)] md:block"
        />
        <span className="hidden font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)] md:block">
          <span className="tabular-nums text-[color:var(--ink-2)]">
            {scheduledCount}
          </span>{" "}
          scheduled
        </span>
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
    <div className="inline-flex shrink-0 gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--sunken)] p-[3px]">
      {views.map((view) => (
        <button
          key={view}
          type="button"
          className={cn(
            "h-7 rounded-[7px] px-3.5 text-[12.5px] font-semibold capitalize tracking-[-0.005em] transition-colors",
            value === view
              ? "bg-[color:var(--card)] text-[color:var(--ink)] shadow-[0_1px_2px_rgba(20,18,10,0.06)]"
              : "text-[color:var(--ink-2)] hover:text-[color:var(--ink)]",
          )}
          onClick={() => onChange(view)}
        >
          {view}
        </button>
      ))}
    </div>
  );
}

/**
 * Vertical-zoom control for the day timeline. Three-button segmented
 * control: − [N%] +. The number doubles as a click target that resets
 * to 100%. Stepping is fixed at TIMELINE_ZOOM_STEP (0.1), clamped to
 * [TIMELINE_ZOOM_MIN, TIMELINE_ZOOM_MAX]. Pressed-disabled when the
 * current value is at the edge of the range.
 */
function TimelineZoomControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (value: number) => void;
}) {
  const atMin = value <= TIMELINE_ZOOM_MIN + 1e-6;
  const atMax = value >= TIMELINE_ZOOM_MAX - 1e-6;
  const percent = `${Math.round(value * 100)}%`;
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-[10px] border border-[color:var(--line)] bg-[color:var(--sunken)] p-[3px]"
      title="Zoom the day timeline · Alt+scroll or Alt+ / Alt− / Alt+0"
    >
      <button
        type="button"
        className="inline-grid h-6 w-6 place-items-center rounded-[7px] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--card)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={atMin}
        onClick={() => onChange(value - TIMELINE_ZOOM_STEP)}
        aria-label="Zoom out"
        title={`Zoom out (currently ${percent})`}
      >
        <Minus className="h-3 w-3" />
      </button>
      <button
        type="button"
        className="rounded-[7px] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] font-medium tabular-nums text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--card)] hover:text-[color:var(--ink)]"
        onClick={() => onChange(TIMELINE_ZOOM_DEFAULT)}
        aria-label="Reset zoom to 100%"
        title="Reset to 100%"
      >
        {percent}
      </button>
      <button
        type="button"
        className="inline-grid h-6 w-6 place-items-center rounded-[7px] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--card)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-40"
        disabled={atMax}
        onClick={() => onChange(value + TIMELINE_ZOOM_STEP)}
        aria-label="Zoom in"
        title={`Zoom in (currently ${percent})`}
      >
        <Plus className="h-3 w-3" />
      </button>
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
  sleepRecords,
  sleepTargetMinutes,
  dataRevision,
}: {
  selectedDate: string;
  todos: TodoItem[];
  todoLists: TodoList[];
  templates: RoutineTemplate[];
  sleepRecords: SleepRecord[];
  sleepTargetMinutes: number;
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

  const completion = useMemo(() => {
    void dataRevision;
    return buildCompletionStats({ startDate, endDate, todos, todoLists });
  }, [dataRevision, endDate, startDate, todoLists, todos]);

  const accuracy = useMemo(() => {
    void dataRevision;
    return buildEstimateAccuracyStats({
      startDate,
      endDate,
      todos,
      todoLists,
    });
  }, [dataRevision, endDate, startDate, todoLists, todos]);

  const sleepStats = useMemo(() => {
    void dataRevision;
    return buildSleepStats({
      startDate,
      endDate,
      sleepRecords,
      sleepTargetMinutes,
    });
  }, [dataRevision, endDate, sleepRecords, sleepTargetMinutes, startDate]);

  const totalMinutes = summary.routineMinutes + summary.todoMinutes;
  const maxRoutineMinutes = Math.max(
    1,
    ...summary.routineRows.map((row) => row.minutes),
  );
  const maxTodoMinutes = Math.max(1, ...summary.todoRows.map((row) => row.minutes));
  const maxListMinutes = Math.max(1, ...summary.listRows.map((row) => row.minutes));
  const maxCompletionsPerList = Math.max(
    1,
    ...completion.byList.map((row) => row.completed),
  );
  const maxCompletionsPerDay = Math.max(
    1,
    ...completion.daily.map((row) => row.count),
  );
  const onTimePercent = completion.completedWithDueCount
    ? Math.round(
        (completion.onTimeCount / completion.completedWithDueCount) * 100,
      )
    : null;

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
    <section className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--card)] p-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="text-lg font-semibold text-[color:var(--ink)]">
              Time statistics
            </div>
            <div className="mt-1 text-xs text-[color:var(--ink-2)]">
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

        <div className="mt-2 flex flex-col gap-1">
          <div className="text-lg font-semibold text-[color:var(--ink)]">
            Reminder completion
          </div>
          <div className="text-xs text-[color:var(--ink-2)]">
            Based on when each reminder was checked off. &ldquo;Overdue&rdquo;
            is range-independent — it shows reminders currently past due.
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <StatsMetric
            label="Completed"
            value={String(completion.completedCount)}
          />
          <StatsMetric
            label="On-time"
            value={onTimePercent === null ? "—" : `${onTimePercent}%`}
          />
          <StatsMetric
            label="With deadline"
            value={String(completion.completedWithDueCount)}
          />
          <StatsMetric
            label="Currently overdue"
            value={String(completion.overdueCount)}
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <StatsPanel title="By list">
            {completion.byList.length ? (
              completion.byList.map((row) => (
                <StatsCountRow
                  key={row.id}
                  title={row.name}
                  color={row.color}
                  count={row.completed}
                  maxCount={maxCompletionsPerList}
                />
              ))
            ) : (
              <StatsEmpty text="No reminders completed in this range." />
            )}
          </StatsPanel>

          <StatsPanel title="By category">
            <CategoryCompletionBreakdown counts={completion.byCategory} />
          </StatsPanel>
        </div>

        <StatsPanel title="Daily completions">
          {completion.daily.some((day) => day.count > 0) ? (
            <CompletionDailyChart
              days={completion.daily}
              maxCount={maxCompletionsPerDay}
            />
          ) : (
            <StatsEmpty text="No completions to plot in this range." />
          )}
        </StatsPanel>

        <div className="mt-2 flex flex-col gap-1">
          <div className="text-lg font-semibold text-[color:var(--ink)]">
            Estimate accuracy
          </div>
          <div className="text-xs text-[color:var(--ink-2)]">
            How AI estimates compared to actual time spent on completed
            reminders. Each dot is one task — ones above the diagonal took
            longer than estimated.
          </div>
        </div>
        <EstimateAccuracySection accuracy={accuracy} />

        <div className="mt-2 flex flex-col gap-1">
          <div className="text-lg font-semibold text-[color:var(--ink)]">
            Sleep
          </div>
          <div className="text-xs text-[color:var(--ink-2)]">
            Imported from Apple Health (and any other tracker that POSTs
            to /api/health/sleep). Bars are total minutes per the night you
            woke up on — green = at or above target, amber = within 80%,
            red = under.
          </div>
        </div>
        <SleepStatsSection
          summary={sleepStats}
          sleepTargetMinutes={sleepTargetMinutes}
        />
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
    <label className="block text-[11px] font-medium uppercase tracking-wide text-[color:var(--ink-3)]">
      {label}
      <span className="relative mt-1 flex h-8 w-[132px] items-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 text-left text-xs font-medium leading-none tabular-nums text-[color:var(--ink)] transition-colors focus-within:border-[color:var(--line-strong)] focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
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
    <div className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--sunken)]/55 p-4">
      <div className="text-[11px] font-medium uppercase tracking-wide text-[color:var(--ink-3)]">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums text-[color:var(--ink)]">
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
    <div className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-4 shadow-[0_10px_28px_-20px_rgba(20,18,10,0.28)]">
      <div className="mb-3 text-sm font-semibold text-[color:var(--ink)]">
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
          <div className="truncate font-medium text-[color:var(--ink)]">
            {title}
          </div>
          <div className="truncate text-[11px] text-[color:var(--ink-3)]">
            {meta}
          </div>
        </div>
        <div className="shrink-0 font-semibold tabular-nums text-[color:var(--ink)]">
          {formatStatsHours(minutes)}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--sunken)]">
        <div className="h-full rounded-full bg-[color:var(--ink)]" style={{ width }} />
      </div>
    </div>
  );
}

function StatsEmpty({ text }: { text: string }) {
  return (
    <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-3 py-5 text-center text-xs text-[color:var(--ink-3)]">
      {text}
    </div>
  );
}

const TIME_RANGE_FMT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * Returns a friendly day label relative to today: "Today" / "Tomorrow" /
 * "Wed" within the next week / "Mon, May 30" further out. Keeps the
 * pinned events list compact while still placing each event in time.
 */
function relativeDayLabel(date: Date, todayDateKey: string): string {
  const dateKey = formatDateKey(date);
  if (dateKey === todayDateKey) return "Today";
  // addDays returns a key string for "today + N".
  if (dateKey === addDays(todayDateKey, 1)) return "Tomorrow";
  const today = parseDateKey(todayDateKey);
  const diffDays = Math.round(
    (date.getTime() - today.getTime()) / (24 * 60 * 60 * 1000),
  );
  if (diffDays > 0 && diffDays < 7) {
    return new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(date);
}

/**
 * Pinned bottom region inside the Calendar rail tab: a short glance of
 * what's coming up across all upcoming days. Fixed max-height with its
 * own scroll so it can't overflow the rail.
 */
function CalendarTabUpcomingEvents({
  events,
  todoLists,
  todayDateKey,
  heightPx,
  onManage,
}: {
  events: EventItem[];
  todoLists: TodoList[];
  todayDateKey: string;
  heightPx: number;
  onManage: () => void;
}) {
  return (
    <div
      className="flex shrink-0 flex-col bg-[color:var(--card)] px-3.5 pb-3 pt-2"
      style={{ height: heightPx }}
    >
      <div className="mb-1 flex items-center justify-between">
        <div className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Upcoming events
        </div>
        <button
          type="button"
          onClick={onManage}
          className="rounded p-1 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
          title="Manage events"
          aria-label="Manage events"
        >
          <Plus className="h-3 w-3" />
        </button>
      </div>
      {events.length === 0 ? (
        <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-3 py-2.5 text-center text-[11px] text-[color:var(--ink-3)]">
          Nothing scheduled.
        </div>
      ) : (
        // Fills the user-controlled region height; internal scroll handles
        // overflow when there are more events than fit.
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-0.5 [scrollbar-color:var(--line)_transparent]">
          {events.map((event) => {
            const list = todoLists.find((l) => l.id === event.list_id);
            const listStyles = list
              ? todoListColorTokens(list.color)
              : null;
            const start = new Date(event.starts_at);
            const end = new Date(
              start.getTime() + event.duration_minutes * 60_000,
            );
            const timeRange = `${TIME_RANGE_FMT.format(start)} – ${TIME_RANGE_FMT.format(end)}`;
            const dayLabel = relativeDayLabel(start, todayDateKey);
            // Reuse the deadline-urgency scale on the day label so the
            // closest events visually pop. <1h = rose, <4h = orange, today
            // = amber, ≤3d = yellow.
            const urgency = eventUrgencyTokens(event);
            return (
              <li
                key={event.id}
                className="flex items-center gap-2 rounded-[10px] border border-transparent p-1.5 hover:border-[color:var(--line-soft)] hover:bg-[color:var(--hover)]"
              >
                <span
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--block-event)] text-[color:var(--block-event-ink)]"
                  aria-hidden
                >
                  {(() => {
                    const Icon =
                      EVENT_TYPE_ICONS[event.event_type] ?? Clock;
                    return <Icon className="h-3 w-3" />;
                  })()}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold leading-[1.2] text-[color:var(--ink)]">
                    {event.title}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 whitespace-nowrap font-[family-name:var(--font-mono)] text-[10px] text-[color:var(--ink-3)]">
                    <span
                      className={cn(
                        "rounded px-1 py-0.5",
                        urgency?.pill ?? "text-[color:var(--ink-3)]",
                      )}
                    >
                      {dayLabel}
                    </span>
                    <span className="truncate">{timeRange}</span>
                    {list && listStyles && (
                      <span
                        className={cn(
                          "inline-flex h-3.5 shrink-0 items-center truncate rounded border px-1 text-[9px] font-medium",
                          listStyles.block,
                          listStyles.text,
                        )}
                      >
                        {list.name}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Floating warning shown after the user drops a Sleep template on a day that
 * already has one. A second drop on the same day within the prompt window
 * replaces the existing block; otherwise the prompt times out and disappears.
 */
function SleepReplaceToast({
  dateKey,
  onDismiss,
}: {
  dateKey: string;
  onDismiss: () => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-5 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-start gap-3 rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] px-4 py-3 text-[13px] text-[color:var(--ink)] shadow-[0_18px_44px_-22px_rgba(20,18,10,0.45)]"
    >
      <Moon className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--ink-2)]" />
      <div className="min-w-0">
        <div className="font-medium">
          Sleep already scheduled on {formatDayLabel(dateKey)}
        </div>
        <div className="mt-0.5 text-[12px] text-[color:var(--ink-2)]">
          Drop again within 5s to replace it.
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="ml-1 -mr-1 -mt-1 rounded p-1 text-[color:var(--ink-3)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Count-based variant of StatsRow used by the reminder-completion panels —
 * shows an integer count with a colored bar tinted by the list's palette.
 */
function StatsCountRow({
  title,
  color,
  count,
  maxCount,
}: {
  title: string;
  color: TodoListColor;
  count: number;
  maxCount: number;
}) {
  const width = `${Math.max(4, Math.round((count / maxCount) * 100))}%`;
  const styles = todoListColorTokens(color);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", styles.accent)} />
          <span className="truncate font-medium text-[color:var(--ink)]">
            {title}
          </span>
        </div>
        <div className="shrink-0 font-semibold tabular-nums text-[color:var(--ink)]">
          {count}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[color:var(--sunken)]">
        <div
          className={cn("h-full rounded-full", styles.accent)}
          style={{ width }}
        />
      </div>
    </div>
  );
}

function CategoryCompletionBreakdown({
  counts,
}: {
  counts: Record<Category, number>;
}) {
  const total = counts.T0 + counts.T1 + counts.T2;
  if (!total) {
    return <StatsEmpty text="No reminders completed in this range." />;
  }
  const order: Category[] = ["T0", "T1", "T2"];
  const labels: Record<Category, string> = {
    T0: "T0 · critical",
    T1: "T1 · important",
    T2: "T2 · everything else",
  };
  return (
    <div className="space-y-3">
      {order.map((cat) => {
        const count = counts[cat];
        const pct = total ? Math.round((count / total) * 100) : 0;
        const width = `${Math.max(4, pct)}%`;
        const tokens = categoryTokens(cat);
        return (
          <div key={cat}>
            <div className="mb-1 flex items-center justify-between gap-3 text-xs">
              <div className="flex min-w-0 items-center gap-2">
                <span
                  className={cn(
                    "inline-flex h-5 min-w-[28px] items-center justify-center rounded-md px-1.5 font-[family-name:var(--font-mono)] text-[10px] font-medium",
                    tokens.chip,
                  )}
                >
                  {cat}
                </span>
                <span className="truncate text-[color:var(--ink-2)]">
                  {labels[cat]}
                </span>
              </div>
              <div className="shrink-0 font-semibold tabular-nums text-[color:var(--ink)]">
                {count}
                <span className="ml-1 text-[10.5px] font-medium text-[color:var(--ink-3)]">
                  {pct}%
                </span>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[color:var(--sunken)]">
              <div
                className="h-full rounded-full bg-[color:var(--ink)]"
                style={{ width: count ? width : "0%" }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Sleep trend chart + summary metrics. Each bar represents one day in
 * range; height is total sleep minutes for the night that ended that
 * morning. Color encodes target proximity so a glance at the chart shows
 * weeks of "on target" vs "under" without reading numbers.
 */
function SleepStatsSection({
  summary,
  sleepTargetMinutes,
}: {
  summary: import("@/components/planner/types").SleepStatsSummary;
  sleepTargetMinutes: number;
}) {
  if (!summary.daysWithData) {
    return (
      <StatsPanel title="Trend">
        <StatsEmpty text="No sleep data in this range yet. Connect Health Auto Export in Settings to start syncing." />
      </StatsPanel>
    );
  }
  // Anchor the y-axis at max(largest day, 9h target+15%) so the target
  // line sits comfortably inside the chart even on light-sleep weeks.
  const referenceMax = Math.max(
    sleepTargetMinutes,
    ...summary.daily.map((row) => row.minutes),
  );
  const chartMaxMinutes = Math.max(60, Math.ceil(referenceMax * 1.05));
  const targetPct = (sleepTargetMinutes / chartMaxMinutes) * 100;
  const labelStride =
    summary.daily.length > 28 ? 7 : summary.daily.length > 14 ? 3 : 1;
  const formatHrs = (minutes: number | null) => {
    if (minutes === null || minutes === 0) return "—";
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  };

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        <StatsMetric label="Average" value={formatHrs(summary.averageMinutes)} />
        <StatsMetric label="Median" value={formatHrs(summary.medianMinutes)} />
        <StatsMetric
          label="Below target"
          value={`${summary.daysBelowTargetCount} / ${summary.daysWithData}`}
        />
      </div>
      <StatsPanel title="Trend">
        <div>
          <div className="relative flex h-32 items-end gap-1">
            {/* Target line — dashed horizontal across the chart so each bar
                can be compared to it without staring at numbers. */}
            <div
              className="pointer-events-none absolute inset-x-0 border-t border-dashed border-[color:var(--ink-3)]/55"
              style={{ bottom: `${targetPct}%` }}
              aria-hidden="true"
            />
            {summary.daily.map((day) => {
              const heightPct = day.minutes
                ? Math.max(
                    6,
                    Math.round((day.minutes / chartMaxMinutes) * 100),
                  )
                : 0;
              const fillColor = !day.minutes
                ? "bg-[color:var(--sunken)]"
                : day.minutes >= sleepTargetMinutes
                ? "bg-emerald-500/85"
                : day.minutes >= sleepTargetMinutes * 0.8
                ? "bg-amber-400/85"
                : "bg-rose-400/85";
              return (
                <div
                  key={day.dateKey}
                  className="flex flex-1 flex-col items-center justify-end"
                  title={`${day.dateKey} · ${formatHrs(day.minutes)}${
                    day.minutes < sleepTargetMinutes && day.minutes > 0
                      ? ` · ${formatHrs(
                          sleepTargetMinutes - day.minutes,
                        )} below target`
                      : ""
                  }`}
                >
                  <div
                    className={cn("w-full rounded-sm", fillColor)}
                    style={{
                      height: `${heightPct}%`,
                      minHeight: day.minutes ? 2 : 0,
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-1 text-[10px] font-[family-name:var(--font-mono)] text-[color:var(--ink-3)]">
            {summary.daily.map((day, index) => (
              <div key={day.dateKey} className="flex-1 text-center">
                {index % labelStride === 0 ? day.dateKey.slice(-5) : ""}
              </div>
            ))}
          </div>
          <div className="mt-2 text-[11px] text-[color:var(--ink-3)]">
            Target: {formatHrs(sleepTargetMinutes)} · dashed line marks the
            target threshold.
          </div>
        </div>
      </StatsPanel>
    </>
  );
}

function CompletionDailyChart({
  days,
  maxCount,
}: {
  days: { dateKey: string; count: number }[];
  maxCount: number;
}) {
  // Show day-of-month labels only every Nth column to avoid crowding on long
  // ranges. Sparse labels still let users orient on month/week boundaries.
  const labelStride = days.length > 28 ? 7 : days.length > 14 ? 3 : 1;
  return (
    <div>
      <div className="flex h-32 items-end gap-1">
        {days.map((day) => {
          const heightPct = day.count
            ? Math.max(6, Math.round((day.count / maxCount) * 100))
            : 0;
          return (
            <div
              key={day.dateKey}
              className="flex flex-1 flex-col items-center justify-end"
              title={`${day.dateKey} · ${day.count} completed`}
            >
              <div
                className={cn(
                  "w-full rounded-sm",
                  day.count
                    ? "bg-[color:var(--ink)]"
                    : "bg-[color:var(--sunken)]",
                )}
                style={{ height: `${heightPct}%`, minHeight: day.count ? 2 : 0 }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-1 text-[10px] font-[family-name:var(--font-mono)] text-[color:var(--ink-3)]">
        {days.map((day, index) => (
          <div key={day.dateKey} className="flex-1 text-center">
            {index % labelStride === 0 ? day.dateKey.slice(-5) : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Composite for the "Estimate accuracy" section: 4 metric tiles + calibration
 * scatter + per-list breakdown. Renders an empty state when no completed
 * todos in range have both an estimate snapshot and an actual.
 */
function EstimateAccuracySection({
  accuracy,
}: {
  accuracy: import("@/components/planner/types").StatsEstimateAccuracySummary;
}) {
  if (!accuracy.points.length) {
    return (
      <StatsPanel title="Calibration">
        <StatsEmpty text="No completed reminders with an estimate yet in this range. Estimate a task, then complete it to start tracking accuracy." />
      </StatsPanel>
    );
  }

  const samples = accuracy.points.length;
  const medianRatioLabel =
    accuracy.medianRatio != null ? `${accuracy.medianRatio.toFixed(2)}×` : "—";
  const mapeLabel =
    accuracy.mapePct != null ? `${Math.round(accuracy.mapePct)}%` : "—";
  const biasLabel = accuracy.meanSignedErrorMinutes != null
    ? `${accuracy.meanSignedErrorMinutes >= 0 ? "+" : ""}${Math.round(accuracy.meanSignedErrorMinutes)}m`
    : "—";
  const coverageLabel = accuracy.rangeCoverage
    ? `${accuracy.rangeCoverage.withinRange} / ${accuracy.rangeCoverage.withRange}`
    : "—";

  const maxRatioForList = Math.max(
    1,
    ...accuracy.byList.map((row) => row.medianRatio),
  );

  return (
    <>
      <div className="grid gap-3 md:grid-cols-4">
        <StatsMetric
          label={`Samples (${samples})`}
          value={medianRatioLabel}
        />
        <StatsMetric label="MAPE" value={mapeLabel} />
        <StatsMetric label="Bias (avg)" value={biasLabel} />
        <StatsMetric label="In P25-P90" value={coverageLabel} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <StatsPanel title="Calibration (estimated vs actual)">
          <CalibrationScatter points={accuracy.points} />
          <p className="mt-2 text-[11px] text-[color:var(--ink-3)]">
            Dots above the dashed diagonal took longer than estimated; below =
            finished faster. Closer to the line is more accurate.
          </p>
        </StatsPanel>

        <StatsPanel title="By list">
          {accuracy.byList.length ? (
            accuracy.byList.map((row) => (
              <StatsRatioRow
                key={row.id}
                title={row.name}
                color={row.color}
                ratio={row.medianRatio}
                samples={row.samples}
                maxRatio={maxRatioForList}
              />
            ))
          ) : (
            <StatsEmpty text="No per-list breakdown yet." />
          )}
        </StatsPanel>
      </div>
    </>
  );
}

/**
 * Minimal SVG scatter — one circle per (estimated, actual) point with a
 * dashed identity line for reference. The axis range is chosen to fit the
 * largest of the two minute values across all points; perfectly-on-line
 * estimates land on the diagonal.
 */
function CalibrationScatter({
  points,
}: {
  points: import("@/components/planner/types").StatsAccuracyPoint[];
}) {
  const maxMin = Math.max(
    60,
    ...points.flatMap((p) => [p.estimatedMinutes, p.actualMinutes]),
  );
  // Round up to a nice axis bound so labels look clean.
  const niceMax = (() => {
    if (maxMin <= 60) return 60;
    if (maxMin <= 120) return 120;
    if (maxMin <= 240) return 240;
    if (maxMin <= 480) return 480;
    if (maxMin <= 960) return 960;
    return Math.ceil(maxMin / 480) * 480;
  })();

  const size = 280;
  const pad = 32;
  const inner = size - 2 * pad;
  const scale = (m: number) => pad + (m / niceMax) * inner;

  // 3 axis ticks: 0, mid, max.
  const ticks = [0, niceMax / 2, niceMax];
  const fmt = (m: number) => (m >= 60 ? `${(m / 60).toFixed(m % 60 ? 1 : 0)}h` : `${m}m`);

  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="h-72 w-full" role="img">
      {/* axes */}
      <line
        x1={pad}
        y1={size - pad}
        x2={size - pad}
        y2={size - pad}
        stroke="currentColor"
        opacity={0.25}
      />
      <line
        x1={pad}
        y1={pad}
        x2={pad}
        y2={size - pad}
        stroke="currentColor"
        opacity={0.25}
      />
      {/* diagonal: perfect estimate */}
      <line
        x1={pad}
        y1={size - pad}
        x2={size - pad}
        y2={pad}
        stroke="currentColor"
        strokeDasharray="4 4"
        opacity={0.35}
      />
      {/* tick labels */}
      {ticks.map((t) => (
        <g key={t}>
          <text
            x={scale(t)}
            y={size - pad + 14}
            fontSize="9"
            textAnchor="middle"
            fill="currentColor"
            opacity={0.55}
          >
            {fmt(t)}
          </text>
          <text
            x={pad - 6}
            y={size - scale(t) + 3}
            fontSize="9"
            textAnchor="end"
            fill="currentColor"
            opacity={0.55}
          >
            {fmt(t)}
          </text>
        </g>
      ))}
      {/* axis titles */}
      <text
        x={size / 2}
        y={size - 4}
        fontSize="10"
        textAnchor="middle"
        fill="currentColor"
        opacity={0.6}
      >
        estimated
      </text>
      <text
        x={10}
        y={size / 2}
        fontSize="10"
        textAnchor="middle"
        fill="currentColor"
        opacity={0.6}
        transform={`rotate(-90 10 ${size / 2})`}
      >
        actual
      </text>
      {/* data points */}
      {points.map((p) => (
        <circle
          key={p.id}
          cx={scale(Math.min(p.estimatedMinutes, niceMax))}
          cy={size - scale(Math.min(p.actualMinutes, niceMax))}
          r={4}
          fill="currentColor"
          opacity={0.65}
        >
          <title>{`${p.title} · est ${fmt(p.estimatedMinutes)} → actual ${fmt(p.actualMinutes)} (${p.ratio.toFixed(2)}×)`}</title>
        </circle>
      ))}
    </svg>
  );
}

/**
 * Per-list ratio row: a horizontal bar where 1× = perfect (center marker),
 * bars extending right mean the user overshot on that list. Color reflects
 * the list's palette.
 */
function StatsRatioRow({
  title,
  color,
  ratio,
  samples,
  maxRatio,
}: {
  title: string;
  color: TodoListColor;
  ratio: number;
  samples: number;
  maxRatio: number;
}) {
  const widthPct = Math.max(4, Math.round((ratio / Math.max(1, maxRatio)) * 100));
  const styles = todoListColorTokens(color);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3 text-xs">
        <div className="flex min-w-0 items-center gap-2">
          <span className={cn("h-2 w-2 shrink-0 rounded-full", styles.accent)} />
          <span className="truncate font-medium text-[color:var(--ink)]">
            {title}
          </span>
        </div>
        <div className="shrink-0 font-semibold tabular-nums text-[color:var(--ink)]">
          {ratio.toFixed(2)}×{" "}
          <span className="ml-1 font-[family-name:var(--font-mono)] text-[10px] font-medium text-[color:var(--ink-3)]">
            n={samples}
          </span>
        </div>
      </div>
      <div className="relative h-2 overflow-hidden rounded-full bg-[color:var(--sunken)]">
        <div
          className={cn("h-full rounded-full", styles.accent)}
          style={{ width: `${widthPct}%` }}
        />
        {/* "perfect estimate" marker at 1× position */}
        <div
          className="absolute top-0 h-2 w-px bg-[color:var(--ink)] opacity-50"
          style={{ left: `${Math.round((1 / Math.max(1, maxRatio)) * 100)}%` }}
        />
      </div>
    </div>
  );
}

type LeftRailProps = {
  inboxTasks: TodoWithMeta[];
  todoTasks: TodoWithMeta[];
  todoLists: TodoList[];
  selectedDate: string;
  autoHideCompletedDays: number | null;
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
  periods: Period[];
  upsertPeriod: (period: Period) => void;
  deletePeriod: (periodId: string) => void;
  events: EventItem[];
  upsertEvent: (event: EventItem) => void;
  deleteEvent: (eventId: string) => void;
};

function LeftRail({
  inboxTasks,
  todoTasks,
  todoLists,
  selectedDate,
  autoHideCompletedDays,
  addInboxTask,
  updateReminder,
  deleteReminder,
  upsertTodoList,
  deleteTodoList,
  events,
  upsertEvent,
  deleteEvent,
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
  const [activeView, setActiveView] = useState<LeftRailView>("calendar");
  const [collapsedTodoListIds, setCollapsedTodoListIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [sortCalendarTodosByDueDate, setSortCalendarTodosByDueDate] =
    useState(loadSavedCalendarTodoSort);
  // Manual "Hide done" toggle on the Reminders tab. Persisted so the user
  // doesn't have to re-toggle each reload. Independent from the
  // auto_hide_completed_days preference — when EITHER is active, completed
  // items get filtered.
  const [hideDoneReminders, setHideDoneReminders] = useState(
    loadSavedHideDoneReminders,
  );
  // Height in pixels of the pinned upcoming-events region in the Calendar
  // tab. User-resizable via the drag handle that separates the todos area
  // (above) from the events area (below). Persisted to localStorage.
  const [calendarEventsHeight, setCalendarEventsHeight] = useState(
    loadCalendarEventsHeight,
  );

  const beginCalendarSplitResize = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      const startY = event.clientY;
      const startHeight = calendarEventsHeight;
      const previousCursor = document.body.style.cursor;
      const previousUserSelect = document.body.style.userSelect;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        // Drag UP = grow the bottom region; drag DOWN = shrink it.
        const next = clampCalendarEventsHeight(
          startHeight - (pointerEvent.clientY - startY),
        );
        setCalendarEventsHeight(next);
      };
      const stop = () => {
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousUserSelect;
        setCalendarEventsHeight((current) => {
          saveCalendarEventsHeight(current);
          return current;
        });
      };
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stop);
      window.addEventListener("pointercancel", stop);
    },
    [calendarEventsHeight],
  );

  const adjustCalendarSplit = useCallback((delta: number) => {
    setCalendarEventsHeight((current) => {
      const next = clampCalendarEventsHeight(current + delta);
      saveCalendarEventsHeight(next);
      return next;
    });
  }, []);

  const resetCalendarSplit = useCallback(() => {
    setCalendarEventsHeight(() => {
      saveCalendarEventsHeight(CALENDAR_EVENTS_HEIGHT_DEFAULT);
      return CALENDAR_EVENTS_HEIGHT_DEFAULT;
    });
  }, []);

  const toggleCalendarTodoSort = useCallback(() => {
    setSortCalendarTodosByDueDate((current) => {
      const next = !current;
      saveCalendarTodoSort(next);
      return next;
    });
  }, []);

  const toggleHideDoneReminders = useCallback(() => {
    setHideDoneReminders((current) => {
      const next = !current;
      saveHideDoneReminders(next);
      return next;
    });
  }, []);

  // Anchor "now" in state so the auto-hide filter is deterministic across
  // re-renders (Date.now() inside useMemo would violate React's purity rule
  // and make memo cache unreliable). We refresh the anchor whenever a todo
  // mutation might affect the result, plus once per minute to catch the
  // day rolling over in a tab that's been open for a while.
  const [nowEpochMs, setNowEpochMs] = useState<number | null>(null);
  useEffect(() => {
    // Canonical "hydrate Date.now() on mount" pattern — same shape as the
    // theme/storage hydration effects in this file.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNowEpochMs(Date.now());
    if (autoHideCompletedDays === null) return;
    const interval = window.setInterval(() => setNowEpochMs(Date.now()), 60_000);
    return () => window.clearInterval(interval);
  }, [autoHideCompletedDays, todoTasks]);

  // Filter completed todos out of the reminders view when either:
  //   - the user toggled "Hide done" on, OR
  //   - the auto-hide-after-N-days preference matches a completion stamp.
  // `pending` todos always pass through.
  const visibleTodoTasks = useMemo(() => {
    const autoCutoffMs =
      autoHideCompletedDays === null || nowEpochMs === null
        ? null
        : nowEpochMs - autoHideCompletedDays * 24 * 60 * 60 * 1000;

    return todoTasks.filter((task) => {
      if (task.status !== "completed") return true;
      if (hideDoneReminders) return false;
      if (autoCutoffMs === null) return true;
      const completedAt = task.completed_at
        ? Date.parse(task.completed_at)
        : NaN;
      if (Number.isNaN(completedAt)) return true; // legacy todos with no stamp stay visible
      return completedAt > autoCutoffMs;
    });
  }, [todoTasks, hideDoneReminders, autoHideCompletedDays, nowEpochMs]);

  const toggleTodoListCollapse = useCallback((listId: string) => {
    setCollapsedTodoListIds((current) => {
      const next = new Set(current);
      if (next.has(listId)) {
        next.delete(listId);
      } else {
        next.add(listId);
      }
      return next;
    });
  }, []);

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

      // Ensure any new list names referenced by the parser exist before we
      // start creating tasks/events that point at them.
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

      // Reverse so the order in the UI matches the order in the input (the
      // addInboxTask call prepends to the list).
      for (const item of [...items].reverse()) {
        const list =
          listByName.get(listNameKey(item.listName)) ??
          listByName.get("inbox") ??
          todoLists[0];
        const listId = list?.id ?? "list-inbox";

        if (item.kind === "event" && item.dueDate && item.dueTime) {
          // The classifier said this is a fixed-time happening; build an
          // Event and skip the todo path entirely. The "&& dueDate && dueTime"
          // guard mirrors the server normalizer so we never end up with a
          // timeless event.
          const startsAt = new Date(
            `${item.dueDate}T${item.dueTime}:00`,
          ).toISOString();
          upsertEvent(
            createEvent({
              title: item.title,
              category: item.category,
              list_id: listId,
              starts_at: startsAt,
              duration_minutes: item.durationMinutes ?? 60,
              duration_uncertain: item.durationUncertain,
              tags: item.tags,
            }),
          );
          continue;
        }

        addInboxTask(
          item.title,
          item.category,
          item.dueDate,
          item.dueTime,
          item.tags,
          listId,
        );
      }
    },
    [addInboxTask, todoLists, upsertEvent, upsertTodoList],
  );

  const calendarInboxTasks = useMemo(
    () =>
      sortCalendarTodosByDueDate
        ? [...inboxTasks].sort(compareTodosByDueDate)
        : inboxTasks,
    [inboxTasks, sortCalendarTodosByDueDate],
  );

  // Upcoming events — pinned to the bottom of the Calendar rail tab so
  // the user always sees what's coming without scrolling past the day's
  // todos. "Upcoming" = scheduled, not yet ended, sorted by start time.
  // Cap at MAX_UPCOMING so the bottom region stays a fixed-height glance;
  // the Events tab is for the full list.
  const MAX_UPCOMING = 8;
  const todayDateKey = todayKey();
  const upcomingEvents = useMemo(() => {
    if (nowEpochMs === null) return [];
    return events
      .filter((event) => event.status !== "cancelled")
      .filter((event) => {
        const start = new Date(event.starts_at);
        if (Number.isNaN(start.getTime())) return false;
        const end = start.getTime() + event.duration_minutes * 60_000;
        return end >= nowEpochMs;
      })
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
      .slice(0, MAX_UPCOMING);
  }, [events, nowEpochMs]);

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
      className="flex w-full items-center justify-center gap-2 rounded-[10px] border border-dashed border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2.5 text-[13px] font-medium text-[color:var(--ink-2)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]"
      onClick={() => setIsAdding(true)}
    >
      <CirclePlus className="h-3.5 w-3.5" />
      New todo
    </button>
  );

  const renderReminderList = (
    tasks: TodoWithMeta[],
    emptyText: string,
    showComposer: boolean,
    sortByDueDate = false,
  ) => (
    <div className="space-y-2 overflow-visible pb-4">
      {showComposer && reminderComposer}
      <TodoListGroups
        tasks={tasks}
        todoLists={todoLists}
        sortByDueDate={sortByDueDate}
        collapsedListIds={collapsedTodoListIds}
        onToggleListCollapse={toggleTodoListCollapse}
        updateReminder={updateReminder}
        deleteReminder={deleteReminder}
      />
      {!tasks.length && <EmptyState text={emptyText} />}
    </div>
  );

  return (
    <aside className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[color:var(--card)]">
      <BrandHeader />
      {/* Horizontal segmented tab bar. Four equal-width buttons, icon on
          top + tiny label below, so the rail can stay narrow without
          eating a whole vertical column for nav. Active = inverted ink. */}
      <nav
        className="mx-2 mb-1.5 mt-2.5 flex shrink-0 gap-0.5 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] p-1"
        role="tablist"
      >
        <RailTab
          active={activeView === "calendar"}
          icon={<CalendarDays className="h-3.5 w-3.5" />}
          label="Calendar"
          count={inboxTasks.length}
          onClick={() => setActiveView("calendar")}
        />
        <RailTab
          active={activeView === "reminders"}
          icon={<CheckSquare className="h-3.5 w-3.5" />}
          label="Reminders"
          count={todoTasks.length}
          onClick={() => setActiveView("reminders")}
        />
        <RailTab
          active={activeView === "events"}
          icon={<Clock className="h-3.5 w-3.5" />}
          label="Events"
          count={events.filter((e) => e.status === "scheduled").length}
          onClick={() => setActiveView("events")}
        />
        <RailTab
          active={activeView === "periods"}
          icon={<CalendarRange className="h-3.5 w-3.5" />}
          label="Periods"
          count={periods.length}
          onClick={() => setActiveView("periods")}
        />
        <RailTab
          active={activeView === "agent"}
          icon={<Sparkles className="h-3.5 w-3.5" />}
          label="Agent"
          onClick={() => setActiveView("agent")}
        />
      </nav>

      {activeView === "calendar" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <RailSectionHeader
            className="pt-3"
            trailing={
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 font-[family-name:var(--font-ui)] text-[11.5px] font-medium normal-case tracking-normal transition-colors",
                  sortCalendarTodosByDueDate
                    ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
                    : "text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]",
                )}
                aria-pressed={sortCalendarTodosByDueDate}
                title="Sort todos by due date"
                onClick={toggleCalendarTodoSort}
              >
                <CalendarDays className="h-3.5 w-3.5" />
                Due date
              </button>
            }
          >
            {"Today's Input"}
          </RailSectionHeader>
          {/* Upper region: scrollable today's-input list. flex-1 + min-h-0
              lets it shrink so the pinned events region below stays visible
              even when the user has many todos. */}
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-2 [scrollbar-color:var(--line)_transparent]">
            {renderReminderList(
              calendarInboxTasks,
              "All open todos are complete.",
              false,
              sortCalendarTodosByDueDate,
            )}
          </div>

          {/* Draggable divider between the upper todos region and the
              pinned events region. Drag up to make events taller, drag
              down to give todos more room. Double-click resets. */}
          <RowResizeHandle
            label="Resize events panel"
            onPointerDown={beginCalendarSplitResize}
            onKeyAdjust={adjustCalendarSplit}
            onReset={resetCalendarSplit}
          />

          {/* Lower region: pinned upcoming-events glance. User-controllable
              height via the handle above; long lists scroll internally. */}
          <CalendarTabUpcomingEvents
            events={upcomingEvents}
            todoLists={todoLists}
            todayDateKey={todayDateKey}
            heightPx={calendarEventsHeight}
            onManage={() => setActiveView("events")}
          />
        </div>
      )}

      {activeView === "reminders" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <RailSectionHeader
            className="pt-3"
            trailing={
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 font-[family-name:var(--font-ui)] text-[11.5px] font-medium normal-case tracking-normal transition-colors",
                  hideDoneReminders
                    ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
                    : "text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]",
                )}
                aria-pressed={hideDoneReminders}
                title={
                  hideDoneReminders
                    ? "Show completed reminders"
                    : "Hide completed reminders"
                }
                onClick={toggleHideDoneReminders}
              >
                {hideDoneReminders ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
                Hide done
              </button>
            }
          >
            Todo List
          </RailSectionHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-4 [scrollbar-color:var(--line)_transparent]">
            {renderReminderList(visibleTodoTasks, "No todos yet.", true)}
          </div>
        </div>
      )}

      {activeView === "events" && (
        <EventsPanel
          events={events}
          todoLists={todoLists}
          upsertEvent={upsertEvent}
          deleteEvent={deleteEvent}
        />
      )}

      {activeView === "periods" && (
        <PeriodsPanel
          periods={periods}
          upsertPeriod={upsertPeriod}
          deletePeriod={deletePeriod}
        />
      )}

      {activeView === "agent" && (
        <AgentPanel
          selectedDate={selectedDate}
          todoLists={todoLists}
          onImport={importParsedTodos}
        />
      )}
    </aside>
  );
}

/**
 * Lizhi Routine logo mark — stacked-blocks L on a rounded square badge.
 * Single source of truth for the brand mark; the same geometry is in
 * app/icon.svg (favicon) and app/apple-icon.tsx (iOS home screen).
 *
 * Colours invert under `dark:` so the mark stays legible in both themes
 * the same way the original text-L badge did.
 */
function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect
        width="100"
        height="100"
        rx="22"
        className="fill-[#1A170E] dark:fill-[#F5EDD6]"
      />
      <rect
        x="28"
        y="18"
        width="18"
        height="42"
        rx="4.5"
        className="fill-[#F5EDD6] dark:fill-[#14110A]"
      />
      <rect
        x="28"
        y="63"
        width="44"
        height="16"
        rx="4.5"
        className="fill-[#F5EDD6] dark:fill-[#14110A]"
      />
      {/* Top letterpress bevel */}
      <rect
        x="6"
        y="3"
        width="88"
        height="2"
        rx="1"
        fill="#ffffff"
        className="opacity-[0.22] dark:opacity-60"
      />
    </svg>
  );
}

function BrandHeader() {
  return (
    <div className="flex shrink-0 items-center gap-2.5 border-b border-[color:var(--line-soft)] px-4 pb-3.5 pt-4">
      <LogoMark className="h-[30px] w-[30px] shrink-0" />
      <div className="min-w-0 flex-1 truncate font-[family-name:var(--font-disp)] text-[17px] font-medium italic tracking-[-0.01em] text-[color:var(--ink)]">
        <span className="font-[family-name:var(--font-ui)] font-semibold not-italic tracking-[-0.015em]">
          Lizhi
        </span>{" "}
        <span className="opacity-70">Routine</span>
      </div>
      <NextLink
        href="/settings"
        className="inline-grid h-7 w-7 shrink-0 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="h-3.5 w-3.5" aria-hidden="true" />
      </NextLink>
    </div>
  );
}

/**
 * Compact horizontal tab used in the rail's top segmented control. Four
 * equal-width buttons, icon-led with a tiny label underneath and a count
 * badge in the top-right corner when relevant. Replaces the old vertical
 * NavItem stack so the rail doesn't burn a whole column on navigation.
 */
function RailTab({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      title={typeof count === "number" ? `${label} (${count})` : label}
      onClick={onClick}
      className={cn(
        "relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-[var(--r-sm)] px-1 py-1.5 transition-colors",
        active
          ? "bg-[color:var(--ink)] !text-[color:var(--card)] shadow-[0_1px_2px_rgba(20,18,10,0.18)]"
          : "text-[color:var(--ink-2)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]",
      )}
    >
      <span aria-hidden>{icon}</span>
      <span className="text-[10px] font-medium leading-none">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className={cn(
            "absolute right-1 top-1 rounded-full px-1 py-[1px] font-[family-name:var(--font-mono)] text-[8.5px] leading-none",
            active
              ? "bg-[color:var(--card)]/20 text-[color:var(--card)]"
              : "bg-[color:var(--card)] text-[color:var(--ink-3)] ring-1 ring-[color:var(--line)]",
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function NavItem({
  icon,
  label,
  count,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  count?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span
        className={cn(
          "shrink-0 transition-colors",
          active
            ? "!text-[color:var(--card)]"
            : "text-[color:var(--ink-3)]",
        )}
      >
        {icon}
      </span>
      <span className="truncate">{label}</span>
      {typeof count === "number" && (
        <span
          className={cn(
            "ml-auto rounded-full px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] leading-none",
            active
              ? "bg-[color:var(--card)]/15 !text-[color:var(--card)]"
              : "bg-[color:var(--sunken)] text-[color:var(--ink-3)]",
          )}
        >
          {count}
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={cn(
          "flex min-h-8 w-full items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-left text-[13.5px] font-medium transition-colors",
          active
            ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
            : "text-[color:var(--ink-2)] hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]",
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
        "flex min-h-8 items-center gap-2.5 rounded-[9px] px-2.5 py-[7px] text-[13.5px] font-medium",
        active
          ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
          : "text-[color:var(--ink-2)]",
      )}
    >
      {content}
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
  onDelete?: () => void;
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
  onDelete,
}: ReminderEditorProps) {
  const [newTag, setNewTag] = useState("");
  const selectedList = todoLists.find((list) => list.id === listId);
  const parsedTags = parseTags(tags);
  const dueMeta =
    dueDate || dueTime
      ? `${dueDate || "Any day"}${dueTime ? ` ${dueTime}` : ""}`
      : "No deadline";
  const commitNewTag = () => {
    const trimmed = newTag.trim();
    if (!trimmed) return;
    const next = [...parsedTags, trimmed].filter(
      (tag, index, allTags) =>
        allTags.findIndex(
          (item) => item.toLocaleLowerCase() === tag.toLocaleLowerCase(),
        ) === index,
    );
    onTagsChange(next.join(", "));
    setNewTag("");
  };
  const removeTag = (tagToRemove: string) => {
    onTagsChange(parsedTags.filter((tag) => tag !== tagToRemove).join(", "));
  };

  return (
    <EditorModal onClose={onCancel}>
      <div className={EDITOR_CARD_CLASS}>
        <EditorHeader
          eyebrow={submitLabel === "Add" ? "Add todo" : "Edit todo"}
          title={title.trim() || "New todo"}
          meta={[`Tier ${category}`, selectedList?.name, dueMeta]}
          onCancel={onCancel}
        />

      <div className={EDITOR_BODY_CLASS}>
        <label className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Title</span>
          <input
            className={EDITOR_PLAIN_INPUT_CLASS}
            placeholder="What needs doing?"
            value={title}
            onChange={(event) => onTitleChange(event.target.value)}
          />
        </label>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Tier</span>
          <EditorTierSegment value={category} onChange={onCategoryChange} />
        </div>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>List</span>
          <div className="relative">
            <select
              className={cn(EDITOR_PLAIN_INPUT_CLASS, "appearance-none pr-7")}
              value={listId}
              onChange={(event) => onListIdChange(event.target.value)}
            >
              {todoLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-0 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[color:var(--ink-3)]" />
          </div>
        </div>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Due</span>
          <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] font-medium text-[color:var(--ink)]">
            <label className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
              <input
                className="w-[7.4rem] bg-transparent font-mono text-[13px] outline-none focus:rounded-[var(--r-sm)] focus:bg-[color:var(--sunken)] focus:ring-2 focus:ring-[color:var(--ring)]"
                type="date"
                value={dueDate}
                onChange={(event) => onDueDateChange(event.target.value)}
              />
            </label>
            <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[color:var(--ink-4)]">
              at
            </span>
            <label className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
              <input
                className="w-[4.8rem] bg-transparent font-mono text-[13px] outline-none focus:rounded-[var(--r-sm)] focus:bg-[color:var(--sunken)] focus:ring-2 focus:ring-[color:var(--ring)]"
                type="time"
                value={dueTime}
                onChange={(event) => onDueTimeChange(event.target.value)}
              />
            </label>
          </div>
        </div>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Tags</span>
          <div className="flex min-h-8 flex-wrap items-center gap-1.5">
            {parsedTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className="inline-flex h-6 items-center gap-1 rounded-full bg-[color:var(--sunken)] px-2 text-[11px] font-semibold !text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--hover)] hover:!text-[color:var(--ink)]"
                title={`Remove ${tag}`}
                onClick={() => removeTag(tag)}
              >
                {tag}
                <X className="h-3 w-3 opacity-50" />
              </button>
            ))}
            <input
              className="h-7 min-w-20 flex-1 bg-transparent text-[13px] italic text-[color:var(--ink-3)] outline-none placeholder:text-[color:var(--ink-3)] focus:text-[color:var(--ink)]"
              placeholder="Add tag..."
              value={newTag}
              onBlur={commitNewTag}
              onChange={(event) => setNewTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === ",") {
                  event.preventDefault();
                  commitNewTag();
                }
              }}
            />
          </div>
        </div>
      </div>

        <EditorFooter
          onDelete={onDelete}
          onCancel={onCancel}
          onSubmit={onSubmit}
          submitLabel={submitLabel}
          submitDisabled={!title.trim()}
        />
      </div>
    </EditorModal>
  );
}

type ReminderCardProps = {
  task: TodoWithMeta;
  todoLists: TodoList[];
  updateReminder: (taskId: string, values: Partial<TodoItem>) => void;
  deleteReminder: (taskId: string) => void;
};

function TodoListGroups({
  tasks,
  todoLists,
  sortByDueDate,
  collapsedListIds,
  onToggleListCollapse,
  updateReminder,
  deleteReminder,
}: {
  tasks: TodoWithMeta[];
  todoLists: TodoList[];
  sortByDueDate: boolean;
  collapsedListIds: Set<string>;
  onToggleListCollapse: (listId: string) => void;
  updateReminder: (taskId: string, values: Partial<TodoItem>) => void;
  deleteReminder: (taskId: string) => void;
}) {
  // When sorting by due date, flatten all groups into a single chronological
  // list — otherwise the list-grouping dominates and the sort isn't visible.
  // Each ReminderCard renders its own list chip so list context is preserved.
  if (sortByDueDate) {
    const sortedTasks = [...tasks].sort(compareTodosByDueDate);
    return (
      <div>
        {sortedTasks.map((task) => (
          <ReminderCard
            key={task.id}
            task={task}
            todoLists={todoLists}
            updateReminder={updateReminder}
            deleteReminder={deleteReminder}
          />
        ))}
      </div>
    );
  }

  const groups = todoLists
    .map((list) => ({
      list,
      tasks: tasks.filter((task) => task.list_id === list.id),
    }))
    .filter((group) => group.tasks.length > 0);

  return (
    <div className="space-y-1.5">
      {groups.map((group) => {
          const styles = todoListColorTokens(group.list.color);
          const isCollapsed = collapsedListIds.has(group.list.id);

          return (
            <div key={group.list.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-1 py-1.5 text-left text-[13.5px] font-semibold tracking-[-0.005em] text-[color:var(--ink)] transition-colors hover:bg-[color:var(--hover)]"
                aria-expanded={!isCollapsed}
                onClick={() => onToggleListCollapse(group.list.id)}
              >
                <span className="flex min-w-0 flex-1 items-center gap-2">
                  <ChevronDown
                    className={cn(
                      "h-3 w-3 shrink-0 text-[color:var(--ink-3)] transition-transform",
                      isCollapsed && "-rotate-90",
                    )}
                  />
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", styles.accent)} />
                  <span className="truncate">{group.list.name}</span>
                </span>
                <span className="rounded-full bg-[color:var(--sunken)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10.5px] leading-none text-[color:var(--ink-3)]">
                  {group.tasks.length}
                </span>
              </button>
              {!isCollapsed && (
                <div>
                  {group.tasks.map((task) => (
                    <ReminderCard
                      key={task.id}
                      task={task}
                      todoLists={todoLists}
                      updateReminder={updateReminder}
                      deleteReminder={deleteReminder}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
    </div>
  );
}

function ReminderCard({
  task,
  todoLists,
  updateReminder,
  deleteReminder,
}: ReminderCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [category, setCategory] = useState<Category>(task.category);
  const [dueDate, setDueDate] = useState(task.due_date ?? "");
  const [dueTime, setDueTime] = useState(task.due_time ?? "");
  const [tags, setTags] = useState(task.tags.join(", "));
  const [listId, setListId] = useState(task.list_id);
  const styles = categoryTokens(task.category);
  const listStyles = todoListColorTokens(task.list.color);
  const dueLabel = formatTodoDue(task);
  const dueUrgency = todoDueUrgencyTokens(task);
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
        onDelete={() => {
          deleteReminder(task.id);
          setIsEditing(false);
        }}
      />
    );
  }

  const docCount = task.context_docs.length;
  const hasEstimate = task.estimate !== null;
  const hasContext = docCount > 0 || hasEstimate;

  // Structure: outer wrapper (NOT draggable, hosts hover styles + the
  // paperclip + panel as siblings) wraps an inner draggable div. Keeping
  // the draggable div free of child buttons / panels was necessary to get
  // dnd-kit drag working on Windows Chrome — when those siblings lived
  // inside the draggable element, their pointer-event surfaces (even with
  // `pointer-events: none` on the invisible state) would intermittently
  // capture the pointerdown that PointerSensor was waiting for.
  //
  // `touch-none` is on the outer wrapper too: while dragging the pointer
  // can leave the inner div and end up over the wrapper's padding/border,
  // and Safari (trackpad) needs the whole surface to opt out of native
  // pan gestures or it'll start a horizontal swipe-back instead of a drag.
  return (
    <div
      className={cn(
        "group relative rounded-[10px] border border-transparent transition-all duration-150 hover:border-[color:var(--line-soft)] hover:bg-[color:var(--hover)]",
        dueUrgency?.card,
        canDrag && "touch-none select-none",
        isDragging &&
          "z-50 border-[color:var(--line)] bg-[color:var(--hover)] shadow-[0_10px_24px_-14px_rgba(20,18,10,0.35)]",
      )}
    >
      <div
        ref={setNodeRef}
        style={transformStyle}
        className={cn(
          "flex items-start gap-2.5 rounded-[10px] p-2.5",
          canDrag
            ? "cursor-grab select-none touch-none active:cursor-grabbing"
            : "cursor-default opacity-50",
          isDragging && "opacity-95",
        )}
        {...(canDrag ? listeners : {})}
        {...attributes}
        title={todoHoverTitle(task)}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setIsEditing(true);
        }}
      >
        <button
          type="button"
          className={cn(
            "mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-[5px] border-[1.5px] bg-[color:var(--card)] transition-colors",
            task.status === "completed"
              ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
              : "border-[color:var(--ink-4)] text-transparent group-hover:border-[color:var(--ink-3)]",
          )}
          title={task.status === "completed" ? "Mark incomplete" : "Complete"}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={() => {
            const isCompleting = task.status !== "completed";
            // When marking complete, auto-fill actual_minutes from the
            // computed past-blocks tally — same value the progress bar
            // shows. 0 means "no blocks scheduled" → leave null so stats
            // don't get polluted with phantom "0 min" data points; the
            // user (or backfill) can fill it in later.
            const update: Partial<TodoItem> = {
              status: isCompleting ? "completed" : "pending",
            };
            if (isCompleting && task.completedMinutes > 0) {
              update.actual_minutes = task.completedMinutes;
            }
            updateReminder(task.id, update);
          }}
        >
          <Check className="h-2.5 w-2.5" strokeWidth={3} />
        </button>
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              "truncate text-[13px] font-medium leading-[1.3] text-[color:var(--ink)]",
              // Right-pad so the title clears the corner paperclip button.
              hasContext ? "pr-7" : "group-hover:pr-7",
              task.status === "completed" && "line-through text-[color:var(--ink-3)]",
            )}
          >
            {task.title}
          </div>
          <div
            className="mt-1.5 flex min-w-0 items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]"
          >
            <span className={cn("inline-flex h-4 shrink-0 items-center rounded px-1.5 text-[9.5px] font-semibold tracking-[0.04em]", styles.chip)}>
              {task.category}
            </span>
            <span className={cn("inline-flex h-4 min-w-0 shrink items-center truncate rounded border px-1.5 text-[9.5px] font-medium", listStyles.block, listStyles.text)}>
              {task.list.name}
            </span>
            {dueLabel && (
              <span
                className={cn(
                  "ml-auto min-w-0 truncate rounded px-1.5 py-0.5 text-[10.5px] font-medium",
                  dueUrgency?.pill ??
                    "bg-[color:var(--sunken)] text-[color:var(--ink-2)]",
                )}
              >
                {dueLabel}
              </span>
            )}
          </div>
          {task.status === "pending" && hasEstimate && !isContextOpen && (
            <div className="mt-2">
              <TodoEstimateProgressBar
                estimate={task.estimate!}
                completedMinutes={task.completedMinutes}
                compact
              />
            </div>
          )}
          {task.status === "completed" && task.estimate_snapshot && (
            <EstimateAccuracyLine
              snapshot={task.estimate_snapshot}
              actualMinutes={task.actual_minutes}
            />
          )}
        </div>
      </div>
      {/*
        Paperclip + panel live OUTSIDE the draggable div but inside the same
        positioned wrapper. They never sit on top of the drag-grab area so
        their pointer surfaces can't interfere with PointerSensor on Windows.
      */}
      <button
        type="button"
        onClick={() => setIsContextOpen((current) => !current)}
        className={cn(
          "absolute right-1.5 top-1.5 inline-flex h-5 shrink-0 items-center gap-0.5 rounded px-1 text-[10px] transition-opacity",
          hasContext
            ? "bg-[color:var(--sunken)] text-[color:var(--ink-2)] hover:text-[color:var(--ink)]"
            : "pointer-events-none text-[color:var(--ink-3)] opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink-2)]",
        )}
        aria-pressed={isContextOpen}
        title={
          hasEstimate
            ? "Open context & estimate"
            : docCount > 0
              ? `${docCount} attached doc${docCount === 1 ? "" : "s"}`
              : "Attach instructions / estimate"
        }
        aria-label="Toggle context panel"
      >
        <Paperclip className="h-2.5 w-2.5" />
        {docCount > 0 && (
          <span className="font-[family-name:var(--font-mono)] text-[9.5px]">
            {docCount}
          </span>
        )}
      </button>
      {isContextOpen && (
        <TodoContextPanel
          todo={task}
          completedMinutes={task.completedMinutes}
          onUpdate={(values) => updateReminder(task.id, values)}
          onClose={() => setIsContextOpen(false)}
        />
      )}
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
        "relative w-64 overflow-hidden rounded-lg border p-3 pl-3.5 shadow-[0_16px_40px_-18px_rgba(20,18,10,0.32)] backdrop-blur",
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
          isSleep ? "text-white" : "text-[color:var(--ink)]",
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
            isSleep ? "text-white/75" : "text-[color:var(--ink-2)]",
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
  tonightSleep?: VisibleTask;
  lastNightSleep?: VisibleTask;
  sleepTargetMinutes: number;
  setSleepTargetMinutes: (value: number) => void;
  onJumpToTask: (taskId: string) => void;
  templates: RoutineTemplate[];
  upsertTemplate: (template: RoutineTemplate) => void;
  deleteTemplate: (templateId: string) => void;
};

function RightRail({
  sleepTemplate,
  tonightSleep,
  lastNightSleep,
  sleepTargetMinutes,
  setSleepTargetMinutes,
  onJumpToTask,
  templates,
  upsertTemplate,
  deleteTemplate,
}: RightRailProps) {
  const [isAdding, setIsAdding] = useState(false);
  const routineTemplates = templates.filter((template) => template.kind !== "sleep");

  return (
    <aside className="flex h-full w-full min-h-0 flex-col bg-[color:var(--card)]">
      <RailSectionHeader
        className="pt-[18px]"
        trailing={
          <span className="cursor-default font-[family-name:var(--font-ui)] text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-3)]">
            5 - 5
          </span>
        }
      >
        Sleep
      </RailSectionHeader>
      <SleepControl
        template={sleepTemplate}
        tonightSleep={tonightSleep}
        lastNightSleep={lastNightSleep}
        sleepTargetMinutes={sleepTargetMinutes}
        setSleepTargetMinutes={setSleepTargetMinutes}
        onJumpToTask={onJumpToTask}
      />

      <RailSectionHeader
        className="pt-5"
        trailing={
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 font-[family-name:var(--font-ui)] text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            title="Add routine"
            aria-label="Add routine"
            onClick={() => setIsAdding(true)}
          >
            <CirclePlus className="h-3.5 w-3.5" />
            New
          </button>
        }
      >
        Routines
      </RailSectionHeader>

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
                commute_enabled: draft.commute_enabled,
                commute_config: null,
                kind: "routine",
              }),
            );
            setIsAdding(false);
          }}
        />
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-0 pb-4 [scrollbar-color:var(--line)_transparent]">
        {routineTemplates.length ? (
          routineTemplates.map((template) => (
            <RoutineTemplateCard
              key={template.id}
              template={template}
              upsertTemplate={upsertTemplate}
              deleteTemplate={deleteTemplate}
            />
          ))
        ) : (
          <div className="mx-3.5">
            <EmptyState text="No routines yet." />
          </div>
        )}
      </div>
    </aside>
  );
}

function RailSectionHeader({
  children,
  trailing,
  className,
}: {
  children: React.ReactNode;
  trailing?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between px-[18px] pb-2 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]",
        className,
      )}
    >
      <span>{children}</span>
      {trailing}
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
  commute_enabled: boolean;
  kind?: "routine";
};

function RoutineTemplateEditor({
  template,
  submitLabel,
  onCancel,
  onSubmit,
  onDelete,
}: {
  template?: RoutineTemplate;
  submitLabel: string;
  onCancel: () => void;
  onSubmit: (template: RoutineDraft) => void;
  onDelete?: () => void;
}) {
  const [title, setTitle] = useState(template?.title ?? "");
  const [duration, setDuration] = useState(
    template?.default_duration_minutes ?? 60,
  );
  const [category, setCategory] = useState<Category>(template?.category ?? "T0");
  const [color, setColor] = useState<TodoListColor>(template?.color ?? "blue");
  const [icon, setIcon] = useState<RoutineIconName>(template?.icon ?? "zap");
  const [isCommute, setIsCommute] = useState(
    Boolean(template && isCommuteTemplate(template)),
  );
  const colorTokens = routineColorTokens(color);
  const iconLabel =
    ROUTINE_ICON_OPTIONS.find((option) => option.value === icon)?.label ?? "Icon";
  const setDurationMinutes = (value: number) => {
    setDuration(Math.max(5, Math.round(value) || 5));
  };
  const submitDisabled = !title.trim();

  return (
    <EditorModal
      onClose={onCancel}
      widthClass="w-[460px] max-w-[calc(100vw-2rem)]"
    >
      <div className="overflow-hidden rounded-[18px] border border-[color:var(--line)] bg-[color:var(--card)] text-left font-[family-name:var(--font-ui)] text-[color:var(--ink)] shadow-[0_1px_0_rgba(255,255,255,0.7)_inset,0_1px_2px_rgba(20,18,10,0.04),0_12px_28px_-8px_rgba(20,18,10,0.18),0_24px_60px_-20px_rgba(20,18,10,0.2)] dark:shadow-[0_24px_60px_-20px_rgba(0,0,0,0.6)]">
        <div className="border-b border-[color:var(--line-soft)] bg-[radial-gradient(120%_100%_at_0%_0%,oklch(94%_0.04_70)_0%,transparent_60%),linear-gradient(180deg,var(--card),var(--sunken))] px-6 py-4">
          <div className="flex items-center justify-between gap-3">
            <span className={EDITOR_LABEL_CLASS}>
              {template ? "Edit routine" : "Add routine"}
            </span>
            <button
              type="button"
              className="inline-grid h-7 w-7 place-items-center rounded-full text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
              title="Close"
              aria-label="Close routine editor"
              onClick={onCancel}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-3 flex min-w-0 items-center gap-3">
            <span
              className={cn(
                "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--r-sm)] border",
                colorTokens.block,
                colorTokens.text,
              )}
              aria-hidden="true"
            >
              <RoutineIcon icon={icon} className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate font-[family-name:var(--font-disp)] text-[20px] font-semibold leading-tight tracking-[-0.015em] text-[color:var(--ink)]">
                {title.trim() || "Routine"}
              </h2>
              <div className={cn(EDITOR_META_CLASS, "mt-1")}>
                <span>Tier {category}</span>
                <EditorMetaDot />
                <span>{formatEditorDuration(duration)}</span>
                <EditorMetaDot />
                <span>{iconLabel}</span>
                {isCommute && (
                  <>
                    <EditorMetaDot />
                    <span>Commute</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="bg-[color:var(--card)] px-6 py-1">
          <label className="block border-b border-[color:var(--line-soft)] py-3.5">
            <span className={cn(EDITOR_LABEL_CLASS, "mb-2.5 block")}>Title</span>
            <input
              className="h-9 w-full rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 text-[13px] font-medium text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line-strong)] focus:bg-[color:var(--card)] focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Routine name"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <div className="border-b border-[color:var(--line-soft)] py-3.5">
            <div className={cn(EDITOR_LABEL_CLASS, "mb-2.5")}>Tier</div>
            <EditorTierSegment value={category} onChange={setCategory} />
          </div>

          <div className="border-b border-[color:var(--line-soft)] py-3.5">
            <div className={cn(EDITOR_LABEL_CLASS, "mb-2.5")}>Minutes</div>
            <div className="inline-flex h-9 w-fit items-center overflow-hidden rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[13px] font-semibold text-[color:var(--ink)] focus-within:border-[color:var(--line-strong)] focus-within:ring-2 focus-within:ring-[color:var(--ring)]">
              <button
                type="button"
                className="flex h-full w-10 items-center justify-center !text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:!text-[color:var(--ink)]"
                aria-label="Decrease minutes"
                onClick={() => setDurationMinutes(duration - 5)}
              >
                -
              </button>
              <input
                className="h-full w-14 bg-transparent text-center font-[family-name:var(--font-mono)] outline-none"
                min={5}
                step={5}
                type="number"
                value={duration}
                onChange={(event) => setDurationMinutes(Number(event.target.value))}
              />
              <button
                type="button"
                className="flex h-full w-10 items-center justify-center !text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:!text-[color:var(--ink)]"
                aria-label="Increase minutes"
                onClick={() => setDurationMinutes(duration + 5)}
              >
                +
              </button>
              <span className="pr-2.5 font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.12em] text-[color:var(--ink-3)]">
                min
              </span>
            </div>
          </div>

          <div className="border-b border-[color:var(--line-soft)] py-3.5">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div>
                <div className={EDITOR_LABEL_CLASS}>Commute</div>
                <p className="mt-1 text-[11.5px] leading-snug text-[color:var(--ink-3)]">
                  Mark this routine as a commute. Addresses, mode, and ETA are
                  set on each scheduled time block.
                </p>
              </div>
              <button
                type="button"
                className={cn(
                  "inline-flex h-7 min-w-12 items-center justify-center rounded-full border px-3 text-[11px] font-semibold transition-colors",
                  isCommute
                    ? "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]"
                    : "border-[color:var(--line)] bg-[color:var(--card)] !text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)]",
                )}
                onClick={() => setIsCommute((value) => !value)}
              >
                {isCommute ? "On" : "Off"}
              </button>
            </div>

            {isCommute && (
              <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)] px-3 py-2 text-[11.5px] leading-snug text-[color:var(--ink-2)]">
                Double-click a placed commute block to set From, To, mode, and
                whether the window is departure-based or arrival-based.
              </div>
            )}
          </div>

          <div className="border-b border-[color:var(--line-soft)] py-3.5">
            <div className={cn(EDITOR_LABEL_CLASS, "mb-2.5")}>Icon</div>
            <div className="flex flex-wrap gap-1.5">
              {ROUTINE_ICON_OPTIONS.map((option) => {
                const selected = icon === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] transition-colors hover:border-[color:var(--line-strong)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                      selected &&
                        "border-[color:var(--ink)] bg-[color:var(--ink)] !text-[color:var(--card)]",
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

          <div className="py-3.5">
            <div className={cn(EDITOR_LABEL_CLASS, "mb-2.5")}>Colour</div>
            <div className="flex flex-wrap gap-3">
              {ROUTINE_COLORS.map((item) => {
                const tokens = routineColorTokens(item);
                const selected = color === item;
                return (
                  <button
                    key={item}
                    type="button"
                    className={cn(
                      "relative flex h-[26px] w-[26px] items-center justify-center rounded-full border border-transparent transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
                      selected &&
                        "after:absolute after:-inset-1 after:rounded-full after:border after:border-[color:var(--ink)]",
                      tokens.accent,
                    )}
                    title={item}
                    aria-label={`Use ${item}`}
                    onClick={() => setColor(item)}
                  >
                    {selected && (
                      <Check className="h-3.5 w-3.5 text-white drop-shadow-sm" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-[color:var(--line-soft)] bg-[color:var(--sunken)] px-6 py-3.5">
          {onDelete ? (
            <button
              type="button"
              className={EDITOR_DELETE_BUTTON_CLASS}
              onClick={onDelete}
            >
              Delete
            </button>
          ) : (
            <div />
          )}
          <div className="flex flex-1 justify-end gap-2">
            <button
              type="button"
              className="inline-flex h-9 min-w-20 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-4 text-[13px] font-semibold !text-[color:var(--ink)] transition-colors hover:bg-[color:var(--sunken)]"
              onClick={onCancel}
            >
              Cancel
            </button>
            <button
              type="button"
              className="inline-flex h-9 min-w-20 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--ink)] px-4 text-[13px] font-semibold !text-[color:var(--card)] transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() =>
                onSubmit({
                  id: template?.id,
                  title: title.trim(),
                  default_duration_minutes: duration,
                  category,
                  color,
                  icon,
                  commute_enabled: isCommute,
                  kind: "routine",
                })
              }
              disabled={submitDisabled}
            >
              {submitLabel}
            </button>
          </div>
        </div>
      </div>
    </EditorModal>
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
  const commuteRoutine = isCommuteTemplate(template);
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
              commute_enabled: nextTemplate.commute_enabled,
              commute_config: null,
            }),
          );
          setIsEditing(false);
        }}
        onDelete={() => {
          deleteTemplate(template.id);
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
        "group mx-3 mb-1.5 flex cursor-grab select-none touch-none items-center gap-[11px] rounded-[11px] border border-transparent p-2.5 transition-all duration-150 hover:border-[color:var(--line-soft)] hover:bg-[color:var(--hover)] active:cursor-grabbing",
        isDragging &&
          "z-50 border-[color:var(--line)] bg-[color:var(--hover)] opacity-95 shadow-[0_10px_24px_-14px_rgba(20,18,10,0.35)]",
      )}
      {...listeners}
      {...attributes}
      title={[
        template.title,
        `${template.category} - ${formatDuration(template.default_duration_minutes)}`,
        commuteRoutine ? "Commute details are set per scheduled block" : null,
      ]
        .filter(Boolean)
        .join("\n")}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        setIsEditing(true);
      }}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]",
          styles.block,
        )}
        aria-hidden="true"
      >
        <RoutineIcon icon={template.icon} className={cn("h-3.5 w-3.5", styles.text)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[13.5px] font-semibold tracking-[-0.005em] text-[color:var(--ink)]">
          {template.title}
        </div>
        <div className="mt-[3px] flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
          <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-[0.04em]", styles.chip)}>
            {template.category}
          </span>
          <span>{formatDuration(template.default_duration_minutes)}</span>
          {commuteRoutine && (
            <>
              <MapPin className="h-3 w-3 shrink-0" />
              <span className="truncate">per block</span>
            </>
          )}
        </div>
      </div>
      <svg
        aria-hidden="true"
        className="h-3.5 w-3.5 shrink-0 text-[color:var(--ink-4)] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        viewBox="0 0 24 24"
        fill="currentColor"
      >
        <circle cx="9" cy="6" r="1.4" />
        <circle cx="9" cy="12" r="1.4" />
        <circle cx="9" cy="18" r="1.4" />
        <circle cx="15" cy="6" r="1.4" />
        <circle cx="15" cy="12" r="1.4" />
        <circle cx="15" cy="18" r="1.4" />
      </svg>
    </div>
  );
}

type SleepControlProps = {
  template?: RoutineTemplate;
  tonightSleep?: VisibleTask;
  lastNightSleep?: VisibleTask;
  sleepTargetMinutes: number;
  setSleepTargetMinutes: (value: number) => void;
  onJumpToTask: (taskId: string) => void;
};

function SleepControl({
  template,
  tonightSleep,
  lastNightSleep,
  sleepTargetMinutes,
  setSleepTargetMinutes,
  onJumpToTask,
}: SleepControlProps) {
  if (!template) return null;

  const minSleepMinutes = 5 * 60;
  const maxSleepMinutes = 10 * 60;
  // Slider always reflects (and only edits) the global preference. Editing
  // an already-scheduled sleep block goes through clicking the block —
  // mixing both into one slider was the original confusion.
  const targetPercent = Math.min(
    100,
    Math.max(
      0,
      ((sleepTargetMinutes - minSleepMinutes) /
        (maxSleepMinutes - minSleepMinutes)) *
        100,
    ),
  );

  return (
    <div
      className="mx-3.5 rounded-[var(--r)] border border-[color:var(--line)] p-3.5"
      style={{
        background:
          "radial-gradient(120% 100% at 100% 0%, color-mix(in oklch, var(--block-sleep) 22%, transparent) 0%, transparent 60%), linear-gradient(180deg, color-mix(in oklch, var(--block-sleep) 9%, var(--card)), var(--card))",
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[color:var(--ink-2)]">
          <Moon className="h-3.5 w-3.5 text-[color:var(--block-sleep)]" />
          Target duration
        </span>
        <span className="font-[family-name:var(--font-mono)] text-[14px] font-semibold tabular-nums text-[color:var(--ink)]">
          {formatDuration(sleepTargetMinutes)}
        </span>
      </div>
      <div className="relative flex h-[22px] items-center">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-[color:var(--line)]">
          <div
            className="h-full rounded-full bg-[color:var(--block-sleep)]"
            style={{ width: `${targetPercent}%` }}
          />
        </div>
        <div
          className="pointer-events-none absolute h-[18px] w-[18px] rounded-full border-2 border-[color:var(--block-sleep)] bg-[color:var(--card)] shadow-[0_1px_3px_rgba(20,18,10,0.18)]"
          style={{ left: `calc(${targetPercent}% - 9px)` }}
        />
        <input
          aria-label="Sleep target duration"
          className="absolute inset-0 h-[22px] w-full cursor-pointer opacity-0"
          type="range"
          min={minSleepMinutes}
          max={maxSleepMinutes}
          step={30}
          value={sleepTargetMinutes}
          onChange={(event) => {
            setSleepTargetMinutes(Number(event.target.value));
          }}
        />
      </div>
      <DraggableBlock
        id={`template:${template.id}`}
        title="Sleep"
        category={template.category}
        durationMinutes={sleepTargetMinutes}
        dragData={{ type: "template", templateId: template.id }}
        colorTokens={{
          accent: "bg-white/70",
          block:
            "border-[color:var(--block-sleep)] bg-[color:var(--block-sleep)]",
          ribbon: "bg-[color:var(--block-sleep)]",
          chip: "bg-white/15 text-white",
          text: "text-white",
        }}
        className="mt-3 px-3 py-2.5 text-white shadow-none hover:translate-y-0 hover:border-[color:var(--block-sleep)] hover:bg-[color:var(--block-sleep)] hover:shadow-none"
        inverse
      >
        <div className="ml-1 flex min-w-0 items-center gap-2.5">
          <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-md bg-white/10 text-[#f4ecff]">
            <RoutineIcon icon={template.icon} className="h-3.5 w-3.5" />
          </span>
          <span className="shrink-0 rounded-[4px] bg-[oklch(60%_0.18_295)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10px] font-semibold tracking-[0.04em] text-white">
            {template.category}
          </span>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold tracking-[-0.005em] text-[#f4ecff]">
            Sleep
          </span>
          <span className="shrink-0 font-[family-name:var(--font-mono)] text-[11px] font-medium text-[#c9b8ee]">
            {formatDuration(sleepTargetMinutes)}
          </span>
        </div>
      </DraggableBlock>
      <div className="mt-2.5 space-y-1.5 border-t border-dashed border-[oklch(86%_0.04_295)] pt-2.5 dark:border-[oklch(34%_0.08_295)]">
        <SleepStatusRow
          label="Last night"
          task={lastNightSleep}
          emptyHint="No carryover"
          onJumpToTask={onJumpToTask}
        />
        <SleepStatusRow
          label="Tonight"
          task={tonightSleep}
          emptyHint="Drag the block to schedule"
          onJumpToTask={onJumpToTask}
        />
      </div>
    </div>
  );
}

function SleepStatusRow({
  label,
  task,
  emptyHint,
  onJumpToTask,
}: {
  label: string;
  task?: VisibleTask;
  emptyHint: string;
  onJumpToTask: (taskId: string) => void;
}) {
  if (!task) {
    return (
      <div className="flex items-center gap-2 text-[11.5px] text-[color:var(--ink-3)]">
        <Clock className="h-3 w-3" aria-hidden="true" />
        <span className="w-[68px] shrink-0 font-[family-name:var(--font-mono)] uppercase tracking-[0.06em]">
          {label}
        </span>
        <span className="min-w-0 truncate italic">{emptyHint}</span>
      </div>
    );
  }

  const startLabel = formatTimeFromMinutes(task.topMinutes);
  const endLabel = formatTimeFromMinutes(
    task.topMinutes + task.visibleDurationMinutes,
  );

  return (
    <button
      type="button"
      onClick={() => onJumpToTask(task.id)}
      className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-2 rounded-[var(--r-sm)] px-1 py-0.5 text-left text-[11.5px] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
      title={`Jump to ${label.toLowerCase()}'s sleep on the timeline`}
    >
      <Clock
        className="h-3 w-3 text-[color:var(--ink-3)]"
        aria-hidden="true"
      />
      <span className="w-[68px] shrink-0 font-[family-name:var(--font-mono)] uppercase tracking-[0.06em] text-[color:var(--ink-3)]">
        {label}
      </span>
      <span className="font-[family-name:var(--font-mono)] font-semibold tabular-nums text-[color:var(--ink)]">
        {formatDuration(task.duration_minutes)}
      </span>
      <span className="font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
        {startLabel}–{endLabel}
      </span>
    </button>
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
  const zoom = useTimelineZoom();

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--card)]">
      <div className="min-h-0 flex-1 overflow-y-scroll">
        <div
          ref={setTimelineNode}
          className={cn(
            "relative min-w-[520px] transition-colors",
            isOver && "bg-[color:var(--sunken)]",
          )}
          style={{ height: TIMELINE_HEIGHT * zoom }}
        >
          <TimelineGrid sunTimes={sunTimes} />
          <div
            className={cn(
              "absolute inset-y-0",
              DAY_TIMELINE_LEFT_CLASS,
              DAY_TIMELINE_RIGHT_CLASS,
            )}
          >
            <PeriodColumnBackground periods={periods} dateKey={dateKey} layout="day" />
          </div>

          {tasks.map((task) => (
            <PlacedTask
              key={`${task.storageDateKey}:${task.id}`}
              task={task}
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
  return (
    <TimeGrid
      gutterWidth={DAY_TIMELINE_GUTTER_WIDTH}
      labelClassName="px-2.5 text-[11px]"
      sunTimes={sunTimes}
    />
  );
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
  // Day view provides a zoom value via TimelineZoomContext; week view
  // doesn't, so the hook returns the default 1 there.
  const zoom = useTimelineZoom();
  const nightBands = [
    { start: 0, end: sunTimes.sunriseOffsetMinutes },
    { start: sunTimes.sunsetOffsetMinutes, end: TOTAL_MINUTES },
  ].filter((band) => band.end > band.start);

  return (
    <div className="absolute inset-0">
      <div
        className="pointer-events-none absolute inset-y-0 left-0 bg-timeline-gutter"
        style={{ width: gutterWidth }}
      />
      {nightBands.map((band) => (
        <div
          key={`${band.start}-${band.end}`}
          className="pointer-events-none absolute right-0 border-y border-[color:var(--line-soft)] bg-[color:var(--sunken)]/35"
          style={{
            left: gutterWidth,
            top: minutesToPixels(band.start) * zoom,
            height: minutesToPixels(band.end - band.start) * zoom,
          }}
        />
      ))}
      {timelineHours().map((hour) => {
        const minutes = (hour - DAY_START_HOUR) * 60;
        const top = minutesToPixels(minutes) * zoom;
        const label = formatTimelineScaleLabel(minutes);

        return (
          <div key={hour} className="absolute left-0 right-0" style={{ top }}>
            <div
              className="grid items-start"
              style={{ gridTemplateColumns: `${gutterWidth}px 1fr` }}
            >
              <div
                className={cn(
                  "-mt-2.5 font-[family-name:var(--font-mono)] font-semibold uppercase tracking-[0.08em] tabular-nums text-[color:var(--timeline-time)]",
                  "text-timeline-time",
                  labelClassName,
                )}
              >
                {label}
              </div>
              <div className="border-t border-timeline-line" />
            </div>
          </div>
        );
      })}
      {Array.from({ length: TOTAL_MINUTES / SNAP_MINUTES }).map((_, index) => {
        const top = minutesToPixels(index * SNAP_MINUTES) * zoom;
        return (
          <div
            key={index}
            className="absolute right-0 border-t border-timeline-line/55"
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
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[color:var(--card)]">
      <div className="min-h-0 flex-1 overflow-y-scroll">
        <div className="sticky top-0 z-20 grid min-w-[900px] grid-cols-[60px_repeat(7,minmax(110px,1fr))] border-b border-[color:var(--line)] bg-[color:var(--card)]">
          <div />
          {days.map((day) => {
            const isSelected = day.dateKey === selectedDate;
            const isToday = day.dateKey === todayKey();
            const dueCount = day.deadlines.length;
            const hasDueHint = dueCount > 0;
            const isUrgentDueDay = hasDueHint && day.dateKey <= todayKey();
            const dueHintTitle = hasDueHint
              ? [
                  `${dueCount} item${dueCount === 1 ? "" : "s"} due`,
                  ...day.deadlines.map(
                    (marker) => `${marker.timeLabel} - ${marker.title}`,
                  ),
                ].join("\n")
              : undefined;

            return (
              <button
                key={day.dateKey}
                type="button"
                className={cn(
                  "border-l border-[color:var(--line-soft)] px-2.5 py-2 text-left transition-colors hover:bg-[color:var(--sunken)]",
                  isSelected && "bg-[color:var(--sunken)]",
                )}
                onClick={() => setSelectedDate(day.dateKey)}
              >
                <div className="flex min-w-0 items-center justify-between gap-1.5">
                  <span className="truncate text-[10px] font-medium uppercase tracking-wider text-[color:var(--ink-3)]">
                    {new Intl.DateTimeFormat("en-AU", { weekday: "short" }).format(
                      parseDateKey(day.dateKey),
                    )}
                  </span>
                  {hasDueHint && (
                    <span
                      className={cn(
                        "inline-flex h-4 shrink-0 items-center gap-1 rounded-full border px-1.5 font-[family-name:var(--font-mono)] text-[9.5px] font-semibold leading-none",
                        isUrgentDueDay
                          ? "border-rose-200 bg-rose-100 text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/20 dark:text-rose-200"
                          : "border-amber-200 bg-amber-100 text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/20 dark:text-amber-200",
                      )}
                      title={dueHintTitle}
                    >
                      <Flag className="h-2.5 w-2.5" aria-hidden="true" />
                      {dueCount}
                    </span>
                  )}
                </div>
                <div
                  className={cn(
                    "mt-0.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md px-1.5 text-sm font-semibold tabular-nums text-[color:var(--ink)]",
                    isToday && "bg-[color:var(--ink)] !text-[color:var(--card)]",
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
            isOver && "bg-[color:var(--sunken)]",
          )}
          style={{ height: TIMELINE_HEIGHT }}
        >
          <TimeGrid gutterWidth={60} labelClassName="px-2 text-[11px]" sunTimes={sunTimes} />
          <div className="absolute inset-0 grid grid-cols-[60px_repeat(7,minmax(110px,1fr))]">
            <div />
            {days.map((day) => (
              <div
                key={day.dateKey}
                className="relative border-l border-[color:var(--line-soft)]"
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
    <section className="min-h-0 flex-1 overflow-y-auto bg-[color:var(--card)] p-4">
      <div className="grid grid-cols-7 overflow-hidden rounded-lg border border-l border-[color:var(--line)]">
        {weekLabels.map((label) => (
          <div
            key={label}
            className="border-b border-r border-[color:var(--line)] bg-[color:var(--sunken)] px-3 py-2 text-[10px] font-medium uppercase tracking-wider text-[color:var(--ink-3)]"
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
                "relative min-h-28 overflow-visible border-b border-r border-[color:var(--line-soft)] p-2 text-left align-top transition-colors hover:z-20 hover:bg-[color:var(--sunken)]/60",
                !inMonth && "bg-[color:var(--sunken)] text-[color:var(--ink-3)]",
                isSelected && "z-10 ring-1 ring-inset ring-[color:var(--ring)]",
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
                        <div className="pointer-events-none absolute left-1 top-2 z-50 hidden w-60 rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)]/95 p-2.5 text-left text-[11px] text-[color:var(--ink-2)] shadow-[0_18px_40px_-18px_rgba(20,18,10,0.32)] backdrop-blur group-hover/period-ribbon:block">
                          <div className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[color:var(--ink)]">
                            <span className={cn("h-2 w-2 shrink-0 rounded-full", tokens.accent)} />
                            <span className="truncate">{period.title}</span>
                          </div>
                          <div className="space-y-0.5">
                            <div>{details.kindLabel} · {details.range}</div>
                            <div>{details.schedule}</div>
                            <div>{details.days}</div>
                            {details.breaks && <div>{details.breaks}</div>}
                            {details.notes && (
                              <div className="mt-1 line-clamp-2 text-[color:var(--ink-2)]">
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
                    ? "bg-[color:var(--ink)] !text-[color:var(--card)]"
                    : inMonth
                      ? "text-[color:var(--ink-2)]"
                      : "text-[color:var(--ink-3)]",
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
                        "truncate rounded px-1.5 py-0.5 text-[11px] font-medium text-[color:var(--ink-2)]",
                        styles.block,
                        task.kind === "calendar" &&
                          (task.displayIsEvent
                            ? EVENT_BLOCK_CLASS
                            : CALENDAR_BLOCK_CLASS),
                        task.kind === "sleep" && SLEEP_MONTH_BLOCK_CLASS,
                      )}
                      title={monthTaskHoverTitle(task)}
                    >
                      <span
                        className={cn(
                          "mr-1 tabular-nums",
                          task.kind === "sleep"
                            ? "text-white/65"
                            : "text-[color:var(--ink-3)]",
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
                    className="flex items-center gap-1 truncate rounded border border-[oklch(82%_0.08_25)] bg-[oklch(95%_0.04_25)] px-1.5 py-0.5 text-[11px] font-medium text-[oklch(55%_0.18_25)] dark:border-[oklch(45%_0.12_25)] dark:bg-[oklch(28%_0.08_25)] dark:text-[oklch(78%_0.12_25)]"
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
                  <div className="px-1.5 text-[10px] font-medium text-[color:var(--ink-3)]">
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
  const zoom = useTimelineZoom();
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
              const top = minutesToPixels(segment.startMinutes) * zoom;
              const height = Math.max(
                4,
                minutesToPixels(segment.endMinutes - segment.startMinutes) * zoom,
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
  const zoom = useTimelineZoom();
  if (!markers.length) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-30">
      {markers.map((marker) => {
        const top = minutesToPixels(marker.topMinutes) * zoom + marker.stackIndex * 22;
        const tooltip = `${marker.title} deadline at ${marker.timeLabel}${marker.hasExplicitTime ? "" : " (no time set)"}`;

        if (layout === "day") {
          return (
            <div
              key={marker.id}
              className="absolute left-0 right-8"
              style={{ top }}
              title={tooltip}
            >
              <div
                className="absolute right-0 top-0 border-t-2 border-dashed border-[oklch(62%_0.20_25)] dark:border-[oklch(70%_0.16_25)]"
                style={{ left: DAY_TIMELINE_CONTENT_LEFT }}
              />
              <span
                className="absolute top-0 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-[color:var(--card)] bg-[oklch(58%_0.22_25)] shadow-[0_0_0_3px_rgba(244,63,94,0.16)] dark:bg-[oklch(70%_0.18_25)]"
                style={{ left: DAY_TIMELINE_CONTENT_LEFT }}
              />
              <div
                className="absolute top-0 flex min-w-0 -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full border border-[oklch(82%_0.09_25)] bg-[oklch(96%_0.04_25)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[oklch(48%_0.20_25)] shadow-sm ring-1 ring-white/70 backdrop-blur dark:border-[oklch(48%_0.13_25)] dark:bg-[oklch(27%_0.08_25)] dark:text-[oklch(82%_0.12_25)]"
                style={{
                  left: `calc(${DAY_TIMELINE_CONTENT_LEFT}px + (100% - ${DAY_TIMELINE_CONTENT_LEFT}px) / 2)`,
                  maxWidth: `calc(100% - ${DAY_TIMELINE_CONTENT_LEFT + 170}px)`,
                }}
              >
                <Flag className="h-3.5 w-3.5 shrink-0" />
                <span className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] font-bold uppercase tracking-[0.08em]">
                  Due {marker.timeLabel}
                </span>
                <span className="h-3 w-px shrink-0 bg-[oklch(82%_0.09_25)] dark:bg-[oklch(48%_0.13_25)]" />
                <span className="min-w-0 truncate">
                  {marker.title}
                </span>
              </div>
            </div>
          );
        }

        const styles = categoryTokens(marker.category);

        return (
          <div
            key={marker.id}
            className={cn(
              "absolute",
              "left-1 right-1",
            )}
            style={{ top }}
            title={tooltip}
          >
            <div className="absolute left-0 right-0 top-0 border-t border-dashed border-[oklch(76%_0.12_25)] dark:border-[oklch(55%_0.14_25)]" />
            <div
              className={cn(
                "inline-flex max-w-full -translate-y-1/2 items-center gap-1.5 rounded-md border border-[oklch(82%_0.08_25)] bg-[color:var(--card)]/95 px-2 py-1 text-[10px] font-medium text-[oklch(55%_0.18_25)] shadow-sm backdrop-blur",
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
  const zoom = useTimelineZoom();
  if (!marker) return null;

  const top = minutesToPixels(marker.topMinutes) * zoom;

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
      className={cn(
        "pointer-events-none absolute z-40 flex -translate-y-1/2 items-center",
        DAY_TIMELINE_LEFT_CLASS,
        DAY_TIMELINE_RIGHT_CLASS,
      )}
      style={{ top }}
      aria-label={`Current time ${marker.label}`}
    >
      <span className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_2px_rgba(244,63,94,0.18)] dark:bg-rose-400" />
      <span className="h-px flex-1 bg-rose-500 shadow-[0_0_0_1px_rgba(244,63,94,0.16)] dark:bg-rose-400" />
      <div className="absolute right-0 translate-x-[70%]">
        <span className="inline-flex rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-white shadow-sm dark:bg-rose-400 dark:text-[color:var(--card)]">
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
  // Day view supplies a zoom via context; week view doesn't, so the hook
  // returns 1 there and the block lays out at native density.
  const zoom = useTimelineZoom();
  const top = minutesToPixels(task.topMinutes) * zoom;
  const height = Math.max(
    1,
    minutesToPixels(task.visibleDurationMinutes) * zoom,
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
    : "text-[color:var(--ink-2)]";
  const titleTextClass = isSleep
    ? "text-white"
    : "text-[color:var(--ink)]";
  const inlineIconClass = cn(
    "shrink-0",
    isWeekLayout ? "h-3.5 w-3.5" : "h-4 w-4",
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
  const routeLabel =
    task.commute_estimate || task.commute_config
      ? compactRouteLabel(
          (task.commute_estimate ?? task.commute_config)!.origin,
          (task.commute_estimate ?? task.commute_config)!.destination,
        )
      : null;
  // For cross-midnight blocks (most often sleep), the visible top edge is
  // 00:00 of the displayed day, which hides the fact that the block actually
  // started yesterday. Surface the real start in the hover title so users
  // aren't confused by a sleep block "starting at 00:00".
  let carryoverHint: string | null = null;
  if (task.continuesBefore && task.start_time) {
    const startedAt = new Date(task.start_time);
    if (!Number.isNaN(startedAt.getTime())) {
      const hh = String(startedAt.getHours()).padStart(2, "0");
      const mm = String(startedAt.getMinutes()).padStart(2, "0");
      carryoverHint = `Started ${formatDayLabel(task.storageDateKey)} at ${hh}:${mm}`;
    }
  }

  const taskHoverTitle = [
    `${task.title} (${startLabel} - ${endLabel})`,
    carryoverHint,
    task.commute_estimate
      ? `${compactRouteLabel(
          task.commute_estimate.origin,
          task.commute_estimate.destination,
        )}\n${commuteModeLabel(task.commute_estimate.mode)} - ${formatDuration(
          task.commute_estimate.travel_duration_minutes,
        )} travel + ${formatDuration(task.commute_estimate.buffer_minutes)} buffer`
      : routeLabel
        ? `${routeLabel}\nCommute details saved, estimate pending`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      // `data-task-id` is the jump target for rail status rows (e.g.
      // SleepControl "Tonight" / "Last night" rows scroll-to here).
      data-task-id={task.id}
      className={cn(
        "group absolute",
        layout === "week"
          ? "left-1 right-1"
          : [DAY_TIMELINE_LEFT_CLASS, DAY_TIMELINE_RIGHT_CLASS],
      )}
      style={{
        top,
        height,
      }}
      title={taskHoverTitle}
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
      {task.displayDurationUncertain && (
        // Bottom-fade overlay: communicates "this duration is a guess, not
        // a contract". Sits over the lower portion of the block, fading the
        // calendar-tinted background toward the timeline bg. pointer-events-
        // none so it never swallows clicks; below the resize handle (z-20)
        // so that handle still works if the block is ever unlocked.
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] rounded-b-[inherit]"
          style={{
            height: "45%",
            background:
              "linear-gradient(to bottom, transparent 0%, var(--card) 88%)",
          }}
          title="Duration is uncertain"
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
          isWeekLayout ? "pr-1.5" : "px-4 pr-5",
          hasTopDeadline ? "pb-2 pt-6" : isWeekLayout ? "py-1.5" : "py-2.5",
          task.kind === "calendar" &&
            (task.displayIsEvent ? EVENT_BLOCK_CLASS : CALENDAR_BLOCK_CLASS),
          isSleep && SLEEP_BLOCK_CLASS,
          isContinuation && "border-dashed",
          isLocked && "cursor-default",
        )}
      >
        {isWeekLayout ? (
          <div className="flex min-w-0 items-center gap-1 leading-none">
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
          <div className="flex min-w-0 items-center gap-3 leading-none">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={cn(
                  "shrink-0 rounded-[5px] px-1.5 py-1 font-[family-name:var(--font-mono)] text-[10.5px] font-bold leading-none tracking-[0.04em]",
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
                  "min-w-0 truncate text-[16px] font-bold leading-none tracking-[-0.01em]",
                  titleTextClass,
                )}
              >
                {task.title}
              </span>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium leading-none",
                  mutedTextClass,
                )}
              >
                {task.commute_estimate || task.commuteEnabled ? (
                  <Navigation className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <Clock className="h-3 w-3" aria-hidden="true" />
                )}
                {formatDuration(task.duration_minutes)}
              </span>
            </div>
            <div className="ml-auto flex shrink-0 items-center gap-1.5">
              <span
                className={cn(
                  "shrink-0 font-[family-name:var(--font-mono)] text-[12px] font-semibold tracking-[0.06em] tabular-nums",
                  mutedTextClass,
                )}
              >
                {startLabel} - {endLabel}
              </span>
            </div>
          </div>
        )}
      </DraggableBlock>
      {!isLocked && (
        <button
          type="button"
          className="absolute bottom-0.5 left-1/2 z-20 flex h-4 w-12 -translate-x-1/2 cursor-ns-resize items-center justify-center rounded bg-[color:var(--card)]/85 text-[color:var(--ink-3)] opacity-0 shadow-sm backdrop-blur transition-all hover:text-[color:var(--ink)] group-hover:opacity-100"
          title="Resize duration"
          onPointerDown={(event) => {
            event.preventDefault();
            event.stopPropagation();
            beginResize(task, event.clientY, "bottom");
          }}
        >
          <MoveVertical className="h-3 w-3" />
        </button>
      )}
      {task.displayIsActualSleep && (
        <button
          type="button"
          className="absolute right-1 top-1 z-20 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/15 text-white/85 opacity-0 backdrop-blur transition-all hover:bg-white/30 hover:text-white group-hover:opacity-100"
          title="Remove this imported sleep record (will return on next HAE sync)"
          onPointerDown={(event) => {
            // Synthetic block is locked, so DraggableBlock won't grab the
            // pointer here, but stop propagation anyway for safety.
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            deleteTask(task);
          }}
        >
          <X className="h-3 w-3" />
        </button>
      )}
      {isEditing && canEdit && (
        <PlacedTaskEditor
          task={task}
          onCancel={() => setIsEditing(false)}
          onSave={(values) => {
            updateTask(task, task.storageDateKey, values);
            setIsEditing(false);
          }}
          onDelete={() => {
            deleteTask(task);
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
  onDelete,
}: {
  task: VisibleTask;
  onCancel: () => void;
  onSave: (values: Partial<Task>) => void;
  onDelete: () => void;
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
  const initialCommuteConfig =
    task.commute_config ??
    (task.commute_estimate
      ? commuteConfigFromEstimate(task.commute_estimate)
      : null);
  const canConfigureCommute = Boolean(
    task.commuteEnabled || initialCommuteConfig || task.commute_estimate,
  );
  const [commuteOrigin, setCommuteOrigin] = useState(
    initialCommuteConfig?.origin ?? "",
  );
  const [commuteDestination, setCommuteDestination] = useState(
    initialCommuteConfig?.destination ?? "",
  );
  const [commuteMode, setCommuteMode] = useState<CommuteMode>(
    initialCommuteConfig?.mode ?? "driving-traffic",
  );
  const [commuteBuffer, setCommuteBuffer] = useState(
    initialCommuteConfig?.buffer_minutes ?? 10,
  );
  const [commuteTimeStrategy, setCommuteTimeStrategy] =
    useState<CommuteTimeStrategy>(
      initialCommuteConfig?.time_strategy ?? "depart_at_start",
    );
  const [commuteEstimate, setCommuteEstimate] =
    useState<CommuteEstimate | null>(task.commute_estimate);
  const [isEstimatingCommute, setIsEstimatingCommute] = useState(false);
  const [commuteError, setCommuteError] = useState<string | null>(null);

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
  const editedCommuteConfig: CommuteConfig | null =
    canConfigureCommute && commuteOrigin.trim() && commuteDestination.trim()
      ? {
          origin: commuteOrigin.trim(),
          destination: commuteDestination.trim(),
          mode: commuteMode,
          buffer_minutes: Math.max(
            0,
            Math.min(240, Math.round(commuteBuffer) || 0),
          ),
          time_strategy: commuteTimeStrategy,
          provider: "mapbox",
        }
      : null;
  const savedCommuteEstimate = commuteEstimateMatchesConfig(
    commuteEstimate,
    editedCommuteConfig,
  )
    ? commuteEstimate
    : null;

  const save = () => {
    onSave({
      title: title.trim() || task.title,
      category,
      start_time: dateForTimelineMinutes(
        task.storageDateKey,
        editedStartMinutes,
      ),
      duration_minutes: editedDurationMinutes,
      commute_config: editedCommuteConfig,
      commute_estimate: savedCommuteEstimate,
    });
  };
  const recalculateCommute = async () => {
    if (!editedCommuteConfig) {
      setCommuteError("Add both departure and arrival addresses first.");
      return;
    }
    setIsEstimatingCommute(true);
    setCommuteError(null);
    try {
      const nextEstimate = await estimateCommute(editedCommuteConfig);
      setCommuteEstimate(nextEstimate);
      if (editedCommuteConfig.time_strategy === "arrive_by_end") {
        const nextStart = clampNumber(
          editedEndMinutes - nextEstimate.duration_minutes,
          0,
          Math.max(0, TOTAL_MINUTES - 1),
        );
        setStartTime(formatTimeFromMinutes(nextStart));
      } else {
        const nextEnd = clampNumber(
          editedStartMinutes + nextEstimate.duration_minutes,
          1,
          TOTAL_MINUTES,
        );
        setEndTime(formatTimeFromMinutes(nextEnd));
      }
    } catch (error) {
      setCommuteError(
        error instanceof Error ? error.message : "Unable to estimate commute.",
      );
    } finally {
      setIsEstimatingCommute(false);
    }
  };

  return (
    <EditorModal onClose={onCancel}>
      <div className={EDITOR_CARD_CLASS}>
        <EditorHeader
          eyebrow="Edit block"
          title={title.trim() || task.title}
          meta={[
            `Tier ${category}`,
            `${startTime || "--:--"} - ${endTime || "--:--"}`,
            formatEditorDuration(editedDurationMinutes),
          ]}
          onCancel={onCancel}
        />

      <div className={EDITOR_BODY_CLASS}>
        <label className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Title</span>
          <input
            autoFocus
            className={EDITOR_PLAIN_INPUT_CLASS}
            value={title}
            placeholder="Block title"
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Tier</span>
          <EditorTierSegment value={category} onChange={setCategory} />
        </div>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Window</span>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-1.5">
            <input
              className={cn(EDITOR_INPUT_CLASS, "font-mono")}
              type="time"
              step={60}
              value={startTime}
              onChange={(event) => setStartTime(event.target.value)}
            />
            <span className="font-mono text-[color:var(--ink-3)]">
              {"->"}
            </span>
            <input
              className={cn(EDITOR_INPUT_CLASS, "font-mono")}
              type="time"
              step={60}
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </div>
        </div>
        <div className={EDITOR_ROW_CLASS}>
          <span className={EDITOR_LABEL_CLASS}>Duration</span>
          <div className="inline-grid w-fit grid-cols-[3.25rem_auto_3.25rem_auto] items-center gap-1">
            <input
              className={cn(EDITOR_INPUT_CLASS, "font-mono text-center")}
              readOnly
              value={Math.floor(editedDurationMinutes / 60)}
            />
            <span className="font-mono text-[12px] text-[color:var(--ink-3)]">
              h
            </span>
            <input
              className={cn(EDITOR_INPUT_CLASS, "font-mono text-center")}
              readOnly
              value={String(editedDurationMinutes % 60).padStart(2, "0")}
            />
            <span className="font-mono text-[12px] text-[color:var(--ink-3)]">
              m
            </span>
          </div>
        </div>
        {canConfigureCommute && (
          <div className={EDITOR_ROW_CLASS}>
            <span className={EDITOR_LABEL_CLASS}>Commute</span>
            <div className="min-w-0 space-y-2">
              <div className="grid gap-2">
                <input
                  className={EDITOR_INPUT_CLASS}
                  placeholder="Departure address"
                  value={commuteOrigin}
                  onChange={(event) => {
                    setCommuteOrigin(event.target.value);
                    setCommuteEstimate(null);
                  }}
                />
                <input
                  className={EDITOR_INPUT_CLASS}
                  placeholder="Arrival address"
                  value={commuteDestination}
                  onChange={(event) => {
                    setCommuteDestination(event.target.value);
                    setCommuteEstimate(null);
                  }}
                />
                <div className="grid grid-cols-[1fr_1fr_5rem] gap-2">
                  <select
                    className={EDITOR_INPUT_CLASS}
                    value={commuteMode}
                    onChange={(event) => {
                      setCommuteMode(event.target.value as CommuteMode);
                      setCommuteEstimate(null);
                    }}
                  >
                    {COMMUTE_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {commuteModeLabel(mode)}
                      </option>
                    ))}
                  </select>
                  <select
                    className={EDITOR_INPUT_CLASS}
                    value={commuteTimeStrategy}
                    onChange={(event) =>
                      setCommuteTimeStrategy(
                        event.target.value as CommuteTimeStrategy,
                      )
                    }
                  >
                    {COMMUTE_TIME_STRATEGIES.map((strategy) => (
                      <option key={strategy} value={strategy}>
                        {commuteTimeStrategyLabel(strategy)}
                      </option>
                    ))}
                  </select>
                  <input
                    className={cn(EDITOR_INPUT_CLASS, "text-center font-mono")}
                    min={0}
                    max={240}
                    step={5}
                    type="number"
                    value={commuteBuffer}
                    title="Buffer minutes"
                    onChange={(event) => {
                      setCommuteBuffer(Number(event.target.value));
                      setCommuteEstimate(null);
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {commuteEstimate && (
                  <>
                    <span className="rounded bg-[color:var(--sunken)] px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold text-[color:var(--ink-2)]">
                      {formatDuration(commuteEstimate.travel_duration_minutes)} travel
                    </span>
                    <span className="rounded bg-[color:var(--sunken)] px-2 py-1 font-[family-name:var(--font-mono)] text-[10px] font-semibold text-[color:var(--ink-2)]">
                      {formatDuration(commuteEstimate.duration_minutes)} total
                    </span>
                  </>
                )}
                <button
                  type="button"
                  className="inline-flex h-7 items-center justify-center rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 text-[11px] font-semibold text-[color:var(--ink)] transition-colors hover:bg-[color:var(--sunken)] disabled:opacity-50"
                  onClick={recalculateCommute}
                  disabled={isEstimatingCommute}
                >
                  {isEstimatingCommute ? "Estimating" : "Recalculate"}
                </button>
              </div>
              <p className="text-[11px] leading-snug text-[color:var(--ink-3)]">
                Depart mode adjusts the end time from the block start. Arrive
                mode adjusts the start time from the block end.
              </p>
              {commuteError && (
                <p className="text-[11px] leading-snug text-[oklch(55%_0.18_25)]">
                  {commuteError}
                </p>
              )}
            </div>
          </div>
        )}
      </div>

        <EditorFooter
          onDelete={onDelete}
          onCancel={onCancel}
          onSubmit={save}
          submitLabel="Save"
        />
      </div>
    </EditorModal>
  );
}
