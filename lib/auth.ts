"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isCloudConfigured } from "@/lib/supabase";
import {
  attachCloudWriter,
  pullFromCloud,
  resolveSyncConflict,
  syncOnSignIn,
  syncOnSignOut,
  type SyncOnSignInResult,
} from "@/lib/cloud-sync";

/**
 * Marker for "we've already reconciled local state against the cloud for this
 * user." Persisting it across reloads is what stops syncOnSignIn (and its
 * conflict dialog) from firing on every refresh of an already-signed-in tab.
 *
 * Cleared on sign-out so the next sign-in always re-syncs fresh.
 */
const LAST_SYNCED_USER_KEY = "lizhi-routine:last-synced-user-id";

function readLastSyncedUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_SYNCED_USER_KEY);
  } catch {
    return null;
  }
}

function writeLastSyncedUserId(userId: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (userId) {
      window.localStorage.setItem(LAST_SYNCED_USER_KEY, userId);
    } else {
      window.localStorage.removeItem(LAST_SYNCED_USER_KEY);
    }
  } catch {
    // localStorage may be unavailable (private mode, quota). Best-effort only.
  }
}

export type AuthStatus = "disabled" | "loading" | "signed-out" | "signed-in";

export type SyncConflict = Extract<SyncOnSignInResult, { kind: "conflict" }> & {
  userId: string;
};

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Bumps on every successful sign-in/out so callers can re-hydrate state. */
  dataRevision: number;
  /** Last error from a sign-in/sign-up attempt (cleared on next attempt). */
  authError: string | null;
  /** Set when sign-in detected both local + cloud data; awaits user choice. */
  syncConflict: SyncConflict | null;
};

export type AuthActions = {
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
  resolveConflict: (choice: "cloud" | "local") => Promise<void>;
  /**
   * Force a fresh pull from the cloud and replace local state with it.
   * Returns true if cloud had data; false if user isn't signed in or cloud
   * is empty. Bumps dataRevision so consumers re-hydrate from storage.
   */
  refreshFromCloud: () => Promise<boolean>;
};

export function useAuth(): AuthState & AuthActions {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isCloudConfigured() ? "loading" : "disabled",
  );
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const [syncConflict, setSyncConflict] = useState<SyncConflict | null>(null);
  // Tracks the user we've already reconciled with cloud in *this* mount.
  // Persisted copy in localStorage (LAST_SYNCED_USER_KEY) survives refreshes.
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    // The useState initializer already set status to "disabled" when env
    // vars are missing; nothing to do here.
    if (!supabase) return;

    // Seed the in-memory ref from the persisted marker. Without this, a page
    // refresh of an already-signed-in tab would re-run syncOnSignIn and pop
    // the conflict dialog every time (local has data, cloud has data).
    lastSyncedUserId.current = readLastSyncedUserId();

    let cancelled = false;

    const ingest = async (session: Session | null) => {
      if (cancelled) return;
      if (session?.user) {
        const sameUser = lastSyncedUserId.current === session.user.id;
        setUser(session.user);
        setStatus("signed-in");
        if (!sameUser) {
          try {
            const result = await syncOnSignIn(supabase, session.user.id);
            if (!cancelled && result.kind === "conflict") {
              setSyncConflict({ ...result, userId: session.user.id });
              // Don't bump dataRevision yet — local state still reflects the
              // pre-sign-in user; we wait for the user's conflict choice.
              // Also don't persist the marker yet — only resolveConflict
              // should claim "we're synced" on the user's behalf.
              lastSyncedUserId.current = session.user.id;
              return;
            }
          } catch (error) {
            console.warn("[lizhi-routine] sign-in sync failed", error);
          }
          lastSyncedUserId.current = session.user.id;
          writeLastSyncedUserId(session.user.id);
          if (!cancelled) setDataRevision((value) => value + 1);
        } else {
          // Already-synced user refreshing the page: skip the reconciliation
          // pass (which would only see two non-empty stores and conflict),
          // but make sure writes still flow to the cloud.
          attachCloudWriter(supabase, session.user.id);
        }
      } else {
        const wasSignedIn = lastSyncedUserId.current !== null;
        setUser(null);
        setStatus("signed-out");
        setSyncConflict(null);
        if (wasSignedIn) {
          syncOnSignOut();
          lastSyncedUserId.current = null;
          writeLastSyncedUserId(null);
          if (!cancelled) setDataRevision((value) => value + 1);
        }
      }
    };

    void supabase.auth.getSession().then(({ data }) => ingest(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        void ingest(session);
      },
    );

    return () => {
      cancelled = true;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) {
        setAuthError("Cloud sync is not configured.");
        return false;
      }
      setAuthError(null);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      return true;
    },
    [],
  );

  const signUp = useCallback(
    async (email: string, password: string): Promise<boolean> => {
      const supabase = getSupabase();
      if (!supabase) {
        setAuthError("Cloud sync is not configured.");
        return false;
      }
      setAuthError(null);
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setAuthError(error.message);
        return false;
      }
      // If "Confirm email" is enabled in Supabase, signUp returns a user
      // with no session. Surface that to the caller so the UI can hint.
      if (!data.session) {
        setAuthError(
          "Account created. Check your email to confirm before signing in.",
        );
        return false;
      }
      return true;
    },
    [],
  );

  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    await supabase.auth.signOut();
  }, []);

  const clearError = useCallback(() => setAuthError(null), []);

  const refreshFromCloud = useCallback(async (): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase || !user) return false;
    try {
      const pulled = await pullFromCloud(supabase, user.id);
      // Bump dataRevision either way so the planner re-reads local; cloud
      // having no data is also worth surfacing (nothing changes locally).
      setDataRevision((value) => value + 1);
      return pulled;
    } catch (error) {
      console.warn("[lizhi-routine] manual cloud pull failed", error);
      return false;
    }
  }, [user]);

  const resolveConflict = useCallback(
    async (choice: "cloud" | "local") => {
      const supabase = getSupabase();
      if (!supabase) return;
      const conflict = syncConflict;
      if (!conflict) return;
      try {
        await resolveSyncConflict(supabase, conflict.userId, choice);
      } catch (error) {
        console.warn("[lizhi-routine] conflict resolution failed", error);
      }
      // Now that the user has picked a side, local and cloud agree — claim
      // synced status so future refreshes skip the conflict dialog.
      lastSyncedUserId.current = conflict.userId;
      writeLastSyncedUserId(conflict.userId);
      setSyncConflict(null);
      setDataRevision((value) => value + 1);
    },
    [syncConflict],
  );

  return {
    status,
    user,
    dataRevision,
    authError,
    syncConflict,
    signIn,
    signUp,
    signOut,
    clearError,
    resolveConflict,
    refreshFromCloud,
  };
}
