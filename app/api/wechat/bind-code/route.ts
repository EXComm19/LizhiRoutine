import { NextResponse, type NextRequest } from "next/server";
import { isSameOrigin } from "@/lib/server/http";
import { getServerUser } from "@/lib/server/supabase-user";
import {
  createWechatBindCode,
  listWechatLinksForUser,
  unlinkWechatOpenidForUser,
} from "@/lib/server/wechat-store";

export const runtime = "nodejs";

/**
 * Session-authenticated companion to the WeChat webhook.
 *
 * GET  — Returns the current binding status: list of openids linked to
 *        this user. Used by the Settings panel to show "已绑定 1 个微信"
 *        or similar.
 *
 * POST — Generate a fresh 6-digit code. The user shows it on screen,
 *        then sends `bind <code>` to the 公众号. Codes are one-time
 *        and expire after 10 minutes.
 *
 * DELETE — Unbind: removes all openid links for this user. The next
 *        message from that openid will get the "你还没绑定" prompt.
 */

export async function GET() {
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const links = await listWechatLinksForUser(user.userId);
  return NextResponse.json({ links });
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  try {
    const { code, expiresAt } = await createWechatBindCode(user.userId);
    return NextResponse.json({ code, expiresAt });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error.";
    console.error("[wechat-bind-code] generation failed", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!isSameOrigin(request)) {
    return NextResponse.json(
      { error: "Cross-origin request blocked." },
      { status: 403 },
    );
  }
  const user = await getServerUser();
  if (!user) {
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }
  const removed = await unlinkWechatOpenidForUser(user.userId);
  return NextResponse.json({ removed });
}
