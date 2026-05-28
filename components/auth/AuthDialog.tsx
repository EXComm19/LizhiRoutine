"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Mode = "sign-in" | "sign-up";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<boolean>;
  onSignUp: (email: string, password: string) => Promise<boolean>;
  authError: string | null;
  clearError: () => void;
};

export function AuthDialog(props: AuthDialogProps) {
  if (!props.open) return null;
  return <AuthDialogBody {...props} />;
}

function AuthDialogBody({
  onClose,
  onSignIn,
  onSignUp,
  authError,
  clearError,
}: AuthDialogProps) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    const ok =
      mode === "sign-in"
        ? await onSignIn(email.trim(), password)
        : await onSignUp(email.trim(), password);
    setSubmitting(false);
    if (ok) onClose();
  };

  const fieldClass =
    "w-full rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--card)] px-3 py-2 text-[13px] text-[color:var(--ink)] outline-none transition-colors placeholder:text-[color:var(--ink-3)] focus:border-[color:var(--line-strong)] focus:ring-2 focus:ring-[color:var(--ring)]";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--ink)]/40 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-dialog-title"
    >
      <div className="absolute inset-0" aria-hidden="true" onClick={onClose} />
      <div className="relative w-full max-w-sm overflow-hidden rounded-[var(--r-lg)] border border-[color:var(--line)] bg-[color:var(--card)] shadow-[0_24px_48px_-12px_rgba(20,18,10,0.28)]">
        {/* Banner header */}
        <div className="relative border-b border-[color:var(--line-soft)] bg-[color:var(--bg)] px-5 py-4">
          <button
            type="button"
            className="absolute right-3 top-3 inline-grid h-7 w-7 place-items-center rounded-[var(--r-sm)] text-[color:var(--ink-3)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-3.5 w-3.5" />
          </button>
          <h2
            id="auth-dialog-title"
            className="font-[family-name:var(--font-disp)] text-[20px] font-medium tracking-[-0.015em] text-[color:var(--ink)]"
          >
            {mode === "sign-in" ? (
              <>
                <em className="italic font-normal text-[color:var(--ink-2)]">
                  Sign{" "}
                </em>
                in
              </>
            ) : (
              <>
                <em className="italic font-normal text-[color:var(--ink-2)]">
                  Create{" "}
                </em>
                account
              </>
            )}
          </h2>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-[10.5px] tracking-[0.04em] text-[color:var(--ink-3)]">
            {mode === "sign-in"
              ? "Sync your routine across every device."
              : "Existing local data uploads to your new account."}
          </p>
        </div>

        <div className="px-5 pb-5 pt-4">
          {/* Mode toggle */}
          <div className="flex gap-0.5 rounded-[var(--r-sm)] border border-[color:var(--line)] bg-[color:var(--sunken)] p-0.5">
            {(["sign-in", "sign-up"] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={cn(
                  "h-7 flex-1 rounded-[6px] text-[12px] font-medium transition-colors",
                  mode === value
                    ? "bg-[color:var(--card)] text-[color:var(--ink)] shadow-[0_1px_2px_rgba(20,18,10,0.06)]"
                    : "text-[color:var(--ink-2)] hover:text-[color:var(--ink)]",
                )}
                onClick={() => {
                  setMode(value);
                  clearError();
                }}
              >
                {value === "sign-in" ? "Sign in" : "Sign up"}
              </button>
            ))}
          </div>

          <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
            <div>
              <label
                htmlFor="auth-email"
                className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]"
              >
                Email
              </label>
              <input
                id="auth-email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className={fieldClass}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="auth-password"
                className="mb-1 block font-[family-name:var(--font-mono)] text-[10px] font-medium uppercase tracking-[0.14em] text-[color:var(--ink-3)]"
              >
                Password
              </label>
              <input
                id="auth-password"
                type="password"
                autoComplete={
                  mode === "sign-in" ? "current-password" : "new-password"
                }
                required
                minLength={mode === "sign-up" ? 6 : undefined}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={fieldClass}
                placeholder={mode === "sign-up" ? "At least 6 characters" : ""}
              />
            </div>

            {authError && (
              <div className="rounded-[var(--r-sm)] border border-[oklch(82%_0.08_15)] bg-[oklch(94%_0.04_15)] px-3 py-2 text-[12px] text-[oklch(40%_0.14_15)] dark:border-[oklch(45%_0.12_15)] dark:bg-[oklch(28%_0.08_15)] dark:text-[oklch(82%_0.08_15)]">
                {authError}
              </div>
            )}

            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={submitting || !email.trim() || !password}
            >
              {submitting
                ? mode === "sign-in"
                  ? "Signing in..."
                  : "Creating account..."
                : mode === "sign-in"
                  ? "Sign in"
                  : "Create account"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
