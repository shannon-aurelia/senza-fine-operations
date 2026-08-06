"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";

export type InventoryItem = {
  type: string;
  sku: string;
  brand: string;
  name: string;
  detail: string;
  qty: number;
  uom: string;
  loc: string;
  expDate: string;
  recDate: string;
  remarks: string;
  weight: number;
};

export type SheetData = {
  inventory: InventoryItem[];
  names: string[];
  locs: string[];
  reasons: string[];
};

type SubmitAction = (payload: Record<string, unknown>) => Promise<{ ok: boolean; message: string }>;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizeSheetData(payload: Record<string, unknown>): SheetData {
  const source = Array.isArray(payload.inventory) ? payload.inventory : Array.isArray(payload.items) ? payload.items : [];
  const inventory = source.map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const name = text(item.name || item.itemName);
    const brand = text(item.brand);
    return {
      type: text(item.type), sku: text(item.sku), brand, name,
      detail: text(item.detail) || [brand, name].filter(Boolean).join(" - "),
      qty: number(item.qty ?? item.quantity), uom: text(item.uom) || "unit",
      loc: text(item.loc || item.location), expDate: text(item.expDate || item.expiryDate),
      recDate: text(item.recDate || item.receivedDate), remarks: text(item.remarks),
      weight: number(item.weight),
    };
  });
  const unique = (values: unknown[], fallback: string[]) => {
    const result = [...new Set(values.map(text).filter(Boolean))];
    return result.length ? result : fallback;
  };
  return {
    inventory,
    names: unique(Array.isArray(payload.names) ? payload.names : [], []),
    locs: unique(Array.isArray(payload.locs) ? payload.locs : inventory.map((item) => item.loc), ["Soho", "Outlet"]),
    reasons: unique(Array.isArray(payload.reasons) ? payload.reasons : [], ["Used", "Expired", "Spoiled", "Spilled", "Damaged", "Other"]),
  };
}

function dateValue(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function daysUntil(value: string) {
  const date = dateValue(value);
  if (!date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  date.setHours(0, 0, 0, 0);
  return Math.ceil((date.getTime() - today.getTime()) / 86400000);
}

function formatDate(value: string) {
  const date = dateValue(value);
  return date ? new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(date) : "Not recorded";
}

function StatusBanner({ status }: { status: { tone: string; message: string } | null }) {
  return status ? <div className={`form-status ${status.tone}`}>{status.message}</div> : null;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><span>◇</span><strong>{title}</strong><p>{copy}</p></div>;
}

export function InventoryView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const [location, setLocation] = useState("All");
  const [type, setType] = useState("All");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const types = useMemo(() => [...new Set(data.inventory.map((item) => item.type).filter(Boolean))].sort(), [data.inventory]);
  const filtered = useMemo(() => data.inventory.filter((item) => {
    const matchesQuery = !deferredQuery || [item.detail, item.sku, item.type, item.brand, item.name].join(" ").toLowerCase().includes(deferredQuery);
    return matchesQuery && (location === "All" || item.loc === location) && (type === "All" || item.type === type);
  }), [data.inventory, deferredQuery, location, type]);
  const total = filtered.reduce((sum, item) => sum + item.qty, 0);

  async function stockOut(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const outQty = number(form.get("outQty"));
    if (outQty <= 0 || outQty > selected.qty) {
      setStatus({ tone: "error", message: `Enter a quantity between 1 and ${selected.qty}.` });
      setSubmitting(false);
      return;
    }
    const result = await submit({
      action: "stockOut", name: text(form.get("name")), location: selected.loc,
      type: selected.type, sku: selected.sku, brand: selected.brand, detail: selected.detail,
      expDate: selected.expDate, recDate: selected.recDate, outQty, qty: outQty,
      uom: selected.uom, reason: text(form.get("reason")), remarks: text(form.get("remarks")),
    });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    setSubmitting(false);
    if (result.ok) { setSelected(null); onRefresh(); }
  }

  return <section className="module-page">
    <div className="module-heading"><div><p className="eyebrow">Live stock control</p><h2>Inventory</h2><p>Search every active batch and record stock movements without opening the spreadsheet.</p></div><button className="secondary-button" onClick={onRefresh}>↻ Refresh data</button></div>
    <div className="mini-kpis"><article><span>Visible batches</span><strong>{filtered.length}</strong></article><article><span>Total visible quantity</span><strong>{total.toLocaleString()}</strong></article><article><span>Locations</span><strong>{data.locs.length}</strong></article></div>
    <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU, brand, or type" /></label><select value={location} onChange={(event) => setLocation(event.target.value)}><option>All</option>{data.locs.map((item) => <option key={item}>{item}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value)}><option>All</option>{types.map((item) => <option key={item}>{item}</option>)}</select></div>
    <StatusBanner status={status}/>
    {filtered.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>SKU</th><th>Location</th><th>Received</th><th>Expiry</th><th>Quantity</th><th></th></tr></thead><tbody>{filtered.map((item, index) => { const days = daysUntil(item.expDate); return <tr key={`${item.sku}-${item.loc}-${item.expDate}-${index}`}><td><strong>{item.detail || item.name || "Unnamed item"}</strong><span>{item.type || "Uncategorized"}</span></td><td>{item.sku || "—"}</td><td><span className="location-chip">{item.loc || "Unknown"}</span></td><td>{formatDate(item.recDate)}</td><td><span className={days == null ? "risk neutral" : days < 0 ? "risk expired" : days <= 7 ? "risk warning" : "risk safe"}>{days == null ? "Not recorded" : days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `${days} days`}</span></td><td><strong>{item.qty.toLocaleString()}</strong> {item.uom}</td><td><button className="row-button" onClick={() => { setSelected(item); setStatus(null); }}>Stock out</button></td></tr>; })}</tbody></table></div> : <EmptyState title="No inventory matches" copy="Try a different search or filter."/>}
    {selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><form className="action-modal" onSubmit={stockOut} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Stock movement</p><h3>{selected.detail}</h3><span>{selected.qty} {selected.uom} available at {selected.loc}</span></div><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></div><div className="form-grid"><label><span>Processed by</span><input name="name" required placeholder="Employee name" list="staff-names"/></label><label><span>Quantity out</span><input name="outQty" type="number" min="1" max={selected.qty} required/></label><label><span>Reason</span><select name="reason" required><option value="">Select reason</option>{data.reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label className="wide"><span>Remarks</span><textarea name="remarks" rows={3} placeholder="Optional note"/></label></div><datalist id="staff-names">{data.names.map((name) => <option key={name} value={name}/>)}</datalist><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? "Saving…" : "Confirm stock out"}</button></div></form></div> : null}
  </section>;
}

type PurchaseLine = { id: number; item: string; sku: string; qty: string; uom: string; location: string };

export function PurchasingView({ data, submit }: { data: SheetData; submit: SubmitAction }) {
  const [lines, setLines] = useState<PurchaseLine[]>([{ id: 1, item: "", sku: "", qty: "", uom: "", location: "Outlet" }]);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const catalog = useMemo(() => [...new Map(data.inventory.map((item) => [`${item.sku}|${item.detail}`, item])).values()].sort((a, b) => a.detail.localeCompare(b.detail)), [data.inventory]);
  function updateLine(id: number, changes: Partial<PurchaseLine>) { setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line)); }
  function chooseItem(id: number, value: string) { const item = catalog.find((entry) => `${entry.sku}|${entry.detail}` === value); if (item) updateLine(id, { item: item.detail, sku: item.sku, uom: item.uom, location: item.loc || "Outlet" }); }
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validLines = lines.filter((line) => line.item && number(line.qty) > 0);
    if (!validLines.length) { setStatus({ tone: "error", message: "Add at least one item with a requested quantity." }); return; }
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const result = await submit({ action: "purchaseRequest", name: text(form.get("name")), requestedBy: text(form.get("name")), email: text(form.get("email")), remarks: text(form.get("remarks")), items: validLines.map((line) => ({ type: data.inventory.find((item) => item.sku === line.sku)?.type || "", sku: line.sku, itemName: line.item, detail: line.item, qtyRequested: number(line.qty), qty: number(line.qty), uom: line.uom, location: line.location })) });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    setSubmitting(false);
    if (result.ok) setLines([{ id: Date.now(), item: "", sku: "", qty: "", uom: "", location: "Outlet" }]);
  }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">Procurement workflow</p><h2>Purchase requisition</h2><p>Create a multi-item request for review and ordering.</p></div><span className="live-badge">Writes to Google Sheets</span></div><form className="workflow-card" onSubmit={submitRequest}><div className="workflow-title"><div><span>Step 1 of 4</span><strong>New requisition</strong></div><div className="workflow-steps"><i className="active">Request</i><i>Approval</i><i>Order</i><i>Receive</i></div></div><div className="form-grid purchase-meta"><label><span>Requested by</span><input name="name" required placeholder="Employee name" list="requester-names"/></label><label><span>Email</span><input name="email" type="email" placeholder="Optional notification email"/></label></div><datalist id="requester-names">{data.names.map((name) => <option key={name} value={name}/>)}</datalist><div className="line-items"><div className="line-header"><span>Item</span><span>Location</span><span>Qty</span><span>UOM</span><span></span></div>{lines.map((line) => <div className="line-row" key={line.id}><select value={line.item ? `${line.sku}|${line.item}` : ""} onChange={(event) => chooseItem(line.id, event.target.value)} required><option value="">Select inventory item</option>{catalog.map((item) => <option key={`${item.sku}|${item.detail}`} value={`${item.sku}|${item.detail}`}>{item.detail} · {item.sku}</option>)}</select><select value={line.location} onChange={(event) => updateLine(line.id, { location: event.target.value })}>{data.locs.map((loc) => <option key={loc}>{loc}</option>)}</select><input value={line.qty} onChange={(event) => updateLine(line.id, { qty: event.target.value })} type="number" min="1" placeholder="0" required/><input value={line.uom} onChange={(event) => updateLine(line.id, { uom: event.target.value })} placeholder="UOM" required/><button type="button" onClick={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.id !== line.id))} aria-label="Remove item">×</button></div>)}</div><button type="button" className="add-line" onClick={() => setLines((current) => [...current, { id: Date.now(), item: "", sku: "", qty: "", uom: "", location: data.locs[0] || "Outlet" }])}>+ Add another item</button><label className="remarks-field"><span>Request notes</span><textarea name="remarks" rows={3} placeholder="Supplier preference, urgency, or other context"/></label><StatusBanner status={status}/><div className="form-footer"><span>{lines.filter((line) => line.item).length} item(s) in request</span><button className="primary-button" disabled={submitting}>{submitting ? "Submitting…" : "Submit for approval"}</button></div></form></section>;
}

export function ExpiryView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const [range, setRange] = useState("30");
  const [location, setLocation] = useState("All");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const risky = useMemo(() => data.inventory.map((item) => ({ item, days: daysUntil(item.expDate) })).filter((row) => row.days != null && row.item.qty > 0 && row.days <= number(range) && (location === "All" || row.item.loc === location)).sort((a, b) => (a.days ?? 0) - (b.days ?? 0)), [data.inventory, range, location]);
  const expired = risky.filter((row) => (row.days ?? 0) < 0).length;
  const thisWeek = risky.filter((row) => (row.days ?? 99) >= 0 && (row.days ?? 99) <= 7).length;
  async function recordWaste(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!selected) return; const form = new FormData(event.currentTarget); const qty = number(form.get("qty")); const result = await submit({ action: "stockOut", name: text(form.get("name")), location: selected.loc, type: selected.type, sku: selected.sku, brand: selected.brand, detail: selected.detail, expDate: selected.expDate, recDate: selected.recDate, outQty: qty, qty, uom: selected.uom, reason: text(form.get("reason")) || "Expired", remarks: text(form.get("remarks")) }); setStatus({ tone: result.ok ? "success" : "error", message: result.message }); if (result.ok) { setSelected(null); onRefresh(); } }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">FIFO control</p><h2>Expiry and waste</h2><p>Work from the most urgent batch first and record waste against the correct stock row.</p></div><div className="filter-inline"><select value={location} onChange={(event) => setLocation(event.target.value)}><option>All</option>{data.locs.map((loc) => <option key={loc}>{loc}</option>)}</select><select value={range} onChange={(event) => setRange(event.target.value)}><option value="7">Next 7 days</option><option value="14">Next 14 days</option><option value="30">Next 30 days</option><option value="90">Next 90 days</option></select></div></div><div className="mini-kpis"><article className="danger"><span>Expired batches</span><strong>{expired}</strong></article><article className="warning"><span>Due within 7 days</span><strong>{thisWeek}</strong></article><article><span>Quantity at risk</span><strong>{risky.reduce((sum, row) => sum + row.item.qty, 0).toLocaleString()}</strong></article></div><StatusBanner status={status}/>{risky.length ? <div className="expiry-board">{risky.map(({ item, days }, index) => <article key={`${item.sku}-${item.loc}-${index}`} className={(days ?? 0) < 0 ? "expired-card" : (days ?? 0) <= 7 ? "warning-card" : ""}><div className="expiry-count"><strong>{days == null ? "—" : days < 0 ? Math.abs(days) : days}</strong><span>{days != null && days < 0 ? "days overdue" : "days left"}</span></div><div className="expiry-main"><span>{item.type} · {item.loc}</span><h3>{item.detail}</h3><p>Batch expires {formatDate(item.expDate)} · Received {formatDate(item.recDate)}</p></div><div className="expiry-qty"><strong>{item.qty}</strong><span>{item.uom}</span></div><button className="row-button" onClick={() => setSelected(item)}>Record waste</button></article>)}</div> : <EmptyState title="No batches in this window" copy="There are no recorded expiry dates matching these filters."/>}{selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><form className="action-modal compact" onSubmit={recordWaste} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Waste record</p><h3>{selected.detail}</h3><span>{selected.qty} {selected.uom} available</span></div><button type="button" onClick={() => setSelected(null)}>×</button></div><div className="form-grid"><label><span>Processed by</span><input name="name" required list="waste-names"/></label><label><span>Quantity</span><input name="qty" type="number" min="1" max={selected.qty} required/></label><label><span>Reason</span><select name="reason" defaultValue={daysUntil(selected.expDate) != null && (daysUntil(selected.expDate) ?? 0) < 0 ? "Expired" : "Spoiled"}>{data.reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label className="wide"><span>Remarks</span><textarea name="remarks" rows={3}/></label></div><datalist id="waste-names">{data.names.map((name) => <option key={name} value={name}/>)}</datalist><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button">Save waste record</button></div></form></div> : null}</section>;
}

const checklistGroups = {
  Opening: ["Dining area is clean and ready", "POS and payment devices are online", "Ingredient stations are stocked", "Cold storage temperature checked"],
  Service: ["Team briefing completed", "Critical stock issues communicated", "Customer area checked", "Waste separated and recorded"],
  Closing: ["Cash and sales handover complete", "Remaining stock secured", "Equipment switched off safely", "Closing cleanliness verified"],
};

export function DailyOperationsView({ data, submit }: { data: SheetData; submit: SubmitAction }) {
  const [group, setGroup] = useState<keyof typeof checklistGroups>("Opening");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const tasks = checklistGroups[group];
  const completed = tasks.filter((task) => checks[`${group}:${task}`]).length;
  async function submitChecklist(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setSubmitting(true); const form = new FormData(event.currentTarget); const entries = tasks.map((task) => ({ task, completed: Boolean(checks[`${group}:${task}`]) })); const result = await submit({ action: "dailyIssue", department: text(form.get("department")), shift: group, name: text(form.get("name")), location: text(form.get("location")), checks: entries, issues: text(form.get("issues")), remarks: text(form.get("issues")) }); setStatus({ tone: result.ok ? "success" : "error", message: result.message }); setSubmitting(false); if (result.ok) setChecks({}); }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">Restaurant checklist</p><h2>Daily operations</h2><p>Complete shift checks and escalate issues in the same submission.</p></div><div className="progress-ring"><strong>{completed}/{tasks.length}</strong><span>completed</span></div></div><div className="segmented-control">{Object.keys(checklistGroups).map((item) => <button key={item} className={group === item ? "active" : ""} onClick={() => setGroup(item as keyof typeof checklistGroups)}>{item}</button>)}</div><form className="daily-layout" onSubmit={submitChecklist}><div className="checklist-card"><div className="checklist-heading"><h3>{group} checklist</h3><span>{Math.round(completed / tasks.length * 100)}%</span></div>{tasks.map((task) => { const key = `${group}:${task}`; return <label className={checks[key] ? "check-row checked" : "check-row"} key={task}><input type="checkbox" checked={Boolean(checks[key])} onChange={(event) => setChecks((current) => ({ ...current, [key]: event.target.checked }))}/><span className="custom-check">✓</span><strong>{task}</strong><small>{checks[key] ? "Completed" : "Tap when completed"}</small></label>; })}</div><aside className="issue-card"><h3>Shift submission</h3><label><span>Employee</span><input name="name" required list="daily-names"/></label><label><span>Location</span><select name="location" required><option value="">Select location</option>{data.locs.map((loc) => <option key={loc}>{loc}</option>)}</select></label><label><span>Department</span><select name="department" required><option>Kitchen</option><option>Floor</option><option>Bar</option><option>Management</option></select></label><label><span>Issues or handover notes</span><textarea name="issues" rows={6} placeholder="Describe anything that needs follow-up"/></label><datalist id="daily-names">{data.names.map((name) => <option key={name} value={name}/>)}</datalist><StatusBanner status={status}/><button className="primary-button" disabled={submitting}>{submitting ? "Submitting…" : "Submit shift check"}</button></aside></form></section>;
}

export function InsightsView({ data, navigate }: { data: SheetData; navigate: (section: string) => void }) {
  const insights = useMemo(() => {
    const expired = data.inventory.filter((item) => item.qty > 0 && (daysUntil(item.expDate) ?? 999) < 0);
    const week = data.inventory.filter((item) => { const days = daysUntil(item.expDate); return item.qty > 0 && days != null && days >= 0 && days <= 7; });
    const low = data.inventory.filter((item) => item.qty > 0 && item.qty <= 3);
    const noExpiry = data.inventory.filter((item) => item.qty > 0 && !item.expDate);
    return [
      { priority: "Critical", title: `Remove ${expired.length} expired batches`, copy: expired.length ? `${expired.reduce((sum, item) => sum + item.qty, 0)} units remain recorded as usable stock.` : "No expired batches are currently recorded.", metric: expired.length, action: "Expiry & Waste" },
      { priority: "High", title: `Prioritize ${week.length} near-expiry batches`, copy: week.length ? "Use these ingredients first, promote relevant menu items, or transfer stock between locations." : "No batches expire within seven days.", metric: week.reduce((sum, item) => sum + item.qty, 0), action: "Expiry & Waste" },
      { priority: "Medium", title: `Review ${low.length} low-stock batches`, copy: "Confirm whether these quantities should trigger a purchase requisition.", metric: low.length, action: "Purchasing" },
      { priority: "Data quality", title: `Complete ${noExpiry.length} missing expiry records`, copy: "Expiry visibility improves when receiving records include batch dates.", metric: noExpiry.length, action: "Inventory" },
    ];
  }, [data.inventory]);
  return <section className="module-page"><div className="module-heading insights-heading"><div><p className="eyebrow">Decision intelligence</p><h2>Azumie insights</h2><p>Recommendations generated from the current Senza Fine inventory snapshot.</p></div><div className="azumie-orb">✦</div></div><div className="insight-hero"><div><span>Today’s operating focus</span><h3>Protect stock integrity before placing the next order.</h3><p>Resolve expired and near-expiry batches first, then use low-stock signals to make a cleaner purchase decision.</p></div><div className="hero-metric"><strong>{data.inventory.length}</strong><span>live stock records analyzed</span></div></div><div className="recommendation-grid">{insights.map((insight, index) => <article key={insight.title}><div className="recommendation-rank">{String(index + 1).padStart(2, "0")}</div><div className="recommendation-copy"><span className={`priority ${insight.priority.toLowerCase().replace(" ", "-")}`}>{insight.priority}</span><h3>{insight.title}</h3><p>{insight.copy}</p></div><div className="recommendation-action"><strong>{insight.metric.toLocaleString()}</strong><button onClick={() => navigate(insight.action)}>Take action →</button></div></article>)}</div><div className="method-note"><span>How this works</span><p>These rules currently use live quantities, batch expiry dates, and location data. Sales forecasting and purchasing optimization will become more accurate as additional transaction history is connected.</p></div></section>;
}
