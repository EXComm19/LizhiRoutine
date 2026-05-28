export const SCHEMA_VERSION = 3;

export type Category = "T0" | "T1" | "T2";
export type TaskStatus = "pending" | "completed";
export type BlockKind = "task" | "routine" | "calendar" | "sleep";
export type TodoListColor =
  | "blue"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "zinc";
export type RoutineIconName =
  | "zap"
  | "dumbbell"
  | "utensils"
  | "book"
  | "briefcase"
  | "laptop"
  | "coffee"
  | "shower"
  | "moon";
export type CommuteMode = "driving" | "driving-traffic" | "walking" | "cycling";
export type CommuteProvider = "mapbox";
export type CommuteTimeStrategy = "depart_at_start" | "arrive_by_end";

export type CommuteConfig = {
  origin: string;
  destination: string;
  mode: CommuteMode;
  buffer_minutes: number;
  time_strategy: CommuteTimeStrategy;
  provider: CommuteProvider;
};

export type CommuteEstimate = {
  provider: CommuteProvider;
  origin: string;
  destination: string;
  mode: CommuteMode;
  travel_duration_minutes: number;
  buffer_minutes: number;
  duration_minutes: number;
  distance_meters: number;
  calculated_at: string;
};

export type Task = {
  id: string;
  schema_version: number;
  title: string;
  category: Category;
  kind: BlockKind;
  status: TaskStatus;
  duration_minutes: number;
  start_time: string | null;
  locked: boolean;
  source_id: string | null;
  commute_config: CommuteConfig | null;
  commute_estimate: CommuteEstimate | null;
  created_at: string;
  updated_at: string;
};

export type RoutineTemplate = {
  id: string;
  schema_version: number;
  title: string;
  category: Category;
  color: TodoListColor;
  icon: RoutineIconName;
  kind: "routine" | "sleep";
  default_duration_minutes: number;
  commute_enabled: boolean;
  commute_config: CommuteConfig | null;
  built_in: boolean;
  created_at: string;
  updated_at: string;
};

export type TodoList = {
  id: string;
  schema_version: number;
  name: string;
  color: TodoListColor;
  built_in: boolean;
  created_at: string;
  updated_at: string;
};

/**
 * A piece of long-form context attached to a todo (markdown / PDF
 * instructions). We store the extracted text only — never the original file —
 * so the row stays JSON-safe and syncs through user_state.todos.
 *
 * `text` is capped (server side) to keep cloud payloads predictable.
 */
export type TodoContextDoc = {
  id: string;
  /** Original filename, kept for display only. */
  name: string;
  /** "text/markdown", "application/pdf", or "text/html-extract" (extension). */
  mime: string;
  /** Original byte size, before extraction. Useful for showing "2.3 MB pdf". */
  size_bytes: number;
  /** Extracted plain text; may be truncated. */
  text: string;
  /** Length of `text` after truncation, for the UI to show "12k chars". */
  text_chars: number;
  /**
   * When the doc came from a web capture (Chrome extension), the original
   * page URL — so the user can jump back to the source. Null for uploads.
   */
  source_url?: string | null;
  added_at: string;
};

/**
 * Time estimate for completing a todo. Currently the only producer is the
 * /api/estimate-todo route ("ai" source), but the type leaves room for a
 * future manual override.
 */
/** Single subtask within an AI breakdown of a todo. */
export type TodoEstimateSubtask = {
  name: string;
  minutes: number;
};

export type TodoEstimateConfidence = "low" | "medium" | "high";

export type TodoEstimate = {
  /**
   * Canonical "most likely" minutes (P50). Older estimates only have this;
   * newer ones also fill the optimistic/pessimistic + subtask fields.
   * Always reflects the headline number shown in the progress bar.
   */
  minutes: number;
  source: "ai" | "manual";
  /** Short rationale from the model, displayed below the progress bar. */
  notes: string | null;
  /** When this estimate was last (re-)computed. */
  computed_at: string;

  // -- Phase-2A additions; all optional for backward compat --
  /** Lower bound (~P25) — "if everything goes smoothly". */
  minutes_optimistic?: number;
  /** Upper bound (~P90) — "if you hit issues". */
  minutes_pessimistic?: number;
  /** Concrete decomposition the model produced. Empty array = none. */
  subtasks?: TodoEstimateSubtask[];
  /** Free-text drivers ("long context doc", "multi-step procedure"). */
  factors?: string[];
  /** Model's self-reported confidence in the estimate. */
  confidence?: TodoEstimateConfidence;
};

/**
 * Frozen copy of a todo's estimate captured at the moment it was marked
 * completed. Stays put even if the user later re-estimates the (now
 * pending-again) todo — that's the whole point: it's the data point we
 * compare against actual_minutes for accuracy tracking and for feeding
 * back into future estimates.
 */
export type TodoEstimateSnapshot = {
  minutes: number;
  source: TodoEstimate["source"];
  /** ISO timestamp when the snapshot was taken (≈ first completed_at). */
  snapshotted_at: string;
};

export type TodoItem = {
  id: string;
  schema_version: number;
  title: string;
  category: Category;
  status: TaskStatus;
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  list_id: string;
  /**
   * ISO timestamp of when status flipped to "completed". Null when pending.
   * Used by the auto-hide-after-N-days preference to compute age.
   */
  completed_at: string | null;
  /** Attached instruction docs (markdown / pdf), text-only. */
  context_docs: TodoContextDoc[];
  /**
   * Free-text user notes about the task that should influence the estimate
   * but don't belong in the docs (e.g. "I'm new to this topic", "have a
   * partial draft already", "due tomorrow, doesn't need to be perfect").
   * Injected verbatim into the estimate prompt as a user-perspective hint.
   */
  user_insight: string | null;
  /** AI/manual time estimate for completion, or null if none computed. */
  estimate: TodoEstimate | null;
  /**
   * The estimate frozen at completion time. Survives later re-estimates so
   * accuracy stats compare actuals against the prediction that was actually
   * standing when the user did the work.
   */
  estimate_snapshot: TodoEstimateSnapshot | null;
  /**
   * Total focused-work minutes the user (or the auto-fill from completed
   * scheduled blocks) recorded for this todo. Null until set.
   */
  actual_minutes: number | null;
  created_at: string;
  updated_at: string;
};

/**
 * Fixed-time appointment / meeting / one-off class.
 *
 * Distinct from TodoItem on purpose: events have a definite start time and
 * duration (the time IS the event), can't be split, and don't take an AI
 * estimate (the model has nothing to estimate — the duration is known).
 * Recurring time blocks belong to Period instead.
 *
 * Events render on the timeline as virtual `kind: "calendar"` blocks at
 * their `starts_at` — the projection is render-time, the persistent data
 * lives only here.
 */
export type EventStatus = "scheduled" | "cancelled";

/**
 * Coarse category for visual + classification purposes. Drives the icon
 * shown on the event card and the timeline block, so a quick glance
 * tells "medical thing" vs "work meeting" vs "class". "general" is the
 * fallback when nothing more specific fits.
 */
export type EventType =
  | "general"
  | "medical"
  | "work"
  | "academic"
  | "social"
  | "personal";

export type EventItem = {
  id: string;
  schema_version: number;
  title: string;
  category: Category;
  /** Reuses TodoList for grouping — same lists as todos. */
  list_id: string;
  tags: string[];
  /** ISO datetime — the start of the event in wall-clock time. */
  starts_at: string;
  duration_minutes: number;
  /**
   * True when the user (or the AI parser, when inferring from text without
   * an explicit duration) wasn't confident about how long this will actually
   * run. Drives a bottom-fade visual on the timeline block so it's obvious
   * the height is a guess, not a contract. duration_minutes stays as the
   * "best estimate" used for layout regardless.
   */
  duration_uncertain: boolean;
  /** Coarse category — drives icon + (eventually) per-type filtering. */
  event_type: EventType;
  /** Free-text notes (agenda summary, location, etc.). */
  notes: string | null;
  /** Optional attached docs (agenda PDF, joining info). */
  context_docs: TodoContextDoc[];
  status: EventStatus;
  created_at: string;
  updated_at: string;
};

export type Preferences = {
  schema_version: number;
  sleep_target_minutes: number;
  /**
   * Auto-hide completed reminders this many days after their completed_at.
   * `null` = feature off (completed items stay visible until manually toggled).
   * A value of 0 means "hide immediately on completion."
   */
  auto_hide_completed_days: number | null;
  updated_at: string;
};

export type PeriodKind =
  | "placement"
  | "work"
  | "internship"
  | "holiday"
  | "study"
  | "custom";

export type PeriodColor = TodoListColor;

export type PeriodBreak = {
  id: string;
  label: string;
  start_time: string;
  end_time: string;
};

export type Period = {
  id: string;
  schema_version: number;
  title: string;
  kind: PeriodKind;
  color: PeriodColor;
  start_date: string;
  end_date: string;
  daily_start_time: string | null;
  daily_end_time: string | null;
  days_of_week: number[];
  breaks: PeriodBreak[];
  notes: string;
  created_at: string;
  updated_at: string;
};

export type DragPayload =
  | { type: "task"; taskId: string }
  | { type: "template"; templateId: string }
  | { type: "placed-task"; taskId: string };

export type Envelope<T> = {
  schema_version: number;
  updated_at: string;
  data: T;
};

export type DayDoc = Envelope<{ tasks: Task[] }>;
export type TemplatesDoc = Envelope<{ templates: RoutineTemplate[] }>;
export type PreferencesDoc = Envelope<Preferences>;
export type TodosDoc = Envelope<{ todos: TodoItem[] }>;
export type TodoListsDoc = Envelope<{ lists: TodoList[] }>;
export type PeriodsDoc = Envelope<{ periods: Period[] }>;
export type EventsDoc = Envelope<{ events: EventItem[] }>;

/**
 * One recorded sleep session, imported from an external tracker.
 * Sleep sessions overlap midnight in practice — we always store the actual
 * wall-clock instants, never split. Rendering code is responsible for
 * clipping to a calendar day.
 *
 * `source_uid` is the dedup key when re-importing: stable per session
 * across multiple HealthKit exports, so the ingest endpoint can upsert
 * without creating duplicates.
 */
export type SleepRecord = {
  id: string;
  schema_version: number;
  /** ISO datetime, the user went to bed / fell asleep. */
  started_at: string;
  /** ISO datetime, the user woke up / got out of bed. */
  ended_at: string;
  /**
   * Duration in minutes — either reported by the source or computed from
   * (ended_at - started_at). Stored explicitly so renderers don't have to
   * re-parse dates on every paint.
   */
  duration_minutes: number;
  /**
   * Source app/device the record came from. Free-form string for now;
   * "apple-health", "health-auto-export", "manual", future "oura", etc.
   */
  source: string;
  /**
   * Stable identifier from the source so re-imports dedupe. For
   * HealthAutoExport this is the start ISO + source app concatenation.
   * Required.
   */
  source_uid: string;
  created_at: string;
  updated_at: string;
};

export type SleepRecordsDoc = Envelope<{ records: SleepRecord[] }>;
