import type { Category } from "@/lib/schema";

export type EmailSuggestionStatus = "pending" | "added" | "dismissed";

export type EmailTodoSuggestion = {
  id: string;
  accountId: string;
  accountEmail?: string | null;
  provider: "gmail";
  sourceMessageId: string;
  sourceThreadId: string | null;
  sourceSubject: string;
  sourceFrom: string;
  sourceReceivedAt: string | null;
  sourceSnippet: string;
  fingerprint: string;
  title: string;
  listName: string;
  category: Category;
  dueDate: string | null;
  dueTime: string | null;
  tags: string[];
  /** "task" or "event" — see ai-todo-parser.ts for the full semantics. */
  kind: "task" | "event";
  /** Minutes for the event when kind=event and dueTime is set; else null. */
  durationMinutes: number | null;
  /** True when the parser guessed the duration. Drives the fade visual. */
  durationUncertain: boolean;
  confidence: number;
  reason: string;
  /**
   * 1-2 sentence AI gist of the email content — written for every scanned
   * email so the agent feed shows a card even when there's nothing to add.
   * Empty string falls back to the subject in the UI.
   */
  summary: string;
  /**
   * True when the email implies a concrete task/event the user should add.
   * False = informational only (newsletters, confirmations, FYIs). The
   * agent UI hides the Add button for non-actionable cards.
   */
  isActionable: boolean;
  status: EmailSuggestionStatus;
  createdTodoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GmailAccountSummary = {
  id: string;
  email: string;
  lastSyncedAt: string | null;
  historyId: string | null;
};

export type GmailConnectionStatus = {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
  historyId: string | null;
  accounts: GmailAccountSummary[];
  needsConfiguration?: boolean;
  error?: string;
};

export type GmailScanResponse = {
  suggestions: EmailTodoSuggestion[];
  scannedMessages: number;
  parsedMessages: number;
  skippedMessages: number;
  warnings: string[];
};
