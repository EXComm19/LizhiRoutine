import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { generateApiToken } from "@/lib/server/extension-auth";
import { isSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

type TokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

/**
 * List the caller's API tokens. Plaintext values are NOT returned — they
 * only ever exist briefly in POST's response. Used by the settings UI to
 * show which tokens are active + when they were last used.
 */
export async function GET() {
  const supabase = createClient(await cookies());
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  // RLS filters to the caller's rows automatically; we still set user_id
  // explicitly so an RLS misconfig wouldn't leak someone else's tokens.
  const { data, error } = await supabase
    .from("user_api_tokens")
    .select("id, label, created_at, last_used_at, revoked_at")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: false })
    .returns<TokenRow[]>();
  if (error) {
    return NextResponse.json(
      { error: `Could not list tokens: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ tokens: data ?? [] });
}

/**
 * Create a new token. Returns the plaintext exactly once — the client must
 * copy it immediately. We only persist the hash, so even an admin with raw
 * DB access can't recover an existing user's token.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }

  const supabase = createClient(await cookies());
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  let body: { label?: string } = {};
  try {
    body = (await request.json()) as { label?: string };
  } catch {
    // Empty bodies are fine — label is optional.
  }
  const label =
    typeof body.label === "string" ? body.label.trim().slice(0, 80) : "";

  const { plaintext, hash } = generateApiToken();
  const { data, error } = await supabase
    .from("user_api_tokens")
    .insert({
      user_id: userData.user.id,
      token_hash: hash,
      label,
    })
    .select("id, label, created_at, last_used_at, revoked_at")
    .single<TokenRow>();
  if (error || !data) {
    return NextResponse.json(
      { error: `Could not create token: ${error?.message ?? "unknown"}` },
      { status: 500 },
    );
  }

  // plaintext is the only sensitive thing here, hence the explicit
  // single-shot semantic. Client must capture it now.
  return NextResponse.json({ token: data, plaintext });
}
