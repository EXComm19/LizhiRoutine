# Data, Backend, And Sync Contract

## Backend Principle

The first iOS app should use the same Supabase backend as the web app. Do not create a separate mobile-only schema for MVP.

## Supabase Tables

### `public.user_state`

One row per user for global data.

| Column | Type | Meaning |
| --- | --- | --- |
| `user_id` | uuid | Auth user id, primary key. |
| `schema_version` | integer | Current schema version. |
| `templates` | jsonb | `RoutineTemplate[]`. |
| `todos` | jsonb | `TodoItem[]`. |
| `todo_lists` | jsonb | `TodoList[]`. |
| `periods` | jsonb | `Period[]`. |
| `preferences` | jsonb | `Preferences`. |
| `updated_at` | timestamptz | Row update timestamp. |

### `public.day_tasks`

One row per user and planning date.

| Column | Type | Meaning |
| --- | --- | --- |
| `user_id` | uuid | Auth user id. |
| `date_key` | text | Planning date key, `YYYY-MM-DD`. |
| `schema_version` | integer | Current schema version. |
| `data` | jsonb | `{ "tasks": Task[] }`. |
| `updated_at` | timestamptz | Row update timestamp. |

Primary key: `(user_id, date_key)`.

RLS policies require `auth.uid() = user_id`.

## Schema Version

Current web schema version: `2`.

Swift models should include `schema_version` fields and preserve unknown-safe migration behavior where possible.

## Core Models

### `Task`

Represents anything on the timeline.

```ts
{
  id: string;
  schema_version: number;
  title: string;
  category: "T0" | "T1" | "T2";
  kind: "task" | "routine" | "calendar" | "sleep";
  status: "pending" | "completed";
  duration_minutes: number;
  start_time: string | null;
  locked: boolean;
  source_id: string | null;
  created_at: string;
  updated_at: string;
}
```

Important:

- Todo timeline blocks use `kind = "task"` and `source_id = todo.id`.
- Routine timeline blocks use `kind = "routine"` or `"sleep"` and `source_id = template.id`.
- Calendar blocks use `kind = "calendar"`, `locked = true`, and `source_id` as import/dedupe key.
- `duration_minutes` should be exact; UI drag can snap, but editor can save exact minute values.

### `RoutineTemplate`

```ts
{
  id: string;
  schema_version: number;
  title: string;
  category: "T0" | "T1" | "T2";
  color: "blue" | "emerald" | "amber" | "rose" | "violet" | "zinc";
  icon: "zap" | "dumbbell" | "utensils" | "book" | "briefcase" | "laptop" | "coffee" | "shower" | "moon";
  kind: "routine" | "sleep";
  default_duration_minutes: number;
  built_in: boolean;
  created_at: string;
  updated_at: string;
}
```

### `TodoItem`

```ts
{
  id: string;
  schema_version: number;
  title: string;
  category: "T0" | "T1" | "T2";
  status: "pending" | "completed";
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  list_id: string;
  created_at: string;
  updated_at: string;
}
```

### `TodoList`

```ts
{
  id: string;
  schema_version: number;
  name: string;
  color: "blue" | "emerald" | "amber" | "rose" | "violet" | "zinc";
  built_in: boolean;
  created_at: string;
  updated_at: string;
}
```

### `Period`

```ts
{
  id: string;
  schema_version: number;
  title: string;
  kind: "placement" | "work" | "internship" | "holiday" | "study" | "custom";
  color: "blue" | "emerald" | "amber" | "rose" | "violet" | "zinc";
  start_date: string;
  end_date: string;
  daily_start_time: string | null;
  daily_end_time: string | null;
  days_of_week: number[];
  breaks: PeriodBreak[];
  notes: string;
  created_at: string;
  updated_at: string;
}
```

## Time Rules

Constants:

```text
DAY_START_HOUR = 5
DAY_END_HOUR = 29
TOTAL_MINUTES = 1440
SNAP_MINUTES = 30
```

Rules:

- Timeline starts at local `05:00` for the selected date.
- Timeline ends at local `05:00` the next date.
- Times earlier than `05:00` wrap to the bottom.
- Store `start_time` as ISO timestamp.
- Display according to local timezone.
- Be careful around daylight saving transitions.

## Sync Rules For MVP

Use local-first with simple last-write-wins:

1. Load cached local data immediately.
2. If signed in, pull Supabase data.
3. If cloud data exists, replace local cache.
4. If cloud data is empty, push local cache.
5. Every local mutation updates local cache first and queues/pushes a Supabase upsert.

iOS should structure this through services so the conflict policy can be upgraded later.

Recommended iOS storage:

- MVP: file-backed JSON cache or SQLite.
- Prefer SQLite/SwiftData if you want faster querying and offline mutation queues.
- Whatever is used locally must still round-trip the Supabase JSON contract.

## IDs

Web IDs use prefixes:

- `task-...`
- `template-...`
- `todo-...`
- `list-...`
- `period-...`

iOS can use the same string prefixes with UUIDs. Avoid relying on `crypto.randomUUID`; use Swift `UUID().uuidString`.

