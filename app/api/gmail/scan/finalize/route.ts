import { NextResponse, type NextRequest } from "next/server";
import { finalizeGmailScan } from "@/lib/server/gmail-scan";
import { resolveScanContext } from "@/lib/server/gmail-scan-route";

export const runtime = "nodejs";

type FinalizeRequest = {
  accountId?: unknown;
} | null;

export async function POST(request: NextRequest) {
  const resolved = await resolveScanContext<FinalizeRequest>(request);
  if (!resolved.ok) return resolved.response;
  const { user, account } = resolved;

  try {
    const result = await finalizeGmailScan({ user, account });
    return NextResponse.json({ suggestions: result.suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not finalize Gmail scan.";
    console.error("[lizhi-routine:gmail-scan] finalize failed", {
      userId: user.userId,
      accountEmail: account.email,
      accountId: account.id,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
