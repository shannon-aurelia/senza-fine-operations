"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "../lib/supabase";

export default function AuthScreen({ setupRequired = false }: { setupRequired?: boolean }) {
  const [message, setMessage] = useState("");

  async function signIn() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("Supabase configuration is not available on this deployment.");
      return;
    }
    setMessage("Opening Google sign in…");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin },
    });
    if (error) setMessage(error.message);
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <img src="/senza-fine-logo.jpeg" alt="Senza Fine" />
          <div><strong>Senza Fine</strong><span>Operations</span></div>
        </div>
        <p className="eyebrow">Internal operations platform</p>
        <h1>Restaurant operations, in one place.</h1>
        <p className="auth-copy">Inventory, purchasing, expiry control, daily checklists, and Azumie recommendations for the Senza Fine team.</p>
        <button className="google-button" onClick={signIn} disabled={setupRequired}>
          <span className="google-mark">G</span>
          {setupRequired ? "Authentication setup required" : "Continue with Google"}
        </button>
        {message && <p className="auth-message">{message}</p>}
        <small>Only approved Senza Fine team accounts can continue.</small>
      </section>
      <aside className="auth-side">
        <div><span>Powered by</span><strong>Azumie</strong><p>Operational intelligence built around the way your restaurant actually works.</p></div>
      </aside>
    </main>
  );
}
