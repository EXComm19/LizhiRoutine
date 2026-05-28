"use client";

import { useState } from "react";
import { AlertTriangle, Check, Copy, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Settings section that documents how to wire up Apple Health's "Health
 * Auto Export" iOS app (or any other sleep-tracker that can POST JSON) to
 * the bearer-protected `/api/health/sleep` endpoint.
 *
 * Reuses the same tokens shown in ExtensionTokensPanel — sleep ingest and
 * the Chrome extension share the auth layer. Nothing about this panel
 * touches local state; it's purely informational + a copy-button or two.
 */
export function SleepImportPanel() {
  // Lazy initializer so we read window.location once at mount instead of
  // an effect; SSR returns "" and the first client render fills it in.
  const [endpoint] = useState<string>(() =>
    typeof window === "undefined" ? "" : `${window.location.origin}/api/health/sleep`,
  );
  // `localhost` (or 127.x / *.local) means the page is loaded from a dev
  // server. iOS apps like Health Auto Export resolve `localhost` against
  // the *phone itself*, not the laptop — so the URL is unreachable unless
  // the user swaps it for a LAN IP or tunnel. We show a banner so this
  // isn't a silent failure mode.
  const isLoopbackHost = (() => {
    if (typeof window === "undefined") return false;
    const host = window.location.hostname;
    return (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "0.0.0.0" ||
      host.endsWith(".local")
    );
  })();
  const [copied, setCopied] = useState<"endpoint" | "json" | null>(null);

  const copy = async (text: string, which: "endpoint" | "json") => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard denied — ignore */
    }
  };

  const sampleJson = `{
  "records": [
    {
      "started_at": "2026-05-27T23:30:00+08:00",
      "ended_at":   "2026-05-28T07:15:00+08:00",
      "source":     "Apple Watch"
    }
  ]
}`;

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center gap-2">
        <Moon className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
        <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Sleep import
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Push sleep records from Apple Health using the{" "}
        <a
          href="https://apps.apple.com/app/id1561960573"
          target="_blank"
          rel="noreferrer"
          className="underline decoration-[color:var(--line-strong)] underline-offset-2 hover:text-[color:var(--ink)]"
        >
          Health Auto Export
        </a>{" "}
        iOS app. Imported sessions show up on the timeline (next to your
        target sleep block) and feed the sleep trend chart in Stats.
      </p>

      {isLoopbackHost && (
        <div className="mt-3 flex items-start gap-2 rounded-[var(--r-sm)] border border-amber-400/60 bg-amber-100/50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="font-medium">
              You&apos;re on <code>localhost</code> — the URL below
              won&apos;t reach your iPhone.
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed">
              <code>localhost</code> on the phone means the phone itself.
              Pick one:
            </p>
            <ul className="mt-1 ml-4 list-disc space-y-0.5 text-[11.5px] leading-relaxed">
              <li>
                <strong>Same Wi-Fi LAN IP</strong>: run{" "}
                <code>ipconfig</code> (Windows) /{" "}
                <code>ifconfig</code> (macOS), then start the dev server
                with <code>next dev -H 0.0.0.0</code> and use{" "}
                <code>http://&lt;your-ip&gt;:3000/api/health/sleep</code>.
                Allow Node through the firewall.
              </li>
              <li>
                <strong>Cloudflare Tunnel</strong> (free, no signup):{" "}
                <code>cloudflared tunnel --url http://localhost:3000</code>{" "}
                — gives you an HTTPS URL that works on any network.
              </li>
              <li>
                <strong>Deploy</strong> to Vercel and use the production
                URL. Fixed forever.
              </li>
            </ul>
          </div>
        </div>
      )}

      <div className="mt-4 grid gap-3 text-[12.5px] text-[color:var(--ink-2)]">
        <div>
          <div className="mb-1 font-medium text-[color:var(--ink)]">
            1 · Get a token
          </div>
          <p>
            Use any active token from <em>Extension access</em> above (or
            generate a new one labelled “Sleep”). The same token works for
            both the Chrome extension and sleep ingest.
          </p>
        </div>

        <div>
          <div className="mb-1 font-medium text-[color:var(--ink)]">
            2 · Configure Health Auto Export
          </div>
          <p>
            Open the app on iPhone → <strong>Automations</strong> →{" "}
            <strong>+ New Automation</strong> → choose{" "}
            <strong>REST API</strong> as the destination. Settings:
          </p>
          <ul className="ml-4 mt-1 list-disc space-y-1">
            <li>
              <strong>URL</strong>:
              <div className="mt-1 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1 font-[family-name:var(--font-mono)] text-[11.5px] text-[color:var(--ink)]">
                  {endpoint || "https://your-host/api/health/sleep"}
                </code>
                <Button
                  type="button"
                  variant="soft"
                  size="sm"
                  onClick={() => void copy(endpoint, "endpoint")}
                  disabled={!endpoint}
                >
                  {copied === "endpoint" ? (
                    <>
                      <Check className="mr-1 h-3 w-3" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1 h-3 w-3" /> Copy
                    </>
                  )}
                </Button>
              </div>
            </li>
            <li>
              <strong>Method</strong>: <code>POST</code>
            </li>
            <li>
              <strong>Headers</strong>: <code>Authorization: Bearer YOUR_TOKEN</code>
              {" — "}paste the plaintext you copied when generating it
            </li>
            <li>
              <strong>Body type</strong>: JSON
            </li>
            <li>
              <strong>Aggregate by</strong>: pick <em>Sleep Analysis</em>{" "}
              and enable <em>Include individual records</em> so each
              session lands as its own row
            </li>
            <li>
              <strong>Frequency</strong>: hourly is plenty. Daily works
              too; faster won&apos;t bring in data that isn&apos;t there yet.
            </li>
          </ul>
        </div>

        <div>
          <div className="mb-1 font-medium text-[color:var(--ink)]">
            3 · (Optional) test from anywhere
          </div>
          <p>
            Curl this from a terminal to confirm the endpoint and token
            work. Replace <code>YOUR_TOKEN</code>.
          </p>
          <div className="mt-2 flex items-start gap-2">
            <pre className="min-w-0 flex-1 overflow-x-auto rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] px-2.5 py-2 font-[family-name:var(--font-mono)] text-[11px] leading-relaxed text-[color:var(--ink)]">
{`curl -X POST ${endpoint || "https://your-host/api/health/sleep"} \\
  -H "Authorization: Bearer YOUR_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${sampleJson.replace(/\n\s*/g, " ")}'`}
            </pre>
            <Button
              type="button"
              variant="soft"
              size="sm"
              onClick={() => void copy(sampleJson, "json")}
              title="Copy the JSON body sample"
            >
              {copied === "json" ? (
                <>
                  <Check className="mr-1 h-3 w-3" /> Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-3 w-3" /> JSON
                </>
              )}
            </Button>
          </div>
          <p className="mt-2 text-[11.5px] text-[color:var(--ink-3)]">
            On success you&apos;ll get back{" "}
            <code>{`{ inserted, updated, total, warnings }`}</code>. The
            endpoint dedupes by <code>source</code> + <code>started_at</code>,
            so re-sending the same window is safe.
          </p>
        </div>
      </div>
    </section>
  );
}
