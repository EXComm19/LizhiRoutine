"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ChevronDown,
  Inbox,
  Mail,
  Plus,
  RefreshCcw,
  ShieldCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  EmailTodoSuggestion,
  GmailConnectionStatus,
} from "@/lib/email-suggestions";
import type { ParsedTodoCandidate } from "@/lib/ai-todo-parser";
import type { TodoList } from "@/lib/schema";
import { cn } from "@/lib/utils";

type SuggestionsPayload = {
  suggestions: EmailTodoSuggestion[];
};

function formatSuggestionDue(suggestion: EmailTodoSuggestion) {
  if (!suggestion.dueDate && !suggestion.dueTime) return "No deadline";
  if (!suggestion.dueDate) return suggestion.dueTime ?? "No deadline";

  const date = new Intl.DateTimeFormat("en-AU", {
    month: "short",
    day: "numeric",
  }).format(new Date(`${suggestion.dueDate}T00:00:00`));
  return suggestion.dueTime ? `${date} ${suggestion.dueTime}` : date;
}

function suggestionToParsedTodo(
  suggestion: EmailTodoSuggestion,
): ParsedTodoCandidate {
  return {
    title: suggestion.title,
    listName: suggestion.listName,
    category: suggestion.category,
    dueDate: suggestion.dueDate,
    dueTime: suggestion.dueTime,
    tags: suggestion.tags,
    // Carry the classifier's task/event verdict through so importParsedTodos
    // routes to the right entity.
    kind: suggestion.kind,
    durationMinutes: suggestion.durationMinutes,
    durationUncertain: suggestion.durationUncertain,
  };
}

async function fetchGmailStatus(signal?: AbortSignal) {
  const response = await fetch("/api/gmail/status", { cache: "no-store", signal });
  return (await response.json()) as GmailConnectionStatus;
}

async function fetchSuggestions(signal?: AbortSignal) {
  const response = await fetch("/api/gmail/suggestions", { cache: "no-store", signal });
  const payload = (await response.json()) as SuggestionsPayload;
  return payload.suggestions ?? [];
}

function isAbortError(error: unknown) {
  return (
    error instanceof DOMException && error.name === "AbortError"
  ) || (error as { name?: string } | null)?.name === "AbortError";
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

export function GmailSettingsPanel({
  initialBanner,
}: {
  initialBanner?: { tone: "success" | "error"; text: string } | null;
} = {}) {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [message, setMessage] = useState("");
  const [banner, setBanner] = useState<
    { tone: "success" | "error"; text: string } | null
  >(initialBanner ?? null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    try {
      const next = await fetchGmailStatus(signal);
      if (signal?.aborted) return;
      setStatus(next);
    } catch (error) {
      if (!isAbortError(error)) throw error;
    } finally {
      if (!signal?.aborted) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Mount-fetch: refresh() flips setIsLoading synchronously which the lint
    // rule flags, but this is the canonical hydrate-on-mount pattern. The
    // AbortController cleanup makes it strict-mode safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const disconnect = async (accountId: string, email: string) => {
    setMessage("");
    await fetch("/api/gmail/disconnect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accountId }),
    });
    setMessage(`${email} disconnected.`);
    await refresh();
  };

  const accounts = status?.accounts ?? [];

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Gmail reminders
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-[color:var(--ink-2)]">
            Connect Gmail so Lizhi Routine can scan recent inbox mail and suggest
            todos for you to review.
          </p>
        </div>
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[color:var(--sunken)] text-[color:var(--ink-3)]">
          <Mail className="h-4 w-4" />
        </span>
      </div>

      <div className="mt-4 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] p-3 text-[12px] text-[color:var(--ink-2)]">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
          <span>
            Suggestions are not added automatically. You approve each one in
            Reminders.
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {isLoading ? (
          <span className="text-[12px] text-[color:var(--ink-3)]">
            Checking Gmail...
          </span>
        ) : accounts.length ? (
          <>
            <span className="rounded-full bg-[color:var(--sunken)] px-2.5 py-1 text-[12px] font-medium text-[color:var(--ink-2)]">
              {accounts.length} Gmail account{accounts.length === 1 ? "" : "s"}
            </span>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void refresh()}
            >
              Refresh
            </Button>
            <Button type="button" size="sm" variant="primary" asChild>
              <a href="/api/gmail/auth/start">Connect another</a>
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="primary" asChild>
              <a href="/api/gmail/auth/start">Connect Gmail</a>
            </Button>
            {status?.needsConfiguration && (
              <span className="text-[12px] text-[color:var(--ink-3)]">
                Add Google OAuth env vars first.
              </span>
            )}
          </>
        )}
      </div>
      {accounts.length > 0 && (
        <div className="mt-3 space-y-2">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="flex items-center justify-between gap-2 rounded-[var(--r-sm)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-[color:var(--ink)]">
                  {account.email}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                  {account.lastSyncedAt
                    ? `Last scan ${new Date(account.lastSyncedAt).toLocaleString()}`
                    : "Not scanned yet"}
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => void disconnect(account.id, account.email)}
              >
                Disconnect
              </Button>
            </div>
          ))}
        </div>
      )}
      {banner && (
        <div
          role={banner.tone === "error" ? "alert" : "status"}
          className={cn(
            "mt-3 flex items-start justify-between gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5 text-[12px]",
            banner.tone === "error"
              ? "bg-[oklch(95%_0.04_25)] text-[oklch(40%_0.16_25)] dark:bg-[oklch(28%_0.10_25)] dark:text-[oklch(82%_0.10_25)]"
              : "bg-[oklch(95%_0.06_150)] text-[oklch(40%_0.14_150)] dark:bg-[oklch(28%_0.08_150)] dark:text-[oklch(82%_0.10_150)]",
          )}
        >
          <span className="min-w-0">{banner.text}</span>
          <button
            type="button"
            className="shrink-0 text-[color:var(--ink-3)] transition-colors hover:text-[color:var(--ink)]"
            aria-label="Dismiss"
            onClick={() => setBanner(null)}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
      {(message || status?.error) && (
        <p className="mt-3 text-[12px] text-[color:var(--ink-3)]">
          {message || status?.error}
        </p>
      )}
    </section>
  );
}

export function GmailSuggestionsPanel({
  selectedDate,
  todoLists,
  onImport,
}: {
  selectedDate: string;
  todoLists: TodoList[];
  onImport: (items: ParsedTodoCandidate[]) => void;
}) {
  const [status, setStatus] = useState<GmailConnectionStatus | null>(null);
  const [suggestions, setSuggestions] = useState<EmailTodoSuggestion[]>([]);
  const [message, setMessage] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [busyAccountId, setBusyAccountId] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState<
    { current: number; total: number } | null
  >(null);

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
      setMessage("Could not load Gmail suggestions.");
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    // Mount-fetch: refresh() flips setIsLoading synchronously which the lint
    // rule flags, but this is the canonical hydrate-on-mount pattern. The
    // AbortController cleanup makes it strict-mode safe.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const accounts = status?.accounts ?? [];
  const isBusy = busyAccountId !== null;

  // Inner scan worker — no refresh, no surrounding setMessage. Used both for
  // single-account Scan (which then refreshes) and inside scanAll (which
  // refreshes exactly once at the end).
  //
  // Drives the chunked plan → run → finalize flow:
  //   1. POST /api/gmail/scan/plan      — discover message IDs to process
  //   2. POST /api/gmail/scan/run × N   — process in chunks of `chunkLimit`
  //   3. POST /api/gmail/scan/finalize  — advance Gmail historyId cursor
  //
  // Each chunk stays well under a serverless function timeout. `onProgress`
  // is invoked after every chunk so scanAll can show a running X/Y count.
  const scanAccount = async (
    accountId: string,
    options?: {
      forceBackfill?: boolean;
      onProgress?: (current: number, total: number) => void;
    },
  ): Promise<{ ok: boolean; error?: string }> => {
    const existingLists = todoLists.map((list) => ({
      id: list.id,
      name: list.name,
    }));

    try {
      const planResponse = await fetch("/api/gmail/scan/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountId,
          forceBackfill: options?.forceBackfill === true,
        }),
      });
      const planPayload = (await planResponse.json()) as {
        pendingMessageIds?: string[];
        chunkLimit?: number;
        warnings?: string[];
        error?: string;
      };
      if (!planResponse.ok) {
        return {
          ok: false,
          error: planPayload.error ?? "Could not plan Gmail scan.",
        };
      }
      if (planPayload.warnings?.length) {
        console.info(
          "[lizhi-routine] Gmail scan plan notes",
          planPayload.warnings,
        );
      }

      const pending = planPayload.pendingMessageIds ?? [];
      const chunkLimit = Math.max(1, planPayload.chunkLimit ?? 8);
      const total = pending.length;
      options?.onProgress?.(0, total);

      let processed = 0;
      for (let offset = 0; offset < pending.length; offset += chunkLimit) {
        const chunk = pending.slice(offset, offset + chunkLimit);
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
        const runPayload = (await runResponse.json()) as {
          scannedMessages?: number;
          warnings?: string[];
          error?: string;
        };
        if (!runResponse.ok) {
          return {
            ok: false,
            error: runPayload.error ?? "Could not scan Gmail chunk.",
          };
        }
        if (runPayload.warnings?.length) {
          console.info(
            "[lizhi-routine] Gmail scan chunk notes",
            runPayload.warnings,
          );
        }
        processed += chunk.length;
        options?.onProgress?.(processed, total);
      }

      // Finalize even when nothing was processed — keeps lastSyncedAt fresh
      // and lets the next scan use the incremental history path.
      const finalizeResponse = await fetch("/api/gmail/scan/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId }),
      });
      if (!finalizeResponse.ok) {
        const finalizePayload = (await finalizeResponse
          .json()
          .catch(() => null)) as { error?: string } | null;
        return {
          ok: false,
          error: finalizePayload?.error ?? "Could not finalize Gmail scan.",
        };
      }

      return { ok: true };
    } catch {
      return { ok: false, error: "Could not reach Gmail scanner." };
    }
  };

  const runScan = async (
    accountId: string,
    options?: { forceBackfill?: boolean },
  ) => {
    if (isBusy) return;
    setBusyAccountId(accountId);
    setScanProgress({ current: 0, total: 0 });
    setMessage("");
    try {
      const result = await scanAccount(accountId, {
        ...options,
        onProgress: (current, total) => setScanProgress({ current, total }),
      });
      if (!result.ok) {
        setMessage(result.error ?? "Could not scan Gmail.");
        return;
      }
      await refresh();
      const account = accounts.find((item) => item.id === accountId);
      setMessage(`Scanned ${account?.email ?? "Gmail"}.`);
    } finally {
      setBusyAccountId(null);
      setScanProgress(null);
    }
  };

  const scanAll = async (options?: { forceBackfill?: boolean }) => {
    if (isBusy || !accounts.length) return;
    setMessage("");
    // Sentinel busyAccountId so isBusy is true for the whole loop and the
    // per-account Scan buttons stay disabled until we finish.
    setBusyAccountId("__all__");
    setScanProgress({ current: 0, total: 0 });
    let failures = 0;
    try {
      for (const account of accounts) {
        const result = await scanAccount(account.id, {
          ...options,
          onProgress: (current, total) => setScanProgress({ current, total }),
        });
        if (!result.ok) failures += 1;
      }
      // Single refresh at the end — was previously O(N) refreshes because
      // each runScan() did its own.
      await refresh();
      const nextSuggestions = await fetchSuggestions();
      setSuggestions(nextSuggestions);
      const failureSuffix = failures
        ? ` (${failures} failed)`
        : "";
      setMessage(
        `Scanned ${accounts.length} account${accounts.length === 1 ? "" : "s"}; found ${nextSuggestions.length} pending suggestion${nextSuggestions.length === 1 ? "" : "s"}${failureSuffix}.`,
      );
    } finally {
      setBusyAccountId(null);
      setScanProgress(null);
    }
  };

  const addSuggestion = async (suggestion: EmailTodoSuggestion) => {
    onImport([suggestionToParsedTodo(suggestion)]);
    setSuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id),
    );
    await patchSuggestionStatus(suggestion.id, "added", suggestion.accountId);
  };

  const dismissSuggestion = async (suggestion: EmailTodoSuggestion) => {
    setSuggestions((current) =>
      current.filter((item) => item.id !== suggestion.id),
    );
    await patchSuggestionStatus(suggestion.id, "dismissed", suggestion.accountId);
  };

  return (
    <div className="rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] p-3">
      <button
        type="button"
        className="flex w-full items-center gap-2 text-left font-[family-name:var(--font-ui)] text-[13.5px] font-semibold tracking-[-0.005em] text-[color:var(--ink-2)] transition-colors hover:text-[color:var(--ink)]"
        aria-expanded={!isCollapsed}
        onClick={() => setIsCollapsed((current) => !current)}
      >
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-[8px] bg-[color:var(--sunken)] text-[color:var(--ink-3)]">
          <Inbox className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate">Gmail suggestions</span>
        {suggestions.length > 0 && (
          <span className="rounded-full bg-[color:var(--ink)] px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[10.5px] leading-none !text-[color:var(--card)]">
            {suggestions.length}
          </span>
        )}
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 shrink-0 text-[color:var(--ink-3)] transition-transform",
            isCollapsed && "-rotate-90",
          )}
          aria-hidden="true"
        />
      </button>

      {!isCollapsed && (
        <div className="mt-3 space-y-2">
          {accounts.length ? (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[11.5px] text-[color:var(--ink-3)]">
                  {accounts.length} connected Gmail account
                  {accounts.length === 1 ? "" : "s"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="soft"
                  disabled={isBusy}
                  title="Scan for new mail. Shift-click to re-scan the last 50 inbox messages."
                  onClick={(event) =>
                    void scanAll({ forceBackfill: event.shiftKey })
                  }
                >
                  <RefreshCcw className="h-3.5 w-3.5" />
                  {isBusy
                    ? scanProgress && scanProgress.total > 0
                      ? `${scanProgress.current}/${scanProgress.total}`
                      : "Scanning"
                    : "Scan all"}
                </Button>
              </div>
              {accounts.map((account) => (
                <div
                  key={account.id}
                  className="flex items-center justify-between gap-2 rounded-[8px] bg-[color:var(--sunken)] px-2 py-1.5"
                >
                  <span className="min-w-0 truncate text-[11px] text-[color:var(--ink-3)]">
                    {account.email}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)] disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={isBusy}
                    title="Scan for new mail. Shift-click to re-scan the last 50 inbox messages."
                    onClick={(event) =>
                      void runScan(account.id, { forceBackfill: event.shiftKey })
                    }
                  >
                    {busyAccountId === account.id
                      ? scanProgress && scanProgress.total > 0
                        ? `${scanProgress.current}/${scanProgress.total}`
                        : "Scanning"
                      : "Scan"}
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)] p-3 text-[12px] text-[color:var(--ink-2)]">
              {status?.needsConfiguration
                ? "Google OAuth is not configured yet."
                : "Connect Gmail in Settings to scan inbox reminders."}
            </div>
          )}

          {message && (
            <div className="text-[11.5px] leading-relaxed text-[color:var(--ink-3)]">
              {message}
            </div>
          )}

          <div className="space-y-1.5">
            {suggestions.map((suggestion) => (
              <div
                key={suggestion.id}
                className="rounded-[10px] border border-[color:var(--line-soft)] bg-[color:var(--sunken)] p-2.5"
                title={[
                  suggestion.title,
                  suggestion.accountEmail
                    ? `Account: ${suggestion.accountEmail}`
                    : null,
                  `From: ${suggestion.sourceFrom}`,
                  `Subject: ${suggestion.sourceSubject}`,
                  `Reason: ${suggestion.reason || "No reason provided"}`,
                ]
                  .filter(Boolean)
                  .join("\n")}
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="line-clamp-2 text-[12.5px] font-semibold leading-snug text-[color:var(--ink)]">
                      {suggestion.title}
                    </div>
                    <div className="mt-1 flex min-w-0 flex-wrap items-center gap-1.5 font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
                      <span className="rounded bg-[color:var(--card)] px-1.5 py-0.5">
                        {suggestion.category}
                      </span>
                      <span className="rounded bg-[color:var(--card)] px-1.5 py-0.5">
                        {suggestion.listName}
                      </span>
                      <span className="rounded bg-[color:var(--card)] px-1.5 py-0.5">
                        {formatSuggestionDue(suggestion)}
                      </span>
                      {suggestion.accountEmail && (
                        <span className="max-w-full truncate rounded bg-[color:var(--card)] px-1.5 py-0.5">
                          {suggestion.accountEmail}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md bg-[color:var(--ink)] !text-[color:var(--card)] transition-opacity hover:opacity-80"
                      title="Add todo"
                      aria-label="Add todo"
                      onClick={() => void addSuggestion(suggestion)}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      className="grid h-6 w-6 place-items-center rounded-md text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--hover)] hover:text-[color:var(--ink)]"
                      title="Dismiss"
                      aria-label="Dismiss"
                      onClick={() => void dismissSuggestion(suggestion)}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                {suggestion.reason && (
                  <div className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-snug text-[color:var(--ink-3)]">
                    <Check className="mt-0.5 h-3 w-3 shrink-0" />
                    <span className="line-clamp-2">{suggestion.reason}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
