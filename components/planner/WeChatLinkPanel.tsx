"use client";

import { useEffect, useState } from "react";
import { Check, Copy, MessageCircle, RefreshCcw, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Settings section: WeChat 公众号 binding.
 *
 * Three states:
 *  - Loading        — initial fetch of bind status
 *  - Linked         — show the openid(s) + Unlink button
 *  - Unlinked       — show the "Generate code" CTA + step-by-step
 *
 * The code itself is just 6 digits the user shows on screen, then
 * types into the 公众号 chat as "bind XXXXXX".
 */

type Link = { openid: string; linkedAt: string };

export function WeChatLinkPanel() {
  const [links, setLinks] = useState<Link[] | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"generate" | "unlink" | null>(null);
  const [copied, setCopied] = useState(false);

  // Mount fetch. Uses an `active` flag so React's strict-mode double-
  // mount + unmount doesn't write into a stale component instance, and
  // structured this way to satisfy the react-hooks/set-state-in-effect
  // lint rule that flags `refresh()`-style helper calls.
  useEffect(() => {
    let active = true;
    fetch("/api/wechat/bind-code", { cache: "no-store" })
      .then(async (response) => {
        if (!active) return;
        if (!response.ok) {
          setError(`Could not load bind status (${response.status}).`);
          setLinks([]);
          return;
        }
        const payload = (await response.json()) as { links?: Link[] };
        if (active) setLinks(payload.links ?? []);
      })
      .catch(() => {
        if (active) {
          setError("Could not reach the server.");
          setLinks([]);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  // Imperative refetch — used by the Refresh button after re-binding.
  const refresh = async () => {
    setError(null);
    try {
      const response = await fetch("/api/wechat/bind-code", {
        cache: "no-store",
      });
      if (!response.ok) {
        setError(`Could not load bind status (${response.status}).`);
        setLinks([]);
        return;
      }
      const payload = (await response.json()) as { links?: Link[] };
      setLinks(payload.links ?? []);
    } catch {
      setError("Could not reach the server.");
      setLinks([]);
    }
  };

  // Wall-clock for the "expires in X minutes" countdown. Driven by a
  // 30s interval so the badge stays roughly current without burning
  // re-renders. Date.now() lives in state to keep render pure.
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  const generate = async () => {
    setBusy("generate");
    setError(null);
    try {
      const response = await fetch("/api/wechat/bind-code", {
        method: "POST",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Failed (${response.status}).`);
        return;
      }
      const payload = (await response.json()) as {
        code: string;
        expiresAt: string;
      };
      setCode(payload.code);
      setExpiresAt(payload.expiresAt);
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    if (!window.confirm("Disconnect WeChat? Future messages will be ignored until you re-bind.")) {
      return;
    }
    setBusy("unlink");
    setError(null);
    try {
      const response = await fetch("/api/wechat/bind-code", {
        method: "DELETE",
      });
      if (!response.ok) {
        setError(`Could not unlink (${response.status}).`);
        return;
      }
      setLinks([]);
      setCode(null);
      setExpiresAt(null);
    } finally {
      setBusy(null);
    }
  };

  const copyCode = async () => {
    if (!code || typeof navigator === "undefined" || !navigator.clipboard) {
      return;
    }
    try {
      await navigator.clipboard.writeText(`bind ${code}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard denied — ignore */
    }
  };

  const minutesLeft = expiresAt
    ? Math.max(0, Math.round((Date.parse(expiresAt) - now) / 60_000))
    : null;

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center gap-2">
        <MessageCircle className="h-3.5 w-3.5 text-[color:var(--ink-3)]" />
        <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          WeChat
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Send messages to your 公众号; they auto-parse into todos / events
        and land in your account. The bot replies with a quick
        acknowledgement — actual parsing runs in the background, results
        show up on next refresh.
      </p>

      {error && (
        <div className="mt-3 rounded-[var(--r-sm)] border border-amber-400/60 bg-amber-100/50 px-3 py-2 text-[12px] text-amber-900 dark:border-amber-500/50 dark:bg-amber-500/10 dark:text-amber-200">
          {error}
        </div>
      )}

      {links === null ? (
        <div className="mt-4 text-[12.5px] text-[color:var(--ink-3)]">
          Loading…
        </div>
      ) : links.length > 0 ? (
        <div className="mt-4 grid gap-3 text-[12.5px] text-[color:var(--ink-2)]">
          <div className="rounded-[var(--r)] border border-emerald-300/60 bg-emerald-100/40 p-3 dark:border-emerald-500/40 dark:bg-emerald-500/10">
            <div className="font-medium text-emerald-900 dark:text-emerald-200">
              ✅ Linked
            </div>
            <ul className="mt-1 space-y-0.5">
              {links.map((link) => (
                <li
                  key={link.openid}
                  className="font-[family-name:var(--font-mono)] text-[11.5px] text-emerald-800 dark:text-emerald-300"
                >
                  {link.openid.slice(0, 12)}…{link.openid.slice(-4)}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void refresh()}
            >
              <RefreshCcw className="mr-1 h-3 w-3" /> Refresh
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void unlink()}
              disabled={busy === "unlink"}
              title="Remove the binding"
            >
              <Unlink className="mr-1 h-3 w-3" />
              {busy === "unlink" ? "Unlinking…" : "Unlink"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 text-[12.5px] text-[color:var(--ink-2)]">
          <div>
            <div className="mb-1 font-medium text-[color:var(--ink)]">
              1 · Generate a 6-digit bind code
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => void generate()}
                disabled={busy === "generate"}
              >
                {busy === "generate" ? "Generating…" : code ? "Regenerate" : "Generate"}
              </Button>
              {code && (
                <>
                  <code className="min-w-[120px] rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1.5 font-[family-name:var(--font-mono)] text-[14px] tracking-[0.18em] text-[color:var(--ink)]">
                    bind {code}
                  </code>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => void copyCode()}
                  >
                    {copied ? (
                      <>
                        <Check className="mr-1 h-3 w-3" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="mr-1 h-3 w-3" /> Copy
                      </>
                    )}
                  </Button>
                  {minutesLeft !== null && (
                    <span className="text-[11.5px] text-[color:var(--ink-3)]">
                      expires in ~{minutesLeft}m
                    </span>
                  )}
                </>
              )}
            </div>
          </div>
          <div>
            <div className="mb-1 font-medium text-[color:var(--ink)]">
              2 · Send the code to the 公众号
            </div>
            <p>
              Open WeChat, find your 公众号, and send exactly{" "}
              <code>bind XXXXXX</code> (replace with the 6 digits above).
              The bot will reply <em>“✅ 已绑定”</em>.
            </p>
          </div>
          <div>
            <div className="mb-1 font-medium text-[color:var(--ink)]">
              3 · Use it
            </div>
            <p>
              Then any text message you send becomes a parsed todo / event.
              Example: <em>明天早上十点去 Bunnings 买套筒</em> → adds to
              your Reminders.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
