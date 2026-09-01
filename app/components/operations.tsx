"use client";

import { FormEvent, useDeferredValue, useMemo, useState } from "react";

export type InventoryItem = {
  id: number;
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

export type PurchaseRequest = {
  requestId: string;
  itemKey: string;
  rowNumber: number;
  requestedAt: string;
  prId: string;
  requestedBy: string;
  location: string;
  email: string;
  type: string;
  sku: string;
  brand: string;
  itemName: string;
  uom: string;
  qtyRequested: number;
  preApproved: boolean;
  ordered: boolean;
  qtyReceived: number;
  complete: boolean;
  status: string;
  department: string;
  designatedReviewer: string;
  reviewedBy: string;
  reviewNote: string;
  approvedBy: string;
  approvalNote: string;
  remarks: string;
};

export type UsageRecord = { id: number; inventory_id: number; employee: string; department: string; location: string; quantity: number; uom: string; reason: string; remarks: string; created_at: string };
export type ReceiptRecord = { id: number; pr_id: string; item_name: string; receiver: string; location: string; quantity: number; uom: string; expiry_date: string; created_at: string };
export type StaffAccount = { id: string; name: string; email: string | null; department: string; role: string; active: boolean; must_change_password: boolean; last_login_at: string | null };
export type CatalogItem = { id: string; category: string; itemName: string; sku: string; brand: string; uom: string; active: boolean };

export type SheetData = {
  inventory: InventoryItem[];
  catalog: CatalogItem[];
  purchases: PurchaseRequest[];
  usage: UsageRecord[];
  receipts: ReceiptRecord[];
  users: StaffAccount[];
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

async function filePayload(value: FormDataEntryValue | null) {
  if (!(value instanceof File) || !value.size) return null;
  if (value.size > 5_242_880) throw new Error("Each photo must be smaller than 5 MB.");
  const bytes = new Uint8Array(await value.arrayBuffer());
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return { name: value.name, type: value.type, data: btoa(binary) };
}

export function normalizeSheetData(payload: Record<string, unknown>): SheetData {
  const source = Array.isArray(payload.inventory) ? payload.inventory : Array.isArray(payload.items) ? payload.items : [];
  const inventory = source.map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    const name = text(item.name || item.itemName);
    const brand = text(item.brand);
    return {
      id: number(item.id), type: text(item.type), sku: text(item.sku), brand, name,
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
  const purchaseSource = Array.isArray(payload.purchases) ? payload.purchases : [];
  const purchases = purchaseSource.map((raw) => {
    const item = (raw || {}) as Record<string, unknown>;
    return {
      requestId: text(item.requestId),
      itemKey: text(item.itemKey),
      rowNumber: number(item.rowNumber),
      requestedAt: text(item.requestedAt),
      prId: text(item.prId),
      requestedBy: text(item.requestedBy),
      location: text(item.location),
      email: text(item.email),
      type: text(item.type),
      sku: text(item.sku),
      brand: text(item.brand),
      itemName: text(item.itemName || item.name),
      uom: text(item.uom) || "unit",
      qtyRequested: number(item.qtyRequested),
      preApproved: Boolean(item.preApproved),
      ordered: Boolean(item.ordered),
      qtyReceived: number(item.qtyReceived),
      complete: Boolean(item.complete),
      status: text(item.status) || (Boolean(item.complete) ? "Received" : Boolean(item.ordered) ? "Ordered" : Boolean(item.preApproved) ? "Approved" : "Submitted"),
      department: text(item.department),
      designatedReviewer: text(item.designatedReviewer),
      reviewedBy: text(item.reviewedBy), reviewNote: text(item.reviewNote), approvedBy: text(item.approvedBy), approvalNote: text(item.approvalNote), remarks: text(item.remarks),
    };
  });
  return {
    inventory,
    catalog: Array.isArray(payload.catalog) ? payload.catalog.map((raw) => {
      const item = (raw || {}) as Record<string, unknown>;
      return { id: text(item.id), category: text(item.category) || "Uncategorized", itemName: text(item.item_name || item.itemName), sku: text(item.sku), brand: text(item.brand), uom: text(item.uom) || "unit", active: item.active !== false };
    }) : [],
    purchases,
    usage: Array.isArray(payload.usage) ? payload.usage.map((raw) => raw as UsageRecord) : [],
    receipts: Array.isArray(payload.receipts) ? payload.receipts.map((raw) => raw as ReceiptRecord) : [],
    users: Array.isArray(payload.users) ? payload.users.map((raw) => raw as StaffAccount) : [],
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

function CreateItemModal({ data, submit, onClose, onCreated }: { data: SheetData; submit: SubmitAction; onClose: () => void; onCreated: () => void }) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const categories = useMemo(() => [...new Set(["Beef", "Chicken", "Vegetables", "Fruits", "Seafood", "Dairy", "Beverages", "Dry Goods", "Packaging", "Cleaning", "Utilities", ...data.catalog.map((item) => item.category), ...data.inventory.map((item) => item.type)].filter(Boolean))].sort(), [data.catalog, data.inventory]);
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setStatus(null);
    const form = new FormData(event.currentTarget);
    const result = await submit({ action: "createItem", category: text(form.get("category")), itemName: text(form.get("itemName")), sku: text(form.get("sku")), brand: text(form.get("brand")), uom: text(form.get("uom")) || "unit" });
    setBusy(false); setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) { onCreated(); window.setTimeout(onClose, 500); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="action-modal" onSubmit={create} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Item catalog</p><h3>Create a new item</h3><span>Add an item once, then select it in purchasing requests.</span></div><button type="button" onClick={onClose} aria-label="Close">×</button></div><div className="form-grid"><label><span>Category</span><input name="category" list="item-categories" required placeholder="Example: Beef"/></label><label><span>Item name</span><input name="itemName" required placeholder="Example: Sirloin"/></label><label><span>SKU</span><input name="sku" placeholder="Optional unique SKU"/></label><label><span>Brand</span><input name="brand" placeholder="Optional brand"/></label><label><span>Unit of measure</span><input name="uom" required defaultValue="kg" placeholder="kg, pack, pcs"/></label></div><datalist id="item-categories">{categories.map((category) => <option key={category} value={category}/>)}</datalist><StatusBanner status={status}/><div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Creating…" : "Create item"}</button></div></form></div>;
}

export function InventoryView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.toLowerCase());
  const [location, setLocation] = useState("All");
  const [type, setType] = useState("All");
  const [selected, setSelected] = useState<InventoryItem | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
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
      action: "stockOut", inventoryId: selected.id, name: text(form.get("name")), department: text(form.get("department")), location: selected.loc,
      type: selected.type, sku: selected.sku, brand: selected.brand, detail: selected.detail,
      expDate: selected.expDate, recDate: selected.recDate, outQty, qty: outQty,
      uom: selected.uom, reason: text(form.get("reason")), remarks: text(form.get("remarks")),
    });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    setSubmitting(false);
    if (result.ok) { setSelected(null); onRefresh(); }
  }

  return <section className="module-page">
    <div className="module-heading"><div><p className="eyebrow">Live stock control</p><h2>Inventory</h2><p>Search stock batches and manage the master item and category catalog.</p></div><div className="heading-actions"><button className="primary-button" onClick={() => setCreatingItem(true)}>+ Create item</button><button className="secondary-button" onClick={onRefresh}>↻ Refresh data</button></div></div>
    <div className="mini-kpis"><article><span>Visible batches</span><strong>{filtered.length}</strong></article><article><span>Total visible quantity</span><strong>{total.toLocaleString()}</strong></article><article><span>Locations</span><strong>{data.locs.length}</strong></article></div>
    <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search item, SKU, brand, or type" /></label><select value={location} onChange={(event) => setLocation(event.target.value)}><option>All</option>{data.locs.map((item) => <option key={item}>{item}</option>)}</select><select value={type} onChange={(event) => setType(event.target.value)}><option>All</option>{types.map((item) => <option key={item}>{item}</option>)}</select></div>
    <StatusBanner status={status}/>
    {filtered.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Item</th><th>SKU</th><th>Location</th><th>Received</th><th>Expiry</th><th>Quantity</th><th></th></tr></thead><tbody>{filtered.map((item, index) => { const days = daysUntil(item.expDate); return <tr key={`${item.sku}-${item.loc}-${item.expDate}-${index}`}><td><strong>{item.detail || item.name || "Unnamed item"}</strong><span>{item.type || "Uncategorized"}</span></td><td>{item.sku || "—"}</td><td><span className="location-chip">{item.loc || "Unknown"}</span></td><td>{formatDate(item.recDate)}</td><td><span className={days == null ? "risk neutral" : days < 0 ? "risk expired" : days <= 7 ? "risk warning" : "risk safe"}>{days == null ? "Not recorded" : days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? "Expires today" : `${days} days`}</span></td><td><strong>{item.qty.toLocaleString()}</strong> {item.uom}</td><td><button className="row-button" onClick={() => { setSelected(item); setStatus(null); }}>Stock out</button></td></tr>; })}</tbody></table></div> : <EmptyState title="No inventory matches" copy="Try a different search or filter."/>}
    {creatingItem ? <CreateItemModal data={data} submit={submit} onClose={() => setCreatingItem(false)} onCreated={onRefresh}/> : null}
    {selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><form className="action-modal" onSubmit={stockOut} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Stock movement</p><h3>{selected.detail}</h3><span>{selected.qty} {selected.uom} available at {selected.loc}</span></div><button type="button" onClick={() => setSelected(null)} aria-label="Close">×</button></div><div className="form-grid"><label><span>Processed by</span><input name="name" required placeholder="Employee name" list="staff-names"/></label><label><span>Quantity out</span><input name="outQty" type="number" min="1" max={selected.qty} required/></label><label><span>Reason</span><select name="reason" required><option value="">Select reason</option>{data.reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label><label className="wide"><span>Remarks</span><textarea name="remarks" rows={3} placeholder="Optional note"/></label></div><datalist id="staff-names">{data.names.map((name) => <option key={name} value={name}/>)}</datalist><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button" disabled={submitting}>{submitting ? "Saving…" : "Confirm stock out"}</button></div></form></div> : null}
  </section>;
}

type PurchaseLine = { id: number; item: string; sku: string; qty: string; uom: string; location: string };

export function PurchasingView({ data, submit, onRefresh, accessRole = "owner", operatorName = "" }: { data: SheetData; submit: SubmitAction; onRefresh: () => void; accessRole?: string; operatorName?: string }) {
  const [tab, setTab] = useState("Request");
  const [lines, setLines] = useState<PurchaseLine[]>([{ id: 1, item: "", sku: "", qty: "", uom: "", location: "Outlet" }]);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, number>>({});
  const catalog = useMemo(() => {
    const masterItems = data.catalog.map((item) => ({ id: 0, type: item.category, sku: item.sku, brand: item.brand, name: item.itemName, detail: [item.brand, item.itemName].filter(Boolean).join(" - "), qty: 0, uom: item.uom, loc: "Outlet", expDate: "", recDate: "", remarks: "", weight: 0 }));
    return [...new Map([...data.inventory, ...masterItems].map((item) => [`${item.sku}|${item.detail}`, item])).values()].sort((a, b) => a.detail.localeCompare(b.detail));
  }, [data.inventory, data.catalog]);
  const [creatingItem, setCreatingItem] = useState(false);
  const requestGroups = useMemo(() => {
    const groups = new Map<string, { requestId: string; prId: string; requestedAt: string; requestedBy: string; department: string; status: string; designatedReviewer: string; reviewedBy: string; reviewNote: string; approvalNote: string; items: PurchaseRequest[] }>();
    for (const item of data.purchases) {
      const key = item.requestId || item.prId;
      const group = groups.get(key) || { requestId: item.requestId, prId: item.prId, requestedAt: item.requestedAt, requestedBy: item.requestedBy, department: item.department, status: item.status, designatedReviewer: item.designatedReviewer, reviewedBy: item.reviewedBy, reviewNote: item.reviewNote, approvalNote: item.approvalNote, items: [] };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [data.purchases]);
  function updateLine(id: number, changes: Partial<PurchaseLine>) { setLines((current) => current.map((line) => line.id === id ? { ...line, ...changes } : line)); }
  function chooseItem(id: number, value: string) { const item = catalog.find((entry) => `${entry.sku}|${entry.detail}` === value); if (item) updateLine(id, { item: item.detail, sku: item.sku, uom: item.uom, location: item.loc || "Outlet" }); }
  async function submitRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const validLines = lines.filter((line) => line.item && number(line.qty) > 0);
    if (!validLines.length) { setStatus({ tone: "error", message: "Add at least one item with a requested quantity." }); return; }
    setSubmitting(true);
    const form = new FormData(event.currentTarget);
    const result = await submit({ action: "purchaseRequest", name: text(form.get("name")), requestedBy: text(form.get("name")), email: text(form.get("email")), remarks: text(form.get("remarks")), items: validLines.map((line) => ({ type: catalog.find((item) => item.sku === line.sku && item.detail === line.item)?.type || "", sku: line.sku, itemName: line.item, detail: line.item, qtyRequested: number(line.qty), qty: number(line.qty), uom: line.uom, location: line.location })) });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    setSubmitting(false);
    if (result.ok) { setLines([{ id: Date.now(), item: "", sku: "", qty: "", uom: "", location: "Outlet" }]); onRefresh(); setTab("Review"); }
  }
  async function runAction(payload: Record<string, unknown>) {
    setSubmitting(true); const result = await submit(payload); setSubmitting(false);
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) onRefresh();
  }
  const allowedTabs = accessRole === "owner" ? ["Request", "Review", "Approval", "History"] : accessRole === "reviewer" ? ["Request", "Review", "History"] : ["Request", "History"];
  const visibleGroups = (tab === "Review" ? requestGroups.filter((group) => group.status === "Submitted") : tab === "Approval" ? requestGroups.filter((group) => group.status === "Reviewed") : requestGroups).filter((group) => accessRole === "owner" || tab === "Review" || group.requestedBy === operatorName);
  return <section className="module-page">
    <div className="module-heading"><div><p className="eyebrow">Request → Review → Owner approval</p><h2>Purchasing</h2><p>Staff submit requests, assigned reviewers check them, and the owner approves, edits, rejects, or deletes them.</p></div><div className="heading-actions"><button className="secondary-button" onClick={() => setCreatingItem(true)}>+ Item not listed?</button><span className="live-badge">Live database</span></div></div>
    {creatingItem ? <CreateItemModal data={data} submit={submit} onClose={() => setCreatingItem(false)} onCreated={onRefresh}/> : null}
    <div className="segmented-control purchase-tabs">{allowedTabs.map((item) => <button type="button" key={item} className={tab === item ? "active" : ""} onClick={() => { setTab(item); setStatus(null); }}>{item}{item === "Review" ? ` (${requestGroups.filter((group) => group.status === "Submitted").length})` : item === "Approval" ? ` (${requestGroups.filter((group) => group.status === "Reviewed").length})` : ""}</button>)}</div>
    <StatusBanner status={status}/>
    {tab === "Request" ? <form className="workflow-card" onSubmit={submitRequest}><div className="workflow-title"><div><span>Step 1 of 4</span><strong>New requisition</strong></div><div className="workflow-steps"><i className="active">Request</i><i>Review</i><i>Approval</i><i>Receive</i></div></div><div className="form-grid purchase-meta"><label><span>Requested by</span><select name="name" required defaultValue=""><option value="">Select requester</option>{["Nissa","Rere","Yusuf","Sendy","Hesti","Nadia","Aron","Yasri","Roni","Ahmad"].map((name) => <option key={name}>{name}</option>)}</select></label><label><span>Department</span><select name="department" required><option>Floor</option><option>Kitchen</option><option>Utilities</option></select></label><label><span>Email</span><input name="email" type="email" placeholder="Optional notification email"/></label></div><div className="line-items"><div className="line-header"><span>Item</span><span>Location</span><span>Qty</span><span>UOM</span><span></span></div>{lines.map((line) => <div className="line-row" key={line.id}><select value={line.item ? `${line.sku}|${line.item}` : ""} onChange={(event) => chooseItem(line.id, event.target.value)} required><option value="">Select inventory item</option>{catalog.map((item) => <option key={`${item.sku}|${item.detail}`} value={`${item.sku}|${item.detail}`}>{item.detail} · {item.sku}</option>)}</select><select value={line.location} onChange={(event) => updateLine(line.id, { location: event.target.value })}>{data.locs.map((loc) => <option key={loc}>{loc}</option>)}</select><input value={line.qty} onChange={(event) => updateLine(line.id, { qty: event.target.value })} type="number" min="0.01" step="any" placeholder="0" required/><input value={line.uom} onChange={(event) => updateLine(line.id, { uom: event.target.value })} placeholder="UOM" required/><button type="button" onClick={() => setLines((current) => current.length === 1 ? current : current.filter((item) => item.id !== line.id))} aria-label="Remove item">×</button></div>)}</div><button type="button" className="add-line" onClick={() => setLines((current) => [...current, { id: Date.now(), item: "", sku: "", qty: "", uom: "", location: data.locs[0] || "Outlet" }])}>+ Add another item</button><label className="remarks-field"><span>Request notes</span><textarea name="remarks" rows={3} placeholder="Supplier preference, urgency, or other context"/></label><div className="form-footer"><span>{lines.filter((line) => line.item).length} item(s) in request</span><button className="primary-button" disabled={submitting}>{submitting ? "Submitting…" : "Submit for review"}</button></div></form> : null}
    {tab !== "Request" ? <div className="request-board">{visibleGroups.length ? visibleGroups.map((group) => <article className="request-card" key={group.requestId || group.prId}><div className="request-card-head"><div><span className={`status-chip ${group.status.toLowerCase().replaceAll(" ", "-")}`}>{group.status}</span><h3>{group.prId}</h3><p>{group.requestedBy} · {group.department || "Legacy request"} · {formatDate(group.requestedAt)}</p></div><strong>{group.items.length} item(s)</strong></div><div className="request-items">{group.items.map((item) => <div key={item.itemKey || `${item.rowNumber}-${item.sku}`}><span>{item.itemName}</span>{tab === "Approval" ? <input aria-label={`Quantity for ${item.itemName}`} type="number" min="0.01" step="any" value={approvalQuantities[item.itemKey] ?? item.qtyRequested} onChange={(event) => setApprovalQuantities((current) => ({ ...current, [item.itemKey]: number(event.target.value) }))}/> : <strong>{item.qtyRequested} {item.uom}</strong>}<small>{item.location}</small></div>)}</div>{tab === "Review" ? <div className="request-actions"><label><span>Review note</span><input value={notes[group.requestId] || ""} onChange={(event) => setNotes((current) => ({ ...current, [group.requestId]: event.target.value }))} placeholder="Availability, supplier, urgency"/></label><button className="primary-button" disabled={submitting} onClick={() => runAction({ action: "reviewPurchase", requestId: group.requestId, reviewer: group.designatedReviewer, note: notes[group.requestId] || "" })}>Review as {group.designatedReviewer}</button></div> : null}{tab === "Approval" ? <div className="request-actions owner-actions"><label><span>Owner note</span><input value={notes[group.requestId] || ""} onChange={(event) => setNotes((current) => ({ ...current, [group.requestId]: event.target.value }))} placeholder="Approval or rejection reason"/></label><button className="secondary-button danger-button" disabled={submitting} onClick={() => runAction({ action: "approvePurchase", requestId: group.requestId, decision: "Rejected", actor: "Owner", note: notes[group.requestId] || "" })}>Reject</button><button className="primary-button" disabled={submitting} onClick={() => runAction({ action: "approvePurchase", requestId: group.requestId, decision: "Approved", actor: "Owner", note: notes[group.requestId] || "", items: group.items.map((item) => ({ key: item.itemKey, type: item.type, sku: item.sku, brand: item.brand, itemName: item.itemName, uom: item.uom, qtyRequested: approvalQuantities[item.itemKey] ?? item.qtyRequested, qtyReceived: item.qtyReceived, location: item.location, remarks: item.remarks })) })}>Approve edited request</button></div> : null}{tab === "History" ? <div className="request-actions history-actions">{group.status === "Approved" ? <button className="primary-button" disabled={submitting} onClick={() => runAction({ action: "markOrdered", requestId: group.requestId })}>Mark as ordered</button> : null}<button className="secondary-button danger-button" disabled={submitting} onClick={() => { if (window.confirm(`Delete purchase request ${group.prId}?`)) runAction({ action: "deletePurchase", requestId: group.requestId, actor: "Owner" }); }}>Delete request</button></div> : null}</article>) : <EmptyState title={`No requests awaiting ${tab.toLowerCase()}`} copy={tab === "Review" ? "New staff requests will appear here." : "Reviewed requests will appear here for the owner."}/>}</div> : null}
  </section>;
}

export function UsageView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const activeItems = useMemo(() => data.inventory.map((item, index) => ({ item, key: `${index}|${item.sku}|${item.loc}|${item.expDate}` })).filter(({ item }) => item.qty > 0).sort((a, b) => a.item.detail.localeCompare(b.item.detail)), [data.inventory]);
  const [selectedKey, setSelectedKey] = useState("");
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const selected = activeItems.find((entry) => entry.key === selectedKey)?.item || null;

  async function submitUsage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const qty = number(form.get("qty"));
    if (qty <= 0 || qty > selected.qty) {
      setStatus({ tone: "error", message: `Enter a quantity between 1 and ${selected.qty}.` });
      return;
    }
    setSubmitting(true);
    const result = await submit({
      action: "stockOut",
      inventoryId: selected.id,
      name: text(form.get("name")),
      department: text(form.get("department")),
      location: selected.loc,
      type: selected.type,
      sku: selected.sku,
      brand: selected.brand,
      detail: selected.detail,
      expDate: selected.expDate,
      recDate: selected.recDate,
      outQty: qty,
      qty,
      uom: selected.uom,
      reason: text(form.get("reason")) || "Used",
      remarks: text(form.get("remarks")),
    });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    setSubmitting(false);
    if (result.ok) {
      setSelectedKey("");
      onRefresh();
      formElement.reset();
    }
  }

  return <section className="module-page">
    <div className="module-heading"><div><p className="eyebrow">Inventory movement</p><h2>Item usage</h2><p>Record ingredients and supplies used during restaurant operations.</p></div><button className="secondary-button" onClick={onRefresh}>↻ Refresh stock</button></div>
    <form className="workflow-card simple-workflow" onSubmit={submitUsage}>
      <div className="workflow-title"><div><span>Inventory usage</span><strong>New usage record</strong></div><span className="live-badge">Deducts from selected batch</span></div>
      <div className="form-grid padded-form">
        <label className="wide"><span>Inventory item</span><select value={selectedKey} onChange={(event) => setSelectedKey(event.target.value)} required><option value="">Select item and batch</option>{activeItems.map(({ item, key }) => <option key={key} value={key}>{item.detail} · {item.loc} · {item.qty.toLocaleString()} {item.uom}</option>)}</select></label>
        <label><span>Used by</span><select name="name" required defaultValue=""><option value="">Select staff member</option>{data.names.map((name) => <option key={name}>{name}</option>)}</select></label>
        <label><span>Department</span><select name="department" required><option>Kitchen</option><option>Floor</option><option>Utilities</option></select></label>
        <label><span>Quantity used</span><input name="qty" type="number" min="0.01" step="any" max={selected?.qty} required placeholder={selected ? `Max ${selected.qty}` : "0"}/></label>
        <label><span>Reason</span><select name="reason" defaultValue="Used">{data.reasons.map((reason) => <option key={reason}>{reason}</option>)}</select></label>
        <label><span>Location</span><input value={selected?.loc || ""} readOnly placeholder="From selected batch"/></label>
        <label className="wide"><span>Usage notes</span><textarea name="remarks" rows={3} placeholder="Menu item, shift, event, or other context"/></label>
      </div>
      <StatusBanner status={status}/>
      <div className="form-footer"><span>{selected ? `${selected.qty.toLocaleString()} ${selected.uom} available` : "Choose the exact stock batch used"}</span><button className="primary-button" disabled={submitting || !selected}>{submitting ? "Saving…" : "Record item usage"}</button></div>
    </form>
  </section>;
}

export function ReceivingView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("Pending");
  const [selected, setSelected] = useState<PurchaseRequest | null>(null);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const rows = useMemo(() => data.purchases.filter((item) => {
    const remaining = Math.max(0, item.qtyRequested - item.qtyReceived);
    const matches = !query || [item.prId, item.itemName, item.sku, item.requestedBy].join(" ").toLowerCase().includes(query.toLowerCase());
    const receivable = ["Approved", "Ordered", "Partially Received"].includes(item.status);
    const matchesFilter = filter === "All" || (filter === "Pending" ? remaining > 0 && receivable : remaining === 0);
    return matches && matchesFilter && (filter === "All" || receivable || remaining === 0);
  }).sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)), [data.purchases, query, filter]);

  async function submitReceipt(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    const qtyReceived = number(form.get("qtyReceived"));
    if (qtyReceived <= 0) {
      setStatus({ tone: "error", message: "Enter the quantity physically received." });
      return;
    }
    let packagePhoto = null; let invoicePhoto = null;
    try { [packagePhoto, invoicePhoto] = await Promise.all([filePayload(form.get("packagePhoto")), filePayload(form.get("invoicePhoto"))]); }
    catch (error) { setStatus({ tone: "error", message: error instanceof Error ? error.message : "The photo could not be prepared." }); return; }
    const result = await submit({
      action: "receivePurchase",
      requestId: selected.requestId,
      itemKey: selected.itemKey,
      rowNumber: selected.rowNumber,
      prId: selected.prId,
      sku: selected.sku,
      itemName: selected.itemName,
      receiver: text(form.get("receiver")),
      location: text(form.get("location")),
      expiryDate: text(form.get("expiryDate")),
      qtyReceived,
      remarks: text(form.get("remarks")),
      packagePhoto,
      invoicePhoto,
    });
    setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) {
      setSelected(null);
      onRefresh();
    }
  }

  const pending = data.purchases.filter((item) => item.qtyRequested > item.qtyReceived && ["Approved", "Ordered", "Partially Received"].includes(item.status)).length;
  return <section className="module-page">
    <div className="module-heading"><div><p className="eyebrow">Package → Check → Photos → Inventory</p><h2>Goods receiving</h2><p>Receive only approved orders, document the package and invoice, then update inventory automatically.</p></div><span className="live-badge">{pending} line(s) awaiting receipt</span></div>
    <div className="filter-bar"><label className="search-field"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search PR ID, item, SKU, or requester"/></label><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Pending</option><option>Received</option><option>All</option></select></div>
    <StatusBanner status={status}/>
    {rows.length ? <div className="data-table-wrap"><table className="data-table"><thead><tr><th>PR ID</th><th>Item</th><th>Requested by</th><th>Location</th><th>Requested</th><th>Received</th><th>Status</th><th></th></tr></thead><tbody>{rows.map((item) => { const remaining = Math.max(0, item.qtyRequested - item.qtyReceived); return <tr key={`${item.rowNumber}-${item.prId}`}><td><strong>{item.prId}</strong><span>{formatDate(item.requestedAt)}</span></td><td><strong>{item.itemName}</strong><span>{item.type} · {item.sku || "No SKU"}</span></td><td>{item.requestedBy || "—"}</td><td><span className="location-chip">{item.location || "Outlet"}</span></td><td><strong>{item.qtyRequested.toLocaleString()}</strong> {item.uom}</td><td><strong>{item.qtyReceived.toLocaleString()}</strong> {item.uom}</td><td><span className={remaining > 0 ? "risk warning" : "risk safe"}>{remaining > 0 ? `${remaining} remaining` : "Complete"}</span></td><td><button className="row-button" disabled={remaining === 0} onClick={() => { setSelected(item); setStatus(null); }}>Receive</button></td></tr>; })}</tbody></table></div> : <EmptyState title="No purchase lines found" copy="Try another filter or submit a purchase request first."/>}
    {selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><form className="action-modal" onSubmit={submitReceipt} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Receive PR {selected.prId}</p><h3>{selected.itemName}</h3><span>{Math.max(0, selected.qtyRequested - selected.qtyReceived)} {selected.uom} remaining</span></div><button type="button" onClick={() => setSelected(null)}>×</button></div><div className="form-grid"><label><span>Received by</span><select name="receiver" required defaultValue=""><option value="">Select staff member</option>{data.names.map((name) => <option key={name}>{name}</option>)}</select></label><label><span>Location</span><select name="location" defaultValue={selected.location || "Outlet"}>{data.locs.map((loc) => <option key={loc}>{loc}</option>)}</select></label><label><span>Quantity received</span><input name="qtyReceived" type="number" min="0.01" max={Math.max(0, selected.qtyRequested - selected.qtyReceived)} step="any" required/></label><label><span>Expiry date</span><input name="expiryDate" type="date"/></label><label><span>Package photo</span><input name="packagePhoto" type="file" accept="image/jpeg,image/png,image/webp" required/></label><label><span>Receipt / invoice scan</span><input name="invoicePhoto" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" required/></label><label className="wide"><span>Receiving notes</span><textarea name="remarks" rows={3} placeholder="Condition, shortage, supplier note, or batch information"/></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button">Confirm receipt and update inventory</button></div></form></div> : null}
  </section>;
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

export function ReportsView({ data }: { data: SheetData }) {
  const [report, setReport] = useState("Products");
  const [period, setPeriod] = useState("Daily");
  const productRows = useMemo(() => {
    const map = new Map<string, { name: string; sku: string; quantity: number; uom: string; locations: Set<string> }>();
    for (const item of data.inventory) {
      const key = `${item.sku}|${item.detail}|${item.uom}`;
      const row = map.get(key) || { name: item.detail, sku: item.sku, quantity: 0, uom: item.uom, locations: new Set<string>() };
      row.quantity += item.qty; row.locations.add(item.loc); map.set(key, row);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [data.inventory]);
  const expiryRows = useMemo(() => data.inventory.filter((item) => item.qty > 0 && item.expDate).toSorted((a, b) => a.expDate.localeCompare(b.expDate)), [data.inventory]);
  const activityRows = useMemo(() => {
    const inventory = new Map(data.inventory.map((item) => [item.id, item]));
    const map = new Map<string, { date: string; quantity: number; transactions: number; items: Set<string> }>();
    for (const usage of data.usage) {
      const date = new Date(usage.created_at);
      const key = period === "Monthly" ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}` : date.toISOString().slice(0, 10);
      const row = map.get(key) || { date: key, quantity: 0, transactions: 0, items: new Set<string>() };
      row.quantity += Number(usage.quantity); row.transactions += 1; row.items.add(inventory.get(usage.inventory_id)?.detail || "Item"); map.set(key, row);
    }
    return [...map.values()].sort((a, b) => b.date.localeCompare(a.date));
  }, [data.inventory, data.usage, period]);
  function downloadCsv() {
    const rows = report === "Products" ? [["Product","SKU","Quantity","UOM","Locations"], ...productRows.map((row) => [row.name,row.sku,row.quantity,row.uom,[...row.locations].join(" + ")])] : report === "Expiry" ? [["Product","SKU","Location","Expiry","Quantity","UOM"], ...expiryRows.map((item) => [item.detail,item.sku,item.loc,item.expDate,item.qty,item.uom])] : [["Period","Transactions","Quantity used","Unique products"], ...activityRows.map((row) => [row.date,row.transactions,row.quantity,row.items.size])];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"','""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); link.download = `senza-fine-${report.toLowerCase()}-${new Date().toISOString().slice(0,10)}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">Inventory reporting</p><h2>Reports</h2><p>Review stock by product, expiry date, or daily and monthly usage.</p></div><button className="secondary-button" onClick={downloadCsv}>Download CSV</button></div><div className="segmented-control">{["Products","Expiry","Activity"].map((item) => <button key={item} className={report === item ? "active" : ""} onClick={() => setReport(item)}>{item}</button>)}</div>{report === "Activity" ? <div className="filter-inline report-period"><select value={period} onChange={(event) => setPeriod(event.target.value)}><option>Daily</option><option>Monthly</option></select></div> : null}<div className="data-table-wrap"><table className="data-table">{report === "Products" ? <><thead><tr><th>Product</th><th>SKU</th><th>Locations</th><th>Total quantity</th></tr></thead><tbody>{productRows.map((row) => <tr key={`${row.sku}-${row.name}`}><td><strong>{row.name}</strong></td><td>{row.sku || "—"}</td><td>{[...row.locations].join(" + ")}</td><td><strong>{row.quantity.toLocaleString()}</strong> {row.uom}</td></tr>)}</tbody></> : report === "Expiry" ? <><thead><tr><th>Product</th><th>Location</th><th>Expiry date</th><th>Time remaining</th><th>Quantity</th></tr></thead><tbody>{expiryRows.map((item) => { const days = daysUntil(item.expDate); return <tr key={`${item.id}-${item.expDate}`}><td><strong>{item.detail}</strong><span>{item.sku}</span></td><td>{item.loc}</td><td>{formatDate(item.expDate)}</td><td><span className={(days ?? 0) < 0 ? "risk expired" : (days ?? 0) <= 7 ? "risk warning" : "risk safe"}>{days == null ? "—" : days < 0 ? `${Math.abs(days)} days overdue` : `${days} days`}</span></td><td>{item.qty} {item.uom}</td></tr>; })}</tbody></> : <><thead><tr><th>{period}</th><th>Transactions</th><th>Quantity used</th><th>Products used</th></tr></thead><tbody>{activityRows.map((row) => <tr key={row.date}><td><strong>{row.date}</strong></td><td>{row.transactions}</td><td>{row.quantity.toLocaleString()}</td><td>{row.items.size}</td></tr>)}</tbody></>}</table></div></section>;
}

export function UsersView({ data, submit, onRefresh }: { data: SheetData; submit: SubmitAction; onRefresh: () => void }) {
  const [selected, setSelected] = useState<StaffAccount | null>(null);
  const [status, setStatus] = useState<{ tone: string; message: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!selected) return; setBusy(true);
    const form = new FormData(event.currentTarget);
    const result = await submit({ action: "saveUser", id: selected.id, name: text(form.get("name")), email: selected.email, department: text(form.get("department")), role: text(form.get("role")), active: form.get("active") === "on" });
    setBusy(false); setStatus({ tone: result.ok ? "success" : "error", message: result.message });
    if (result.ok) { setSelected(null); onRefresh(); }
  }
  return <section className="module-page"><div className="module-heading"><div><p className="eyebrow">Owner controls</p><h2>Users and permissions</h2><p>Employees create their own account first. Review each registration, assign the correct department and role, then activate access.</p></div><span className="live-badge">Owner only</span></div><StatusBanner status={status}/><div className="account-grid">{data.users.length ? data.users.map((user) => <article key={user.id}><div className="account-avatar">{user.name.slice(0,1).toUpperCase()}</div><div className="account-copy"><span>{user.department} · {user.role}</span><h3>{user.name}</h3><p>{user.email}</p><small>{user.active ? "Approved and able to sign in" : "Waiting for Owner approval"}</small></div><span className={user.active ? "risk safe" : "risk warning"}>{user.active ? "Active" : "Pending"}</span><button className="row-button" onClick={() => { setSelected(user); setStatus(null); }}>{user.active ? "Edit access" : "Review"}</button></article>) : <EmptyState title="No staff registrations yet" copy="New accounts will appear here after employees register."/>}</div>{selected ? <div className="modal-backdrop" onMouseDown={() => setSelected(null)}><form className="action-modal" onSubmit={save} onMouseDown={(event) => event.stopPropagation()}><div className="modal-heading"><div><p className="eyebrow">Staff registration</p><h3>{selected.name}</h3><span>{selected.email}</span></div><button type="button" onClick={() => setSelected(null)}>×</button></div><div className="form-grid"><label className="wide"><span>Staff name</span><input name="name" defaultValue={selected.name} required/></label><label><span>Department</span><select name="department" defaultValue={selected.department}><option>Owner</option><option>Floor</option><option>Kitchen</option><option>Utilities</option><option>Staff</option></select></label><label><span>Role</span><select name="role" defaultValue={selected.role}><option value="staff">Staff</option><option value="reviewer">Reviewer</option><option value="owner">Owner</option></select></label><label className="wide active-check"><input name="active" type="checkbox" defaultChecked={selected.active}/><span>Approve this account to access Senza Fine operations</span></label></div><div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setSelected(null)}>Cancel</button><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save access"}</button></div></form></div> : null}</section>;
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
