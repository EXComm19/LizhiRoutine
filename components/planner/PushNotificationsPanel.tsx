"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  Send,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  checkPushCapability,
  disablePush,
  enablePush,
  isCurrentDeviceSubscribed,
  type PushCapability,
} from "@/lib/client/push-client";

/**
 * Settings → Notifications panel. Three jobs:
 *  1. Tell the user whether their browser/device can handle push at all
 *  2. Let them enable / disable on this device
 *  3. Provide a "Send test push" button so they know the chain works
 *
 * Multi-device aware: also lists the OTHER devices already subscribed
 * to the same Lizhi account (just endpoint prefix + user-agent snippet).
 */

type DeviceRow = {
  endpoint: string;
  user_agent: string | null;
  created_at: string;
};

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function PushNotificationsPanel() {
  const [capability, setCapability] = useState<PushCapability | null>(null);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [busy, setBusy] = useState<"enable" | "disable" | "test" | null>(null);
  const [banner, setBanner] = useState<{
    kind: "ok" | "err";
    text: string;
  } | null>(null);

  const refreshDevices = async () => {
    try {
      const response = await fetch("/api/push/subscribe", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const payload = (await response.json()) as {
        subscriptions?: DeviceRow[];
      };
      setDevices(payload.subscriptions ?? []);
    } catch {
      /* not fatal — devices list is informational */
    }
  };

  useEffect(() => {
    let active = true;
    (async () => {
      const cap = checkPushCapability();
      if (active) setCapability(cap);
      const sub = await isCurrentDeviceSubscribed();
      if (active) setSubscribed(sub);
      await refreshDevices();
    })();
    return () => {
      active = false;
    };
  }, []);

  const handleEnable = async () => {
    setBanner(null);
    setBusy("enable");
    try {
      await enablePush(VAPID_PUBLIC_KEY);
      setSubscribed(true);
      await refreshDevices();
      setBanner({
        kind: "ok",
        text: "Notifications enabled on this device.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not enable.";
      setBanner({ kind: "err", text: message });
    } finally {
      setBusy(null);
    }
  };

  const handleDisable = async () => {
    setBanner(null);
    setBusy("disable");
    try {
      await disablePush();
      setSubscribed(false);
      await refreshDevices();
      setBanner({
        kind: "ok",
        text: "Notifications disabled on this device.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not disable.";
      setBanner({ kind: "err", text: message });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    setBanner(null);
    setBusy("test");
    try {
      const response = await fetch("/api/push/send-test", { method: "POST" });
      const payload = (await response.json()) as {
        sent?: number;
        pruned?: number;
        errors?: string[];
      };
      if (!response.ok) {
        setBanner({
          kind: "err",
          text: payload.errors?.[0] ?? `Failed (${response.status}).`,
        });
        return;
      }
      const sent = payload.sent ?? 0;
      if (sent === 0) {
        setBanner({
          kind: "err",
          text:
            payload.errors?.[0] ??
            "No devices subscribed yet — enable on at least one.",
        });
      } else {
        setBanner({
          kind: "ok",
          text: `Pushed to ${sent} device${sent === 1 ? "" : "s"}.`,
        });
      }
    } catch {
      setBanner({ kind: "err", text: "Could not reach the server." });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center gap-2">
        <Bell className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
        <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Notifications
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Get push notifications to your iPhone, iPad, or laptop. Once
        enabled, the app doesn&apos;t need to be open — Lizhi can ping
        you with daily agendas, sleep alerts, or event reminders.
      </p>

      {/* Capability gating + UX prompts */}
      {capability?.kind === "needs-pwa-install" && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-amber-400/60 bg-amber-100/50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Add to Home Screen first</div>
            <p className="mt-1 text-[11.5px] leading-relaxed">
              iOS only allows web push from installed PWAs.{" "}
              <strong>Safari → Share → 添加到主屏幕</strong>, then open
              Lizhi from that icon and come back to this page.
            </p>
          </div>
        </div>
      )}

      {capability?.kind === "unsupported" && (
        <div className="mt-3 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] px-3 py-2 text-[12px] text-[color:var(--ink-3)]">
          This browser can&apos;t deliver push notifications. Try Safari
          on iOS 16.4+, Chrome, or Firefox.
        </div>
      )}

      {capability?.kind === "denied" && (
        <div className="mt-3 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] px-3 py-2 text-[12px] text-[color:var(--ink-2)]">
          Notifications are blocked for this site. Re-enable in your
          browser / iOS Settings → Lizhi Routine, then come back.
        </div>
      )}

      {banner && (
        <div
          className={
            "mt-3 rounded-[var(--r-sm)] px-3 py-2 text-[12px] " +
            (banner.kind === "ok"
              ? "border border-emerald-300/60 bg-emerald-100/40 text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-500/10 dark:text-emerald-200"
              : "border border-rose-400/60 bg-rose-100/40 text-rose-900 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200")
          }
        >
          {banner.text}
        </div>
      )}

      {/* Action buttons — only show when capability is good */}
      {capability?.kind === "ready" && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {subscribed ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void handleDisable()}
              disabled={busy === "disable"}
            >
              <BellOff className="mr-1 h-3 w-3" />
              {busy === "disable" ? "Disabling…" : "Disable on this device"}
            </Button>
          ) : (
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void handleEnable()}
              disabled={busy === "enable" || !VAPID_PUBLIC_KEY}
            >
              <Bell className="mr-1 h-3 w-3" />
              {busy === "enable" ? "Enabling…" : "Enable on this device"}
            </Button>
          )}
          <Button
            type="button"
            variant="soft"
            size="sm"
            onClick={() => void handleTest()}
            disabled={busy === "test" || devices.length === 0}
            title={
              devices.length === 0
                ? "Enable on at least one device first"
                : "Send a test push to every subscribed device"
            }
          >
            <Send className="mr-1 h-3 w-3" />
            {busy === "test" ? "Sending…" : "Send test push"}
          </Button>
        </div>
      )}

      {/* Subscribed devices */}
      {devices.length > 0 && (
        <div className="mt-4">
          <div className="mb-1 font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
            Subscribed devices ({devices.length})
          </div>
          <ul className="space-y-1.5">
            {devices.map((dev) => (
              <li
                key={dev.endpoint}
                className="rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)]/40 px-2.5 py-1.5 text-[11.5px] text-[color:var(--ink-2)]"
              >
                <div className="truncate font-[family-name:var(--font-mono)]">
                  {(dev.user_agent ?? "Unknown device").slice(0, 60)}
                </div>
                <div className="mt-0.5 text-[10.5px] text-[color:var(--ink-3)]">
                  added {new Date(dev.created_at).toLocaleDateString()}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {!VAPID_PUBLIC_KEY && (
        <div className="mt-3 rounded-[var(--r-sm)] border border-amber-400/60 bg-amber-100/50 px-3 py-2 text-[11.5px] text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
          <code>NEXT_PUBLIC_VAPID_PUBLIC_KEY</code> not set in{" "}
          <code>.env.local</code> — buttons are disabled until you fill
          it in and restart the dev server.
        </div>
      )}
    </section>
  );
}
