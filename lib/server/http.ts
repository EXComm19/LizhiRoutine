import type { NextRequest } from "next/server";

/**
 * Rejects cross-origin browser-issued mutations.
 *
 * For non-GET/HEAD requests, the request must include either:
 * - an `Origin` header whose origin equals the request's own origin, or
 * - a `Referer` header on the same origin (legacy clients without Origin).
 *
 * Server-to-server / curl / mobile clients without an Origin OR Referer are
 * rejected so we never trust an "absent" header (browsers always send at
 * least one on cross-origin POST/PATCH/etc). Same-origin fetches from this
 * app always include Origin in modern browsers.
 *
 * Pair this with the existing Supabase auth check — defence in depth.
 */
export function isSameOrigin(request: NextRequest): boolean {
  const method = request.method.toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") {
    return true;
  }

  const own =
    request.headers.get("x-forwarded-host") && request.headers.get("x-forwarded-proto")
      ? `${request.headers.get("x-forwarded-proto")}://${request.headers.get("x-forwarded-host")}`
      : request.nextUrl.origin;

  const origin = request.headers.get("origin");
  if (origin) {
    return origin === own;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin === own;
    } catch {
      return false;
    }
  }

  return false;
}
