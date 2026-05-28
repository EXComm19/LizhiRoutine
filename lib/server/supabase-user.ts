import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Sentinel userId used when Supabase auth isn't configured (pure-local dev
 * mode). Treated as a real user id everywhere inside the gmail-store so the
 * single-machine workflow keeps working without changes.
 */
export const LOCAL_USER_ID = "__local__";

function isCloudConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export type ServerUser = {
  userId: string;
  /** True when we fell back to LOCAL_USER_ID because Supabase isn't set up. */
  isLocal: boolean;
};

/**
 * Resolve the Supabase user id for the current request.
 *
 * - If Supabase env vars are present, returns the authenticated user's id or
 *   `null` when no session exists. Callers should treat `null` as 401.
 * - If Supabase env vars are missing (pure-local dev), returns the sentinel
 *   LOCAL_USER_ID. Lets the Gmail feature keep working on a developer machine
 *   that hasn't configured auth.
 */
export async function getServerUser(): Promise<ServerUser | null> {
  if (!isCloudConfigured()) {
    return { userId: LOCAL_USER_ID, isLocal: true };
  }

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user?.id) return null;
  return { userId: data.user.id, isLocal: false };
}
