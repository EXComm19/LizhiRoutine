/* eslint-disable no-restricted-globals */
//
// Lizhi Routine service worker.
//
// Minimal: handles incoming push events + click events. No offline
// caching (we want the app to always fetch fresh state from Supabase).
//
// Path: /sw.js — served from `public/sw.js` so its scope is the
// entire origin. Registered from the Settings panel ONLY when the
// user explicitly opts in to notifications; we don't register it
// app-wide to avoid surprising users with permission prompts.
//

self.addEventListener("install", (event) => {
  // Take effect immediately; we don't need the old SW to handle
  // pending requests since we don't cache anything.
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  // Become the active SW for all open clients without requiring a
  // reload. Important for the "Enable notifications → immediately
  // get a test push" flow.
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  const data = (() => {
    if (!event.data) return null;
    try {
      return event.data.json();
    } catch {
      // Bare text fallback if the server ever sends raw bytes.
      return { title: "Lizhi", body: event.data.text() };
    }
  })();

  const title = data?.title || "Lizhi";
  const body = data?.body || "";
  const url = data?.url || "/";
  const tag = data?.tag || undefined;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      // CRITICAL for iOS: when a `tag` is reused, a new notification
      // silently UPDATES the existing one and does NOT re-alert (no
      // banner/sound) unless `renotify` is true. Without this, the second
      // "Send test push" (same tag) appears to "not arrive", and repeated
      // reminders that reuse a daily tag don't buzz. `renotify` requires a
      // tag, so only set it when we have one.
      renotify: Boolean(tag),
      badge: "/icon.svg",
      icon: "/icon.svg",
      data: { url },
      // iOS web push respects `silent` only when the page is
      // foregrounded; for backgrounded delivery the default sound +
      // banner are correct.
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/";

  event.waitUntil(
    (async () => {
      // Try to focus an already-open Lizhi tab + navigate it; otherwise
      // open a new window.
      const allClients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      for (const client of allClients) {
        if (
          client.url.includes(self.location.origin) &&
          "focus" in client
        ) {
          if ("navigate" in client) {
            try {
              await client.navigate(targetUrl);
            } catch {
              /* navigation can fail across origins; just focus */
            }
          }
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return null;
    })(),
  );
});
