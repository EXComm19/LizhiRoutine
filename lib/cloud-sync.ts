import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SCHEMA_VERSION,
  type DayDoc,
  type EventItem,
  type EventsDoc,
  type SleepRecord,
  type SleepRecordsDoc,
  type Period,
  type PeriodsDoc,
  type Preferences,
  type PreferencesDoc,
  type RoutineTemplate,
  type Task,
  type TemplatesDoc,
  type TodoItem,
  type TodoList,
  type TodoListsDoc,
  type TodosDoc,
} from "@/lib/schema";
import {
  clearAllLocalState,
  loadAllDays,
  loadEvents,
  loadPeriods,
  loadSleepRecords,
  loadPreferences,
  loadTemplates,
  loadTodoLists,
  loadTodos,
  localHasUserData,
  setCloudWriter,
  type CloudWriter,
  writeDayLocal,
  writeEventsLocal,
  writePeriodsLocal,
  writeSleepRecordsLocal,
  writePreferencesLocal,
  writeTemplatesLocal,
  writeTodoListsLocal,
  writeTodosLocal,
} from "@/lib/storage";

type UserStateRow = {
  user_id: string;
  schema_version: number;
  templates: RoutineTemplate[];
  todos: TodoItem[];
  todo_lists: TodoList[];
  periods: Period[];
  /**
   * Phase-43 Event entity. Older user_state rows from before the split may
   * not have this column populated — readers must tolerate it being null
   * / missing and fall back to an empty array.
   */
  events: EventItem[] | null;
  /**
   * Migration 0009 column. Null on rows that pre-date the column for the
   * same tolerate-it-being-absent reason `events` does.
   */
  sleep_records: SleepRecord[] | null;
  preferences: Preferences;
  updated_at: string;
};

type DayTaskRow = {
  user_id: string;
  date_key: string;
  schema_version: number;
  data: { tasks: Task[] };
  updated_at: string;
};

function nowIso() {
  return new Date().toISOString();
}

function logCloudError(scope: string, error: unknown) {
  if (error) {
    console.warn(`[lizhi-routine] cloud sync (${scope}) failed`, error);
  }
}

function makeCloudWriter(
  client: SupabaseClient,
  userId: string,
): CloudWriter {
  const upsertState = (patch: Partial<UserStateRow>) => {
    void client
      .from("user_state")
      .upsert(
        {
          user_id: userId,
          schema_version: SCHEMA_VERSION,
          updated_at: nowIso(),
          ...patch,
        },
        { onConflict: "user_id" },
      )
      .then(({ error }) => logCloudError("user_state", error));
  };

  return {
    day: (dateKey, doc: DayDoc) => {
      void client
        .from("day_tasks")
        .upsert(
          {
            user_id: userId,
            date_key: dateKey,
            schema_version: doc.schema_version,
            data: doc.data,
            updated_at: doc.updated_at,
          },
          { onConflict: "user_id,date_key" },
        )
        .then(({ error }) => logCloudError(`day:${dateKey}`, error));
    },
    templates: (doc: TemplatesDoc) =>
      upsertState({ templates: doc.data.templates }),
    todos: (doc: TodosDoc) => upsertState({ todos: doc.data.todos }),
    todoLists: (doc: TodoListsDoc) =>
      upsertState({ todo_lists: doc.data.lists }),
    periods: (doc: PeriodsDoc) => upsertState({ periods: doc.data.periods }),
    events: (doc: EventsDoc) => upsertState({ events: doc.data.events }),
    sleepRecords: (doc: SleepRecordsDoc) =>
      upsertState({ sleep_records: doc.data.records }),
    preferences: (doc: PreferencesDoc) =>
      upsertState({ preferences: doc.data }),
  };
}

async function fetchCloudSnapshot(
  client: SupabaseClient,
  userId: string,
): Promise<{ stateRow: UserStateRow | null; dayRows: DayTaskRow[] }> {
  const [stateResult, dayResult] = await Promise.all([
    client
      .from("user_state")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle<UserStateRow>(),
    client
      .from("day_tasks")
      .select("*")
      .eq("user_id", userId)
      .returns<DayTaskRow[]>(),
  ]);
  return {
    stateRow: stateResult.data ?? null,
    dayRows: dayResult.data ?? [],
  };
}

function snapshotHasData(snapshot: {
  stateRow: UserStateRow | null;
  dayRows: DayTaskRow[];
}) {
  return Boolean(snapshot.stateRow) || snapshot.dayRows.length > 0;
}

function applyCloudSnapshotLocally(snapshot: {
  stateRow: UserStateRow | null;
  dayRows: DayTaskRow[];
}) {
  // Replace local state with cloud snapshot. Theme/pane prefs are preserved.
  clearAllLocalState();

  const { stateRow, dayRows } = snapshot;
  if (stateRow) {
    if (Array.isArray(stateRow.templates)) {
      writeTemplatesLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { templates: stateRow.templates },
      });
    }
    if (Array.isArray(stateRow.todos)) {
      writeTodosLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { todos: stateRow.todos },
      });
    }
    if (Array.isArray(stateRow.todo_lists)) {
      writeTodoListsLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { lists: stateRow.todo_lists },
      });
    }
    if (Array.isArray(stateRow.periods)) {
      writePeriodsLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { periods: stateRow.periods },
      });
    }
    if (Array.isArray(stateRow.events)) {
      writeEventsLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { events: stateRow.events },
      });
    }
    if (Array.isArray(stateRow.sleep_records)) {
      writeSleepRecordsLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: { records: stateRow.sleep_records },
      });
    }
    if (stateRow.preferences && typeof stateRow.preferences === "object") {
      const cloudPrefs = stateRow.preferences as Partial<Preferences>;
      const autoHide = cloudPrefs.auto_hide_completed_days;
      writePreferencesLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: {
          schema_version: SCHEMA_VERSION,
          sleep_target_minutes: cloudPrefs.sleep_target_minutes ?? 8 * 60,
          auto_hide_completed_days:
            typeof autoHide === "number" &&
            Number.isFinite(autoHide) &&
            autoHide >= 0
              ? Math.floor(autoHide)
              : null,
          updated_at: stateRow.updated_at,
        },
      });
    }
  }

  for (const row of dayRows) {
    writeDayLocal(row.date_key, {
      schema_version: row.schema_version,
      updated_at: row.updated_at,
      data: row.data,
    });
  }
}

async function pushLocalToCloud(client: SupabaseClient, userId: string) {
  const templates = loadTemplates();
  const todos = loadTodos();
  const todoLists = loadTodoLists();
  const periods = loadPeriods();
  const events = loadEvents();
  const sleepRecords = loadSleepRecords();
  const preferences = loadPreferences();
  const days = loadAllDays();

  const stateUpsert = client
    .from("user_state")
    .upsert(
      {
        user_id: userId,
        schema_version: SCHEMA_VERSION,
        templates,
        todos,
        todo_lists: todoLists,
        periods,
        events,
        sleep_records: sleepRecords,
        preferences,
        updated_at: nowIso(),
      },
      { onConflict: "user_id" },
    );

  const dayUpsert = days.length
    ? client.from("day_tasks").upsert(
        days.map((entry) => ({
          user_id: userId,
          date_key: entry.dateKey,
          schema_version: SCHEMA_VERSION,
          data: { tasks: entry.tasks },
          updated_at: nowIso(),
        })),
        { onConflict: "user_id,date_key" },
      )
    : null;

  const [stateResult, dayResult] = await Promise.all([
    stateUpsert,
    dayUpsert ?? Promise.resolve({ error: null }),
  ]);

  logCloudError("push:user_state", stateResult.error);
  logCloudError("push:day_tasks", dayResult.error);
}

export type SyncOnSignInResult =
  | { kind: "pulled" }
  | { kind: "pushed" }
  | { kind: "noop" }
  | {
      kind: "conflict";
      /** Lightweight summary of the cloud side so the UI can show counts. */
      cloud: {
        templates: number;
        todos: number;
        periods: number;
        events: number;
        sleepRecords: number;
        days: number;
      };
    };

/**
 * Run after a successful sign-in.
 *
 * - Cloud empty + local empty → noop.
 * - Cloud empty + local has data → push local up (and register writer).
 * - Cloud has data + local empty → pull cloud down (and register writer).
 * - Cloud has data + local has data → return a `conflict` marker WITHOUT
 *   touching either side. The caller must surface a dialog and then call
 *   `resolveSyncConflict` with the user's choice. Until then, no writer is
 *   registered, so local edits remain local.
 */
export async function syncOnSignIn(
  client: SupabaseClient,
  userId: string,
): Promise<SyncOnSignInResult> {
  const snapshot = await fetchCloudSnapshot(client, userId);
  const cloudHas = snapshotHasData(snapshot);
  const localHas = localHasUserData();

  if (!cloudHas && !localHas) {
    setCloudWriter(makeCloudWriter(client, userId));
    return { kind: "noop" };
  }

  if (!cloudHas && localHas) {
    await pushLocalToCloud(client, userId);
    setCloudWriter(makeCloudWriter(client, userId));
    return { kind: "pushed" };
  }

  if (cloudHas && !localHas) {
    applyCloudSnapshotLocally(snapshot);
    setCloudWriter(makeCloudWriter(client, userId));
    return { kind: "pulled" };
  }

  return {
    kind: "conflict",
    cloud: {
      templates: snapshot.stateRow?.templates?.length ?? 0,
      todos: snapshot.stateRow?.todos?.length ?? 0,
      periods: snapshot.stateRow?.periods?.length ?? 0,
      events: snapshot.stateRow?.events?.length ?? 0,
      sleepRecords: snapshot.stateRow?.sleep_records?.length ?? 0,
      days: snapshot.dayRows.length,
    },
  };
}

/**
 * Apply the user's resolution to a sync conflict.
 * - "cloud" → replace local with cloud snapshot (the old default behaviour).
 * - "local" → push local state up, overwriting cloud.
 * Either way, the cloud writer is registered afterwards.
 */
export async function resolveSyncConflict(
  client: SupabaseClient,
  userId: string,
  choice: "cloud" | "local",
): Promise<void> {
  if (choice === "cloud") {
    const snapshot = await fetchCloudSnapshot(client, userId);
    applyCloudSnapshotLocally(snapshot);
  } else {
    await pushLocalToCloud(client, userId);
  }
  setCloudWriter(makeCloudWriter(client, userId));
}

/**
 * Re-attach the cloud writer without re-running the initial sync.
 * Used on page refresh when we've already synced this user before — local
 * state is already write-through, we just need writes to flow upward again.
 */
export function attachCloudWriter(
  client: SupabaseClient,
  userId: string,
): void {
  setCloudWriter(makeCloudWriter(client, userId));
}

/**
 * Unconditionally pull the cloud snapshot and replace local with it.
 *
 * Use this when the user explicitly asks for fresh data (Refresh button,
 * tab-back-from-background, etc.). Assumes the write-through cloud writer
 * has been keeping cloud in sync with local edits made on THIS device —
 * any in-flight local writes that haven't reached the cloud yet would be
 * lost, but in normal operation they're flushed on each save.
 *
 * Returns true on success (snapshot fetched and applied), false if the
 * cloud has no data for this user (nothing to pull).
 */
export async function pullFromCloud(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const snapshot = await fetchCloudSnapshot(client, userId);
  if (!snapshotHasData(snapshot)) return false;
  applyCloudSnapshotLocally(snapshot);
  setCloudWriter(makeCloudWriter(client, userId));
  return true;
}

/**
 * Detach the cloud writer and clear local app state so the next account
 * (or a signed-out session) starts clean.
 */
export function syncOnSignOut(): void {
  setCloudWriter(null);
  clearAllLocalState();
}
