import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EmailSuggestionStatus,
  EmailTodoSuggestion,
} from "@/lib/email-suggestions";
import type { Category } from "@/lib/schema";
import { LOCAL_USER_ID } from "@/lib/server/supabase-user";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";

const STORE_VERSION = 2;
const GMAIL_STORE_PATH =
  process.env.GMAIL_STORE_PATH ?? path.join(process.cwd(), ".gmail-store.json");

/**
 * Returns a request-scoped Supabase client when cloud sync is configured.
 * RLS enforces per-user access on every query, so a missing/forged userId
 * still can't reach another user's rows even if app code has a bug.
 */
async function cloudClient(): Promise<SupabaseClient | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }
  return createSupabaseServerClient(await cookies());
}

function isoFromMillis(ms: number) {
  return new Date(ms).toISOString();
}

function millisFromIso(value: string | null | undefined) {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type GmailAccountRow = {
  id: string;
  user_id: string;
  provider: string;
  email: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  history_id: string | null;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
};

type ScannedMessageRow = {
  id: string;
  account_id: string;
  user_id: string;
  provider_message_id: string;
  provider_thread_id: string | null;
  subject_hash: string | null;
  received_at: string | null;
  scanned_at: string;
  status: "parsed" | "skipped" | "failed";
};

type SuggestionRow = {
  id: string;
  account_id: string;
  user_id: string;
  provider: string;
  fingerprint: string;
  source_message_id: string;
  source_thread_id: string | null;
  source_subject: string;
  source_from: string;
  source_received_at: string | null;
  source_snippet: string;
  title: string;
  list_name: string;
  category: Category;
  due_date: string | null;
  due_time: string | null;
  tags: string[];
  // 0006 migration: classifier output. Old rows from before the migration
  // default to "task" via the column default; reads still tolerate null.
  kind: "task" | "event" | null;
  duration_minutes: number | null;
  // 0007 migration: parser set this when it guessed a duration. Default
  // false at the DB level; null-tolerant in case of stale rows.
  duration_uncertain: boolean | null;
  confidence: number;
  reason: string;
  // 0008 migration: short AI-written gist + actionable flag. Empty
  // string + true are the per-row defaults so pre-migration rows keep
  // their existing "actionable suggestion" behaviour.
  summary: string | null;
  is_actionable: boolean | null;
  status: EmailSuggestionStatus;
  created_todo_id: string | null;
  created_at: string;
  updated_at: string;
};

function accountFromRow(row: GmailAccountRow): StoredGmailAccount {
  return revealedAccount({
    id: row.id,
    userId: row.user_id,
    provider: "gmail",
    email: row.email,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    expiresAt: millisFromIso(row.expires_at),
    historyId: row.history_id,
    lastSyncedAt: row.last_synced_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function accountToRow(account: StoredGmailAccount): GmailAccountRow {
  const stored = storedAccount(account);
  return {
    id: stored.id,
    user_id: stored.userId,
    provider: stored.provider,
    email: stored.email,
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expires_at: isoFromMillis(stored.expiresAt),
    history_id: stored.historyId,
    last_synced_at: stored.lastSyncedAt,
    created_at: stored.createdAt,
    updated_at: stored.updatedAt,
  };
}

function scannedFromRow(row: ScannedMessageRow): ScannedGmailMessage {
  return {
    id: row.id,
    accountId: row.account_id,
    providerMessageId: row.provider_message_id,
    providerThreadId: row.provider_thread_id,
    subjectHash: row.subject_hash ?? "",
    receivedAt: row.received_at,
    scannedAt: row.scanned_at,
    status: row.status,
  };
}

function suggestionFromRow(row: SuggestionRow): EmailTodoSuggestion {
  // Old rows have null kind (pre-0006 migration). Default to "task" — the
  // safer choice that keeps existing accept-flows working unchanged.
  const kind: "task" | "event" =
    row.kind === "event" && row.due_date && row.due_time ? "event" : "task";
  // Pre-0008 rows have null summary / is_actionable. Treat them as
  // actionable (matches the historical behaviour) with no summary text.
  const isActionable = row.is_actionable !== false;
  return {
    id: row.id,
    accountId: row.account_id,
    provider: "gmail",
    fingerprint: row.fingerprint,
    sourceMessageId: row.source_message_id,
    sourceThreadId: row.source_thread_id,
    sourceSubject: row.source_subject,
    sourceFrom: row.source_from,
    sourceReceivedAt: row.source_received_at,
    sourceSnippet: row.source_snippet,
    title: row.title,
    listName: row.list_name,
    category: row.category,
    dueDate: row.due_date,
    dueTime: row.due_time,
    tags: row.tags,
    kind,
    durationMinutes:
      kind === "event"
        ? (row.duration_minutes && row.duration_minutes > 0
            ? row.duration_minutes
            : 60)
        : null,
    durationUncertain: kind === "event" ? row.duration_uncertain === true : false,
    confidence: row.confidence,
    reason: row.reason,
    summary: row.summary ?? "",
    isActionable,
    status: row.status,
    createdTodoId: row.created_todo_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type StoredGmailAccount = {
  id: string;
  /**
   * Supabase user id that owns this account. Set to LOCAL_USER_ID when the
   * deployment isn't using Supabase auth. Every store helper filters by this
   * field so one user can never read another's tokens or suggestions.
   */
  userId: string;
  provider: "gmail";
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  historyId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ScannedGmailMessage = {
  id: string;
  accountId: string;
  providerMessageId: string;
  providerThreadId: string | null;
  subjectHash: string;
  receivedAt: string | null;
  scannedAt: string;
  status: "parsed" | "skipped" | "failed";
};

type GmailStoreDoc = {
  schema_version: number;
  accounts: StoredGmailAccount[];
  scannedMessages: ScannedGmailMessage[];
  suggestions: EmailTodoSuggestion[];
};

function nowIso() {
  return new Date().toISOString();
}

function emptyStore(): GmailStoreDoc {
  return {
    schema_version: STORE_VERSION,
    accounts: [],
    scannedMessages: [],
    suggestions: [],
  };
}

function encryptionSecret() {
  const value = process.env.GMAIL_TOKEN_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY is not configured. Generate a 32+ char random string and set it in .env.local (or the deployment environment) before connecting Gmail.",
    );
  }
  if (value.length < 16) {
    throw new Error(
      "GMAIL_TOKEN_ENCRYPTION_KEY is too short. Use at least 16 characters (32+ recommended).",
    );
  }
  return value;
}

function encryptionKey() {
  return createHash("sha256").update(encryptionSecret()).digest();
}

function protectSecret(value: string) {
  if (!value) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${encrypted.toString("base64url")}`;
}

function revealSecret(value: string) {
  if (!value.startsWith("v1:")) return value;
  const [, ivRaw, tagRaw, encryptedRaw] = value.split(":");
  if (!ivRaw || !tagRaw || !encryptedRaw) return value;

  const decipher = createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(ivRaw, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedRaw, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

function storedAccount(account: StoredGmailAccount): StoredGmailAccount {
  return {
    ...account,
    accessToken: protectSecret(account.accessToken),
    refreshToken: protectSecret(account.refreshToken),
  };
}

function revealedAccount(account: StoredGmailAccount): StoredGmailAccount {
  return {
    ...account,
    accessToken: revealSecret(account.accessToken),
    refreshToken: revealSecret(account.refreshToken),
  };
}

async function readStoreRaw(): Promise<GmailStoreDoc> {
  try {
    const raw = await readFile(GMAIL_STORE_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<GmailStoreDoc>;
    const accounts: StoredGmailAccount[] = Array.isArray(parsed.accounts)
      ? parsed.accounts.map((account) => ({
          ...account,
          // Pre-v2 accounts have no userId. Assign them to LOCAL_USER_ID so
          // single-user dev installs keep working; in a Supabase-backed
          // deployment these rows simply won't be visible to any real user
          // and can be cleaned up via a one-off reconnect.
          userId: account.userId ?? LOCAL_USER_ID,
        }))
      : [];
    return {
      schema_version: STORE_VERSION,
      accounts,
      scannedMessages: Array.isArray(parsed.scannedMessages)
        ? parsed.scannedMessages
        : [],
      suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return emptyStore();
    throw error;
  }
}

async function writeStoreRaw(store: GmailStoreDoc) {
  await mkdir(path.dirname(GMAIL_STORE_PATH), { recursive: true });
  await writeFile(
    GMAIL_STORE_PATH,
    `${JSON.stringify(store, null, 2)}\n`,
    "utf8",
  );
}

export function makeStoreId(prefix: string) {
  return `${prefix}-${randomBytes(16).toString("hex")}`;
}

export function makeFingerprint(parts: Array<string | null | undefined>) {
  return createHash("sha256")
    .update(
      parts
        .map((part) => (part ?? "").trim().toLocaleLowerCase())
        .join("\u001f"),
    )
    .digest("hex");
}

export async function saveGmailAccount(account: StoredGmailAccount) {
  const next = { ...account, updatedAt: nowIso() };

  const sb = await cloudClient();
  if (sb) {
    const { error } = await sb
      .from("gmail_accounts")
      .upsert(accountToRow(next), { onConflict: "id" });
    if (error) throw new Error(`gmail_accounts upsert failed: ${error.message}`);
    return next;
  }

  const store = await readStoreRaw();
  const stored = storedAccount(next);
  const existingIndex = store.accounts.findIndex(
    (item) => item.id === account.id && item.userId === account.userId,
  );
  if (existingIndex >= 0) {
    store.accounts[existingIndex] = stored;
  } else {
    store.accounts.push(stored);
  }
  await writeStoreRaw(store);
  return next;
}

export async function getGmailAccount(userId: string, accountId: string) {
  const sb = await cloudClient();
  if (sb) {
    const { data, error } = await sb
      .from("gmail_accounts")
      .select("*")
      .eq("id", accountId)
      .maybeSingle<GmailAccountRow>();
    if (error) throw new Error(`gmail_accounts lookup failed: ${error.message}`);
    if (!data || data.user_id !== userId) return null;
    return accountFromRow(data);
  }

  const store = await readStoreRaw();
  const account = store.accounts.find(
    (item) => item.id === accountId && item.userId === userId,
  );
  return account ? revealedAccount(account) : null;
}

export async function listGmailAccounts(userId: string) {
  const sb = await cloudClient();
  if (sb) {
    const { data, error } = await sb
      .from("gmail_accounts")
      .select("*")
      .order("email", { ascending: true })
      .returns<GmailAccountRow[]>();
    if (error) throw new Error(`gmail_accounts list failed: ${error.message}`);
    // RLS already filters to the current user, but the userId arg lets us
    // double-check against a forged session and keeps the local-mode path
    // behaviour identical.
    return (data ?? [])
      .filter((row) => row.user_id === userId)
      .map(accountFromRow);
  }

  const store = await readStoreRaw();
  return store.accounts
    .filter((account) => account.userId === userId)
    .map(revealedAccount)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function findGmailAccountByEmail(userId: string, email: string) {
  const normalized = email.trim().toLocaleLowerCase();
  if (!normalized) return null;

  const sb = await cloudClient();
  if (sb) {
    const { data, error } = await sb
      .from("gmail_accounts")
      .select("*")
      .eq("user_id", userId)
      .ilike("email", normalized)
      .maybeSingle<GmailAccountRow>();
    if (error) throw new Error(`gmail_accounts find-by-email failed: ${error.message}`);
    return data ? accountFromRow(data) : null;
  }

  const store = await readStoreRaw();
  const account = store.accounts.find(
    (item) =>
      item.userId === userId &&
      item.email.trim().toLocaleLowerCase() === normalized,
  );
  return account ? revealedAccount(account) : null;
}

export async function updateGmailAccount(
  userId: string,
  accountId: string,
  patch: Partial<StoredGmailAccount>,
) {
  const account = await getGmailAccount(userId, accountId);
  if (!account) return null;
  // Never let a patch reassign ownership; userId is fixed at create time.
  const { userId: _ignoredUserId, ...safePatch } = patch;
  void _ignoredUserId;
  const next = {
    ...account,
    ...safePatch,
    id: account.id,
    userId: account.userId,
    updatedAt: nowIso(),
  };
  await saveGmailAccount(next);
  return next;
}

export async function deleteGmailAccount(userId: string, accountId: string) {
  const sb = await cloudClient();
  if (sb) {
    // RLS scopes delete to the current user automatically; the .eq is belt-
    // and-braces in case RLS is ever loosened. ON DELETE CASCADE on the
    // child tables cleans up scanned_messages + suggestions.
    const { data, error } = await sb
      .from("gmail_accounts")
      .delete()
      .eq("id", accountId)
      .eq("user_id", userId)
      .select("id");
    if (error) throw new Error(`gmail_accounts delete failed: ${error.message}`);
    return Boolean(data?.length);
  }

  const store = await readStoreRaw();
  const ownedAccountIds = new Set(
    store.accounts
      .filter(
        (account) => account.userId === userId && account.id === accountId,
      )
      .map((account) => account.id),
  );
  if (!ownedAccountIds.size) return false;

  store.accounts = store.accounts.filter(
    (account) => !ownedAccountIds.has(account.id),
  );
  store.scannedMessages = store.scannedMessages.filter(
    (message) => !ownedAccountIds.has(message.accountId),
  );
  store.suggestions = store.suggestions.filter(
    (suggestion) => !ownedAccountIds.has(suggestion.accountId),
  );
  await writeStoreRaw(store);
  return true;
}

function accountBelongsToUser(
  store: GmailStoreDoc,
  userId: string,
  accountId: string,
) {
  return store.accounts.some(
    (account) => account.id === accountId && account.userId === userId,
  );
}

export async function markGmailMessageScanned(
  userId: string,
  message: Omit<ScannedGmailMessage, "id" | "scannedAt">,
) {
  const sb = await cloudClient();
  if (sb) {
    const scannedAt = nowIso();
    const { error } = await sb.from("gmail_scanned_messages").upsert(
      {
        id: makeStoreId("gmail-message"),
        account_id: message.accountId,
        user_id: userId,
        provider_message_id: message.providerMessageId,
        provider_thread_id: message.providerThreadId,
        subject_hash: message.subjectHash,
        received_at: message.receivedAt,
        scanned_at: scannedAt,
        status: message.status,
      },
      { onConflict: "account_id,provider_message_id" },
    );
    if (error) throw new Error(`gmail_scanned_messages upsert failed: ${error.message}`);
    return true;
  }

  const store = await readStoreRaw();
  if (!accountBelongsToUser(store, userId, message.accountId)) {
    return false;
  }
  const existingIndex = store.scannedMessages.findIndex(
    (item) =>
      item.accountId === message.accountId &&
      item.providerMessageId === message.providerMessageId,
  );
  const next: ScannedGmailMessage = {
    ...message,
    id:
      existingIndex >= 0
        ? store.scannedMessages[existingIndex].id
        : makeStoreId("gmail-message"),
    scannedAt: nowIso(),
  };
  if (existingIndex >= 0) {
    store.scannedMessages[existingIndex] = next;
  } else {
    store.scannedMessages.push(next);
  }
  await writeStoreRaw(store);
  return true;
}

export async function getScannedGmailMessageIds(
  userId: string,
  accountId: string,
) {
  const sb = await cloudClient();
  if (sb) {
    const { data, error } = await sb
      .from("gmail_scanned_messages")
      .select("provider_message_id")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .returns<Array<Pick<ScannedMessageRow, "provider_message_id">>>();
    if (error) throw new Error(`gmail_scanned_messages list failed: ${error.message}`);
    return new Set((data ?? []).map((row) => row.provider_message_id));
  }

  const store = await readStoreRaw();
  if (!accountBelongsToUser(store, userId, accountId)) {
    return new Set<string>();
  }
  return new Set(
    store.scannedMessages
      .filter((message) => message.accountId === accountId)
      .map((message) => message.providerMessageId),
  );
}

export async function upsertEmailSuggestions(
  userId: string,
  accountId: string,
  suggestions: Array<Omit<EmailTodoSuggestion, "id" | "accountId" | "status" | "createdTodoId" | "createdAt" | "updatedAt">>,
) {
  const sb = await cloudClient();
  if (sb) {
    if (!suggestions.length) return [];
    const now = nowIso();
    const rows = suggestions.map((suggestion) => ({
      id: makeStoreId("email-suggestion"),
      account_id: accountId,
      user_id: userId,
      provider: suggestion.provider,
      fingerprint: suggestion.fingerprint,
      source_message_id: suggestion.sourceMessageId,
      source_thread_id: suggestion.sourceThreadId,
      source_subject: suggestion.sourceSubject,
      source_from: suggestion.sourceFrom,
      source_received_at: suggestion.sourceReceivedAt,
      source_snippet: suggestion.sourceSnippet,
      title: suggestion.title,
      list_name: suggestion.listName,
      category: suggestion.category,
      due_date: suggestion.dueDate,
      due_time: suggestion.dueTime,
      tags: suggestion.tags,
      kind: suggestion.kind,
      duration_minutes: suggestion.durationMinutes,
      duration_uncertain: suggestion.durationUncertain,
      confidence: suggestion.confidence,
      reason: suggestion.reason,
      summary: suggestion.summary,
      is_actionable: suggestion.isActionable,
      status: "pending" as const,
      created_todo_id: null,
      created_at: now,
      updated_at: now,
    }));
    // ignoreDuplicates keeps the *existing* row when the (account_id,
    // fingerprint) unique constraint trips. We then read back the rows that
    // match the fingerprints we tried to insert so the caller sees both new
    // and pre-existing suggestions, mirroring the JSON path.
    const { error: upsertError } = await sb
      .from("gmail_suggestions")
      .upsert(rows, { onConflict: "account_id,fingerprint", ignoreDuplicates: true });
    if (upsertError) {
      throw new Error(`gmail_suggestions upsert failed: ${upsertError.message}`);
    }
    const fingerprints = rows.map((row) => row.fingerprint);
    const { data, error } = await sb
      .from("gmail_suggestions")
      .select("*")
      .eq("account_id", accountId)
      .in("fingerprint", fingerprints)
      .returns<SuggestionRow[]>();
    if (error) throw new Error(`gmail_suggestions readback failed: ${error.message}`);
    return (data ?? []).map(suggestionFromRow);
  }

  const store = await readStoreRaw();
  if (!accountBelongsToUser(store, userId, accountId)) {
    return [];
  }
  const now = nowIso();
  const inserted: EmailTodoSuggestion[] = [];

  for (const suggestion of suggestions) {
    const existing = store.suggestions.find(
      (item) => item.accountId === accountId && item.fingerprint === suggestion.fingerprint,
    );
    if (existing) {
      inserted.push(existing);
      continue;
    }

    const next: EmailTodoSuggestion = {
      ...suggestion,
      id: makeStoreId("email-suggestion"),
      accountId,
      status: "pending",
      createdTodoId: null,
      createdAt: now,
      updatedAt: now,
    };
    store.suggestions.push(next);
    inserted.push(next);
  }

  await writeStoreRaw(store);
  return inserted;
}

export async function listEmailSuggestions(
  userId: string,
  accountId: string,
  status: EmailSuggestionStatus | "all" = "pending",
) {
  const sb = await cloudClient();
  if (sb) {
    let query = sb
      .from("gmail_suggestions")
      .select("*")
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.returns<SuggestionRow[]>();
    if (error) throw new Error(`gmail_suggestions list failed: ${error.message}`);
    return (data ?? []).map(suggestionFromRow);
  }

  const store = await readStoreRaw();
  if (!accountBelongsToUser(store, userId, accountId)) return [];
  return store.suggestions
    .filter((suggestion) => suggestion.accountId === accountId)
    .filter((suggestion) => status === "all" || suggestion.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listEmailSuggestionsForUser(
  userId: string,
  status: EmailSuggestionStatus | "all" = "pending",
  options?: { accountId?: string },
) {
  const sb = await cloudClient();
  if (sb) {
    let query = sb
      .from("gmail_suggestions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (options?.accountId) query = query.eq("account_id", options.accountId);
    if (status !== "all") query = query.eq("status", status);
    const { data, error } = await query.returns<SuggestionRow[]>();
    if (error) {
      throw new Error(`gmail_suggestions list-for-user failed: ${error.message}`);
    }
    return (data ?? []).map(suggestionFromRow);
  }

  const store = await readStoreRaw();
  const ownedAccountIds = new Set(
    store.accounts
      .filter((account) => account.userId === userId)
      .filter((account) =>
        options?.accountId ? account.id === options.accountId : true,
      )
      .map((account) => account.id),
  );
  if (!ownedAccountIds.size) return [];
  return store.suggestions
    .filter((suggestion) => ownedAccountIds.has(suggestion.accountId))
    .filter((suggestion) => status === "all" || suggestion.status === status)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function updateEmailSuggestionStatus({
  userId,
  accountId,
  suggestionId,
  status,
  createdTodoId,
}: {
  userId: string;
  accountId: string;
  suggestionId: string;
  status: EmailSuggestionStatus;
  createdTodoId?: string | null;
}) {
  const sb = await cloudClient();
  if (sb) {
    const patch: Partial<SuggestionRow> = {
      status,
      updated_at: nowIso(),
    };
    if (createdTodoId !== undefined) patch.created_todo_id = createdTodoId;
    const { data, error } = await sb
      .from("gmail_suggestions")
      .update(patch)
      .eq("id", suggestionId)
      .eq("account_id", accountId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle<SuggestionRow>();
    if (error) throw new Error(`gmail_suggestions update failed: ${error.message}`);
    return data ? suggestionFromRow(data) : null;
  }

  const store = await readStoreRaw();
  if (!accountBelongsToUser(store, userId, accountId)) return null;
  const suggestion = store.suggestions.find(
    (item) => item.accountId === accountId && item.id === suggestionId,
  );
  if (!suggestion) return null;

  suggestion.status = status;
  suggestion.createdTodoId = createdTodoId ?? suggestion.createdTodoId;
  suggestion.updatedAt = nowIso();
  await writeStoreRaw(store);
  return suggestion;
}

/**
 * Auto-dismiss suggestions whose deadline has passed.
 * Called during GET /api/gmail/suggestions so stale items never surface again.
 * No-ops when the array is empty.
 */
export async function dismissExpiredSuggestions(
  userId: string,
  suggestionIds: string[],
): Promise<void> {
  if (!suggestionIds.length) return;
  const now = nowIso();
  const sb = await cloudClient();
  if (sb) {
    await sb
      .from("gmail_suggestions")
      .update({ status: "dismissed", updated_at: now })
      .in("id", suggestionIds)
      .eq("user_id", userId);
    return;
  }
  const store = await readStoreRaw();
  const idSet = new Set(suggestionIds);
  let dirty = false;
  for (const s of store.suggestions) {
    if (idSet.has(s.id) && s.status === "pending") {
      s.status = "dismissed";
      s.updatedAt = now;
      dirty = true;
    }
  }
  if (dirty) await writeStoreRaw(store);
}

/**
 * Bulk-dismiss every pending suggestion for a user. Powers the agent's
 * "Mark all read" button (#52). Returns the count actually flipped, so the
 * caller can decide what feedback to show.
 */
export async function dismissAllPendingSuggestionsForUser(
  userId: string,
): Promise<number> {
  const now = nowIso();
  const sb = await cloudClient();
  if (sb) {
    const { data, error } = await sb
      .from("gmail_suggestions")
      .update({ status: "dismissed", updated_at: now })
      .eq("user_id", userId)
      .eq("status", "pending")
      .select("id");
    if (error) {
      throw new Error(`gmail_suggestions bulk-dismiss failed: ${error.message}`);
    }
    return data?.length ?? 0;
  }
  const store = await readStoreRaw();
  const ownedAccountIds = new Set(
    store.accounts
      .filter((account) => account.userId === userId)
      .map((account) => account.id),
  );
  if (!ownedAccountIds.size) return 0;
  let flipped = 0;
  for (const s of store.suggestions) {
    if (s.status === "pending" && ownedAccountIds.has(s.accountId)) {
      s.status = "dismissed";
      s.updatedAt = now;
      flipped += 1;
    }
  }
  if (flipped) await writeStoreRaw(store);
  return flipped;
}
