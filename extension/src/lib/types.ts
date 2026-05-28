// API contract types shared between popup / background / options. Subset
// of lib/schema.ts from the main Lizhi Routine repo — kept here so this
// extension builds in isolation without reaching into the Next.js workspace.

export type TodoCategory = "T0" | "T1" | "T2";

export type ExtensionTodo = {
  id: string;
  title: string;
  listName: string;
  category: TodoCategory | string;
  dueDate: string | null;
};

export type CapturedPage = {
  /** Full page URL the user was on when they triggered the capture. */
  url: string;
  /** document.title (or page meta title), trimmed. */
  title: string;
  /** Readability-extracted main content, or innerText fallback. */
  text: string;
  /**
   * Source detail for debugging — was Readability successful, or did we
   * fall back to innerText? Surfaced in the popup as a small label.
   */
  extractSource: "readability" | "innertext";
};

export type AttachResponse = {
  todo: { id: string; title: string };
  doc: { id: string; name: string };
};
