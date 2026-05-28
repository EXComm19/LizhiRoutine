import { createHash, randomBytes } from "crypto";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";

/**
 * Plain-text prefix for tokens we hand out. Helps eyeballing leaked secrets
 * in logs / repos / GitHub scanning. Format: `lzr_<43 base64url chars>`,
 * giving 256 bits of entropy on the random payload.
 */
const TOKEN_PREFIX = "lzr_";

export type ExtensionTokenUser = {
  userId: string;
};

/** sha256(plaintext) → hex digest, matches what we store in the DB. */
export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/**
 * Generate a fresh API token. Caller persists the hash; the plaintext is
 * shown to the user once and then discarded.
 */
export function generateApiToken(): { plaintext: string; hash: string } {
  const plaintext = `${TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  return { plaintext, hash: hashApiToken(plaintext) };
}

function extractBearer(request: NextRequest | Request): string | null {
  const header =
    request.headers.get("authorization") ??
    request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;
  return token;
}

/**
 * Authenticate an inbound extension/CLI request via Bearer token.
 *
 * Returns the matching user_id when the token hash exists, is not revoked,
 * and Supabase is configured. Returns null in any failure case — callers
 * should treat null as 401.
 *
 * Uses `lookup_api_token(hash)` (SECURITY DEFINER) so the anon client can
 * verify without an auth session. The function also bumps last_used_at as
 * a side effect, giving the user a live "Last used" column in the UI.
 */
export async function getUserFromExtensionRequest(
  request: NextRequest | Request,
): Promise<ExtensionTokenUser | null> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    return null;
  }

  const plaintext = extractBearer(request);
  if (!plaintext) {
    // Temporary debug for Health Auto Export header debugging — remove
    // once HAE → /api/health/sleep works end-to-end.
    const rawHeader =
      request.headers.get("authorization") ??
      request.headers.get("Authorization");
    console.warn("[lizhi-routine] extension-auth: bearer extract failed", {
      hasAuthHeader: Boolean(rawHeader),
      headerLength: rawHeader?.length ?? 0,
      headerFirst12: rawHeader?.slice(0, 12) ?? null,
      userAgent: request.headers.get("user-agent")?.slice(0, 60) ?? null,
    });
    return null;
  }
  const hash = hashApiToken(plaintext);

  const supabase = createClient(await cookies());
  const { data, error } = await supabase.rpc("lookup_api_token", { hash });
  if (error) {
    console.warn("[lizhi-routine] extension-auth: lookup failed", error);
    return null;
  }
  if (typeof data !== "string" || !data) return null;
  return { userId: data };
}
