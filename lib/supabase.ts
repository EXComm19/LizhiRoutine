import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/client";

let cachedClient: SupabaseClient | null = null;

/**
 * Returns a singleton browser-side Supabase client, or null if env vars are
 * missing. Treat null as "cloud sync disabled" — the app keeps working in
 * pure-localStorage mode while Supabase isn't configured.
 *
 * The actual factory lives in `utils/supabase/client.ts` (using the SSR
 * package's `createBrowserClient`) so browser, server, and middleware code
 * paths share one configuration.
 */
export function getSupabase(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!isCloudConfigured()) return null;

  if (!cachedClient) {
    cachedClient = createClient();
  }
  return cachedClient;
}

export function isCloudConfigured(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
