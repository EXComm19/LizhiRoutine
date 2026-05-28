import { NextResponse, type NextRequest } from "next/server";
import { runGmailScanChunk } from "@/lib/server/gmail-scan";
import { resolveScanContext } from "@/lib/server/gmail-scan-route";

export const runtime = "nodejs";

type RunRequest = {
  accountId?: unknown;
  messageIds?: unknown;
  selectedDate?: unknown;
  existingLists?: unknown;
} | null;

const EXISTING_LISTS_LIMIT = 80;

function isDateKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function normalizeMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

function normalizeLists(value: unknown): {
  lists: Array<{ id: string; name: string }>;
  truncatedBy: number;
} {
  if (!Array.isArray(value)) return { lists: [], truncatedBy: 0 };
  const cleaned = value
    .map((item) => {
      const row = item as Record<string, unknown>;
      const id = typeof row.id === "string" ? row.id : "";
      const name = typeof row.name === "string" ? row.name.trim() : "";
      if (!id || !name) return null;
      return { id, name: name.slice(0, 48) };
    })
    .filter((item): item is { id: string; name: string } => Boolean(item));

  if (cleaned.length <= EXISTING_LISTS_LIMIT) {
    return { lists: cleaned, truncatedBy: 0 };
  }
  return {
    lists: cleaned.slice(0, EXISTING_LISTS_LIMIT),
    truncatedBy: cleaned.length - EXISTING_LISTS_LIMIT,
  };
}

export async function POST(request: NextRequest) {
  const resolved = await resolveScanContext<RunRequest>(request);
  if (!resolved.ok) return resolved.response;
  const { user, account, body } = resolved;

  const messageIds = normalizeMessageIds(body?.messageIds);
  if (!messageIds.length) {
    return NextResponse.json(
      { error: "messageIds is required." },
      { status: 400 },
    );
  }

  const selectedDate = isDateKey(body?.selectedDate)
    ? body.selectedDate
    : new Date().toISOString().slice(0, 10);
  const { lists: existingLists, truncatedBy } = normalizeLists(
    body?.existingLists,
  );

  try {
    const result = await runGmailScanChunk({
      user,
      account,
      messageIds,
      selectedDate,
      existingLists,
    });
    const warnings = result.warnings.slice();
    if (truncatedBy > 0) {
      warnings.push(
        `Only the first ${EXISTING_LISTS_LIMIT} sublists were sent to the parser; ${truncatedBy} were not considered for list matching.`,
      );
    }
    return NextResponse.json({
      scannedMessages: result.scannedMessages,
      parsedMessages: result.parsedMessages,
      skippedMessages: result.skippedMessages,
      warnings,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not scan Gmail chunk.";
    // Log the full context so server-side debugging works without forcing
    // the user to enable GMAIL_SCAN_DEBUG. Failure mode usually is "Kimi
    // 502" or "Kimi returned empty content" — knowing which messageIds
    // were in the failing chunk + which account makes triage trivial.
    console.error("[lizhi-routine:gmail-scan] run chunk failed", {
      userId: user.userId,
      accountEmail: account.email,
      accountId: account.id,
      messageCount: messageIds.length,
      messageIds,
      error: message,
      stack: error instanceof Error ? error.stack : undefined,
    });
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
