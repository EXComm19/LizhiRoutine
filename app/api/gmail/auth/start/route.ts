import { randomBytes } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildGmailAuthUrl,
  getGmailAuthConfig,
} from "@/lib/server/gmail-client";
import { setGmailOAuthStateCookie } from "@/lib/server/gmail-session";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

function redirectWithError(request: NextRequest, message: string) {
  const url = new URL("/settings", request.nextUrl.origin);
  url.searchParams.set("gmail_error", message);
  return NextResponse.redirect(url);
}

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return redirectWithError(
      request,
      "Sign in before connecting a Gmail account.",
    );
  }

  try {
    const config = getGmailAuthConfig(request);
    const state = randomBytes(24).toString("base64url");
    const response = NextResponse.redirect(
      buildGmailAuthUrl({ config, state }),
    );
    setGmailOAuthStateCookie(response, state);
    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not start Gmail OAuth.";
    return redirectWithError(request, message);
  }
}
