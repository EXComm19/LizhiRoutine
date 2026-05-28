import { NextRequest, NextResponse } from "next/server";
import {
  dismissExpiredSuggestions,
  listEmailSuggestionsForUser,
  listGmailAccounts,
} from "@/lib/server/gmail-store";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ suggestions: [] });
  }

  const accounts = await listGmailAccounts(user.userId);
  if (!accounts.length) {
    return NextResponse.json({ suggestions: [] });
  }

  const status = request.nextUrl.searchParams.get("status");
  const requestedAccountId = request.nextUrl.searchParams.get("accountId");
  const scopedAccountId =
    requestedAccountId && accounts.some((account) => account.id === requestedAccountId)
      ? requestedAccountId
      : undefined;
  const accountEmailById = new Map(
    accounts.map((account) => [account.id, account.email]),
  );
  const requestedStatus =
    status === "all" || status === "added" || status === "dismissed"
      ? status
      : "pending";

  const suggestions = await listEmailSuggestionsForUser(
    user.userId,
    requestedStatus,
    scopedAccountId ? { accountId: scopedAccountId } : undefined,
  );

  // Auto-dismiss pending suggestions whose deadline has already passed so they
  // never resurface. Only applies when the caller is asking for pending items.
  let active = suggestions;
  if (requestedStatus === "pending") {
    const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    const expired = suggestions.filter(
      (s) => s.dueDate && s.dueDate < today,
    );
    if (expired.length) {
      // Fire-and-forget is fine — we've already excluded them from the response.
      void dismissExpiredSuggestions(user.userId, expired.map((s) => s.id));
      active = suggestions.filter((s) => !s.dueDate || s.dueDate >= today);
    }
  }

  return NextResponse.json({
    suggestions: active.map((suggestion) => ({
      ...suggestion,
      accountEmail: accountEmailById.get(suggestion.accountId) ?? null,
    })),
  });
}
