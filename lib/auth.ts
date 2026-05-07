"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isCloudConfigured } from "@/lib/supabase";
import { syncOnSignIn, syncOnSignOut } from "@/lib/cloud-sync";

export type AuthStatus = "disabled" | "loading" | "signed-out" | "signed-in";

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Bumps on every successful sign-in/out so callers can re-hydrate state. */
  dataRevision: number;
  /** Last error from a sign-in/sign-up attempt (cleared on next attempt). */
  authError: string | null;
};

export type AuthActions = {
  signIn: (email: string, password: string) => Promise<boolean>;
  signUp: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
};

export function useAuth(): AuthState & AuthActions {
  const [status, setStatus] = useState<AuthStatus>(() =>
    isCloudConfigured() ? "loading" : "disabled",
  );
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const lastSyncedUserId = useRef<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    // The useState initializer already set status to "disabled" when env
    // vars are missing; nothing to do here.
    if (!supabase) return;

    let cancelled = false;

    const ingest = async (session: Session | null) => {
      if (cancelled) return;
      if (session?.user) {
        const sameUser = lastSyncedUserId.current === session.user.id;
        setUser(session.user);
        setStatus("signed-in");
        if (!sameUser) {
          try {
            await syncOnSignIn(supabase, session.user.id);
          } catch (error) {
            console.warn("[lizhi-routine] sign-in sync failed", error);
          }
          lastSyncedUserId.current = session.user.id;
          if (!cancelled) setDataRevision((value) => value + 1);
        }
      } else {
        const wasSignedIn = lastSyncedUserId.current !== null;
        setUser(null);
        setStatus("signed-out");
        if (wasSignedIn) {
          syncOnSignOut();
          lastSyncedUserId.current = null;
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

  return {
    status,
    user,
    dataRevision,
    authError,
    signIn,
    signUp,
    signOut,
    clearError,
  };
}
