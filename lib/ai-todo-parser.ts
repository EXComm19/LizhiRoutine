import type { Category } from "@/lib/schema";

export type TodoParserListContext = {
  id: string;
  name: string;
};

export type ParsedTodoCandidate = {
  title: string;
  listName: string;
  category: Category;
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  /**
   * Classifier output. "task" = something the user does (flexible duration,
   * estimable). "event" = something that happens at a fixed time (meeting,
   * class, appointment). Default "task" when the model is unsure.
   */
  kind: "task" | "event";
  /**
   * Only meaningful when kind === "event" and dueTime is set. Minutes the
   * event runs for. Null otherwise.
   */
  durationMinutes: number | null;
  /**
   * True when the model guessed at durationMinutes (no explicit duration in
   * the source text). Drives the bottom-fade visual on the timeline block
   * so the user can tell the height is inferred. Only meaningful for events.
   */
  durationUncertain: boolean;
};

export type ParseTodosRequest = {
  text: string;
  selectedDate: string;
  existingLists: TodoParserListContext[];
};

export type ParseTodosResponse = {
  todos: ParsedTodoCandidate[];
  warnings: string[];
};
