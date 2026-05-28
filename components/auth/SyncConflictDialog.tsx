"use client";

import { useState } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SyncConflict } from "@/lib/auth";

type SyncConflictDialogProps = {
  conflict: SyncConflict | null;
  onResolve: (choice: "cloud" | "local") => Promise<void>;
};

/**
 * Shown right after sign-in when BOTH the device's localStorage and the
 * Supabase account have data. The user picks which side wins; no
 * automatic merge.
 *
 * If the user simply ignores this dialog, the cloud writer never gets
 * registered (see lib/auth.ts), so local edits stay local until they
 * decide. That's intentional — we don't want a stray click to overwrite a
 * year's worth of cloud data, or vice versa.
 */
export function SyncConflictDialog({
  conflict,
  onResolve,
}: SyncConflictDialogProps) {
  const [pending, setPending] = useState<"cloud" | "local" | null>(null);

  if (!conflict) return null;

  const pick = async (choice: "cloud" | "local") => {
    if (pending) return;
    setPending(choice);
    try {
      await onResolve(choice);
    } finally {
      setPending(null);
    }
  };

  const { cloud } = conflict;
  const cloudHasAnything =
    cloud.templates > 0 ||
    cloud.todos > 0 ||
    cloud.periods > 0 ||
    cloud.events > 0 ||
    cloud.sleepRecords > 0 ||
    cloud.days > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink)]/40 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="sync-conflict-title"
    >
      <div className="relative w-full max-w-md overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] shadow-[0_24px_48px_-12px_rgba(20,18,10,0.28)]">
        <div className="border-b border-[color:var(--line-soft)] bg-[color:var(--bg)] px-5 py-4">
          <h2
            id="sync-conflict-title"
            className="font-[family-name:var(--font-disp)] text-[20px] font-medium tracking-[-0.015em] text-[color:var(--ink)]"
          >
            <em className="italic font-normal text-[color:var(--ink-2)]">
              Choose{" "}
            </em>
            which data to keep
          </h2>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)]">
            This device and the cloud both have data. Pick one — the other
            side will be overwritten.
          </p>
        </div>

        <div className="space-y-2 px-5 py-4">
          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-3 text-left transition-colors hover:bg-[color:var(--sunken)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => void pick("local")}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[color:var(--sunken)] text-[color:var(--ink-3)]">
              <HardDrive className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[color:var(--ink)]">
                Keep this device&apos;s data
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[color:var(--ink-2)]">
                Upload everything currently in this browser. The account&apos;s
                existing cloud data will be replaced.
              </span>
            </span>
          </button>

          <button
            type="button"
            className="flex w-full items-start gap-3 rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-3 text-left transition-colors hover:bg-[color:var(--sunken)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={pending !== null}
            onClick={() => void pick("cloud")}
          >
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[8px] bg-[color:var(--sunken)] text-[color:var(--ink-3)]">
              <Cloud className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-semibold text-[color:var(--ink)]">
                Use the cloud data
              </span>
              <span className="mt-0.5 block text-[12px] leading-relaxed text-[color:var(--ink-2)]">
                {cloudHasAnything
                  ? `Download ${cloud.days} day${cloud.days === 1 ? "" : "s"}, ${cloud.todos} todo${cloud.todos === 1 ? "" : "s"}, ${cloud.events} event${cloud.events === 1 ? "" : "s"}, ${cloud.periods} period${cloud.periods === 1 ? "" : "s"}, ${cloud.templates} routine${cloud.templates === 1 ? "" : "s"}. This browser's current data will be replaced.`
                  : "Replace this browser's data with the account's cloud snapshot."}
              </span>
            </span>
          </button>
        </div>

        <div className="border-t border-[color:var(--line-soft)] bg-[color:var(--sunken)] px-5 py-3 text-[11.5px] text-[color:var(--ink-3)]">
          {pending === "cloud" && "Downloading cloud data..."}
          {pending === "local" && "Uploading device data..."}
          {!pending && "No automatic merge — pick a side."}
        </div>

        <div className="flex justify-end gap-2 border-t border-[color:var(--line-soft)] bg-[color:var(--card)] px-5 py-3">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={pending !== null}
            onClick={() => void pick("local")}
          >
            Keep device
          </Button>
          <Button
            type="button"
            size="sm"
            variant="primary"
            disabled={pending !== null}
            onClick={() => void pick("cloud")}
          >
            Use cloud
          </Button>
        </div>
      </div>
    </div>
  );
}
