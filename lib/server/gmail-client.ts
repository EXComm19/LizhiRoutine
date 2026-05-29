import type { NextRequest } from "next/server";
import {
  getGmailAccount,
  updateGmailAccount,
  type StoredGmailAccount,
} from "@/lib/server/gmail-store";
import { cleanEnvValue, parseEnvNumber } from "@/lib/server/env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API_URL = "https://gmail.googleapis.com/gmail/v1";
const GMAIL_READONLY_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export type GmailAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

export type GmailTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  error?: string;
  error_description?: string;
};

export type GmailProfile = {
  emailAddress?: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId?: string;
};

export type GmailListMessagesResponse = {
  messages?: Array<{ id?: string; threadId?: string }>;
  nextPageToken?: string;
  resultSizeEstimate?: number;
};

export type GmailHistoryResponse = {
  history?: Array<{
    id?: string;
    messagesAdded?: Array<{
      message?: { id?: string; threadId?: string; labelIds?: string[] };
    }>;
  }>;
  historyId?: string;
  nextPageToken?: string;
  error?: { code?: number; message?: string };
};

export type GmailMessageResponse = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: {
    mimeType?: string;
    body?: {
      data?: string;
      size?: number;
    };
    headers?: Array<{ name?: string; value?: string }>;
    parts?: GmailMessageResponse["payload"][];
  };
};

export type GmailMessageSummary = {
  id: string;
  threadId: string | null;
  labelIds: string[];
  subject: string;
  from: string;
  date: string;
  receivedAt: string | null;
  snippet: string;
  bodyText: string;
  bodyTextChars: number;
  bodyTextTruncated: boolean;
};

function requestOrigin(request: NextRequest) {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return request.nextUrl.origin;
}

export function getGmailAuthConfig(request: NextRequest): GmailAuthConfig {
  const clientId = cleanEnvValue(process.env.GOOGLE_CLIENT_ID);
  const clientSecret = cleanEnvValue(process.env.GOOGLE_CLIENT_SECRET);
  const redirectUri =
    cleanEnvValue(process.env.GOOGLE_OAUTH_REDIRECT_URI) ||
    `${requestOrigin(request)}/api/gmail/auth/callback`;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET. Add them to .env.local and restart the server.",
    );
  }

  return { clientId, clientSecret, redirectUri };
}

export function buildGmailAuthUrl({
  config,
  state,
}: {
  config: GmailAuthConfig;
  state: string;
}) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GMAIL_READONLY_SCOPE);
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent select_account");
  url.searchParams.set("include_granted_scopes", "true");
  url.searchParams.set("state", state);
  return url;
}

export async function exchangeGmailCode({
  config,
  code,
}: {
  config: GmailAuthConfig;
  code: string;
}) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | GmailTokenResponse
    | null;
  if (!response.ok || !payload?.access_token) {
    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Google token exchange failed.",
    );
  }

  return payload;
}

export async function refreshGmailAccessToken(
  userId: string,
  account: StoredGmailAccount,
  request: NextRequest,
) {
  const config = getGmailAuthConfig(request);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: account.refreshToken,
      grant_type: "refresh_token",
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | GmailTokenResponse
    | null;
  if (!response.ok || !payload?.access_token) {
    const error = new Error(
      payload?.error_description ||
        payload?.error ||
        "Google token refresh failed.",
    );
    // Tag refresh-token failures so callers can surface a "reconnect"
    // UX instead of a generic 500. Google returns invalid_grant when:
    //   - the user revoked access at myaccount.google.com/permissions
    //   - the token was unused for 6 months
    //   - the OAuth app is in "testing" status and a 7-day grace expired
    //   - >50 refresh tokens issued for this user-app pair (oldest evicted)
    //   - the user changed their Google password
    const code = payload?.error ?? "";
    const description = payload?.error_description ?? "";
    if (
      code === "invalid_grant" ||
      /expired|revoked/i.test(description)
    ) {
      (error as Error & { gmailReauthRequired?: boolean }).gmailReauthRequired =
        true;
    }
    throw error;
  }

  const updated = await updateGmailAccount(userId, account.id, {
    accessToken: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });

  return updated ?? { ...account, accessToken: payload.access_token };
}

export async function getValidGmailAccount(
  userId: string,
  accountId: string,
  request: NextRequest,
) {
  const account = await getGmailAccount(userId, accountId);
  if (!account) return null;

  if (account.expiresAt > Date.now() + 60_000) {
    return account;
  }

  return refreshGmailAccessToken(userId, account, request);
}

export class GmailHttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "GmailHttpError";
  }
}

async function gmailFetch<T>(
  account: StoredGmailAccount,
  path: string,
  options?: {
    init?: RequestInit;
    searchParams?: Record<string, string>;
  },
): Promise<T> {
  const url = new URL(`${GMAIL_API_URL}${path}`);
  for (const [key, value] of Object.entries(options?.searchParams ?? {})) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url, {
    ...options?.init,
    headers: {
      ...(options?.init?.headers ?? {}),
      Authorization: `Bearer ${account.accessToken}`,
    },
  });

  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { message?: string } })
    | null;
  if (!response.ok) {
    const message =
      payload?.error?.message ?? `Gmail API request failed (${response.status}).`;
    throw new GmailHttpError(message, response.status);
  }
  // Successful Gmail endpoints always return JSON; null only happens on a
  // parse error, which we treat as a corrupt response.
  if (payload === null) {
    throw new GmailHttpError(
      "Gmail API returned an unparseable response.",
      response.status,
    );
  }
  return payload;
}

export async function getGmailProfile(account: StoredGmailAccount) {
  return gmailFetch<GmailProfile>(account, "/users/me/profile");
}

export async function listRecentGmailMessageIds({
  account,
  maxResults,
}: {
  account: StoredGmailAccount;
  maxResults: number;
}) {
  const payload = await gmailFetch<GmailListMessagesResponse>(
    account,
    "/users/me/messages",
    {
      searchParams: {
        q: "in:inbox newer_than:30d -in:spam -in:trash",
        maxResults: String(Math.max(1, Math.min(100, maxResults))),
      },
    },
  );

  return (payload.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));
}

export async function listGmailHistoryMessageIds({
  account,
  startHistoryId,
  maxResults,
}: {
  account: StoredGmailAccount;
  startHistoryId: string;
  maxResults: number;
}) {
  const ids = new Set<string>();
  let nextPageToken: string | undefined;

  do {
    const searchParams: Record<string, string> = {
      startHistoryId,
      historyTypes: "messageAdded",
      maxResults: "100",
    };
    if (nextPageToken) searchParams.pageToken = nextPageToken;

    let payload: GmailHistoryResponse;
    try {
      payload = await gmailFetch<GmailHistoryResponse>(
        account,
        "/users/me/history",
        { searchParams },
      );
    } catch (error) {
      // 404 = startHistoryId older than Gmail's history cursor TTL (~7d).
      // Caller backfills via listRecentGmailMessageIds.
      if (error instanceof GmailHttpError && error.status === 404) {
        return { expired: true, ids: [] as string[] };
      }
      throw error;
    }

    for (const history of payload.history ?? []) {
      for (const added of history.messagesAdded ?? []) {
        const messageId = added.message?.id;
        if (!messageId) continue;
        ids.add(messageId);
        if (ids.size >= maxResults) {
          return { expired: false, ids: [...ids] };
        }
      }
    }

    nextPageToken = payload.nextPageToken;
  } while (nextPageToken && ids.size < maxResults);

  return { expired: false, ids: [...ids] };
}

function headerValue(message: GmailMessageResponse, name: string) {
  const header = message.payload?.headers?.find(
    (item) => item.name?.toLocaleLowerCase() === name.toLocaleLowerCase(),
  );
  return header?.value ?? "";
}

function messageTextLimit() {
  return parseEnvNumber(process.env.GMAIL_MESSAGE_TEXT_MAX_CHARS, {
    min: 1000,
    max: 20000,
    fallback: 6000,
  });
}

function decodeBase64Url(value: string) {
  // Node ≥16 handles the URL-safe alphabet + missing padding natively.
  return Buffer.from(value, "base64url").toString("utf8");
}

function stripHtml(value: string) {
  return value
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/g, "'");
}

function normalizeBodyText(value: string) {
  return value
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function collectPayloadText(
  payload: GmailMessageResponse["payload"] | undefined,
  collector: { plain: string[]; html: string[] },
) {
  if (!payload) return;

  const data = payload.body?.data;
  if (data) {
    try {
      const decoded = decodeBase64Url(data);
      if (payload.mimeType === "text/plain") {
        collector.plain.push(decoded);
      } else if (payload.mimeType === "text/html") {
        collector.html.push(stripHtml(decoded));
      }
    } catch {
      // Ignore malformed payload fragments; Gmail snippets still give us a
      // small fallback and scan logging will show bodyTextChars as 0.
    }
  }

  for (const part of payload.parts ?? []) {
    collectPayloadText(part, collector);
  }
}

function extractBodyText(message: GmailMessageResponse) {
  const collector = { plain: [] as string[], html: [] as string[] };
  collectPayloadText(message.payload, collector);
  const text = normalizeBodyText(
    collector.plain.length ? collector.plain.join("\n\n") : collector.html.join("\n\n"),
  );
  const limit = messageTextLimit();
  return {
    bodyText: text.slice(0, limit),
    bodyTextChars: text.length,
    bodyTextTruncated: text.length > limit,
  };
}

export async function getGmailMessageSummary(
  account: StoredGmailAccount,
  messageId: string,
) {
  const payload = await gmailFetch<GmailMessageResponse>(
    account,
    `/users/me/messages/${encodeURIComponent(messageId)}`,
    { searchParams: { format: "full" } },
  );
  if (!payload.id) {
    throw new GmailHttpError(
      "Gmail message response missing an id.",
      502,
    );
  }

  const receivedAt =
    payload.internalDate && /^\d+$/.test(payload.internalDate)
      ? new Date(Number(payload.internalDate)).toISOString()
      : null;
  const body = extractBodyText(payload);

  return {
    id: payload.id,
    threadId: payload.threadId ?? null,
    labelIds: payload.labelIds ?? [],
    subject: headerValue(payload, "Subject") || "(no subject)",
    from: headerValue(payload, "From") || "(unknown sender)",
    date: headerValue(payload, "Date"),
    receivedAt,
    snippet: payload.snippet ?? "",
    ...body,
  } satisfies GmailMessageSummary;
}
