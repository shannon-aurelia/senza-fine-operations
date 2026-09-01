"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import AuthScreen from "./components/auth-screen";
import StaffLogin, { StaffUser } from "./components/staff-login";
import { DailyOperationsView, daysUntil, ExpiryView, InsightsView, InventoryView, normalizeSheetData, PurchasingView, ReceivingView, ReportsView, SheetData, UsageView, UsersView } from "./components/operations";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "./lib/supabase";

type Theme = "dark" | "light";

const navItems = [
  ["Overview", "⌂"],
  ["Inventory", "▣"],
  ["Item Usage", "−"],
  ["Purchasing", "▤"],
  ["Receiving", "↓"],
  ["Reports", "▥"],
  ["Users", "♙"],
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

function Dashboard({ data, navigate }: { data: SheetData; navigate: (section: string) => void }) {
  const max = Math.max(...sales);
  const points = sales.map((v, i) => `${i * (100 / 6)},${92 - (v / max) * 72}`).join(" ");
  const activeRecords = data.inventory.filter((item) => item.qty > 0);
  const expired = data.inventory.filter((item) => item.qty > 0 && (daysUntil(item.expDate) ?? 0) < 0);
  const expiring = data.inventory.filter((item) => { const days = daysUntil(item.expDate); return item.qty > 0 && days != null && days >= 0 && days <= 7; });
  return (
    <>
      <section className="kpi-grid" aria-label="Key performance indicators">
        <article className="kpi-card blue"><div className="kpi-icon">▣</div><div><span>Active stock records</span><strong>{activeRecords.length || 437}</strong><small>Across Soho and Outlet</small></div></article>
        <article className="kpi-card red"><div className="kpi-icon">◷</div><div><span>Expired batches</span><strong>{data.inventory.length ? expired.length : 4}</strong><small>Action required today</small></div></article>
        <article className="kpi-card amber"><div className="kpi-icon">△</div><div><span>Expiring in 7 days</span><strong>{data.inventory.length ? expiring.length : 4}</strong><small>{data.inventory.length ? `${expiring.reduce((sum, item) => sum + item.qty, 0).toLocaleString()} units exposed` : "933 units exposed"}</small></div></article>
        <article className="kpi-card green"><div className="kpi-icon">↗</div><div><span>July sales</span><strong>Rp 39.78M</strong><small>Rp 1.37M daily average</small></div></article>
      </section>

      <section className="dashboard-grid">
        <article className="panel attention-panel">
          <div className="panel-heading"><div><p className="eyebrow">Decision board</p><h2>What needs your attention</h2></div><span className="azumie-tag">✦ Azumie priority</span></div>
          <div className="action-list">
            <div className="action-row"><span className="rank">01</span><div className="action-copy"><strong>Remove {data.inventory.length ? expired.length : "four"} expired batches</strong><span>Prevent accidental use and record the waste reason.</span></div><div className="impact"><small>IMPACT</small><b>Safety</b></div><button onClick={() => navigate("Expiry & Waste")}>Review items</button></div>
            <div className="action-row"><span className="rank">02</span><div className="action-copy"><strong>Use near-expiry stock first</strong><span>{data.inventory.length ? `${expiring.length} batches need attention within seven days.` : "6 bags across both locations expire tomorrow."}</span></div><div className="impact"><small>AT RISK</small><b>{data.inventory.length ? expiring.reduce((sum, item) => sum + item.qty, 0) : 6} units</b></div><button onClick={() => navigate("Expiry & Waste")}>Plan usage</button></div>
            <div className="action-row"><span className="rank">03</span><div className="action-copy"><strong>Review July sales volatility</strong><span>Daily revenue ranged from Rp166K to Rp2.75M.</span></div><div className="impact positive"><small>OPPORTUNITY</small><b>Demand</b></div><button onClick={() => navigate("Azumie Insights")}>View insight</button></div>
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

export default function Home() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [section, setSection] = useState("Overview");
  const [liveSync, setLiveSync] = useState<"checking" | "live" | "snapshot" | "error">("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessReady, setAccessReady] = useState(false);
  const [emergencyPin, setEmergencyPin] = useState("");
  const [staffToken, setStaffToken] = useState("");
  const [staffUser, setStaffUser] = useState<StaffUser | null>(null);
  const [sheetData, setSheetData] = useState<SheetData>({ inventory: [], catalog: [], purchases: [], usage: [], receipts: [], users: [], names: [], locs: ["Soho", "Outlet"], reasons: ["Used", "Expired", "Spoiled", "Spilled", "Damaged", "Other"] });
  const [refreshKey, setRefreshKey] = useState(0);
  const authRequired = false;
  useEffect(() => {
    const savedPin = window.sessionStorage.getItem("senza-emergency-pin") || "";
    const savedToken = window.sessionStorage.getItem("senza-staff-session") || "";
    const savedUser = window.sessionStorage.getItem("senza-staff-user");
    window.queueMicrotask(() => {
      setEmergencyPin(savedPin);
      setStaffToken(savedToken);
      if (savedUser) { try { setStaffUser(JSON.parse(savedUser) as StaffUser); } catch { window.sessionStorage.removeItem("senza-staff-user"); } }
      setAccessReady(true);
    });
  }, []);
  useEffect(() => { const saved = window.localStorage.getItem("senza-theme") as Theme | null; if (saved) window.queueMicrotask(() => setTheme(saved)); }, []);
  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { window.queueMicrotask(() => setAuthReady(true)); return; }
    const prepareSession = async (nextSession: Session | null) => {
      if (nextSession?.user?.email) {
        const user = nextSession.user;
        const email = user.email;
        if (!email) return;
        const { data: profile } = await supabase.from("sf_auth_profiles").select("app_scope").eq("id", user.id).maybeSingle();
        if (profile?.app_scope !== "senza-fine") {
          const name = String(user.user_metadata?.full_name || user.user_metadata?.name || email.split("@")[0]);
          const department = ["Floor", "Kitchen", "Utilities", "Staff"].includes(user.user_metadata?.department) ? user.user_metadata.department : "Staff";
          await supabase.from("sf_auth_profiles").upsert({ id: user.id, name, email: email.toLowerCase(), department, role: "staff", active: false, app_scope: "senza-fine", updated_at: new Date().toISOString() }, { onConflict: "id" });
        }
      }
      setSession(nextSession);
      setAuthReady(true);
    };
    supabase.auth.getSession().then(({ data }) => { void prepareSession(data.session); });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => { window.setTimeout(() => { void prepareSession(nextSession); }, 0); });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!accessReady || (!emergencyPin && !staffToken && !session) || (authRequired && !session && !emergencyPin && !staffToken)) return;
    let active = true;
    const sync = async () => {
      try {
        const response = await fetch("/api/sheets", {
          cache: "no-store",
          headers: {
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
            ...(emergencyPin ? { "x-senza-emergency-pin": emergencyPin } : {}),
            ...(staffToken ? { "x-senza-session": staffToken } : {}),
          },
        });
        const data = await response.json();
        if (active) {
          if (response.ok) {
            setSheetData(normalizeSheetData(data));
            setLiveSync(data.configured === false || data.syncStatus === "snapshot" ? "snapshot" : "live");
          } else {
            if (response.status === 401 && emergencyPin) {
              window.sessionStorage.removeItem("senza-emergency-pin");
              setEmergencyPin("");
            }
            if (response.status === 401 && staffToken) {
              window.sessionStorage.removeItem("senza-staff-session"); window.sessionStorage.removeItem("senza-staff-user"); setStaffToken(""); setStaffUser(null);
            }
            setLiveSync("error");
          }
        }
      } catch { if (active) setLiveSync("error"); }
    };
    sync();
    const timer = window.setInterval(sync, 30000);
    return () => { active = false; window.clearInterval(timer); };
  }, [accessReady, authReady, authRequired, emergencyPin, staffToken, session, refreshKey]);
  const submitAction = async (payload: Record<string, unknown>) => {
    try {
      const response = await fetch("/api/sheets", { method: "POST", headers: { "content-type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}), ...(emergencyPin ? { "x-senza-emergency-pin": emergencyPin } : {}), ...(staffToken ? { "x-senza-session": staffToken } : {}) }, body: JSON.stringify(payload) });
      const result = await response.json();
      const ok = response.ok && (result.ok !== false) && !result.error;
      if (ok) setRefreshKey((value) => value + 1);
      return { ok, message: ok ? (result.message || "Saved successfully.") : (result.error || result.message || "The update could not be saved.") };
    } catch { return { ok: false, message: "The operations database could not be reached." }; }
  };
  const toggleTheme = () => setTheme((current) => { const next = current === "dark" ? "light" : "dark"; window.localStorage.setItem("senza-theme", next); return next; });
  if (!accessReady || (!emergencyPin && !staffToken && !authReady)) return <main className="auth-loading">Opening Senza Fine Operations…</main>;
  if (!emergencyPin && !staffToken && !session) return <StaffLogin/>;
  if (authRequired && !session && !staffToken) return <AuthScreen setupRequired={!isSupabaseConfigured()} />;
  const displayName = staffUser?.name || session?.user.user_metadata?.full_name || session?.user.user_metadata?.name || "Owner";
  const initial = String(displayName).charAt(0).toUpperCase();
  const isOwner = Boolean(emergencyPin) || staffUser?.role === "owner" || session?.user.email?.toLowerCase() === "aureliawwshan@gmail.com";
  const signOut = async () => { if (staffToken) await submitAction({ action: "logout" }); await getSupabaseBrowserClient()?.auth.signOut(); window.sessionStorage.removeItem("senza-emergency-pin"); window.sessionStorage.removeItem("senza-staff-session"); window.sessionStorage.removeItem("senza-staff-user"); setEmergencyPin(""); setStaffToken(""); setStaffUser(null); };
  return (
    <main className="app-shell" data-theme={theme}>
      <aside className="sidebar">
        <div className="brand"><img src="/senza-fine-logo.jpeg" alt="Senza Fine"/><div><strong>Senza Fine</strong><span>Operations</span></div></div>
        <nav>{navItems.filter(([label]) => label !== "Users" || isOwner).map(([label, icon]) => <button key={label} className={section === label ? "active" : ""} onClick={() => setSection(label)}><span>{icon}</span>{label}</button>)}</nav>
        <div className="sidebar-footer"><div className="sync"><i className={liveSync}/><div><strong>Operations database</strong><span>{liveSync === "live" ? "Live · refreshes every 30s" : liveSync === "checking" ? "Checking connection…" : liveSync === "snapshot" ? "Recovery snapshot" : "Connection needs attention"}</span></div></div><small>Powered by <b>Azumie</b></small></div>
      </aside>
      <section className="workspace">
        <header className="topbar"><div><p>Live requests, receiving, usage, and inventory</p><h1>{section === "Overview" ? `Good afternoon, ${String(displayName).split(" ")[0]}` : section}</h1></div><div className="top-actions"><button className="location">⌖ <span>{staffUser?.department || "All locations"}</span>⌄</button><ThemeToggle theme={theme} onToggle={toggleTheme}/><button className="profile" onClick={signOut} title="Sign out"><span>{initial}</span><div><strong>{displayName}</strong><small>{isOwner ? "Owner" : staffUser?.role === "reviewer" ? "Reviewer" : "Staff"}</small></div></button></div></header>
        <div className="content">
          {section === "Overview" ? <Dashboard data={sheetData} navigate={setSection}/> : null}
          {section === "Inventory" ? <InventoryView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)}/> : null}
          {section === "Item Usage" ? <UsageView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)}/> : null}
          {section === "Purchasing" ? <PurchasingView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)} accessRole={isOwner ? "owner" : staffUser?.role || "staff"} operatorName={displayName}/> : null}
          {section === "Receiving" ? <ReceivingView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)}/> : null}
          {section === "Reports" ? <ReportsView data={sheetData}/> : null}
          {section === "Users" && isOwner ? <UsersView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)}/> : null}
          {section === "Expiry & Waste" ? <ExpiryView data={sheetData} submit={submitAction} onRefresh={() => setRefreshKey((value) => value + 1)}/> : null}
          {section === "Daily Operations" ? <DailyOperationsView data={sheetData} submit={submitAction}/> : null}
          {section === "Azumie Insights" ? <InsightsView data={sheetData} navigate={setSection}/> : null}
        </div>
      </section>
    </main>
  );
}
