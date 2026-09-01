"use client";

import Image from "next/image";
import { FormEvent, useState } from "react";

export type StaffUser = { id: string; name: string; email: string; department: string; role: string; mustChangePassword?: boolean };

export default function StaffLogin({ onLogin, onRecovery }: { onLogin: (token: string, user: StaffUser) => void; onRecovery: (pin: string) => void }) {
  const [mode, setMode] = useState<"staff" | "recovery">("staff");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/sheets", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "login", email: form.get("email"), password: form.get("password") }) });
      const result = await response.json();
      if (!response.ok || !result.token) setError(result.error || "Sign in failed.");
      else onLogin(result.token, result.user);
    } catch { setError("The login service could not be reached."); }
    setBusy(false);
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const pin = String(new FormData(event.currentTarget).get("pin") || "").trim().toUpperCase();
    try {
      const response = await fetch("/api/sheets", { headers: { "x-senza-emergency-pin": pin }, cache: "no-store" });
      if (!response.ok) setError("Owner recovery PIN is incorrect.");
      else onRecovery(pin);
    } catch { setError("The recovery service could not be reached."); }
    setBusy(false);
  }

  return <main className="auth-page staff-auth"><section className="auth-card"><div className="auth-brand"><Image src="/senza-fine-logo.jpeg" alt="Senza Fine" width={64} height={64}/><div><strong>Senza Fine</strong><span>Operations</span></div></div><p className="eyebrow">Secure staff access</p><h1>{mode === "staff" ? "Sign in to your account." : "Owner recovery access."}</h1><p className="auth-copy">{mode === "staff" ? "Use the email and password assigned by the Owner. Every update will be recorded under your name." : "Use this only to create accounts or recover Owner access."}</p><div className="auth-mode"><button className={mode === "staff" ? "active" : ""} onClick={() => { setMode("staff"); setError(""); }}>Staff login</button><button className={mode === "recovery" ? "active" : ""} onClick={() => { setMode("recovery"); setError(""); }}>Owner recovery</button></div>{mode === "staff" ? <form className="emergency-form" onSubmit={login}><label><span>Email</span><input name="email" type="email" autoComplete="email" required placeholder="name@senza-fine.com"/></label><label><span>Password</span><input name="password" type="password" autoComplete="current-password" required placeholder="Your password"/></label><button className="google-button" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button></form> : <form className="emergency-form" onSubmit={recover}><label><span>Owner recovery PIN</span><input name="pin" type="password" autoComplete="off" required placeholder="SF-••••-••••-••••-••••"/></label><button className="google-button" disabled={busy}>{busy ? "Verifying…" : "Open Owner recovery"}</button></form>}{error ? <p className="auth-message">{error}</p> : null}<small>Accounts and permissions are managed by the Senza Fine Owner.</small></section><aside className="auth-side"><div><span>Operational accountability</span><strong>Every action has a name.</strong><p>Purchase requests, reviews, approvals, receiving, and inventory usage are recorded under the employee who performed them.</p></div></aside></main>;
}
