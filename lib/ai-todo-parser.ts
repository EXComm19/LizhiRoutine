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
