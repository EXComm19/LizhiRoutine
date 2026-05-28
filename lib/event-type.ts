// Lookup tables for the EventType enum. Lives apart from the React tree so
// non-component code (parsers, normalizers) can import the label list
// without pulling in lucide-react.

import type { EventType } from "@/lib/schema";

export const EVENT_TYPES: ReadonlyArray<EventType> = [
  "general",
  "medical",
  "work",
  "academic",
  "social",
  "personal",
];

/** Human label for picker UIs and prompt definitions. */
export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  general: "General",
  medical: "Medical",
  work: "Work",
  academic: "Academic",
  social: "Social",
  personal: "Personal",
};

/**
 * One-line hint shown next to each option in the picker — also useful as
 * prompt context for the AI parser when telling it which category to pick.
 */
export const EVENT_TYPE_HINTS: Record<EventType, string> = {
  general: "Default — anything else",
  medical: "Doctor / dentist / therapy / vaccination",
  work: "Meeting / interview / standup / 1-on-1",
  academic: "Lecture / class / workshop / tutorial",
  social: "Coffee / dinner / party / hangout",
  personal: "Errand / appointment outside the other types",
};
