import { NextResponse, type NextRequest } from "next/server";
import { planGmailScan, runChunkLimit } from "@/lib/server/gmail-scan";
import { resolveScanContext } from "@/lib/server/gmail-scan-route";

export const runtime = "nodejs";

type PlanRequest = {
  accountId?: unknown;
  forceBackfill?: unknown;
} | null;

export async function POST(request: NextRequest) {
  const resolved = await resolveScanContext<PlanRequest>(request);
  if (!resolved.ok) return resolved.response;
  const { user, account, body } = resolved;

  try {
    const result = await planGmailScan({
      user,
      account,
      forceBackfill: body?.forceBackfill === true,
    });
    return NextResponse.json({
      accountId: account.id,
      accountEmail: account.email,
      pendingMessageIds: result.pendingMessageIds,
      discovered: result.discovered,
      alreadyScanned: result.alreadyScanned,
      warnings: result.warnings,
      // Echo back the server-side cap so the client can pick its own chunk
      // size without guessing. Client should send at most this many IDs to
      // /run per call.
      chunkLimit: runChunkLimit(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not plan Gmail scan.";
    console.error("[lizhi-routine:gmail-scan] plan failed", {
      userId: user.userId,
      accountEmail: account.email,
      accountId: account.id,
      forceBackfill: body?.forceBackfill === true,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
