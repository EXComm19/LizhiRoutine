import type { NextRequest, NextResponse } from "next/server";

export const GMAIL_ACCOUNT_COOKIE = "lizhi-gmail-account";
export const GMAIL_OAUTH_STATE_COOKIE = "lizhi-gmail-oauth-state";

const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 180;
const STATE_MAX_AGE_SECONDS = 60 * 10;

export function getGmailAccountId(request: NextRequest) {
  return request.cookies.get(GMAIL_ACCOUNT_COOKIE)?.value ?? null;
}

export function setGmailAccountCookie(
  response: NextResponse,
  accountId: string,
) {
  response.cookies.set(GMAIL_ACCOUNT_COOKIE, accountId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearGmailAccountCookie(response: NextResponse) {
  response.cookies.set(GMAIL_ACCOUNT_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function setGmailOAuthStateCookie(
  response: NextResponse,
  state: string,
) {
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_MAX_AGE_SECONDS,
  });
}

export function clearGmailOAuthStateCookie(response: NextResponse) {
  response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
