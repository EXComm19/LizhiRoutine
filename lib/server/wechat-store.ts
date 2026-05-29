import { randomInt } from "crypto";
import { createServiceClient } from "@/utils/supabase/service";

/**
 * Supabase-backed storage for the WeChat 公众号 integration:
 *  - openid ↔ Lizhi user_id links
 *  - one-time 6-digit bind codes (10-minute TTL)
 *
 * All paths use the service-role client because the bind code is
 * generated under a session-auth API route, but the webhook is called
 * anonymously by Tencent and needs to read/write without RLS.
 */

const BIND_CODE_TTL_MINUTES = 10;

function makeSixDigitCode(): string {
  // randomInt(min, max) — max is exclusive. 6 zero-padded digits, never
  // starts with leading-zero risk because we pad explicitly.
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Generate a one-time bind code for `userId`. Invalidates any
 * outstanding code for the same user first so they only ever have one
 * live code at a time. Returns the new plaintext code; the row TTL is
 * BIND_CODE_TTL_MINUTES from now.
 */
export async function createWechatBindCode(userId: string): Promise<{
  code: string;
  expiresAt: string;
}> {
  const sb = createServiceClient();
  if (!sb) {
    throw new Error("Supabase service role not configured.");
  }
  await sb.from("wechat_bind_codes").delete().eq("user_id", userId);
  const expiresAt = new Date(
    Date.now() + BIND_CODE_TTL_MINUTES * 60_000,
  ).toISOString();

  // Up to 5 retries in case randomInt happens to collide with an
  // expired-but-not-yet-cleaned code. Vanishingly rare on 1M space.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeSixDigitCode();
    const { error } = await sb.from("wechat_bind_codes").insert({
      code,
      user_id: userId,
      expires_at: expiresAt,
    });
    if (!error) return { code, expiresAt };
    // 23505 = unique_violation. Anything else is a hard failure.
    if ((error as { code?: string }).code !== "23505") {
      throw new Error(`wechat bind code insert failed: ${error.message}`);
    }
  }
  throw new Error("Could not allocate a unique WeChat bind code.");
}

/**
 * Consume a bind code: looks it up, validates TTL, deletes the row,
 * and returns the linked user_id. Returns null on miss / expired.
 */
export async function consumeWechatBindCode(
  code: string,
): Promise<string | null> {
  const sb = createServiceClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("wechat_bind_codes")
    .select("user_id, expires_at")
    .eq("code", code)
    .maybeSingle<{ user_id: string; expires_at: string }>();
  if (error || !data) return null;
  if (new Date(data.expires_at).getTime() < Date.now()) {
    await sb.from("wechat_bind_codes").delete().eq("code", code);
    return null;
  }
  await sb.from("wechat_bind_codes").delete().eq("code", code);
  return data.user_id;
}

/**
 * Persist an openid → user mapping. Upserts so re-binding the same
 * openid to a (possibly different) user works without a stale row.
 */
export async function linkWechatOpenid(params: {
  openid: string;
  userId: string;
}): Promise<void> {
  const sb = createServiceClient();
  if (!sb) {
    throw new Error("Supabase service role not configured.");
  }
  const { error } = await sb.from("wechat_links").upsert(
    {
      openid: params.openid,
      user_id: params.userId,
      linked_at: new Date().toISOString(),
    },
    { onConflict: "openid" },
  );
  if (error) {
    throw new Error(`wechat_links upsert failed: ${error.message}`);
  }
}

export async function lookupUserByOpenid(
  openid: string,
): Promise<string | null> {
  const sb = createServiceClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("wechat_links")
    .select("user_id")
    .eq("openid", openid)
    .maybeSingle<{ user_id: string }>();
  if (error) {
    console.warn("[lizhi-routine:wechat] openid lookup failed", error);
    return null;
  }
  return data?.user_id ?? null;
}

export async function unlinkWechatOpenidForUser(
  userId: string,
): Promise<number> {
  const sb = createServiceClient();
  if (!sb) return 0;
  const { data, error } = await sb
    .from("wechat_links")
    .delete()
    .eq("user_id", userId)
    .select("openid");
  if (error) {
    console.warn("[lizhi-routine:wechat] unlink failed", error);
    return 0;
  }
  return data?.length ?? 0;
}

export async function listWechatLinksForUser(
  userId: string,
): Promise<Array<{ openid: string; linkedAt: string }>> {
  const sb = createServiceClient();
  if (!sb) return [];
  const { data, error } = await sb
    .from("wechat_links")
    .select("openid, linked_at")
    .eq("user_id", userId);
  if (error || !data) return [];
  return data.map((row: { openid: string; linked_at: string }) => ({
    openid: row.openid,
    linkedAt: row.linked_at,
  }));
}
