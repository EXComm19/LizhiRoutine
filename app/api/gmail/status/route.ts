import { NextRequest, NextResponse } from "next/server";
import type { GmailConnectionStatus } from "@/lib/email-suggestions";
import { getGmailAuthConfig } from "@/lib/server/gmail-client";
import { listGmailAccounts } from "@/lib/server/gmail-store";
import { getServerUser } from "@/lib/server/supabase-user";

export const runtime = "nodejs";

const SIGNED_OUT_STATUS: GmailConnectionStatus = {
  connected: false,
  email: null,
  lastSyncedAt: null,
  historyId: null,
  accounts: [],
};

export async function GET(request: NextRequest) {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json(SIGNED_OUT_STATUS);
  }

  try {
    getGmailAuthConfig(request);
  } catch (error) {
    return NextResponse.json({
      ...SIGNED_OUT_STATUS,
      needsConfiguration: true,
      error: error instanceof Error ? error.message : "Gmail is not configured.",
    } satisfies GmailConnectionStatus);
  }

  const accounts = await listGmailAccounts(user.userId);
  const summaries = accounts.map((account) => ({
    id: account.id,
    email: account.email,
    lastSyncedAt: account.lastSyncedAt,
    historyId: account.historyId,
  }));
  const primary = summaries[0] ?? null;

  return NextResponse.json({
    connected: summaries.length > 0,
    email: primary?.email ?? null,
    lastSyncedAt: primary?.lastSyncedAt ?? null,
    historyId: primary?.historyId ?? null,
    accounts: summaries,
  } satisfies GmailConnectionStatus);
}
