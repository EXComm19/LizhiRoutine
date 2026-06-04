import { NextRequest, NextResponse } from "next/server";
import type { SleepRecord } from "@/lib/schema";
import { getUserFromExtensionRequest } from "@/lib/server/extension-auth";
import { createServiceClient } from "@/utils/supabase/service";
import { sendPushToUser } from "@/lib/server/web-push";

export const runtime = "nodejs";

/**
 * POST /api/health/sleep
 *
 * Bearer-authenticated ingest endpoint for sleep records, designed to be
 * called from iOS apps like Health Auto Export. Two body shapes accepted:
 *
 *   1) Health Auto Export's native shape:
 *      {
 *        "data": {
 *          "metrics": [
 *            { "name": "sleep_analysis", "data": [{ sleepStart, sleepEnd,
 *               source, inBedStart?, inBedEnd?, asleep? }, ...] }
 *          ]
 *        }
 *      }
 *
 *   2) Simple shape for custom Shortcuts or manual upload:
 *      {
 *        "records": [
 *          { "started_at": "...ISO...", "ended_at": "...ISO...",
 *            "source": "Apple Watch" }
 *        ]
 *      }
 *
 * Records are deduped by source_uid = `${source}|${started_at}`. Re-import
 * of the same data updates the existing row in place; new records are
 * appended. Returns counts so the caller can decide what to surface.
 *
 * Rejects:
 *  - Missing bearer
 *  - Both shapes empty / malformed
 *  - More than MAX_RECORDS_PER_CALL in one POST (DoS guard)
 */

const MAX_RECORDS_PER_CALL = 500;

type RawRecord = {
  started_at: string;
  ended_at: string;
  source: string;
  /** Optional explicit duration override; otherwise computed from span. */
  duration_minutes?: number;
};

type UserStateRow = {
  sleep_records: SleepRecord[] | null;
};

function nowIso() {
  return new Date().toISOString();
}

function newId() {
  return `sleep-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * Health Auto Export emits dates in several shapes depending on the iOS
 * device locale + chosen date format. We try them in order:
 *
 *   1) Anything Date.parse already understands (ISO, RFC, "YYYY-MM-DD HH:mm:ss +HHMM")
 *   2) HAE's zh-CN locale shape with the timezone duplicated:
 *      "2026-05-22 +1000 上午1:20:09 +1000"
 *   3) English locale "AM/PM" variant:
 *      "2026-05-22 1:20:09 AM +1000"
 *
 * Returns a strict ISO 8601 string (UTC) on success, null on failure.
 */
function toIso(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;

  // Fast path: stuff Date.parse already handles.
  const direct = Date.parse(value);
  if (Number.isFinite(direct)) return new Date(direct).toISOString();

  // zh-CN: date + (optional tz) + 上午/下午 H:MM:SS + (optional tz)
  // Example: "2026-05-22 +1000 上午1:20:09 +1000"
  const zh = /^(\d{4}-\d{2}-\d{2})(?:\s+([+-]\d{4}))?\s+(上午|下午)\s*(\d{1,2}):(\d{2}):(\d{2})(?:\s+([+-]\d{4}))?$/.exec(
    value,
  );
  if (zh) {
    const [, date, tz1, ampm, hhRaw, mm, ss, tz2] = zh;
    let hour = parseInt(hhRaw, 10);
    if (ampm === "下午" && hour < 12) hour += 12;
    if (ampm === "上午" && hour === 12) hour = 0;
    const hh = hour.toString().padStart(2, "0");
    const tz = tz2 ?? tz1 ?? "+0000";
    const tzIso = `${tz.slice(0, 3)}:${tz.slice(3)}`;
    const iso = `${date}T${hh}:${mm}:${ss}${tzIso}`;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }

  // en-US: date + H:MM:SS + AM/PM + (optional tz)
  // Example: "2026-05-22 1:20:09 AM +1000"
  const en = /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}):(\d{2}):(\d{2})\s*(AM|PM)\s*(?:([+-]\d{4}))?$/i.exec(
    value,
  );
  if (en) {
    const [, date, hhRaw, mm, ss, ampm, tz] = en;
    let hour = parseInt(hhRaw, 10);
    if (ampm.toUpperCase() === "PM" && hour < 12) hour += 12;
    if (ampm.toUpperCase() === "AM" && hour === 12) hour = 0;
    const hh = hour.toString().padStart(2, "0");
    const tzPart = tz ? `${tz.slice(0, 3)}:${tz.slice(3)}` : "+00:00";
    const iso = `${date}T${hh}:${mm}:${ss}${tzPart}`;
    const ms = Date.parse(iso);
    if (Number.isFinite(ms)) return new Date(ms).toISOString();
  }

  return null;
}

/**
 * Maximum gap between two HAE phase rows that still counts as part of the
 * same sleep session. 60 minutes is generous enough to span "got up to
 * use the bathroom, didn't fall asleep for 30 min" while small enough
 * that a nap in the afternoon doesn't merge with last night's session.
 */
const SESSION_MERGE_GAP_MS = 60 * 60_000;

function clampDurationFromSpan(startedAt: string, endedAt: string): number {
  const span = Date.parse(endedAt) - Date.parse(startedAt);
  if (!Number.isFinite(span) || span <= 0) return 0;
  return Math.round(span / 60_000);
}

/**
 * Normalize either body shape into our internal RawRecord array.
 * Returns the records and an array of human-readable warnings.
 */
function extractRecords(
  body: unknown,
): { records: RawRecord[]; warnings: string[] } {
  const warnings: string[] = [];
  const out: RawRecord[] = [];
  if (!body || typeof body !== "object") return { records: out, warnings };

  // Shape 1: Health Auto Export.
  //
  // HAE emits one row per sleep PHASE — "在床上 / Core / REM / Deep /
  // Awake" — not one row per night. Multiple trackers (Apple Watch +
  // Pillow, for instance) often run in parallel and emit overlapping
  // rows, so we can't simply filter to InBed: many trackers (incl. Apple
  // Watch) never emit InBed at all.
  //
  // Strategy: parse every row into a (start, end, source) tuple, sort by
  // start, then greedy-merge adjacent rows whose gap is <60 min into
  // sessions. Each merged session becomes one record. A long InBed row
  // is just another tuple in this scheme — it naturally absorbs the
  // phase rows that fall inside it.
  //
  // This dedupes trackers automatically: Pillow and Apple Watch tracking
  // the same night produce interleaved tuples, which merge into one
  // session.
  type RawTuple = { start: number; end: number; source: string };
  const tuples: RawTuple[] = [];

  const data = (body as { data?: unknown }).data;
  if (data && typeof data === "object") {
    const metrics = (data as { metrics?: unknown }).metrics;
    if (Array.isArray(metrics)) {
      for (const metric of metrics) {
        if (!metric || typeof metric !== "object") continue;
        const m = metric as Record<string, unknown>;
        if (m.name !== "sleep_analysis") continue;
        if (!Array.isArray(m.data)) continue;

        const rows = m.data as Array<Record<string, unknown>>;
        for (const entry of rows) {
          const e = entry;
          // Awake is part of a sleep session but not "asleep" — keep it
          // for session-boundary detection because it sits *inside* the
          // session window for InBed-style trackers. Excluding would
          // create spurious gaps.
          const startedAt =
            toIso(e.start) ??
            toIso(e.startDate) ??
            toIso(e.sleepStart) ??
            toIso(e.inBedStart) ??
            toIso(e.date);
          const endedAt =
            toIso(e.end) ??
            toIso(e.endDate) ??
            toIso(e.sleepEnd) ??
            toIso(e.inBedEnd);
          if (!startedAt || !endedAt) {
            warnings.push(
              `Skipped a "${typeof e.value === "string" ? e.value : "?"}" entry missing start/end time.`,
            );
            continue;
          }
          const startMs = Date.parse(startedAt);
          const endMs = Date.parse(endedAt);
          if (
            !Number.isFinite(startMs) ||
            !Number.isFinite(endMs) ||
            endMs <= startMs
          ) {
            continue;
          }
          tuples.push({
            start: startMs,
            end: endMs,
            source:
              typeof e.source === "string" && e.source
                ? e.source
                : "Apple Health",
          });
        }
      }
    }
  }

  // Sort by start, then greedy-merge adjacent tuples into sessions.
  tuples.sort((a, b) => a.start - b.start);
  type Session = {
    start: number;
    end: number;
    /** Tally of source names within the session — primary wins on count. */
    sourceTally: Map<string, number>;
  };
  const sessions: Session[] = [];

  for (const tuple of tuples) {
    const last = sessions[sessions.length - 1];
    if (last && tuple.start - last.end <= SESSION_MERGE_GAP_MS) {
      last.end = Math.max(last.end, tuple.end);
      last.sourceTally.set(
        tuple.source,
        (last.sourceTally.get(tuple.source) ?? 0) + 1,
      );
    } else {
      sessions.push({
        start: tuple.start,
        end: tuple.end,
        sourceTally: new Map([[tuple.source, 1]]),
      });
    }
  }

  // Push each session as one RawRecord. Source label = the tracker with
  // the most rows in this session, breaking ties alphabetically for
  // determinism. duration_minutes = end-start span (we trust the merged
  // bounds more than any single row's `qty` claim).
  for (const session of sessions) {
    const sortedSources = [...session.sourceTally.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
    const primarySource = sortedSources[0]?.[0] ?? "Apple Health";
    out.push({
      started_at: new Date(session.start).toISOString(),
      ended_at: new Date(session.end).toISOString(),
      source: primarySource,
      duration_minutes: Math.round((session.end - session.start) / 60_000),
    });
  }

  // Shape 2: simple records[]
  const records = (body as { records?: unknown }).records;
  if (Array.isArray(records)) {
    for (const entry of records) {
      if (!entry || typeof entry !== "object") continue;
      const e = entry as Record<string, unknown>;
      const startedAt = toIso(e.started_at) ?? toIso(e.startedAt);
      const endedAt = toIso(e.ended_at) ?? toIso(e.endedAt);
      if (!startedAt || !endedAt) {
        warnings.push("Skipped a record missing started_at/ended_at.");
        continue;
      }
      const declared = e.duration_minutes ?? e.durationMinutes;
      out.push({
        started_at: startedAt,
        ended_at: endedAt,
        source: typeof e.source === "string" && e.source ? e.source : "manual",
        duration_minutes:
          typeof declared === "number" && Number.isFinite(declared)
            ? Math.max(0, Math.round(declared))
            : undefined,
      });
    }
  }

  return { records: out, warnings };
}

function sourceUidFor(record: RawRecord): string {
  return `${record.source}|${record.started_at}`;
}

export async function POST(request: NextRequest) {
  const user = await getUserFromExtensionRequest(request);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Debug: dump every HAE payload to disk so we can inspect the exact
  // shape HAE sent. Different trackers (Apple Watch / Pillow / etc) emit
  // subtly different rows; without the full body we're guessing. Will be
  // removed once the parser is stable.
  try {
    const fs = await import("node:fs/promises");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "tmp");
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `hae-payload-${Date.now()}.json`);
    await fs.writeFile(file, JSON.stringify(body, null, 2), "utf8");
    console.warn(`[lizhi-routine:sleep] HAE payload dumped to ${file}`);
  } catch (error) {
    console.warn("[lizhi-routine:sleep] payload dump failed", error);
  }

  const { records: incoming, warnings } = extractRecords(body);
  if (!incoming.length) {
    return NextResponse.json(
      {
        error:
          "No sleep records found in the payload. Expected Health Auto Export shape or { records: [...] }.",
      },
      { status: 400 },
    );
  }
  if (incoming.length > MAX_RECORDS_PER_CALL) {
    return NextResponse.json(
      {
        error: `Too many records in one call (${incoming.length}). Split into batches of ${MAX_RECORDS_PER_CALL}.`,
      },
      { status: 413 },
    );
  }

  const supabase = createServiceClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY missing." },
      { status: 503 },
    );
  }

  const { data: stateRow, error: loadError } = await supabase
    .from("user_state")
    .select("sleep_records")
    .eq("user_id", user.userId)
    .maybeSingle<UserStateRow>();

  if (loadError) {
    return NextResponse.json(
      { error: `Could not load state: ${loadError.message}` },
      { status: 500 },
    );
  }
  if (!stateRow) {
    // First-time user who hasn't opened the app yet. We could create a row
    // but the rest of the app expects defaults to be seeded client-side;
    // refusing here is the smaller risk.
    return NextResponse.json(
      { error: "User state not found. Open the app once to initialize." },
      { status: 404 },
    );
  }

  const existing = Array.isArray(stateRow.sleep_records)
    ? stateRow.sleep_records
    : [];

  // Same-night dedup by TIME-WINDOW OVERLAP, latest-arrival wins.
  //
  // A single night gets tracked by multiple sources (Pillow + Apple
  // Watch) and re-pushed by HAE several times an hour. Keying on
  // source|start created a separate record per source and per slightly-
  // shifted start, so the same night piled up. Instead: an incoming
  // session REPLACES every existing record whose [start, end] window it
  // overlaps. Because this POST is the most recent data we've seen, the
  // incoming record always wins — exactly "the latest update is the
  // winner". Non-overlapping sessions (an afternoon nap vs night sleep)
  // coexist untouched.
  const now = nowIso();
  const overlaps = (
    aStart: number,
    aEnd: number,
    bStart: number,
    bEnd: number,
  ) => Math.max(aStart, bStart) < Math.min(aEnd, bEnd);

  // Working set starts as the existing records; we mutate it per incoming.
  let working: SleepRecord[] = [...existing];
  let inserted = 0;
  let replaced = 0;

  for (const incomingRow of incoming) {
    const startMs = Date.parse(incomingRow.started_at);
    const endMs = Date.parse(incomingRow.ended_at);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }
    const duration =
      incomingRow.duration_minutes ??
      clampDurationFromSpan(incomingRow.started_at, incomingRow.ended_at);

    // Find every existing record this incoming session overlaps.
    const overlapped: SleepRecord[] = [];
    const kept: SleepRecord[] = [];
    for (const record of working) {
      const rs = Date.parse(record.started_at);
      const re = Date.parse(record.ended_at);
      if (
        Number.isFinite(rs) &&
        Number.isFinite(re) &&
        overlaps(startMs, endMs, rs, re)
      ) {
        overlapped.push(record);
      } else {
        kept.push(record);
      }
    }

    // Preserve identity from the earliest-created overlapped record so the
    // night keeps a stable id + "first seen" timestamp across re-syncs.
    const anchor = overlapped
      .slice()
      .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];

    const winner: SleepRecord = {
      id: anchor?.id ?? newId(),
      schema_version: 1,
      started_at: incomingRow.started_at,
      ended_at: incomingRow.ended_at,
      duration_minutes: duration,
      source: incomingRow.source,
      source_uid: sourceUidFor(incomingRow),
      created_at: anchor?.created_at ?? now,
      updated_at: now,
    };

    working = [...kept, winner];
    if (overlapped.length > 0) replaced += 1;
    else inserted += 1;
  }

  // Sort descending by start time so the most recent night is first when
  // the client renders. Cheap; keeps the array tidy.
  const merged = working.sort((a, b) =>
    a.started_at < b.started_at ? 1 : a.started_at > b.started_at ? -1 : 0,
  );

  const { error: writeError } = await supabase
    .from("user_state")
    .update({
      sleep_records: merged,
      updated_at: now,
    })
    .eq("user_id", user.userId);

  if (writeError) {
    return NextResponse.json(
      { error: `Could not save: ${writeError.message}` },
      { status: 500 },
    );
  }

  // Sleep deficit alert: fire-and-forget so HAE doesn't block on it.
  // The push is opportunistic — if the user isn't subscribed or the
  // numbers don't meet the threshold, we silently do nothing.
  void checkSleepDeficitAndPush({
    userId: user.userId,
    records: merged,
  }).catch((error) => {
    console.warn("[lizhi-routine:sleep] deficit push failed", error);
  });

  return NextResponse.json({
    inserted,
    replaced,
    total: merged.length,
    warnings,
  });
}

/**
 * After every HAE sync, check whether the user has been under their
 * sleep target enough to warrant a "you're undersleeping" push. Two
 * triggers:
 *   - Single-night gap ≥ 90 min vs target
 *   - 3-night moving average ≥ 60 min vs target
 *
 * The tag is keyed on date + reason so the iPhone collapses repeats
 * (HAE syncs hourly; we don't want 5 deficit pushes per evening).
 */
async function checkSleepDeficitAndPush(params: {
  userId: string;
  records: SleepRecord[];
}): Promise<void> {
  const supabase = createServiceClient();
  if (!supabase) return;
  const { data: stateRow } = await supabase
    .from("user_state")
    .select("preferences")
    .eq("user_id", params.userId)
    .maybeSingle<{ preferences: { sleep_target_minutes?: number } }>();
  const target = stateRow?.preferences?.sleep_target_minutes ?? 8 * 60;

  // Aggregate per-night totals attributed to wake date (matches
  // buildSleepStats convention in helpers.ts).
  const byNight = new Map<string, number>();
  for (const record of params.records) {
    const endMs = Date.parse(record.ended_at);
    if (!Number.isFinite(endMs)) continue;
    const wake = new Date(endMs);
    const key =
      wake.getFullYear() +
      "-" +
      String(wake.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(wake.getDate()).padStart(2, "0");
    byNight.set(key, (byNight.get(key) ?? 0) + record.duration_minutes);
  }

  // Most recent 3 wake-dates, newest first.
  const recent = [...byNight.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .slice(0, 3);
  if (!recent.length) return;

  const [lastNight, ...prior] = recent;
  const SINGLE_GAP = 90; // minutes
  const AVG_GAP = 60;

  let reason: { kind: "single" | "average"; gap: number } | null = null;
  if (target - lastNight[1] >= SINGLE_GAP) {
    reason = { kind: "single", gap: target - lastNight[1] };
  } else if (recent.length >= 3) {
    const avg =
      recent.reduce((sum, [, mins]) => sum + mins, 0) / recent.length;
    if (target - avg >= AVG_GAP) {
      reason = { kind: "average", gap: target - avg };
    }
  }
  if (!reason) return;

  const formatHrs = (m: number) => {
    const h = Math.floor(m / 60);
    const mm = Math.round(m % 60);
    return `${h}h ${mm.toString().padStart(2, "0")}m`;
  };
  const body =
    reason.kind === "single"
      ? `Last night ${formatHrs(lastNight[1])} — ${formatHrs(reason.gap)} under target.`
      : `Last 3 nights averaged ${formatHrs(
          recent.reduce((sum, [, mins]) => sum + mins, 0) / recent.length,
        )} — ${formatHrs(reason.gap)} under target.`;

  await sendPushToUser({
    userId: params.userId,
    payload: {
      title: "Sleep is slipping",
      body,
      url: "/",
      // 1 push per (wake-date + kind) so hourly HAE re-imports don't spam.
      tag: `sleep-deficit:${lastNight[0]}:${reason.kind}` + (prior.length ? "" : ""),
    },
  });
}
