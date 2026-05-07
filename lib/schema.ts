export const SCHEMA_VERSION = 2;

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
  created_at: string;
  updated_at: string;
};

export type Preferences = {
  schema_version: number;
  sleep_target_minutes: number;
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
