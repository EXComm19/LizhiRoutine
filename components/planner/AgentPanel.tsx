"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCheck,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { EVENT_TYPE_ICONS } from "@/components/planner/EventsPanel";
import { EmptyState } from "@/components/planner/primitives";
import type { ParsedTodoCandidate, ParseTodosResponse } from "@/lib/ai-todo-parser";
import type {
  EmailTodoSuggestion,
  GmailConnectionStatus,
} from "@/lib/email-suggestions";
import type { EventType, TodoList } from "@/lib/schema";
import { todoListColorTokens } from "@/lib/colors";
import { cn } from "@/lib/utils";

// ── Shared HTTP helpers ─────────────────────────────────────────────────

async function fetchGmailStatus(signal?: AbortSignal) {
  const response = await fetch("/api/gmail/status", {
    cache: "no-store",
    signal,
  });
  return (await response.json()) as GmailConnectionStatus;
}

async function fetchSuggestions(signal?: AbortSignal) {
  const response = await fetch("/api/gmail/suggestions", {
    cache: "no-store",
    signal,
  });
  const payload = (await response.json()) as {
    suggestions?: EmailTodoSuggestion[];
  };
  return payload.suggestions ?? [];
}

async function patchSuggestionStatus(
  suggestionId: string,
  status: EmailTodoSuggestion["status"],
  accountId: string,
) {
  await fetch(`/api/gmail/suggestions/${suggestionId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId, status }),
  });
}

async function bulkDismissPendingSuggestions() {
  const response = await fetch("/api/gmail/suggestions/dismiss-all", {
    method: "POST",
  });
  if (!response.ok) return 0;
  const payload = (await response.json().catch(() => null)) as
    | { dismissed?: number }
    | null;
  return payload?.dismissed ?? 0;
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (error as { name?: string } | null)?.name === "AbortError";
}

// ── Paste-history persistence ───────────────────────────────────────────
//
// Survives reloads so the user's chat history with the agent isn't wiped
// every refresh. Capped at 50 messages to keep localStorage well under any
// browser per-origin quota. Local-only (not synced) since this is device
// state, not user-data — when the user signs out, clearAllLocalState()
// will wipe it like any other unprefixed key.

const PASTE_HISTORY_STORAGE_KEY = "lizhi-routine:agent-paste-history";
const PASTE_HISTORY_LIMIT = 50;

function loadPasteHistory(): AgentPasteMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PASTE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    // Light shape validation — paranoid against schema drift.
    return parsed
      .filter((item): item is AgentPasteMessage => {
        const m = item as AgentPasteMessage | null;
        return (
          !!m &&
          m.kind === "paste" &&
          typeof m.id === "string" &&
          typeof m.echo === "string" &&
          typeof m.createdAt === "string" &&
          Array.isArray(m.items)
        );
      })
      .slice(0, PASTE_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

function savePasteHistory(messages: AgentPasteMessage[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      PASTE_HISTORY_STORAGE_KEY,
      JSON.stringify(messages.slice(0, PASTE_HISTORY_LIMIT)),
    );
  } catch {
    // Quota exceeded or storage disabled — ignore; in-memory state still
    // works for the current session.
  }
}

// ── Feed message model (client-side only for v1) ─────────────────────────

type AgentEmailMessage = {
  kind: "email";
  id: string; // suggestion id
  suggestion: EmailTodoSuggestion;
  /** Hidden when user dismissed locally in this session. */
  dismissed?: boolean;
};

type AgentPasteSuggestionStatus = "pending" | "added" | "dismissed";

type AgentPasteMessage = {
  kind: "paste";
  id: string;
  /** First 160 chars of input shown back to the user as the "you sent" header. */
  echo: string;
  createdAt: string;
  items: ParsedTodoCandidate[];
  itemStatuses: Record<number, AgentPasteSuggestionStatus>;
};

type AgentMessage = AgentEmailMessage | AgentPasteMessage;

// ── Composer (textarea + Send button) ───────────────────────────────────

function Composer({
  onSend,
  isWorking,
}: {
  onSend: (text: string) => Promise<void>;
  isWorking: boolean;
}) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const trimmed = text.trim();
  const canSend = trimmed.length > 0 && !isWorking;

  const handleSend = async () => {
    if (!canSend) return;
    const value = trimmed;
    setText("");
    await onSend(value);
    // Refocus so a user pasting multiple things in a row stays in flow.
    textareaRef.current?.focus();
  };

  return (
    <div className="shrink-0 border-t border-[color:var(--line-soft)] bg-[color:var(--card)] px-3 pb-3 pt-2.5">
      <div className="relative">
        <textarea
          ref={textareaRef}
          className="block w-full resize-none rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2 pr-12 text-[13px] text-[color:var(--ink)] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
          placeholder="Paste an email, type a note, or list things to do…"
          rows={3}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // ⌘/Ctrl-Enter to send — common chat affordance, doesn't fight
            // with normal Enter for multi-line paste.
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void handleSend();
            }
          }}
        />
        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={!canSend}
          className={cn(
            "absolute bottom-2 right-2 inline-flex h-7 w-7 items-center justify-center rounded-full transition-colors",
            canSend
              ? "bg-[color:var(--ink)] text-[color:var(--card)] hover:opacity-90"
              : "bg-[color:var(--sunken)] text-[color:var(--ink-3)]",
          )}
          aria-label="Send"
          title="Send (⌘+Enter)"
        >
          {isWorking ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
        </button>
      </div>
      <div className="mt-1.5 px-1 font-[family-name:var(--font-mono)] text-[10px] text-[color:var(--ink-3)]">
        AI will summarise and propose tasks or events. ⌘+Enter to send.
      </div>
    </div>
  );
}

// ── Suggestion card (shared between email + paste sources) ──────────────

function relTime(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return "";
  const diff = (Date.now() - ms) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function tierTokens(category: string) {
  switch (category) {
    case "T0":
      return "bg-[color:var(--ink)] text-[color:var(--card)]";
    case "T1":
      return "bg-[color:var(--t1)]/15 text-[color:var(--t1)]";
    default:
      return "bg-[color:var(--t2)]/15 text-[color:var(--t2)]";
  }
}

type SuggestionShape = {
  kind: "task" | "event";
  title: string;
  category: string;
  listName: string;
  dueDate: string | null;
  dueTime: string | null;
  durationMinutes: number | null;
  durationUncertain: boolean;
  eventType?: EventType;
};

function SuggestionCard({
  s,
  todoLists,
  onAdd,
  onDismiss,
  status,
}: {
  s: SuggestionShape;
  todoLists: TodoList[];
  onAdd: () => void;
  onDismiss: () => void;
  status: "pending" | "added" | "dismissed";
}) {
  const list = todoLists.find((l) => l.name === s.listName);
  const listStyles = list ? todoListColorTokens(list.color) : null;
  const isEvent = s.kind === "event";
  const eventTypeForIcon: EventType = (s.eventType ?? "general") as EventType;
  const Icon = isEvent
    ? (EVENT_TYPE_ICONS[eventTypeForIcon] ?? EVENT_TYPE_ICONS.general)
    : Sparkles;

  const dueLabel = s.dueDate
    ? `${s.dueDate}${s.dueTime ? ` ${s.dueTime}` : ""}`
    : null;
  const durationLabel = isEvent && s.durationMinutes
    ? `${s.durationMinutes}m${s.durationUncertain ? " (~)" : ""}`
    : null;

  return (
    <div
      className={cn(
        "mt-2 flex items-start gap-2.5 rounded-[var(--r-sm)] border bg-[color:var(--card)] p-2.5 transition-opacity",
        status === "pending"
          ? "border-[color:var(--line)]"
          : "border-[color:var(--line-soft)] opacity-55",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--r-sm)]",
          isEvent
            ? "bg-[color:var(--block-event)] text-[color:var(--block-event-ink)]"
            : "bg-[color:var(--sunken)] text-[color:var(--ink-2)]",
        )}
        aria-hidden
      >
        <Icon className="h-3.5 w-3.5" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-3.5 shrink-0 items-center rounded px-1 text-[9px] font-semibold uppercase tracking-wide",
              isEvent
                ? "bg-[color:var(--block-event)] text-[color:var(--block-event-ink)]"
                : "bg-[color:var(--sunken)] text-[color:var(--ink-2)]",
            )}
          >
            {isEvent ? "Event" : "Task"}
          </span>
          <span
            className={cn(
              "inline-flex h-3.5 shrink-0 items-center rounded px-1 text-[9px] font-semibold tracking-wide",
              tierTokens(s.category),
            )}
          >
            {s.category}
          </span>
          {list && listStyles && (
            <span
              className={cn(
                "inline-flex h-3.5 min-w-0 shrink items-center truncate rounded border px-1 text-[9px] font-medium",
                listStyles.block,
                listStyles.text,
              )}
            >
              {list.name}
            </span>
          )}
          {status === "added" && (
            <span className="ml-auto text-[10px] font-[family-name:var(--font-mono)] text-[color:var(--ink-3)]">
              added ✓
            </span>
          )}
          {status === "dismissed" && (
            <span className="ml-auto text-[10px] font-[family-name:var(--font-mono)] text-[color:var(--ink-3)]">
              dismissed
            </span>
          )}
        </div>
        <div className="mt-1 truncate text-[13px] font-medium text-[color:var(--ink)]">
          {s.title}
        </div>
        {(dueLabel || durationLabel) && (
          <div className="mt-0.5 flex items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
            {dueLabel && <span>{dueLabel}</span>}
            {dueLabel && durationLabel && <span>·</span>}
            {durationLabel && <span>{durationLabel}</span>}
          </div>
        )}
        {status === "pending" && (
          <div className="mt-2 flex gap-1.5">
            <Button type="button" variant="primary" size="sm" onClick={onAdd}>
              Add
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Message cards ───────────────────────────────────────────────────────

function EmailMessageCard({
  message,
  todoLists,
  onAdd,
  onDismiss,
}: {
  message: AgentEmailMessage;
  todoLists: TodoList[];
  onAdd: () => Promise<void>;
  onDismiss: () => Promise<void>;
}) {
  const { suggestion } = message;
  const sender = suggestion.sourceFrom.replace(/<[^>]+>/g, "").trim();
  // Actionable = parser flagged this as having a real task/event. For
  // back-compat with pre-#50 rows (no isActionable field on DB), fall
  // back to the legacy "has a title" check.
  const isActionable =
    suggestion.isActionable !== false && Boolean(suggestion.title);
  // The agent-feed body text. Prefer the AI summary (#50), fall back to
  // the actionable "reason" (pre-#50), then to the snippet so the user
  // always sees what landed in their inbox.
  const bodyText =
    suggestion.summary?.trim() ||
    suggestion.reason?.trim() ||
    suggestion.sourceSnippet?.trim() ||
    "";

  return (
    <article className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-3 shadow-[0_2px_8px_-6px_rgba(20,18,10,0.10)]">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--sunken)] text-[color:var(--ink-3)]"
          aria-hidden
        >
          <Mail className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 flex items-center gap-1.5 text-[11.5px] text-[color:var(--ink-2)]">
              <span className="min-w-0 truncate font-medium">
                {sender || suggestion.accountEmail || "Gmail"}
              </span>
              {!isActionable && (
                <span className="inline-flex h-3.5 shrink-0 items-center rounded bg-[color:var(--sunken)] px-1 font-[family-name:var(--font-mono)] text-[9px] font-medium uppercase tracking-wide text-[color:var(--ink-3)]">
                  FYI
                </span>
              )}
            </div>
            <div className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-[color:var(--ink-3)]">
              {relTime(suggestion.sourceReceivedAt ?? suggestion.createdAt)}
            </div>
          </div>
          <div className="mt-0.5 truncate text-[12.5px] font-semibold text-[color:var(--ink)]">
            {suggestion.sourceSubject || "(no subject)"}
          </div>
          {bodyText && (
            <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--ink-2)]">
              {bodyText}
            </p>
          )}
        </div>
      </div>

      {isActionable ? (
        <SuggestionCard
          s={{
            kind: suggestion.kind,
            title: suggestion.title,
            category: suggestion.category,
            listName: suggestion.listName,
            dueDate: suggestion.dueDate,
            dueTime: suggestion.dueTime,
            durationMinutes: suggestion.durationMinutes,
            durationUncertain: suggestion.durationUncertain,
            eventType: undefined,
          }}
          todoLists={todoLists}
          onAdd={() => void onAdd()}
          onDismiss={() => void onDismiss()}
          status="pending"
        />
      ) : (
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void onDismiss()}
            title="Mark as read"
          >
            <Trash2 className="mr-1 h-3 w-3" />
            Mark read
          </Button>
        </div>
      )}
    </article>
  );
}

function PasteMessageCard({
  message,
  todoLists,
  onAdd,
  onDismiss,
}: {
  message: AgentPasteMessage;
  todoLists: TodoList[];
  onAdd: (index: number) => void;
  onDismiss: (index: number) => void;
}) {
  return (
    <article className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-3 shadow-[0_2px_8px_-6px_rgba(20,18,10,0.10)]">
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[var(--r-sm)] bg-[color:var(--sunken)] text-[color:var(--ink-3)]"
          aria-hidden
        >
          <Sparkles className="h-3 w-3" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="min-w-0 truncate text-[11.5px] font-medium text-[color:var(--ink-2)]">
              You
            </div>
            <div className="shrink-0 font-[family-name:var(--font-mono)] text-[10px] text-[color:var(--ink-3)]">
              {relTime(message.createdAt)}
            </div>
          </div>
          <div className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-[color:var(--ink-2)]">
            &ldquo;{message.echo}&rdquo;
          </div>
          <p className="mt-1.5 text-[12px] leading-snug text-[color:var(--ink-2)]">
            Parsed <strong>{message.items.length}</strong>{" "}
            {message.items.length === 1 ? "item" : "items"}.
          </p>
        </div>
      </div>

      {message.items.map((item, index) => (
        <SuggestionCard
          key={index}
          s={{
            kind: item.kind,
            title: item.title,
            category: item.category,
            listName: item.listName,
            dueDate: item.dueDate,
            dueTime: item.dueTime,
            durationMinutes: item.durationMinutes,
            durationUncertain: item.durationUncertain,
          }}
          todoLists={todoLists}
          status={message.itemStatuses[index] ?? "pending"}
          onAdd={() => onAdd(index)}
          onDismiss={() => onDismiss(index)}
        />
      ))}
    </article>
  );
}

// ── Main panel ──────────────────────────────────────────────────────────

type AgentPanelProps = {
  selectedDate: string;
  todoLists: TodoList[];
  onImport: (items: ParsedTodoCandidate[]) => void;
};

// How stale the last sync must be before tab/window focus triggers a
// background scan. Five minutes is the smallest interval that still feels
// "alive" without burning Kimi tokens every alt-tab.
const AUTO_SCAN_STALENESS_MS = 5 * 60 * 1000;

// Filter chips above the feed. "actions" surfaces emails with a real
// task/event proposal, "fyi" the informational ones, "you" your own
// pastes, "all" shows everything together.
type AgentFeedFilter = "all" | "actions" | "fyi" | "you";

const FEED_FILTERS: ReadonlyArray<{ id: AgentFeedFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "actions", label: "Actions" },
  { id: "fyi", label: "FYI" },
  { id: "you", label: "You" },
];

export function AgentPanel({
  selectedDate,
  todoLists,
  onImport,
}: AgentPanelProps) {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [suggestions, setSuggestions] = useState<EmailTodoSuggestion[]>([]);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Lazy initializer reads from localStorage so we don't flash empty
  // state on first paint when there's a saved history.
  const [pasteMessages, setPasteMessages] = useState<AgentPasteMessage[]>(
    () => loadPasteHistory(),
  );
  const [banner, setBanner] = useState<string>("");
  const [feedFilter, setFeedFilter] = useState<AgentFeedFilter>("all");
  const [isDismissingAll, setIsDismissingAll] = useState(false);

  // Persist paste history on every change. Capped + JSON-encoded inside
  // savePasteHistory; small writes so we don't bother debouncing.
  useEffect(() => {
    savePasteHistory(pasteMessages);
  }, [pasteMessages]);

  // Scan state — surfaced as a status pill in the header.
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<
    { current: number; total: number } | null
  >(null);

  // Parse state — for the composer's spinner.
  const [isParsing, setIsParsing] = useState(false);

  // Local memory of when we last auto-scanned, used to throttle window-focus
  // fires that arrive in rapid succession (Cmd-Tab spam, etc.). Distinct
  // from status?.lastSyncedAt — that one only updates after the scan
  // completes, while this updates the moment we kick off.
  const lastAutoScanAtRef = useRef<number>(0);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const [nextStatus, nextSuggestions] = await Promise.all([
        fetchGmailStatus(signal),
        fetchSuggestions(signal),
      ]);
      if (signal?.aborted) return;
      setStatus(nextStatus);
      setSuggestions(nextSuggestions);
    } catch (error) {
      if (isAbortError(error)) return;
      setBanner("Could not load Gmail.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Hydrate on mount; AbortController makes it strict-mode safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const accounts = status?.accounts ?? [];
  const isBusy = busyAccountId !== null;

  // Reuses the same plan → run chunks → finalize chain GmailSuggestionsPanel
  // used; ported here so AgentPanel is self-contained.
  type ScanFailure = {
    accountEmail: string;
    stage: "plan" | "run" | "finalize";
    /** 1-indexed chunk number for run failures, undefined for plan/finalize. */
    chunkIndex?: number;
    chunkOf?: number;
    chunkSize?: number;
    error: string;
    /**
     * Server-side error code. `gmail_reauth_required` means the refresh
     * token was revoked / expired — the rest of the scan is pointless
     * for this account and the UI should prompt for reconnection.
     */
    code?: string;
  };

  const scanAccount = async (
    accountId: string,
    accountEmail: string,
    onProgress?: (current: number, total: number) => void,
  ): Promise<ScanFailure[]> => {
    const existingLists = todoLists.map((list) => ({
      id: list.id,
      name: list.name,
    }));
    const failures: ScanFailure[] = [];
    let pending: string[] = [];
    let chunkLimit = 8;
    /**
     * When the refresh token is dead, plan/run/finalize all 401 with the
     * same error. Skip the cascade so the failure list isn't 3 copies of
     * the same message — one entry tells the user what's wrong.
     */
    let reauthRequired = false;

    // ── Plan ─────────────────────────────────────────────────────────
    try {
      const planResponse = await fetch("/api/gmail/scan/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, forceBackfill: false }),
      });
      const planPayload = (await planResponse.json().catch(() => null)) as
        | {
            pendingMessageIds?: string[];
            chunkLimit?: number;
            error?: string;
            code?: string;
          }
        | null;
      if (!planResponse.ok) {
        const message =
          planPayload?.error ?? `Plan returned HTTP ${planResponse.status}.`;
        failures.push({
          accountEmail,
          stage: "plan",
          error: message,
          code: planPayload?.code,
        });
        console.error("[agent-scan] plan failed", {
          accountEmail,
          error: message,
          code: planPayload?.code,
        });
        if (planPayload?.code === "gmail_reauth_required") {
          reauthRequired = true;
        }
      } else {
        pending = planPayload?.pendingMessageIds ?? [];
        chunkLimit = Math.max(1, planPayload?.chunkLimit ?? 8);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error.";
      failures.push({ accountEmail, stage: "plan", error: message });
      console.error("[agent-scan] plan threw", { accountEmail, error });
    }

    // Refresh-token dead → skip run + finalize, they'll fail the same way.
    if (reauthRequired) return failures;

    const total = pending.length;
    onProgress?.(0, total);

    // ── Run (per chunk, continue past failures) ──────────────────────
    let processed = 0;
    const chunkCount = Math.ceil(pending.length / chunkLimit);
    for (let offset = 0, chunkIndex = 1; offset < pending.length; offset += chunkLimit, chunkIndex += 1) {
      const chunk = pending.slice(offset, offset + chunkLimit);
      try {
        const runResponse = await fetch("/api/gmail/scan/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId,
            messageIds: chunk,
            selectedDate,
            existingLists,
          }),
        });
        if (!runResponse.ok) {
          const errBody = (await runResponse.json().catch(() => null)) as
            | { error?: string; code?: string }
            | null;
          const message =
            errBody?.error ?? `Chunk returned HTTP ${runResponse.status}.`;
          failures.push({
            accountEmail,
            stage: "run",
            chunkIndex,
            chunkOf: chunkCount,
            chunkSize: chunk.length,
            error: message,
            code: errBody?.code,
          });
          console.error("[agent-scan] chunk failed", {
            accountEmail,
            chunkIndex,
            chunkOf: chunkCount,
            chunkSize: chunk.length,
            messageIds: chunk,
            error: message,
          });
          // Continue to the next chunk so one bad batch doesn't drop the
          // rest of the user's inbox on the floor.
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Network error.";
        failures.push({
          accountEmail,
          stage: "run",
          chunkIndex,
          chunkOf: chunkCount,
          chunkSize: chunk.length,
          error: message,
        });
        console.error("[agent-scan] chunk threw", {
          accountEmail,
          chunkIndex,
          chunkOf: chunkCount,
          messageIds: chunk,
          error,
        });
      }
      processed += chunk.length;
      onProgress?.(processed, total);
    }

    // ── Finalize ─────────────────────────────────────────────────────
    try {
      const finalizeResponse = await fetch("/api/gmail/scan/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!finalizeResponse.ok) {
        const errBody = (await finalizeResponse.json().catch(() => null)) as
          | { error?: string; code?: string }
          | null;
        const message =
          errBody?.error ?? `Finalize returned HTTP ${finalizeResponse.status}.`;
        failures.push({
          accountEmail,
          stage: "finalize",
          error: message,
          code: errBody?.code,
        });
        console.error("[agent-scan] finalize failed", {
          accountEmail,
          error: message,
          code: errBody?.code,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Network error.";
      failures.push({ accountEmail, stage: "finalize", error: message });
      console.error("[agent-scan] finalize threw", { accountEmail, error });
    }

    return failures;
  };

  const scanAll = async () => {
    if (isBusy || !accounts.length) return;
    setBanner("");
    setBusyAccountId("__all__");
    setScanProgress({ current: 0, total: 0 });
    lastAutoScanAtRef.current = Date.now();
    const allFailures: ScanFailure[] = [];
    try {
      for (const account of accounts) {
        const failures = await scanAccount(
          account.id,
          account.email,
          (current, total) => setScanProgress({ current, total }),
        );
        allFailures.push(...failures);
      }
      await refresh();
      if (allFailures.length > 0) {
        // Special-case the auth failures first — generic errors aren't
        // worth surfacing when the user can't do anything else until
        // they sign in / reconnect.
        const signedOut = allFailures.some(
          (f) => f.code === "supabase_signed_out",
        );
        const reauthAccounts = Array.from(
          new Set(
            allFailures
              .filter((f) => f.code === "gmail_reauth_required")
              .map((f) => f.accountEmail),
          ),
        );
        if (signedOut) {
          setBanner("Your session expired. Sign in again to scan.");
        } else if (reauthAccounts.length > 0) {
          const list = reauthAccounts.join(", ");
          setBanner(
            `Gmail access expired for ${list}. Reconnect in Settings → Gmail.`,
          );
        } else {
          // First non-reauth failure is shown in full; rest collapsed to
          // a count. Full list is already in console.error.
          const first = allFailures[0];
          const where =
            first.stage === "run"
              ? `chunk ${first.chunkIndex}/${first.chunkOf}`
              : first.stage;
          const trailing =
            allFailures.length > 1
              ? ` (+${allFailures.length - 1} more — see devtools console)`
              : "";
          setBanner(
            `Scan ${first.accountEmail} ${where}: ${first.error}${trailing}`,
          );
        }
        console.error("[agent-scan] all failures", allFailures);
      }
    } finally {
      setBusyAccountId(null);
      setScanProgress(null);
    }
  };

  // ── Auto-scan on focus (#51) ──
  // Goal: every time the user comes back to the tab, the agent quietly
  // checks for new mail without making them click Scan. The listener stays
  // mount-stable; a ref carries the latest closure values into it.
  const autoScanRef = useRef<{
    isBusy: boolean;
    accounts: typeof accounts;
    lastSyncedAt: string | null;
    scanAll: () => Promise<void>;
  } | null>(null);

  useEffect(() => {
    // Keep the ref's snapshot fresh on every render so the listener below
    // always sees the latest accounts / scan function. Doing this inside an
    // effect (not during render) keeps React's strict-mode hooks happy.
    autoScanRef.current = {
      isBusy,
      accounts,
      lastSyncedAt: status?.lastSyncedAt ?? null,
      scanAll,
    };
  });

  useEffect(() => {
    const maybeAutoScan = () => {
      const snapshot = autoScanRef.current;
      if (!snapshot) return;
      const { isBusy, accounts, lastSyncedAt, scanAll } = snapshot;
      // Quick exits: nothing to scan, scan in flight, tab not visible.
      if (isBusy || !accounts.length) return;
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      const lastSyncMs = lastSyncedAt ? Date.parse(lastSyncedAt) : 0;
      const lastLocalMs = lastAutoScanAtRef.current;
      const youngest = Math.max(lastSyncMs, lastLocalMs);
      // If we've scanned within the staleness window, skip.
      if (youngest && Date.now() - youngest < AUTO_SCAN_STALENESS_MS) return;
      void scanAll();
    };

    // Fire once on mount as well — covers the "tab restored from a long-
    // suspended session" case where the tab is already visible.
    maybeAutoScan();

    const onVisible = () => {
      if (document.visibilityState === "visible") maybeAutoScan();
    };
    const onFocus = () => maybeAutoScan();

    // Periodic poll: even if the user never blurs/refocuses the tab,
    // re-check every staleness window so they don't have to click Scan.
    // The maybeAutoScan() guards handle throttling, in-flight scans, and
    // hidden tabs, so this is safe to fire on a fixed cadence.
    const tickId = window.setInterval(maybeAutoScan, AUTO_SCAN_STALENESS_MS);

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(tickId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  const addEmailSuggestion = async (suggestion: EmailTodoSuggestion) => {
    // Informational cards have no actionable shape — guard so an accidental
    // click can't import the bare email subject as a todo.
    if (suggestion.isActionable === false) return;
    // Convert to the parser's candidate shape (carries kind / duration too).
    onImport([
      {
        title: suggestion.title,
        listName: suggestion.listName,
        category: suggestion.category,
        dueDate: suggestion.dueDate,
        dueTime: suggestion.dueTime,
        tags: suggestion.tags,
        kind: suggestion.kind,
        durationMinutes: suggestion.durationMinutes,
        durationUncertain: suggestion.durationUncertain,
      },
    ]);
    setSuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id),
    );
    await patchSuggestionStatus(suggestion.id, "added", suggestion.accountId);
  };

  const dismissEmailSuggestion = async (suggestion: EmailTodoSuggestion) => {
    setSuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id),
    );
    setDismissedIds((current) => {
      const next = new Set(current);
      next.add(suggestion.id);
      return next;
    });
    await patchSuggestionStatus(
      suggestion.id,
      "dismissed",
      suggestion.accountId,
    );
  };

  const markAllEmailsRead = async () => {
    if (isDismissingAll) return;
    // Optimistic: clear locally first so the feed empties immediately, then
    // call the bulk endpoint. If it fails we just refresh to recover state.
    const ids = suggestions.map((s) => s.id);
    if (!ids.length) return;
    setIsDismissingAll(true);
    setDismissedIds((current) => {
      const next = new Set(current);
      ids.forEach((id) => next.add(id));
      return next;
    });
    setSuggestions([]);
    try {
      await bulkDismissPendingSuggestions();
    } catch {
      setBanner("Could not mark all as read — refreshing.");
      await refresh();
    } finally {
      setIsDismissingAll(false);
    }
  };

  const handleComposerSend = useCallback(
    async (text: string) => {
      if (isParsing) return;
      setIsParsing(true);
      const id = `paste-${Date.now()}`;
      try {
        const response = await fetch("/api/parse-todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            selectedDate,
            existingLists: todoLists.map((list) => ({
              id: list.id,
              name: list.name,
            })),
          }),
        });
        if (!response.ok) {
          setBanner("Could not reach the parser.");
          return;
        }
        const payload = (await response.json()) as ParseTodosResponse;
        const items = payload.todos ?? [];
        if (!items.length) {
          setBanner("No actionable items found in that paste.");
          return;
        }
        const message: AgentPasteMessage = {
          kind: "paste",
          id,
          echo: text.slice(0, 160),
          createdAt: new Date().toISOString(),
          items,
          itemStatuses: {},
        };
        setPasteMessages((current) => [message, ...current]);
        setBanner("");
      } catch {
        setBanner("Could not reach the parser.");
      } finally {
        setIsParsing(false);
      }
    },
    [isParsing, selectedDate, todoLists],
  );

  const addPasteItem = (messageId: string, index: number) => {
    setPasteMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        const item = message.items[index];
        if (!item) return message;
        const currentStatus = message.itemStatuses[index] ?? "pending";
        if (currentStatus !== "pending") return message;
        onImport([item]);
        return {
          ...message,
          itemStatuses: { ...message.itemStatuses, [index]: "added" },
        };
      }),
    );
  };

  const dismissPasteItem = (messageId: string, index: number) => {
    setPasteMessages((current) =>
      current.map((message) => {
        if (message.id !== messageId) return message;
        return {
          ...message,
          itemStatuses: { ...message.itemStatuses, [index]: "dismissed" },
        };
      }),
    );
  };

  // Build the unified feed — paste messages and email suggestions, sorted
  // by created-at descending (newest first). We always materialize the full
  // feed so per-chip counts are accurate even when a filter is active.
  const fullFeed: AgentMessage[] = useMemo(() => {
    const emailMessages: AgentEmailMessage[] = suggestions
      .filter((suggestion) => !dismissedIds.has(suggestion.id))
      .map((suggestion) => ({
        kind: "email",
        id: suggestion.id,
        suggestion,
      }));
    const all: AgentMessage[] = [...emailMessages, ...pasteMessages];
    return all.sort((a, b) => {
      const aTime =
        a.kind === "email"
          ? Date.parse(
              a.suggestion.sourceReceivedAt ?? a.suggestion.createdAt,
            )
          : Date.parse(a.createdAt);
      const bTime =
        b.kind === "email"
          ? Date.parse(
              b.suggestion.sourceReceivedAt ?? b.suggestion.createdAt,
            )
          : Date.parse(b.createdAt);
      return bTime - aTime;
    });
  }, [dismissedIds, pasteMessages, suggestions]);

  const filterCounts = useMemo(() => {
    const counts: Record<AgentFeedFilter, number> = {
      all: fullFeed.length,
      actions: 0,
      fyi: 0,
      you: 0,
    };
    for (const message of fullFeed) {
      if (message.kind === "paste") {
        counts.you += 1;
      } else if (
        message.suggestion.isActionable !== false &&
        Boolean(message.suggestion.title)
      ) {
        counts.actions += 1;
      } else {
        counts.fyi += 1;
      }
    }
    return counts;
  }, [fullFeed]);

  const feed: AgentMessage[] = useMemo(() => {
    if (feedFilter === "all") return fullFeed;
    return fullFeed.filter((message) => {
      if (feedFilter === "you") return message.kind === "paste";
      if (message.kind !== "email") return false;
      const isActionable =
        message.suggestion.isActionable !== false &&
        Boolean(message.suggestion.title);
      return feedFilter === "actions" ? isActionable : !isActionable;
    });
  }, [feedFilter, fullFeed]);

  // Only actionable suggestions count as "things to act on" — informational
  // FYI cards are part of the feed but they shouldn't inflate the badge.
  const actionableCount = filterCounts.actions;
  const dismissibleCount = suggestions.filter(
    (s) => !dismissedIds.has(s.id),
  ).length;
  const scanLabel = scanProgress
    ? `Scanning ${scanProgress.current}/${scanProgress.total}`
    : `${actionableCount} to act on`;

  return (
    <aside className="flex h-full w-full min-h-0 flex-col overflow-hidden bg-[color:var(--card)]">
      <div className="flex shrink-0 items-center justify-between gap-2 px-3.5 pb-1.5 pt-3 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
        <span>Agent</span>
        <div className="flex items-center gap-1.5">
          <span className="font-[family-name:var(--font-mono)] text-[10px] normal-case tracking-normal text-[color:var(--ink-3)]">
            {scanLabel}
          </span>
          <button
            type="button"
            onClick={() => void markAllEmailsRead()}
            disabled={isDismissingAll || dismissibleCount === 0}
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            title="Mark all emails as read"
          >
            {isDismissingAll ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCheck className="h-3.5 w-3.5" />
            )}
            Mark all
          </button>
          <button
            type="button"
            onClick={() => void scanAll()}
            disabled={isBusy || accounts.length === 0}
            className="inline-flex items-center gap-1 rounded-[var(--r-sm)] px-1.5 py-1 text-[11.5px] font-medium normal-case tracking-normal text-[color:var(--ink-2)] hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
            title={accounts.length ? "Scan Gmail" : "No Gmail account connected"}
          >
            {isBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Scan
          </button>
        </div>
      </div>

      {/* Filter chips — let the user narrow the feed without scrolling. */}
      <nav
        className="mx-3 mb-1 flex shrink-0 gap-1 overflow-x-auto"
        role="tablist"
        aria-label="Filter agent feed"
      >
        {FEED_FILTERS.map((filter) => {
          const active = feedFilter === filter.id;
          const count = filterCounts[filter.id];
          return (
            <button
              key={filter.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setFeedFilter(filter.id)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
                active
                  ? "border-[color:var(--ink)] bg-[color:var(--ink)] text-[color:var(--card)]"
                  : "border-[color:var(--line)] bg-[color:var(--card)] text-[color:var(--ink-2)] hover:border-[color:var(--line-strong)] hover:text-[color:var(--ink)]",
              )}
            >
              <span>{filter.label}</span>
              <span
                className={cn(
                  "font-[family-name:var(--font-mono)] text-[10px]",
                  active
                    ? "text-[color:var(--card)]/70"
                    : "text-[color:var(--ink-3)]",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </nav>

      {banner && (
        <div className="mx-3 mb-1.5 mt-0.5 flex items-start gap-2 rounded-[var(--r-sm)] bg-[color:var(--sunken)] px-2.5 py-1.5 text-[11.5px] text-[color:var(--ink-2)]">
          <span className="flex-1">{banner}</span>
          <button
            type="button"
            onClick={() => setBanner("")}
            className="rounded p-0.5 text-[color:var(--ink-3)] hover:bg-[color:var(--card)] hover:text-[color:var(--ink)]"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {feed.length === 0 ? (
          <div className="mt-6">
            <EmptyState
              text={
                feedFilter !== "all" && fullFeed.length > 0
                  ? `Nothing under "${FEED_FILTERS.find((f) => f.id === feedFilter)?.label}" right now.`
                  : accounts.length
                  ? "Inbox is clear. Scan to fetch new emails, or paste a note below."
                  : "Connect Gmail in settings, or paste notes below to start."
              }
            />
          </div>
        ) : (
          <div className="space-y-2">
            {feed.map((message) =>
              message.kind === "email" ? (
                <EmailMessageCard
                  key={`email:${message.id}`}
                  message={message}
                  todoLists={todoLists}
                  onAdd={() => addEmailSuggestion(message.suggestion)}
                  onDismiss={() => dismissEmailSuggestion(message.suggestion)}
                />
              ) : (
                <PasteMessageCard
                  key={`paste:${message.id}`}
                  message={message}
                  todoLists={todoLists}
                  onAdd={(index) => addPasteItem(message.id, index)}
                  onDismiss={(index) => dismissPasteItem(message.id, index)}
                />
              ),
            )}
          </div>
        )}

        {!accounts.length && (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-2.5 py-2 text-[11px] text-[color:var(--ink-3)]">
            <Inbox className="mt-0.5 h-3 w-3" />
            <span>
              Gmail not connected — open settings to link an account and
              start auto-summarising emails.
            </span>
          </div>
        )}
      </div>

      <Composer onSend={handleComposerSend} isWorking={isParsing} />
    </aside>
  );
}
