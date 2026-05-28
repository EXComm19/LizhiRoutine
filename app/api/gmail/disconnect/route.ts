import { NextRequest, NextResponse } from "next/server";
import { deleteGmailAccount, listGmailAccounts } from "@/lib/server/gmail-store";
import {
  clearGmailAccountCookie,
  getGmailAccountId,
} from "@/lib/server/gmail-session";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: "Cross-origin request blocked." }, { status: 403 });
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    accountId?: unknown;
  } | null;
  let accountId =
    typeof body?.accountId === "string" ? body.accountId : getGmailAccountId(request);

  if (!accountId) {
    const accounts = await listGmailAccounts(user.userId);
    if (accounts.length === 1) {
      accountId = accounts[0].id;
    } else if (accounts.length > 1) {
      return NextResponse.json(
        { error: "Choose which Gmail account to disconnect." },
        { status: 400 },
      );
    }
  }

  if (accountId) {
    await deleteGmailAccount(user.userId, accountId);
  }

  const response = NextResponse.json({ ok: true });
  clearGmailAccountCookie(response);
  return response;
}
