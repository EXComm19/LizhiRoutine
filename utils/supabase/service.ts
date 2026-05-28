import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — bypasses RLS.
 *
 * Use ONLY in API routes where the caller has already been authenticated by
 * a non-Supabase mechanism (e.g., our Bearer-token check in extension-auth).
 * Never expose this client to user code or read its key on the client.
 *
 * Returns null when SUPABASE_SERVICE_ROLE_KEY isn't set, so callers must
 * handle the missing-config case explicitly.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;
  return createClient(url, serviceKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
