"use client";

import { useState } from "react";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut, UserCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

type AccountButtonProps = {
  status: "disabled" | "loading" | "signed-out" | "signed-in";
  user: User | null;
  onOpenAuth: () => void;
  onSignOut: () => void;
};

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
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-400 dark:text-zinc-500">
        <UserCircle2 className="h-4 w-4" aria-hidden="true" />
        …
      </span>
    );
  }

  if (status === "signed-out" || !user) {
    return (
      <button
        type="button"
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800/60"
        onClick={onOpenAuth}
      >
        <LogIn className="h-3.5 w-3.5" aria-hidden="true" />
        Sign in
      </button>
    );
  }

  const display = user.email ?? "Signed in";

  return (
    <div className="relative">
      <button
        type="button"
        className={cn(
          "inline-flex h-8 max-w-[180px] items-center gap-1.5 rounded-md px-2 text-xs font-medium text-zinc-700 transition-colors",
          menuOpen
            ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100"
            : "hover:bg-zinc-100 dark:text-zinc-200 dark:hover:bg-zinc-800/60",
        )}
        onClick={() => setMenuOpen((open) => !open)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        <UserCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{display}</span>
      </button>
      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            aria-hidden="true"
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="absolute right-0 top-9 z-50 w-48 overflow-hidden rounded-md border border-zinc-200 bg-white shadow-lg dark:border-zinc-800 dark:bg-zinc-900"
            role="menu"
          >
            <div className="border-b border-zinc-100 px-3 py-2 text-[11px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
              Synced as
              <div className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
                {display}
              </div>
            </div>
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-zinc-700 transition-colors hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800/60"
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
