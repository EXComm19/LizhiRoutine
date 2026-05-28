"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type AccountButtonProps = {
  status: "disabled" | "loading" | "signed-out" | "signed-in";
  user: User | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
};

const avatarGradient =
  "bg-[linear-gradient(160deg,oklch(72%_0.14_60),oklch(50%_0.18_305))]";

function userInitial(user: User | null) {
  const source = user?.email ?? "";
  return source.trim().charAt(0).toUpperCase() || "L";
}

export function AccountButton({
  status,
  user,
  onOpenAuth,
  onSignOut,
}: AccountButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  if (status === "disabled") return null;

  if (status === "loading") {
    return (
      <span
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--card)] p-1 pr-2 text-[11px] text-[color:var(--ink-3)]"
        aria-hidden="true"
      >
        <span className="inline-grid h-[22px] w-[22px] place-items-center rounded-full bg-[color:var(--sunken)] font-[family-name:var(--font-mono)] text-[10px] font-semibold text-[color:var(--ink-3)]">
          L
        </span>
      </span>
    );
  }

  if (status === "signed-out" || !user) {
    return (
      <button
        type="button"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--card)] px-2.5 text-[11.5px] font-medium text-[color:var(--ink)] transition-colors hover:bg-[color:var(--sunken)]"
        onClick={onOpenAuth}
      >
        <LogIn className="h-3 w-3" aria-hidden="true" />
        Sign in
      </button>
    );
  }

  const display = user.email ?? "Signed in";
  const initial = userInitial(user);

  return (
    <div className="relative">
      <button
        type="button"
        title={display}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border border-[color:var(--line)] bg-[color:var(--card)] p-1 transition-colors",
          menuOpen ? "bg-[color:var(--sunken)]" : "hover:bg-[color:var(--sunken)]",
        )}
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`Account: ${display}`}
      >
        <span
          className={cn(
            "inline-grid h-[22px] w-[22px] place-items-center rounded-full font-[family-name:var(--font-mono)] text-[10px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.4)_inset]",
            avatarGradient,
          )}
        >
          {initial}
        </span>
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-[var(--r)] border border-[color:var(--line)] bg-[color:var(--card)] shadow-[0_12px_28px_-8px_rgba(20,18,10,0.22)]"
            role="menu"
          >
            <div className="flex items-center gap-2.5 border-b border-[color:var(--line-soft)] px-3 py-2.5">
              <span
                className={cn(
                  "inline-grid h-7 w-7 shrink-0 place-items-center rounded-full font-[family-name:var(--font-mono)] text-[11px] font-semibold text-white",
                  avatarGradient,
                )}
              >
                {initial}
              </span>
              <div className="min-w-0">
                <div className="font-[family-name:var(--font-mono)] text-[10px] uppercase tracking-[0.14em] text-[color:var(--ink-3)]">
                  Synced as
                </div>
                <div className="truncate text-[12px] font-medium text-[color:var(--ink)]">
                  {display}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] text-[color:var(--ink-2)] transition-colors hover:bg-[color:var(--sunken)] hover:text-[color:var(--ink)]"
              onClick={() => {
                setMenuOpen(false);
                onSignOut();
              }}
              role="menuitem"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}
