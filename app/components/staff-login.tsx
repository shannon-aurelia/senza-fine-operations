"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

export type StaffUser = { id: string; name: string; email: string; department: string; role: string; mustChangePassword?: boolean };
type Mode = "login" | "signup" | "forgot";

export default function StaffLogin(_props: { onLogin?: (token: string, user: StaffUser) => void; onRecovery?: (pin: string) => void }) {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setMessage("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("The account service is not configured.");
      setBusy(false);
      return;
    }
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim().toLowerCase();
    const password = String(form.get("password") || "");

    try {
      if (mode === "login") {
        const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
        if (authError) throw authError;
      } else if (mode === "signup") {
        const name = String(form.get("name") || "").trim();
        const department = String(form.get("department") || "Staff");
        if (name.length < 2) throw new Error("Enter your full name.");
        if (password.length < 10) throw new Error("Password must contain at least 10 characters.");
        const { data, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: name, department, senza_fine: "true" },
            emailRedirectTo: window.location.origin,
          },
        });
        if (authError) throw authError;
        if (!data.session) {
          setMessage("Account created. Check your email to confirm it, then wait for Owner approval.");
        } else {
          setMessage("Account created. Your access is waiting for Owner approval.");
        }
      } else {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("If that email has an account, a secure password-reset link has been sent.");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "The account request could not be completed.");
    } finally {
      setBusy(false);
    }
  }

  async function signInWithGoogle() {
    setBusy(true);
    setError("");
    setMessage("");
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setError("The account service is not configured.");
      setBusy(false);
      return;
    }
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (authError) {
      setError(authError.message.includes("provider is not enabled")
        ? "Google sign-in is being connected. Please use email and password for now."
        : authError.message);
      setBusy(false);
    }
  }

  const title = mode === "login" ? "Sign in to Senza Fine." : mode === "signup" ? "Create your staff account." : "Reset your password.";
  const copy = mode === "login"
    ? "Use your own email and password. Every operational update will be recorded under your name."
    : mode === "signup"
      ? "Register with your real name and email. The Owner will approve your department and access."
      : "Enter your account email and we will send a secure reset link.";

  return <main className="auth-page staff-auth"><section className="auth-card"><div className="auth-brand"><Image src="/senza-fine-logo.jpeg" alt="Senza Fine" width={64} height={64}/><div><strong>Senza Fine</strong><span>Operations</span></div></div><p className="eyebrow">Secure staff access</p><h1>{title}</h1><p className="auth-copy">{copy}</p><div className="auth-mode"><button className={mode === "login" ? "active" : ""} onClick={() => switchMode("login")}>Sign in</button><button className={mode === "signup" ? "active" : ""} onClick={() => switchMode("signup")}>Create account</button></div>{mode !== "forgot" ? <button type="button" className="google-button" onClick={signInWithGoogle} disabled={busy}><b>G</b> Continue with Google</button> : null}{mode !== "forgot" ? <div className="auth-divider"><span>or use email</span></div> : null}<form className="emergency-form" onSubmit={submit}>{mode === "signup" ? <><label><span>Full name</span><input name="name" autoComplete="name" required placeholder="Your real name"/></label><label><span>Department</span><select name="department" defaultValue="Staff"><option value="Floor">Floor</option><option value="Kitchen">Kitchen</option><option value="Utilities">Utilities</option><option value="Staff">Other staff</option></select></label></> : null}<label><span>Email</span><input name="email" type="email" autoComplete="email" required placeholder="name@email.com"/></label>{mode !== "forgot" ? <label><span>Password</span><input name="password" type="password" minLength={10} autoComplete={mode === "signup" ? "new-password" : "current-password"} required placeholder="Minimum 10 characters"/></label> : null}<button className="primary-button" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset email"}</button></form>{mode === "login" ? <button type="button" className="auth-text-button" onClick={() => switchMode("forgot")}>Forgot password?</button> : null}{mode === "forgot" ? <button type="button" className="auth-text-button" onClick={() => switchMode("login")}>Back to sign in</button> : null}{error ? <p className="auth-message">{error}</p> : null}{message ? <p className="auth-message success">{message}</p> : null}<small>New accounts cannot view restaurant data until approved by the Owner.</small></section><aside className="auth-side"><div><span>Operational accountability</span><strong>Simple access, recorded responsibility.</strong><p>Purchase requests, receiving, inventory usage, and approvals are connected to the employee who performed them.</p></div></aside></main>;
}
