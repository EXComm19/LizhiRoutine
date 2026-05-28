import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cookies } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient as createSupabaseServerClient } from "@/utils/supabase/server";
import { LOCAL_USER_ID } from "@/lib/server/supabase-user";

type UsageState = {
  month: string;
  requests: number;
  updated_at: string;
};

type MapboxUsageRow = {
  user_id: string;
  month: string;
  requests: number;
  updated_at: string;
};

export class MapboxUsageLimitError extends Error {
  constructor(
    public readonly month: string,
    public readonly used: number,
    public readonly limit: number,
    public readonly requested: number,
  ) {
    super("Mapbox monthly request limit reached");
  }
}

function usagePath() {
  return (
    process.env.MAPBOX_USAGE_FILE?.trim() ||
    path.join(process.cwd(), ".mapbox-usage.json")
  );
}

function monthKey() {
  return new Date().toISOString().slice(0, 7);
}

export function mapboxMonthlyLimit() {
  const parsed = Number(process.env.MAPBOX_MONTHLY_REQUEST_LIMIT);
  if (!Number.isFinite(parsed) || parsed <= 0) return 100000;
  return Math.min(100000, Math.floor(parsed));
}

/**
 * Returns a request-scoped Supabase client when cloud sync is configured.
 * RLS enforces per-user access, so a leaked or forged userId can't read
 * another user's counter.
 */
async function cloudClient(): Promise<SupabaseClient | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }
  return createSupabaseServerClient(await cookies());
}

// ── Local-file fallback (single-user dev mode) ───────────────────────────

async function readFileUsage(): Promise<UsageState> {
  const currentMonth = monthKey();
  try {
    const raw = await readFile(usagePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<UsageState>;
    if (parsed.month === currentMonth && typeof parsed.requests === "number") {
      return {
        month: parsed.month,
        requests: Math.max(0, Math.floor(parsed.requests)),
        updated_at:
          typeof parsed.updated_at === "string"
            ? parsed.updated_at
            : new Date().toISOString(),
      };
    }
  } catch {
    // Missing or malformed files reset to the current month.
  }

  return {
    month: currentMonth,
    requests: 0,
    updated_at: new Date().toISOString(),
  };
}

async function writeFileUsage(state: UsageState) {
  const filePath = usagePath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

// ── Supabase-backed implementation ───────────────────────────────────────

async function readCloudUsage(
  supabase: SupabaseClient,
  userId: string,
): Promise<UsageState> {
  const currentMonth = monthKey();
  const { data, error } = await supabase
    .from("mapbox_usage")
    .select("*")
    .eq("user_id", userId)
    .eq("month", currentMonth)
    .maybeSingle<MapboxUsageRow>();
  if (error) {
    throw new Error(`mapbox_usage lookup failed: ${error.message}`);
  }
  if (!data) {
    return {
      month: currentMonth,
      requests: 0,
      updated_at: new Date().toISOString(),
    };
  }
  return {
    month: data.month,
    requests: Math.max(0, Math.floor(data.requests)),
    updated_at: data.updated_at,
  };
}

async function writeCloudUsage(
  supabase: SupabaseClient,
  userId: string,
  state: UsageState,
) {
  // Postgres upsert is atomic on (user_id, month) so concurrent requests
  // can't lose each other's increments. There's still a small read→write
  // race between readCloudUsage() and this upsert: two simultaneous calls
  // might both reserve against the same starting balance. For a personal
  // app this is acceptable; if it ever needs strict guarantees, switch to
  // a `with for update` SQL function.
  const { error } = await supabase.from("mapbox_usage").upsert(
    {
      user_id: userId,
      month: state.month,
      requests: state.requests,
      updated_at: state.updated_at,
    },
    { onConflict: "user_id,month" },
  );
  if (error) {
    throw new Error(`mapbox_usage upsert failed: ${error.message}`);
  }
}

// ── Public surface ───────────────────────────────────────────────────────

/**
 * Reserve `requestCount` Mapbox API calls against the current month's
 * budget. Throws MapboxUsageLimitError if it would exceed the per-user
 * limit. Returns the new running total so callers can echo it back to
 * clients.
 *
 * The caller must pass the Supabase user id whose quota to spend; in
 * local dev mode (Supabase not configured) the userId is ignored and a
 * single file-based counter is used.
 */
export async function reserveMapboxRequests(
  userId: string,
  requestCount: number,
) {
  const requested = Math.max(0, Math.ceil(requestCount));
  const limit = mapboxMonthlyLimit();

  const supabase = await cloudClient();
  if (supabase && userId !== LOCAL_USER_ID) {
    const state = await readCloudUsage(supabase, userId);
    if (state.requests + requested > limit) {
      throw new MapboxUsageLimitError(
        state.month,
        state.requests,
        limit,
        requested,
      );
    }
    const next: UsageState = {
      month: state.month,
      requests: state.requests + requested,
      updated_at: new Date().toISOString(),
    };
    await writeCloudUsage(supabase, userId, next);
    return {
      month: next.month,
      used: next.requests,
      limit,
    };
  }

  const state = await readFileUsage();
  if (state.requests + requested > limit) {
    throw new MapboxUsageLimitError(
      state.month,
      state.requests,
      limit,
      requested,
    );
  }
  const next: UsageState = {
    month: state.month,
    requests: state.requests + requested,
    updated_at: new Date().toISOString(),
  };
  await writeFileUsage(next);
  return {
    month: next.month,
    used: next.requests,
    limit,
  };
}
