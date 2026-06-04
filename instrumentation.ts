/**
 * Next.js instrumentation entrypoint.
 *
 * Runs once per server process at startup (both `next dev` and
 * `next start`). We use it to spin up an in-process minute-tick that
 * walks every user with a push subscription and fires whatever pushes
 * are due — daily agenda, event lead-in, repeated reminders.
 *
 * The ticker stays scoped to the Node runtime; we don't want to
 * register it from edge functions or browser-bundle contexts. Reload
 * loops in `next dev` re-import this file repeatedly, so the
 * ticker module also dedups internally via a module-scoped guard.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startInProcessTicker } = await import("@/lib/server/cron-ticker");
  startInProcessTicker();
}
