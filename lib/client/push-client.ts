/**
 * Browser-side Web Push helpers. Used only from the Settings panel
 * Enable / Disable buttons; the rest of the app should never need
 * to know about service workers or VAPID.
 *
 * iOS 16.4+ supports Web Push but ONLY for sites the user has added
 * to their Home Screen as a PWA. Safari running in browser mode
 * still doesn't expose Notification.requestPermission. We detect
 * this and surface a hint instead of just silently failing.
 */

const SW_URL = "/sw.js";

export type PushCapability =
  | { kind: "ready" }
  | { kind: "denied" }
  | { kind: "unsupported"; reason: string }
  | { kind: "needs-pwa-install" };

/**
 * Quick browser-side capability check. Doesn't actually request
 * permission — only inspects whether the platform supports push
 * and the current permission state.
 */
export function checkPushCapability(): PushCapability {
  if (typeof window === "undefined") {
    return { kind: "unsupported", reason: "Server-side render." };
  }
  if (!("serviceWorker" in navigator)) {
    return { kind: "unsupported", reason: "No service worker support." };
  }
  if (!("PushManager" in window)) {
    return { kind: "unsupported", reason: "No PushManager." };
  }
  if (!("Notification" in window)) {
    return { kind: "unsupported", reason: "No Notification API." };
  }
  // iOS-specific: standalone-mode check. Outside PWA mode,
  // Notification.permission stays at "default" but requestPermission()
  // silently rejects. We can't detect this perfectly, so we use the
  // PWA-install heuristic for iOS Safari.
  const ua = navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua);
  // navigator.standalone is non-standard but the only reliable iOS
  // standalone-PWA indicator. Older TS doesn't know about it.
  const standalone = (navigator as Navigator & { standalone?: boolean })
    .standalone;
  const inStandalone =
    standalone === true ||
    (window.matchMedia &&
      window.matchMedia("(display-mode: standalone)").matches);
  if (isIOS && !inStandalone) {
    return { kind: "needs-pwa-install" };
  }
  if (Notification.permission === "denied") return { kind: "denied" };
  return { kind: "ready" };
}

/**
 * Register the SW (idempotent) and return its registration. Browsers
 * dedupe by URL so calling this every time the panel mounts is fine.
 */
export async function ensureServiceWorker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  if (existing) return existing;
  return navigator.serviceWorker.register(SW_URL, { scope: "/" });
}

/**
 * VAPID public keys are base64url; PushManager needs them as Uint8Array
 * over a real ArrayBuffer (not SharedArrayBuffer), hence the explicit
 * constructor — newer TS lib types are strict about it.
 */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalised);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes as Uint8Array<ArrayBuffer>;
}

/**
 * Full "enable" path:
 *   1. Register SW
 *   2. Request notification permission (must be in user-gesture call stack)
 *   3. Subscribe via PushManager with VAPID public key
 *   4. POST the subscription to our server
 *
 * Throws on any failure; the caller surfaces the error in the UI.
 */
export async function enablePush(vapidPublicKey: string): Promise<void> {
  if (!vapidPublicKey) {
    throw new Error(
      "Missing VAPID public key — set NEXT_PUBLIC_VAPID_PUBLIC_KEY in .env.local.",
    );
  }
  const registration = await ensureServiceWorker();

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications were denied. Re-enable in iOS Settings → Lizhi Routine."
        : "Notification permission not granted.",
    );
  }

  const existing = await registration.pushManager.getSubscription();
  const subscription =
    existing ??
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  const json = subscription.toJSON();
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: json.endpoint,
      keys: json.keys,
      userAgent: navigator.userAgent,
    }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    throw new Error(
      payload?.error ?? `Subscribe POST failed (${response.status}).`,
    );
  }
}

/**
 * Disable push on THIS device: unsubscribe locally + remove the
 * endpoint server-side. Other devices the user enabled stay active.
 */
export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  const subscription = await registration?.pushManager.getSubscription();
  if (subscription) {
    await fetch("/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    }).catch(() => {
      /* swallow — local unsubscribe still happens */
    });
    await subscription.unsubscribe();
  }
}

/**
 * Is this specific device already subscribed? (vs. another device the
 * same user has — we check by querying the local PushManager state.)
 */
export async function isCurrentDeviceSubscribed(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  if (!("serviceWorker" in navigator)) return false;
  const registration = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!registration) return false;
  const subscription = await registration.pushManager.getSubscription();
  return Boolean(subscription);
}
