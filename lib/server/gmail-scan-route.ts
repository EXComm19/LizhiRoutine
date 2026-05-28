import { NextResponse, type NextRequest } from "next/server";
import { getValidGmailAccount } from "@/lib/server/gmail-client";
import { listGmailAccounts } from "@/lib/server/gmail-store";
import { getGmailAccountId } from "@/lib/server/gmail-session";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser, type ServerUser } from "@/lib/server/supabase-user";

/**
 * Shared preamble for every Gmail-scan sub-route. Handles:
 * - Same-origin CSRF check
 * - Supabase session check
 * - Resolving accountId from body / cookie / single-account default
 * - Loading + refreshing the account's access token
 *
 * Returns either a ready-to-use `{ user, account, body }` triple or a
 * NextResponse the caller should return as-is.
 */
type ResolvedGmailAccount = NonNullable<
  Awaited<ReturnType<typeof getValidGmailAccount>>
>;

export async function resolveScanContext<
  TBody extends { accountId?: unknown } | null,
>(
  request: NextRequest,
): Promise<
  | {
      ok: true;
      user: ServerUser;
      account: ResolvedGmailAccount;
      body: TBody;
    }
  | { ok: false; response: NextResponse }
> {
  if (!isSameOrigin(request)) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Cross-origin request blocked." },
        { status: 403 },
      ),
    };
  }

  const user = await getServerUser();
  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    };
  }

  const body = (await request.json().catch(() => null)) as TBody;
  let accountId =
    typeof body?.accountId === "string"
      ? body.accountId
      : getGmailAccountId(request);

  if (!accountId) {
    const accounts = await listGmailAccounts(user.userId);
    if (accounts.length === 1) {
      accountId = accounts[0].id;
    } else if (accounts.length > 1) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Choose which Gmail account to scan." },
          { status: 400 },
        ),
      };
    }
  }

  if (!accountId) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Gmail is not connected." },
        { status: 401 },
      ),
    };
  }

  const account = await getValidGmailAccount(user.userId, accountId, request);
  if (!account) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Gmail account not found." },
        { status: 404 },
      ),
    };
  }

  return { ok: true, user, account, body };
}
