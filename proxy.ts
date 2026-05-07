import type { NextRequest } from "next/server";
import { createClient } from "@/utils/supabase/middleware";

export async function proxy(request: NextRequest) {
  const { supabase, supabaseResponse } = createClient(request);

  // Calling `getUser()` triggers Supabase's cookie callbacks so the auth
  // session refreshes if needed. Without this call the helper's cookie
  // hooks never fire and the JWT can quietly expire.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Skip Next.js internals and static assets so middleware only runs on
     * page + API routes.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
