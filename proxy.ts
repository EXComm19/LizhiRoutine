import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

function hasSupabaseAuthCookie(request: NextRequest) {
  return request.cookies
    .getAll()
    .some(
      (cookie) =>
        cookie.name.startsWith("sb-") && cookie.name.includes("-auth-token"),
    );
}

export async function proxy(request: NextRequest) {
  if (!hasSupabaseAuthCookie(request)) {
    return NextResponse.next();
  }

  const { supabase, supabaseResponse } = createClient(request);

  // Calling `getUser()` triggers Supabase's cookie callbacks so the auth
  // session refreshes if needed. Without this call the helper's cookie
  // hooks never fire and the JWT can quietly expire.
  const { error } = await supabase.auth.getUser();
  if (error) {
    console.warn("[lizhi-routine] Supabase session refresh skipped", {
      status: error.status,
      code: error.code,
    });
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip Next.js internals, API routes, and static assets.
     *
     * API routes that need auth (Gmail, parse-todos, commute-estimate,
     * import-calendar) call `createClient(await cookies())` themselves via
     * `getServerUser()`, so they trigger their own Supabase session
     * refresh through the route-handler cookie callbacks. Running the
     * proxy on every API hit just doubles the auth calls and can hit
     * Supabase Auth rate limits during local development.
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
