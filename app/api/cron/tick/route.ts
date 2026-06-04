import { NextResponse, type NextRequest } from "next/server";
import { cleanEnvValue } from "@/lib/server/env";
import { runCronTick } from "@/lib/server/cron-tick";

export const runtime = "nodejs";

/**
 * Cron entry point. Two callers:
 *  - The in-process ticker in `instrumentation.ts` (default; auto-runs
 *    every 60s while the dev/prod server is alive).
 *  - Vercel cron / GitHub Action / whatever you point at this URL once
 *    you deploy. The Authorization header must match CRON_SECRET so
 *    nobody else can fire pushes at random.
 *
 * Returns a small JSON summary so monitoring can show "every minute
 * I'm checking and N pushes went out today."
 */
export async function POST(request: NextRequest) {
  const expected = cleanEnvValue(process.env.CRON_SECRET);
  if (!expected) {
    return NextResponse.json(
      { error: "Server misconfiguration: CRON_SECRET missing." },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const ok = header === `Bearer ${expected}`;
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const result = await runCronTick();
  if (result.errors.length > 0) {
    console.warn("[lizhi-routine:cron] tick had errors", result);
  }
  return NextResponse.json(result);
}
