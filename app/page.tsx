"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "./components/auth-screen";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";

type Theme = "dark" | "light";

const navItems = [
  ["Overview", "⌂"],
  ["Inventory", "▣"],
  ["Purchasing", "▤"],
  ["Expiry & Waste", "◷"],
  ["Daily Operations", "✓"],
  ["Azumie Insights", "✦"],
];

const sales = [733000, 606000, 2748000, 166000, 647000, 893000, 1365000];
const salesLabels = ["Jul 25", "Jul 26", "Jul 27", "Jul 28", "Jul 29", "Jul 30", "Jul 31"];

const expiryRows = [
  { name: "Vivo Topping Ace", meta: "Beverage · Outlet", qty: "7 cartons", date: "Jul 30", tone: "critical", label: "Expired" },
  { name: "Pisang Goreng Premix", meta: "Topping · Soho", qty: "15 pax", date: "Aug 1", tone: "critical", label: "Expired" },
  { name: "Cheese Frankfurter", meta: "Sausage · Soho", qty: "5 bags", date: "Aug 3", tone: "high", label: "1 day" },
  { name: "Fresh Milk", meta: "Beverage · Outlet", qty: "7 cartons", date: "Aug 8", tone: "medium", label: "6 days" },
];

function formatRupiah(value: number) {
  return `Rp ${(value / 1000000).toFixed(value >= 1000000 ? 2 : 1)}M`;
}

function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  return (
    <button className="theme-toggle" onClick={onToggle} aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}>
      <span className={theme === "light" ? "active" : ""}>☀</span>
      <span className={theme === "dark" ? "active" : ""}>☾</span>
    </button>
  );
}

function Dashboard() {
  const max = Math.max(...sales);
  const points = sales.map((v, i) => `${i * (100 / 6)},${92 - (v / max) * 72}`).join(" ");
  return (
    <>
      <section className="kpi-grid" aria-label="Key performance indicators">
        <article className="kpi-card blue"><div className="kpi-icon">▣</div><div><span>Active stock records</span><strong>427</strong><small>Across Soho and Outlet</small></div></article>
        <article className="kpi-card red"><div className="kpi-icon">◷</div><div><span>Expired batches</span><strong>4</strong><small>Action required today</small></div></article>
        <article className="kpi-card amber"><div className="kpi-icon">△</div><div><span>Expiring in 7 days</span><strong>4</strong><small>933 units exposed</small></div></article>
        <article className="kpi-card green"><div className="kpi-icon">↗</div><div><span>July sales</span><strong>Rp 39.78M</strong><small>Rp 1.37M daily average</small></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel attention-panel">
          <div className="panel-heading"><div><p className="eyebrow">Decision board</p><h2>What needs your attention</h2></div><span className="azumie-tag">✦ Azumie priority</span></div>
          <div className="action-list">
            <div className="action-row"><span className="rank">01</span><div className="action-copy"><strong>Remove four expired batches</strong><span>Prevent accidental use and record the waste reason.</span></div><div className="impact"><small>IMPACT</small><b>Safety</b></div><button>Review items</button></div>
            <div className="action-row"><span className="rank">02</span><div className="action-copy"><strong>Use Cheese Frankfurter first</strong><span>6 bags across both locations expire tomorrow.</span></div><div className="impact"><small>AT RISK</small><b>6 bags</b></div><button>Plan usage</button></div>
            <div className="action-row"><span className="rank">03</span><div className="action-copy"><strong>Review July sales volatility</strong><span>Daily revenue ranged from Rp166K to Rp2.75M.</span></div><div className="impact positive"><small>OPPORTUNITY</small><b>Demand</b></div><button>View insight</button></div>
          </div>
          <div className="insight-strip"><span className="spark">✦</span><div><strong>Azumie insight</strong><p>Prioritizing expiry actions today protects stock integrity while sales patterns are reviewed for the next purchasing cycle.</p></div><a href="#insights">See all recommendations →</a></div>
        </article>

        <div className="right-stack">
          <article className="panel expiry-panel">
            <div className="panel-heading"><div><p className="eyebrow">Stock health</p><h2>Expiry risk</h2></div><a href="#expiry">View all</a></div>
            <div className="risk-bar"><i className="critical"/><i className="high"/><i className="medium"/><i className="safe"/></div>
            <div className="expiry-list">{expiryRows.map((row) => <div className="expiry-row" key={row.name}><i className={row.tone}/><div><strong>{row.name}</strong><span>{row.meta}</span></div><div className="qty"><strong>{row.qty}</strong><span>{row.date}</span></div><b className={row.tone}>{row.label}</b></div>)}</div>
          </article>

          <article className="panel sales-panel">
            <div className="panel-heading"><div><p className="eyebrow">Revenue</p><h2>Last 7 recorded days</h2></div><strong>{formatRupiah(sales.reduce((a,b)=>a+b,0))}</strong></div>
            <div className="chart"><svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Seven day sales trend"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--accent)" stopOpacity=".34"/><stop offset="1" stopColor="var(--accent)" stopOpacity="0"/></linearGradient></defs><polygon points={`0,96 ${points} 100,96`} fill="url(#area)"/><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="2.4" vectorEffect="non-scaling-stroke"/>{sales.map((v,i)=><circle key={i} cx={i*(100/6)} cy={92-(v/max)*72} r="1.8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.2" vectorEffect="non-scaling-stroke"/>)}</svg><div className="chart-labels">{salesLabels.map(x=><span key={x}>{x}</span>)}</div></div>
          </article>
        </div>
      </section>
    </>
  );
}

function Placeholder({ section }: { section: string }) {
  const descriptions: Record<string,string> = {
    Inventory: "Search every SKU, review quantities by location, inspect batch dates, and create stock movements.",
    Purchasing: "Manage requisitions, approvals, purchase orders, receiving, and purchasing history in one workflow.",
    "Expiry & Waste": "Prioritize batches by expiry risk, record waste, and turn ingredients into time-sensitive action plans.",
    "Daily Operations": "Complete and review Bar, Floor, and Kitchen checklists with issue escalation.",
    "Azumie Insights": "Translate restaurant data into prioritized recommendations and measure what changed afterward.",
  };
  return <section className="section-placeholder"><p className="eyebrow">Senza Fine Operations</p><h2>{section}</h2><p>{descriptions[section]}</p><div className="coming-grid"><article><span>Live Google Sheets</span><strong>Connection ready</strong><small>Secure API bridge setup follows the interface build.</small></article><article><span>Existing logic</span><strong>Recovered</strong><small>The original workflows are being simplified, not discarded.</small></article><article><span>Experience</span><strong>Owner + staff views</strong><small>Each role sees only the actions relevant to their work.</small></article></div></section>;
}

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [section, setSection] = useState("Overview");
  const [liveSync, setLiveSync] = useState<"checking" | "live" | "snapshot" | "error">("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const authRequired = process.env.NEXT_PUBLIC_AUTH_REQUIRED === "true";
  useEffect(() => { const saved = window.localStorage.getItem("senza-theme") as Theme | null; if (saved) window.queueMicrotask(() => setTheme(saved)); }, []);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { window.queueMicrotask(() => setAuthReady(true)); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { setSession(nextSession); setAuthReady(true); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!authReady || (authRequired && !session)) return;
    let active = true;
    const sync = async () => {
      try {
        const response = await fetch("/api/sheets", {
          cache: "no-store",
          headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
        });
        const data = await response.json();
        if (active) setLiveSync(data.ok ? "live" : data.configured === false ? "snapshot" : "error");
      } catch { if (active) setLiveSync("error"); }
    };
    sync();
    const timer = window.setInterval(sync, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authReady, authRequired, session]);
  const toggleTheme = () => setTheme((current) => { const next = current === "dark" ? "light" : "dark"; window.localStorage.setItem("senza-theme", next); return next; });
  if (!authReady) return <main className="auth-loading">Opening Senza Fine Operations…</main>;
  if (authRequired && !session) return <AuthScreen setupRequired={!isSupabaseConfigured()} />;
  const displayName = session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || "Lia";
  const initial = String(displayName).charAt(0).toUpperCase();
  const signOut = async () => { await getSupabaseBrowserClient()?.auth.signOut(); };
  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand"><img src="/senza-fine-logo.jpeg" alt="Senza Fine"/><div><strong>Senza Fine</strong><span>Operations</span></div></div>
        <nav>{navItems.map(([label, icon]) => <button key={label} className={section === label ? "active" : ""} onClick={() => setSection(label)}><span>{icon}</span>{label}</button>)}</nav>
        <div className="sidebar-footer"><div className="sync"><i className={liveSync}/><div><strong>Google Sheets</strong><span>{liveSync === "live" ? "Live · refreshes every 30s" : liveSync === "checking" ? "Checking live connection…" : liveSync === "snapshot" ? "Workbook preview" : "Connection needs attention"}</span></div></div><small>Powered by <b>Azumie</b></small></div>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><p>Sunday, August 2, 2026</p><h1>{section === "Overview" ? `Good afternoon, ${String(displayName).split(" ")[0]}` : section}</h1></div><div className="top-actions"><button className="location">⌖ <span>All locations</span>⌄</button><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="profile" onClick={session ? signOut : undefined} title={session ? "Sign out" : "Preview account"}><span>{initial}</span><div><strong>{displayName}</strong><small>{session ? "Signed in" : "Owner preview"}</small></div></button></div></header>
        <div className="content">{section === "Overview" ? <Dashboard/> : <Placeholder section={section}/>}</div>
      </section>
    </main>
  );
}
