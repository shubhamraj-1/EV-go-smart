"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [ready, setReady] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    setPending(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });

    setPending(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-[-.03em]">Password updated</h1>
        <p className="mt-2 text-sm text-muted">You can now sign in with your new password.</p>
        <a href="/sign-in" className="mt-5 inline-block">
          <Button>Go to sign in</Button>
        </a>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-[-.03em]">Set a new password</h1>
      <p className="mt-1.5 text-sm text-muted">Choose a password with at least 12 characters.</p>

      {!ready && (
        <p className="mt-4 rounded-xl bg-amber-soft px-3.5 py-2.5 text-sm text-amber">
          Waiting for your reset link to load…
        </p>
      )}

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="password" className="text-sm font-semibold">
            New password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-line-strong bg-surface px-3.5 py-2.5 text-sm focus:border-accent focus:ring-2 focus:ring-accent/20 focus:outline-none"
          />
        </div>

        {error && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger">
            {error}
          </p>
        )}

        <Button type="submit" disabled={pending || !ready} className="w-full">
          {pending ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
