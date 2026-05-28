"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TokenRow = {
  id: string;
  label: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type CreatedToken = TokenRow & { plaintext: string };

const dateFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null): string {
  if (!value) return "never";
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return "—";
  return dateFmt.format(new Date(ms));
}

/**
 * Settings panel that lets the user generate / revoke API tokens used by
 * the Chrome extension (and any future external clients). Plaintext tokens
 * are surfaced exactly once when created — after that we only ever show
 * the label / timestamps.
 */
export function ExtensionTokensPanel() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Holds the just-created plaintext token plus its label, so the UI can
  // show the one-shot reveal block. Cleared when the user dismisses it.
  const [createdToken, setCreatedToken] = useState<CreatedToken | null>(null);
  const [draftLabel, setDraftLabel] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/extension/tokens", {
        cache: "no-store",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Could not load tokens (${response.status}).`);
        setTokens([]);
        return;
      }
      const payload = (await response.json()) as { tokens: TokenRow[] };
      setTokens(payload.tokens ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
  }, [refresh]);

  const createToken = async () => {
    if (isCreating) return;
    setIsCreating(true);
    setError(null);
    try {
      const response = await fetch("/api/extension/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: draftLabel }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Could not create token (${response.status}).`);
        return;
      }
      const payload = (await response.json()) as {
        token: TokenRow;
        plaintext: string;
      };
      setCreatedToken({ ...payload.token, plaintext: payload.plaintext });
      setDraftLabel("");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    } finally {
      setIsCreating(false);
    }
  };

  const revokeToken = async (id: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/extension/tokens/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? `Could not revoke (${response.status}).`);
        return;
      }
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error.");
    }
  };

  const copyPlaintext = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.plaintext);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers block clipboard access without a user gesture — the
      // user can still triple-click + Ctrl+C the visible value.
    }
  };

  const activeTokens = tokens.filter((token) => !token.revoked_at);

  return (
    <section className="mt-5 overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-[family-name:var(--font-mono)] text-[10.5px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
          Extension access
        </h2>
      </div>
      <p className="mt-1 text-[13px] text-[color:var(--ink-2)]">
        Generate API tokens for the Chrome extension. A token grants full
        read/write access to this account&apos;s todos — keep it secret and
        revoke any you no longer need.
      </p>

      {/* New token + one-shot reveal */}
      <div className="mt-4 rounded-[var(--r)] border border-[color:var(--line-soft)] bg-[color:var(--sunken)]/55 p-3">
        {createdToken ? (
          <div>
            <div className="mb-2 flex items-center gap-2 text-[12px] font-medium text-[color:var(--ink)]">
              <KeyRound className="h-3.5 w-3.5" /> New token created — copy now
            </div>
            <p className="text-[11.5px] text-[color:var(--ink-2)]">
              This is the only time the plaintext value will be shown.
              Lizhi Routine only stores its hash.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2 py-1.5 font-[family-name:var(--font-mono)] text-[11.5px] text-[color:var(--ink)]">
                {createdToken.plaintext}
              </code>
              <Button
                type="button"
                variant="soft"
                size="sm"
                onClick={() => void copyPlaintext()}
              >
                {copied ? (
                  <>
                    <Check className="mr-1 h-3 w-3" />
                    Copied
                  </>
                ) : (
                  <>
                    <Copy className="mr-1 h-3 w-3" />
                    Copy
                  </>
                )}
              </Button>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setCreatedToken(null)}
              >
                I&apos;ve saved it
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]"
              placeholder="Label (e.g. Work Chrome)"
              value={draftLabel}
              maxLength={80}
              onChange={(event) => setDraftLabel(event.target.value)}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => void createToken()}
              disabled={isCreating}
            >
              <Plus className="mr-1 h-3 w-3" />
              {isCreating ? "Creating" : "New token"}
            </Button>
          </div>
        )}
      </div>

      {/* Active tokens list */}
      <div className="mt-3 space-y-1.5">
        {loading ? (
          <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-3 py-3 text-center text-xs text-[color:var(--ink-3)]">
            Loading…
          </div>
        ) : activeTokens.length === 0 ? (
          <div className="rounded-[var(--r-sm)] border border-dashed border-[color:var(--line)] bg-[color:var(--sunken)]/35 px-3 py-3 text-center text-xs text-[color:var(--ink-3)]">
            No active tokens.
          </div>
        ) : (
          activeTokens.map((token) => (
            <div
              key={token.id}
              className="flex items-center gap-3 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-[color:var(--ink)]">
                  {token.label || "(no label)"}
                </div>
                <div className="mt-0.5 truncate font-[family-name:var(--font-mono)] text-[10.5px] text-[color:var(--ink-3)]">
                  created {formatDate(token.created_at)} · last used{" "}
                  {formatDate(token.last_used_at)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void revokeToken(token.id)}
                className={cn(
                  "rounded p-1.5 text-[color:var(--ink-3)] transition-colors",
                  "hover:bg-[color:var(--sunken)] hover:text-[oklch(55%_0.18_25)]",
                )}
                title="Revoke token"
                aria-label={`Revoke ${token.label || "token"}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))
        )}
      </div>

      {error && (
        <div className="mt-3 rounded-[var(--r-sm)] bg-[oklch(94%_0.04_30)] px-2 py-1.5 text-[11.5px] text-[oklch(45%_0.15_30)] dark:bg-[oklch(30%_0.10_30)] dark:text-[oklch(82%_0.10_30)]">
          {error}
        </div>
      )}
    </section>
  );
}
