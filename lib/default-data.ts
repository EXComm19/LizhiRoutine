import {
  SCHEMA_VERSION,
  type RoutineTemplate,
  type TodoList,
} from "@/lib/schema";

const EPOCH = "1970-01-01T00:00:00.000Z";

export const defaultTemplates: RoutineTemplate[] = [
  {
    id: "template-sleep",
    schema_version: SCHEMA_VERSION,
    title: "Sleep",
    category: "T1",
    color: "violet",
    icon: "moon",
    kind: "sleep",
    default_duration_minutes: 8 * 60,
    commute_enabled: false,
    commute_config: null,
    built_in: true,
    created_at: EPOCH,
    updated_at: EPOCH,
  },
];

export const defaultTodoLists: TodoList[] = [
  {
    id: "list-inbox",
    schema_version: SCHEMA_VERSION,
    name: "Inbox",
    color: "blue",
    built_in: true,
    created_at: EPOCH,
    updated_at: EPOCH,
  },
];
