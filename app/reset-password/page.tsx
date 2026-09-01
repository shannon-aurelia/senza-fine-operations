"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => setReady(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password") || "");
    const confirmation = String(form.get("confirmation") || "");
    if (password.length < 10) {
      setError("Password must contain at least 10 characters.");
      setBusy(false);
      return;
    }
    if (password !== confirmation) {
      setError("The two passwords do not match.");
      setBusy(false);
      return;
    }
    const { error: updateError } = await getSupabaseBrowserClient().auth.updateUser({ password });
    if (updateError) setError(updateError.message);
    else {
      setMessage("Password updated successfully. You can now sign in.");
      await getSupabaseBrowserClient().auth.signOut();
    }
    setBusy(false);
  }

  return <main className="auth-page staff-auth"><section className="auth-card"><div className="auth-brand"><Image src="/senza-fine-logo.jpeg" alt="Senza Fine" width={64} height={64}/><div><strong>Senza Fine</strong><span>Operations</span></div></div><p className="eyebrow">Account recovery</p><h1>Choose a new password.</h1>{!ready && !message ? <p className="auth-copy">Open this page using the password-reset link sent to your email. The secure link may take a moment to verify.</p> : null}{ready && !message ? <form className="emergency-form" onSubmit={updatePassword}><label><span>New password</span><input name="password" type="password" minLength={10} autoComplete="new-password" required placeholder="Minimum 10 characters"/></label><label><span>Confirm new password</span><input name="confirmation" type="password" minLength={10} autoComplete="new-password" required placeholder="Repeat the new password"/></label><button className="primary-button" disabled={busy}>{busy ? "Updating…" : "Update password"}</button></form> : null}{error ? <p className="auth-message">{error}</p> : null}{message ? <p className="auth-message success">{message}</p> : null}<Link className="auth-text-button" href="/">Return to sign in</Link></section></main>;
}
