import { NextRequest, NextResponse } from "next/server";
import {
  exchangeGmailCode,
  getGmailAuthConfig,
  getGmailProfile,
} from "@/lib/server/gmail-client";
import {
  findGmailAccountByEmail,
  makeStoreId,
  saveGmailAccount,
  type StoredGmailAccount,
} from "@/lib/server/gmail-store";
import {
  GMAIL_OAUTH_STATE_COOKIE,
  clearGmailOAuthStateCookie,
  setGmailAccountCookie,
} from "@/lib/server/gmail-session";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

function redirectToSettings(request: NextRequest, params?: Record<string, string>) {
  const url = new URL("/settings", request.nextUrl.origin);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.redirect(
      redirectToSettings(request, {
        gmail_error: "Sign in before connecting a Gmail account.",
      }),
    );
  }

  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const expectedState = request.cookies.get(GMAIL_OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    const response = NextResponse.redirect(
      redirectToSettings(request, {
        gmail_error: "Gmail connection was cancelled or failed state validation.",
      }),
    );
    clearGmailOAuthStateCookie(response);
    return response;
  }

  try {
    const config = getGmailAuthConfig(request);
    const tokens = await exchangeGmailCode({ config, code });
    const expiresAt = Date.now() + (tokens.expires_in ?? 3600) * 1000;
    const temporaryAccountId = makeStoreId("gmail-account");
    const profile = await getGmailProfile({
      id: temporaryAccountId,
      userId: user.userId,
      provider: "gmail",
      email: "",
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token ?? "",
      expiresAt,
      historyId: null,
      lastSyncedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (!tokens.refresh_token) {
      throw new Error(
        "Google did not return a refresh token. Revoke the app in Google Account permissions, then connect again.",
      );
    }

    const now = new Date().toISOString();
    const email = profile.emailAddress ?? "Gmail";
    const existingAccount = await findGmailAccountByEmail(user.userId, email);
    const accountId = existingAccount?.id ?? temporaryAccountId;
    const account: StoredGmailAccount = {
      id: accountId,
      userId: user.userId,
      provider: "gmail",
      email,
      accessToken: tokens.access_token!,
      refreshToken: tokens.refresh_token,
      expiresAt,
      // Keep this null on first connect so the first scan backfills recent
      // inbox mail before switching to Gmail history-based incremental sync.
      historyId: existingAccount?.historyId ?? null,
      lastSyncedAt: existingAccount?.lastSyncedAt ?? null,
      createdAt: existingAccount?.createdAt ?? now,
      updatedAt: now,
    };

    await saveGmailAccount(account);

    const response = NextResponse.redirect(
      redirectToSettings(request, { gmail_connected: "1" }),
    );
    setGmailAccountCookie(response, account.id);
    clearGmailOAuthStateCookie(response);
    return response;
  } catch (error) {
    const response = NextResponse.redirect(
      redirectToSettings(request, {
        gmail_error:
          error instanceof Error ? error.message : "Could not connect Gmail.",
      }),
    );
    clearGmailOAuthStateCookie(response);
    return response;
  }
}
