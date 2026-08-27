"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";

export default function EmergencyAccess({ onAuthorized }: { onAuthorized: (pin: string) => void }) {
  const [pin, setPin] = useState("");
  const [message, setMessage] = useState("");
  const [checking, setChecking] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setChecking(true);
    setMessage("");
    const normalized = pin.trim().toUpperCase();
    try {
      const response = await fetch("/api/sheets", {
        cache: "no-store",
        headers: { "x-senza-emergency-pin": normalized },
      });
      if (!response.ok) {
        setMessage("Kode akses tidak valid.");
        return;
      }
      window.sessionStorage.setItem("senza-emergency-pin", normalized);
      onAuthorized(normalized);
    } catch {
      setMessage("Koneksi belum dapat diverifikasi. Silakan coba lagi.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-brand">
          <Image src="/senza-fine-logo.jpeg" alt="Senza Fine" width={56} height={56} priority />
          <div><strong>Senza Fine</strong><span>Operations</span></div>
        </div>
        <p className="eyebrow">Akses pemulihan sementara</p>
        <h1>Operasional Senza Fine</h1>
        <p className="auth-copy">Masukkan kode pemilik untuk membuka data persediaan terbaru per 26 Agustus 2026.</p>
        <form className="emergency-form" onSubmit={submit}>
          <label><span>Kode akses</span><input value={pin} onChange={(event) => setPin(event.target.value)} placeholder="SF-XXXX-XXXX-XXXX-XXXX" autoComplete="one-time-code" required /></label>
          <button className="google-button" disabled={checking}>{checking ? "Memeriksa…" : "Buka dashboard"}</button>
        </form>
        {message ? <p className="auth-message" role="alert">{message}</p> : null}
        <small>Jangan bagikan kode ini di luar pemilik dan pengelola Senza Fine.</small>
      </section>
      <aside className="auth-side"><div><span>Powered by</span><strong>Azumie</strong><p>Persediaan, penggunaan barang, purchasing, dan penerimaan barang dalam satu sistem.</p></div></aside>
    </main>
  );
}
