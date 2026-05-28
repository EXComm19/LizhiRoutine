// Shared planner-internal types. Component-prop types stay co-located with
// their components; this file is only for things crossing component
// boundaries (helpers in `internals.ts`, multiple views, etc.).

import type {
  Category,
  RoutineIconName,
  Task,
  TodoItem,
  TodoList,
  TodoListColor,
} from "@/lib/schema";

export type VisibleTask = Task & {
  storageDateKey: string;
  topMinutes: number;
  visibleDurationMinutes: number;
  continuesBefore: boolean;
  continuesAfter: boolean;
  displayColor?: TodoListColor;
  displayIcon?: RoutineIconName;
  displayListName?: string;
  commuteEnabled?: boolean;
  /**
   * Set on synthetic event blocks whose source EventItem was flagged with
   * duration_uncertain. PlacedTask renders a bottom-fade gradient to
   * communicate "this height is a guess, not a contract".
   */
  displayDurationUncertain?: boolean;
  /**
   * True when this VisibleTask is a synthetic projection of an EventItem
   * (user-created appointment) — as opposed to an ICS-imported calendar
   * block. Drives the distinct cool-teal palette so the two visually
   * don't collide.
   */
  displayIsEvent?: boolean;
  /**
   * True when this VisibleTask is a synthetic projection of an imported
   * SleepRecord (Apple Health / Pillow / etc), replacing a same-night
   * planned sleep block. The block is locked (no drag/resize) and shows
   * a small × delete affordance instead of the usual editor popover.
   */
  displayIsActualSleep?: boolean;
};

export type DeadlineMarker = {
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

export type CurrentTimeMarker = {
  topMinutes: number;
  label: string;
};

export type LeftRailView = "calendar" | "reminders" | "events" | "periods" | "agent";
export type CalendarView = "day" | "week" | "month" | "stats";

export type CalendarDay = {
  dateKey: string;
  tasks: VisibleTask[];
  deadlines: DeadlineMarker[];
};

export type TodoWithMeta = TodoItem & {
  allocatedMinutes: number;
  /**
   * Sum of duration_minutes across all completed (status === "completed")
   * task blocks linked to this todo. Drives the estimate progress bar.
   */
  completedMinutes: number;
  list: TodoList;
};

export type StatsRoutineRow = {
  id: string;
  title: string;
  category: Category;
  minutes: number;
  kind: Task["kind"];
  linked: boolean;
};

export type StatsTodoRow = {
  id: string;
  title: string;
  listName: string;
  category: Category;
  minutes: number;
  linked: boolean;
};

export type StatsListRow = {
  id: string;
  name: string;
  minutes: number;
};

export type StatsSummary = {
  routineRows: StatsRoutineRow[];
  todoRows: StatsTodoRow[];
  listRows: StatsListRow[];
  routineMinutes: number;
  todoMinutes: number;
};

/** Reminder-completion breakdown by todo list, used in the stats view. */
export type StatsCompletionListRow = {
  id: string;
  name: string;
  color: TodoListColor;
  completed: number;
};

/** Per-day completion count, for the mini-chart in the stats view. */
export type StatsCompletionDay = {
  dateKey: string;
  count: number;
};

/** One data point on the calibration scatter — one completed estimate. */
export type StatsAccuracyPoint = {
  id: string;
  title: string;
  listName: string;
  category: Category;
  estimatedMinutes: number;
  actualMinutes: number;
  /** actual / estimated. */
  ratio: number;
  /** Whether actual fell inside [optimistic, pessimistic] when available. */
  withinRange: boolean | null;
  completedAt: string;
};

/** Per-list aggregate of accuracy — average ratio + sample count. */
export type StatsAccuracyListRow = {
  id: string;
  name: string;
  color: TodoListColor;
  samples: number;
  medianRatio: number;
};

export type StatsEstimateAccuracySummary = {
  /** Every completed-with-snapshot-and-actual todo whose completed_at is in range. */
  points: StatsAccuracyPoint[];
  /** Median actual/estimate ratio across all points (null when no samples). */
  medianRatio: number | null;
  /** Mean absolute percentage error: avg(|actual-estimated|/actual) × 100. */
  mapePct: number | null;
  /** Signed mean error in minutes: avg(actual - estimated). + = underestimated. */
  meanSignedErrorMinutes: number | null;
  /**
   * Of points with both optimistic and pessimistic bounds set, how many had
   * actual ∈ [opt, pes]. Null when no point had bounds.
   */
  rangeCoverage: { withinRange: number; withRange: number } | null;
  /** Per-list aggregate (only lists with ≥1 sample). */
  byList: StatsAccuracyListRow[];
};

export type StatsCompletionSummary = {
  /** Todos whose completed_at falls in [start, end]. */
  completedCount: number;
  /**
   * Of `completedCount`, how many had a due_date set — this is the denominator
   * for the on-time %. Avoids inflating the rate with no-deadline items.
   */
  completedWithDueCount: number;
  /** Of `completedWithDueCount`, how many finished on or before due_date. */
  onTimeCount: number;
  /**
   * Pending todos with due_date strictly before today. Range-independent —
   * this is "what's currently overdue right now," not "what fell overdue in
   * this period," because the latter is rarely what users want to know.
   */
  overdueCount: number;
  /** Counts grouped by todo list (only lists with ≥1 completion appear). */
  byList: StatsCompletionListRow[];
  /** Counts per category — always returns all three keys (zero-filled). */
  byCategory: Record<Category, number>;
  /** One entry per day in the range, in chronological order. */
  daily: StatsCompletionDay[];
};

/**
 * Aggregated daily sleep totals + headline metrics for the Stats tab.
 * Built by buildSleepStats() in helpers.ts; consumed by SleepStatsSection
 * in routine-planner.tsx.
 */
export type SleepStatsRow = {
  dateKey: string;
  minutes: number;
};

export type SleepStatsSummary = {
  daily: SleepStatsRow[];
  averageMinutes: number | null;
  medianMinutes: number | null;
  daysWithData: number;
  daysBelowTargetCount: number;
};

export type SunTimes = {
  sunriseLabel: string;
  sunsetLabel: string;
  sunriseOffsetMinutes: number;
  sunsetOffsetMinutes: number;
  locationLabel: string;
  source: "open-meteo" | "fallback";
};
