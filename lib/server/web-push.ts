import webpush from "web-push";
import { cleanEnvValue } from "@/lib/server/env";
import { createServiceClient } from "@/utils/supabase/service";

/**
 * Server-side Web Push helpers — initialise VAPID once, send to every
 * subscription a user has registered, and prune dead endpoints.
 *
 * VAPID identifies the SENDER (us) to the push gateway. Generated once
 * via `web-push generate-vapid-keys` and pasted into .env.local. The
 * public half is also shipped to the browser so the subscription
 * advertises it as the expected publisher.
 *
 * The VAPID library throws on send if init was never called, so we
 * lazy-init on first use; this keeps test endpoints clean even when
 * the env vars are missing (callers see a clean error instead of a
 * deep stack from the web-push internals).
 */

let initialised = false;
let initialisationError: string | null = null;

function init() {
  if (initialised) return;
  const publicKey = cleanEnvValue(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
  const privateKey = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);
  const subject = cleanEnvValue(process.env.VAPID_SUBJECT);
  if (!publicKey || !privateKey || !subject) {
    initialisationError =
      "Missing VAPID env vars. Generate with `node -e \"console.log(require('web-push').generateVAPIDKeys())\"` and paste into .env.local as NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.";
    return;
  }
  webpush.setVapidDetails(subject, publicKey, privateKey);
  initialised = true;
}

export type PushSubscriptionRow = {
  endpoint: string;
  keys_p256dh: string;
  keys_auth: string;
};

/**
 * Payload Lizhi sends. The service worker on the client receives this
 * as `event.data.json()` and renders the notification accordingly.
 */
export type LizhiPushPayload = {
  title: string;
  body?: string;
  /** Optional URL to open when the user taps the notification. */
  url?: string;
  /** Optional tag — replaces a previous notification with the same tag. */
  tag?: string;
};

/**
 * Send `payload` to every push subscription belonging to `userId`.
 * Prunes any subscription the gateway rejects with 404/410 — those are
 * permanently dead (browser uninstalled, permission revoked, etc.).
 * Returns counts so the caller can log + show a summary.
 */
export async function sendPushToUser(params: {
  userId: string;
  payload: LizhiPushPayload;
}): Promise<{ sent: number; pruned: number; errors: string[] }> {
  init();
  if (initialisationError) {
    return { sent: 0, pruned: 0, errors: [initialisationError] };
  }
  const sb = createServiceClient();
  if (!sb) {
    return {
      sent: 0,
      pruned: 0,
      errors: ["Supabase service role not configured."],
    };
  }
  const { data: subs, error } = await sb
    .from("push_subscriptions")
    .select("endpoint, keys_p256dh, keys_auth")
    .eq("user_id", params.userId)
    .returns<PushSubscriptionRow[]>();
  if (error) {
    return { sent: 0, pruned: 0, errors: [error.message] };
  }
  if (!subs?.length) {
    return { sent: 0, pruned: 0, errors: [] };
  }

  const errors: string[] = [];
  const deadEndpoints: string[] = [];
  let sent = 0;

  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth },
        },
        JSON.stringify(params.payload),
        { TTL: 60 * 60 * 24 }, // 24h — push gateway holds it if device offline
      );
      sent += 1;
    } catch (sendError) {
      // The web-push library throws WebPushError with .statusCode.
      const status = (sendError as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // Permanently dead — endpoint was unsubscribed or expired.
        deadEndpoints.push(sub.endpoint);
      } else {
        const msg =
          sendError instanceof Error ? sendError.message : String(sendError);
        errors.push(`push to ${sub.endpoint.slice(0, 40)}…: ${msg}`);
      }
    }
  }

  if (deadEndpoints.length) {
    await sb
      .from("push_subscriptions")
      .delete()
      .in("endpoint", deadEndpoints);
  }

  // Best-effort last_used_at bump on success — fire-and-forget so we
  // don't block the return on a tiny update.
  if (sent > 0) {
    void sb
      .from("push_subscriptions")
      .update({ last_used_at: new Date().toISOString() })
      .eq("user_id", params.userId);
  }

  return { sent, pruned: deadEndpoints.length, errors };
}
