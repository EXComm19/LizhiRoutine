import { NextRequest, NextResponse } from "next/server";
import type { EmailSuggestionStatus } from "@/lib/email-suggestions";
import {
  listGmailAccounts,
  updateEmailSuggestionStatus,
} from "@/lib/server/gmail-store";
import { getGmailAccountId } from "@/lib/server/gmail-session";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

function isSuggestionStatus(value: unknown): value is EmailSuggestionStatus {
  return value === "pending" || value === "added" || value === "dismissed";
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    accountId?: unknown;
    status?: unknown;
    createdTodoId?: unknown;
  } | null;
  if (!isSuggestionStatus(body?.status)) {
    return NextResponse.json({ error: "Invalid suggestion status." }, { status: 400 });
  }

  let accountId =
    typeof body?.accountId === "string" ? body.accountId : getGmailAccountId(request);
  if (!accountId) {
    const accounts = await listGmailAccounts(user.userId);
    if (accounts.length === 1) accountId = accounts[0].id;
  }
  if (!accountId) {
    return NextResponse.json({ error: "Gmail is not connected." }, { status: 401 });
  }

  const { id } = await context.params;
  const suggestion = await updateEmailSuggestionStatus({
    userId: user.userId,
    accountId,
    suggestionId: id,
    status: body.status,
    createdTodoId:
      typeof body.createdTodoId === "string" ? body.createdTodoId : null,
  });

  if (!suggestion) {
    return NextResponse.json({ error: "Suggestion not found." }, { status: 404 });
  }

  return NextResponse.json({ suggestion });
}
