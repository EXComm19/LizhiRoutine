import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SCHEMA_VERSION,
  type DayDoc,
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
  loadPeriods,
  loadPreferences,
  loadTemplates,
  loadTodoLists,
  loadTodos,
  setCloudWriter,
  type CloudWriter,
  writeDayLocal,
  writePeriodsLocal,
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
    preferences: (doc: PreferencesDoc) =>
      upsertState({ preferences: doc.data }),
  };
}

async function pullFromCloud(
  client: SupabaseClient,
  userId: string,
): Promise<{ hadData: boolean }> {
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

  const stateRow = stateResult.data ?? null;
  const dayRows = dayResult.data ?? [];

  if (!stateRow && dayRows.length === 0) {
    return { hadData: false };
  }

  // Replace local state with cloud snapshot. Theme/pane prefs are preserved.
  clearAllLocalState();

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
    if (stateRow.preferences && typeof stateRow.preferences === "object") {
      writePreferencesLocal({
        schema_version: SCHEMA_VERSION,
        updated_at: stateRow.updated_at,
        data: {
          schema_version: SCHEMA_VERSION,
          sleep_target_minutes:
            (stateRow.preferences as Preferences).sleep_target_minutes ??
            8 * 60,
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

  return { hadData: true };
}

async function pushLocalToCloud(client: SupabaseClient, userId: string) {
  const templates = loadTemplates();
  const todos = loadTodos();
  const todoLists = loadTodoLists();
  const periods = loadPeriods();
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

/**
 * Run after a successful sign-in. Pulls cloud data into localStorage; if
 * the cloud is empty, pushes the existing local state up as starter data.
 * Then registers the cloud writer so future writes propagate.
 */
export async function syncOnSignIn(
  client: SupabaseClient,
  userId: string,
): Promise<void> {
  const result = await pullFromCloud(client, userId);
  if (!result.hadData) {
    await pushLocalToCloud(client, userId);
  }
  setCloudWriter(makeCloudWriter(client, userId));
}

/**
 * Detach the cloud writer and clear local app state so the next account
 * (or a signed-out session) starts clean.
 */
export function syncOnSignOut(): void {
  setCloudWriter(null);
  clearAllLocalState();
}
