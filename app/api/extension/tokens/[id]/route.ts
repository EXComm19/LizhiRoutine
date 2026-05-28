import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/utils/supabase/server";
import { isSameOrigin } from "@/lib/server/http";

export const runtime = "nodejs";

/**
 * Revoke a token. Soft-delete: we set revoked_at rather than DELETE so the
 * audit trail (which keys were ever issued, when) is preserved. After this,
 * lookup_api_token returns null for the matching hash, blocking inbound
 * Bearer auth.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json(
      { error: "Token id is required." },
      { status: 400 },
    );
  }

  const supabase = createClient(await cookies());
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData?.user?.id) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  const { error } = await supabase
    .from("user_api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .is("revoked_at", null);
  if (error) {
    return NextResponse.json(
      { error: `Could not revoke token: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
