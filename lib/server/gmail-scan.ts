import { createHash } from "crypto";
import type { NextRequest } from "next/server";
import type {
  EmailTodoSuggestion,
} from "@/lib/email-suggestions";
import {
  getGmailMessageSummary,
  getGmailProfile,
  listGmailHistoryMessageIds,
  listRecentGmailMessageIds,
  type GmailMessageSummary,
} from "@/lib/server/gmail-client";
import type { StoredGmailAccount } from "@/lib/server/gmail-store";
import { parseEmailSuggestions } from "@/lib/server/email-suggestion-parser";
import {
  getScannedGmailMessageIds,
  listEmailSuggestions,
  markGmailMessageScanned,
  updateGmailAccount,
  upsertEmailSuggestions,
} from "@/lib/server/gmail-store";
import { envFlag, parseEnvNumber } from "@/lib/server/env";

// ── Tunables ─────────────────────────────────────────────────────────────

/** Hard cap on how many messageIds /run will process per call, regardless of
 *  what the client sends. Keeps each request comfortably under a 10s
 *  serverless timeout even on cold Kimi parse calls. */
export function runChunkLimit() {
  return parseEnvNumber(process.env.GMAIL_RUN_CHUNK_MAX, {
    min: 1,
    max: 30,
    fallback: 12,
  });
}

/** How many messages /plan will discover at most. */
export function scanLimit() {
  return parseEnvNumber(process.env.GMAIL_SCAN_MAX_MESSAGES, {
    min: 1,
    max: 100,
    fallback: 50,
  });
}

function kimiBatchMessageLimit() {
  return parseEnvNumber(process.env.GMAIL_KIMI_BATCH_MESSAGES, {
    min: 1,
    max: 12,
    fallback: 5,
  });
}

function kimiBatchCharLimit() {
  return parseEnvNumber(process.env.GMAIL_KIMI_BATCH_MAX_CHARS, {
    min: 4000,
    max: 50000,
    fallback: 18000,
  });
}

function gmailFetchConcurrency() {
  return parseEnvNumber(process.env.GMAIL_FETCH_CONCURRENCY, {
    min: 1,
    max: 10,
    fallback: 5,
  });
}

function gmailDebugEnabled() {
  return envFlag(process.env.GMAIL_SCAN_DEBUG);
}

function debugPreview(value: string, maxLength = 240) {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function logGmailScanDebug(label: string, payload: Record<string, unknown>) {
  if (!gmailDebugEnabled()) return;
  console.info(`[lizhi-routine:gmail-scan] ${label}`, payload);
}

// ── Inbox classification heuristics ─────────────────────────────────────
//
// In #50 most of the local pre-filtering moved to the Kimi parser, since
// every email now gets a summary (informational or actionable). The only
// remaining heuristic is the submission-receipt skip — these emails record
// completed work, so they have no value even as informational cards.

const SUBMISSION_RECEIPT_HINTS = [
  "turnitin digital receipt",
  "you have submitted",
  "has been submitted",
  "successfully submitted",
] as const;

const DEADLINE_REOPENED_HINTS = [
  "new due date",
  "extended due date",
  "extension approved",
] as const;

function subjectHash(subject: string) {
  return createHash("sha256").update(subject).digest("hex");
}

function candidateInputChars(message: GmailMessageSummary) {
  return message.subject.length + message.snippet.length + message.bodyText.length;
}

function searchableMessageText(message: GmailMessageSummary) {
  return `${message.from}\n${message.subject}\n${message.snippet}\n${message.bodyText}`.toLocaleLowerCase();
}

function isCompletedSubmissionReceipt(message: GmailMessageSummary) {
  const text = searchableMessageText(message);
  const looksLikeReceipt = SUBMISSION_RECEIPT_HINTS.some((hint) =>
    text.includes(hint),
  );
  if (!looksLikeReceipt) return false;
  const deadlineReopened = DEADLINE_REOPENED_HINTS.some((hint) =>
    text.includes(hint),
  );
  return !deadlineReopened;
}

/**
 * Fetch all message summaries with bounded concurrency, preserving the
 * order of `messageIds` in the output. Gmail's users.messages.get costs 5
 * quota units / call with a per-user limit of 250/s, so ~5 in flight is a
 * comfortable default well below the threshold.
 */
async function fetchSummariesConcurrent({
  account,
  messageIds,
  concurrency,
}: {
  account: StoredGmailAccount;
  messageIds: string[];
  concurrency: number;
}): Promise<GmailMessageSummary[]> {
  const results = new Array<GmailMessageSummary | null>(messageIds.length).fill(null);
  let cursor = 0;

  async function worker() {
    while (true) {
      const index = cursor++;
      if (index >= messageIds.length) return;
      results[index] = await getGmailMessageSummary(account, messageIds[index]);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, messageIds.length) },
    () => worker(),
  );
  await Promise.all(workers);
  return results.filter((item): item is GmailMessageSummary => item !== null);
}

function chunkCandidates(messages: GmailMessageSummary[]) {
  const maxMessages = kimiBatchMessageLimit();
  const maxChars = kimiBatchCharLimit();
  const batches: GmailMessageSummary[][] = [];
  let current: GmailMessageSummary[] = [];
  let currentChars = 0;

  for (const message of messages) {
    const chars = candidateInputChars(message);
    if (
      current.length > 0 &&
      (current.length >= maxMessages || currentChars + chars > maxChars)
    ) {
      batches.push(current);
      current = [];
      currentChars = 0;
    }
    current.push(message);
    currentChars += chars;
  }

  if (current.length > 0) batches.push(current);
  return batches;
}

// ── Public surface ──────────────────────────────────────────────────────

export type PlanScanResult = {
  /** Message IDs the caller should feed through runGmailScanChunk, in order. */
  pendingMessageIds: string[];
  /** Total Gmail messages observed before deduping against already-scanned. */
  discovered: number;
  /** Already-scanned (skipped) count, just informational. */
  alreadyScanned: number;
  warnings: string[];
};

export async function planGmailScan({
  user,
  account,
  forceBackfill,
}: {
  user: { userId: string };
  account: StoredGmailAccount;
  forceBackfill: boolean;
}): Promise<PlanScanResult> {
  const maxMessages = scanLimit();
  const debug = gmailDebugEnabled();
  const warnings: string[] = [];

  logGmailScanDebug("plan:start", {
    account: account.email,
    maxMessages,
    mode:
      forceBackfill || !account.historyId
        ? "recent-backfill"
        : "incremental-history",
    debugReprocessesScannedMessages: debug,
  });

  let messageIds: string[];
  if (account.historyId && !forceBackfill) {
    const history = await listGmailHistoryMessageIds({
      account,
      startHistoryId: account.historyId,
      maxResults: maxMessages,
    });
    if (history.expired) {
      warnings.push(
        "Gmail sync cursor expired, so Lizhi Routine rescanned recent inbox mail.",
      );
      messageIds = await listRecentGmailMessageIds({ account, maxResults: maxMessages });
    } else {
      messageIds = history.ids;
    }
  } else {
    messageIds = await listRecentGmailMessageIds({ account, maxResults: maxMessages });
  }

  const scannedIds = await getScannedGmailMessageIds(user.userId, account.id);
  const deduped = messageIds.filter(
    (id, index, allIds) => allIds.indexOf(id) === index,
  );
  const pendingMessageIds = deduped
    .filter((id) => debug || !scannedIds.has(id))
    .slice(0, maxMessages);

  logGmailScanDebug("plan:result", {
    discovered: messageIds.length,
    alreadyScanned: deduped.filter((id) => scannedIds.has(id)).length,
    pending: pendingMessageIds.length,
  });

  return {
    pendingMessageIds,
    discovered: messageIds.length,
    alreadyScanned: deduped.filter((id) => scannedIds.has(id)).length,
    warnings,
  };
}

export type RunScanChunkResult = {
  scannedMessages: number;
  parsedMessages: number;
  skippedMessages: number;
  warnings: string[];
};

export async function runGmailScanChunk({
  user,
  account,
  messageIds,
  selectedDate,
  existingLists,
}: {
  user: { userId: string };
  account: StoredGmailAccount;
  messageIds: string[];
  selectedDate: string;
  existingLists: Array<{ id: string; name: string }>;
}): Promise<RunScanChunkResult> {
  const cap = runChunkLimit();
  const idsToFetch = messageIds.slice(0, cap);
  const warnings: string[] = [];
  let scannedMessages = 0;
  let parsedMessages = 0;
  let skippedMessages = 0;

  if (!idsToFetch.length) {
    return { scannedMessages, parsedMessages, skippedMessages, warnings };
  }

  const summaries = await fetchSummariesConcurrent({
    account,
    messageIds: idsToFetch,
    concurrency: gmailFetchConcurrency(),
  });

  const candidates: GmailMessageSummary[] = [];
  for (const summary of summaries) {
    scannedMessages += 1;

    const isInbox = summary.labelIds.includes("INBOX");
    logGmailScanDebug("run:message", {
      id: summary.id,
      threadId: summary.threadId,
      from: summary.from,
      subject: summary.subject,
      receivedAt: summary.receivedAt,
      labels: summary.labelIds,
      snippetChars: summary.snippet.length,
      bodyTextChars: summary.bodyTextChars,
      bodyTextSentChars: summary.bodyText.length,
      bodyTextTruncated: summary.bodyTextTruncated,
      snippetPreview: debugPreview(summary.snippet),
      bodyPreview: debugPreview(summary.bodyText),
      decision: isInbox ? "candidate:send-to-kimi" : "skip:not-inbox",
    });

    // Anything outside the inbox folder (already-archived, sent, spam) is
    // out of scope for the agent feed.
    if (!isInbox) {
      skippedMessages += 1;
      await markGmailMessageScanned(user.userId, {
        accountId: account.id,
        providerMessageId: summary.id,
        providerThreadId: summary.threadId,
        subjectHash: subjectHash(summary.subject),
        receivedAt: summary.receivedAt,
        status: "skipped",
      });
      continue;
    }

    // Submission/Turnitin receipts indicate work that's already DONE, so
    // they have no value in the agent feed even as informational cards.
    // Keep skipping these without a Kimi call.
    if (isCompletedSubmissionReceipt(summary)) {
      skippedMessages += 1;
      logGmailScanDebug("run:skipped", {
        id: summary.id,
        subject: summary.subject,
        reason: "completed-submission-receipt",
      });
      await markGmailMessageScanned(user.userId, {
        accountId: account.id,
        providerMessageId: summary.id,
        providerThreadId: summary.threadId,
        subjectHash: subjectHash(summary.subject),
        receivedAt: summary.receivedAt,
        status: "skipped",
      });
      continue;
    }

    // Note: we used to also pre-skip likely newsletters / marketing via the
    // NOISY_SENDER_PATTERN heuristic. As of #50 we trust Kimi to label them
    // isActionable=false instead, so the user still sees a summary card for
    // every inbox arrival (the "real agent" feel the redesign is aiming
    // for). The pattern + helper are kept around in case we ever need a
    // pre-filter again.

    candidates.push(summary);
  }

  if (candidates.length) {
    const batches = chunkCandidates(candidates);
    logGmailScanDebug("run:kimi-batching", {
      candidateCount: candidates.length,
      batchCount: batches.length,
      batchMessageLimit: kimiBatchMessageLimit(),
      batchCharLimit: kimiBatchCharLimit(),
    });

    const parsedSuggestions: Awaited<
      ReturnType<typeof parseEmailSuggestions>
    >["suggestions"] = [];
    for (const [batchIndex, batch] of batches.entries()) {
      logGmailScanDebug("run:kimi-request", {
        batchIndex: batchIndex + 1,
        batchCount: batches.length,
        candidateCount: batch.length,
        candidateIds: batch.map((candidate) => candidate.id),
        subjects: batch.map((candidate) => candidate.subject),
        approximateInputChars: batch.reduce(
          (total, candidate) => total + candidateInputChars(candidate),
          0,
        ),
      });

      let parsed: Awaited<ReturnType<typeof parseEmailSuggestions>>;
      try {
        parsed = await parseEmailSuggestions({
          messages: batch,
          existingLists,
          selectedDate,
        });
      } catch (error) {
        // Surface the failing batch's full context unconditionally (not
        // gated behind GMAIL_SCAN_DEBUG) so production failures are
        // triagable. The chunk continues to fail upward — the route
        // catches and 502s — but at least we know which subjects + ids
        // were in the doomed batch.
        const message =
          error instanceof Error ? error.message : String(error);
        console.error(
          "[lizhi-routine:gmail-scan] kimi batch failed",
          {
            userId: user.userId,
            accountEmail: account.email,
            accountId: account.id,
            batchIndex: batchIndex + 1,
            batchOf: batches.length,
            batchSize: batch.length,
            candidateIds: batch.map((candidate) => candidate.id),
            subjects: batch.map((candidate) => candidate.subject),
            approximateInputChars: batch.reduce(
              (total, candidate) => total + candidateInputChars(candidate),
              0,
            ),
            error: message,
            stack: error instanceof Error ? error.stack : undefined,
          },
        );
        throw error;
      }
      warnings.push(...parsed.warnings);
      parsedSuggestions.push(...parsed.suggestions);
      logGmailScanDebug("run:kimi-response", {
        batchIndex: batchIndex + 1,
        suggestions: parsed.suggestions.map((suggestion) => ({
          sourceMessageId: suggestion.sourceMessageId,
          title: suggestion.title,
          dueDate: suggestion.dueDate,
          dueTime: suggestion.dueTime,
          confidence: suggestion.confidence,
          reason: suggestion.reason,
        })),
        warnings: parsed.warnings,
      });
    }

    const inserted = await upsertEmailSuggestions(
      user.userId,
      account.id,
      parsedSuggestions,
    );
    parsedMessages = candidates.length;

    const suggestionMessageIds = new Set(
      inserted.map((suggestion) => suggestion.sourceMessageId),
    );
    for (const candidate of candidates) {
      await markGmailMessageScanned(user.userId, {
        accountId: account.id,
        providerMessageId: candidate.id,
        providerThreadId: candidate.threadId,
        subjectHash: subjectHash(candidate.subject),
        receivedAt: candidate.receivedAt,
        status: suggestionMessageIds.has(candidate.id) ? "parsed" : "skipped",
      });
    }
  }

  return { scannedMessages, parsedMessages, skippedMessages, warnings };
}

export type FinalizeScanResult = {
  suggestions: Array<EmailTodoSuggestion & { accountEmail: string }>;
};

export async function finalizeGmailScan({
  user,
  account,
}: {
  user: { userId: string };
  account: StoredGmailAccount;
}): Promise<FinalizeScanResult> {
  const profile = await getGmailProfile(account);
  await updateGmailAccount(user.userId, account.id, {
    historyId: profile.historyId ?? account.historyId,
    lastSyncedAt: new Date().toISOString(),
  });

  const suggestions = (
    await listEmailSuggestions(user.userId, account.id, "pending")
  ).map((suggestion) => ({
    ...suggestion,
    accountEmail: account.email,
  }));

  logGmailScanDebug("finalize:done", {
    account: account.email,
    pendingSuggestions: suggestions.length,
  });

  return { suggestions };
}

// Type re-export so route handlers can reach the underlying NextRequest type
// without importing both gmail-client and next/server in every route file.
export type { NextRequest };
