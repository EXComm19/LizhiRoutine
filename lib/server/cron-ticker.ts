import { cleanEnvValue } from "@/lib/server/env";

/**
 * In-process minute ticker. Started once from instrumentation.ts; calls
 * runCronTick() every 60 seconds. Survives module hot-reload during
 * `next dev` because the `started` flag is module-scoped (HMR
 * re-evaluates the module fresh).
 *
 * Why poll instead of waking on event_at columns: we'd need a queue
 * (BullMQ, pg-boss, Vercel cron, etc.) for that — overkill for the
 * 1-laptop personal-use case. Polling at 60s granularity matches what
 * a user expects from "remind me at 22:00" (worst-case 59s late, which
 * lockscreen-wise is indistinguishable).
 */

let started = false;
let timer: NodeJS.Timeout | null = null;

export function startInProcessTicker() {
  if (started) return;
  // If a separate cron (Vercel, GitHub Action) is meant to drive ticks
  // in production, set CRON_DISABLE_INPROCESS=1 to disable this one.
  // Useful once you deploy — you don't want double-fires.
  const disable = cleanEnvValue(process.env.CRON_DISABLE_INPROCESS);
  if (disable === "1" || disable === "true") {
    console.log(
      "[lizhi-routine:cron] in-process ticker disabled (CRON_DISABLE_INPROCESS).",
    );
    started = true;
    return;
  }
  started = true;
  console.log("[lizhi-routine:cron] in-process ticker on; firing every 60s.");
  // Fire once shortly after startup so server restart doesn't lose a
  // minute boundary — gives feedback within ~5s of the first start.
  setTimeout(() => void tick(), 5_000);
  timer = setInterval(() => void tick(), 60_000);
}

async function tick() {
  try {
    const { runCronTick } = await import("@/lib/server/cron-tick");
    const result = await runCronTick();
    if (result.errors.length > 0) {
      console.warn("[lizhi-routine:cron] tick errors", {
        pushes: result.pushes,
        errors: result.errors,
      });
    } else if (result.pushes > 0) {
      console.log(
        `[lizhi-routine:cron] tick → ${result.pushes} push${
          result.pushes === 1 ? "" : "es"
        } across ${result.scanned} user${result.scanned === 1 ? "" : "s"}.`,
      );
    }
  } catch (error) {
    console.error("[lizhi-routine:cron] tick threw", error);
  }
}

/** Mostly for tests — not used in dev/prod. */
export function stopInProcessTicker() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  started = false;
}
