import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

const PIN_HASH = "31280f6d569c772d1a298233783981ae18f198589027afbd22b18b5aa484cba1";
const FLOOR = ["Nissa", "Rere", "Yusuf", "Sendy"];
const KITCHEN = ["Hesti", "Nadia", "Aron", "Yasri"];
const UTILITIES = ["Roni", "Ahmad"];
const ALL_STAFF = [...FLOOR, ...KITCHEN, ...UTILITIES];

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});

const clean = (value: unknown) => typeof value === "string" ? value.trim() : value == null ? "" : String(value);
const amount = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function departmentFor(name: string) {
  if (FLOOR.includes(name)) return "Floor";
  if (KITCHEN.includes(name)) return "Kitchen";
  if (UTILITIES.includes(name)) return "Utilities";
  return "";
}

function reviewerFor(department: string) {
  return department === "Floor" ? "Nissa" : department === "Kitchen" ? "Yasri" : department === "Utilities" ? "Yusuf" : "";
}

async function savePhoto(supabase: ReturnType<typeof createClient>, file: unknown, prefix: string) {
  if (!file || typeof file !== "object") return null;
  const candidate = file as Record<string, unknown>;
  const data = clean(candidate.data);
  if (!data) return null;
  const mime = clean(candidate.type) || "image/jpeg";
  const extension = mime === "application/pdf" ? "pdf" : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const bytes = Uint8Array.from(atob(data), (character) => character.charCodeAt(0));
  if (bytes.byteLength > 5_242_880) throw new Error("Photo must be smaller than 5 MB.");
  const path = `${prefix}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage.from("senza-fine-receipts").upload(path, bytes, { contentType: mime, upsert: false });
  if (error) throw error;
  return path;
}

Deno.serve(async (request: Request) => {
  try {
    const pin = request.headers.get("x-senza-emergency-pin") || "";
    if (!pin || await sha256(pin) !== PIN_HASH) return json({ ok: false, error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const body = request.method === "POST" ? await request.json().catch(() => ({})) as Record<string, unknown> : {};
    const action = request.method === "GET" ? "snapshot" : clean(body.action) || "snapshot";

    if (action === "snapshot") {
      const [inventoryResult, purchaseResult, usageResult, receiptResult] = await Promise.all([
        supabase.from("sf_inventory").select("*").order("id"),
        supabase.from("sf_purchase_requests").select("*").order("requested_at", { ascending: false }),
        supabase.from("sf_usage_transactions").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("sf_receipts").select("*").order("created_at", { ascending: false }).limit(2000),
      ]);
      const firstError = inventoryResult.error || purchaseResult.error || usageResult.error || receiptResult.error;
      if (firstError) throw firstError;
      const inventory = (inventoryResult.data || []).map((item) => ({
        id: item.id, type: item.type, sku: item.sku, brand: item.brand, name: item.item_name,
        detail: item.item_name, qty: Number(item.quantity), uom: item.uom, loc: item.location,
        expDate: item.expiry_date, recDate: item.received_date, remarks: item.remarks, weight: Number(item.weight),
      }));
      const purchases = (purchaseResult.data || []).flatMap((requestRow) => {
        const items = Array.isArray(requestRow.items) ? requestRow.items : [];
        return items.map((item: Record<string, unknown>, index: number) => ({
          requestId: requestRow.id, rowNumber: requestRow.legacy_row || 0, requestedAt: requestRow.requested_at,
          prId: requestRow.pr_id, requestedBy: requestRow.requested_by, department: requestRow.department,
          location: clean(item.location) || requestRow.location, email: requestRow.email, type: clean(item.type),
          sku: clean(item.sku), brand: clean(item.brand), itemName: clean(item.itemName), uom: clean(item.uom) || "unit",
          itemKey: clean(item.key) || `${requestRow.id}:${index}`, qtyRequested: amount(item.qtyRequested),
          qtyReceived: amount(item.qtyReceived), status: requestRow.status, designatedReviewer: requestRow.designated_reviewer,
          reviewedBy: requestRow.reviewed_by || "", reviewNote: requestRow.review_note || "",
          approvedBy: requestRow.approved_by || "", approvalNote: requestRow.approval_note || "",
          remarks: requestRow.remarks || "", preApproved: ["Approved", "Ordered", "Partially Received", "Received"].includes(requestRow.status),
          ordered: ["Ordered", "Partially Received", "Received"].includes(requestRow.status), complete: requestRow.status === "Received",
        }));
      });
      return json({ ok: true, source: "supabase-live", recoveredAt: "2026-08-26", inventory, purchases, usage: usageResult.data || [], receipts: receiptResult.data || [], names: ALL_STAFF, locs: ["Outlet", "Soho"], reasons: ["Used", "Processed", "Reallocated", "Expired", "Spoiled", "Spilled", "Damaged", "Other"] });
    }

    if (action === "purchaseRequest") {
      const requester = clean(body.requestedBy || body.name);
      const department = departmentFor(requester);
      if (!ALL_STAFF.includes(requester) || !reviewerFor(department)) return json({ ok: false, error: "Choose an authorized Floor, Kitchen, or Utilities requester." }, 400);
      const rawItems = Array.isArray(body.items) ? body.items : [];
      const items = rawItems.map((raw, index) => {
        const item = raw as Record<string, unknown>;
        return { key: crypto.randomUUID(), type: clean(item.type), sku: clean(item.sku), brand: clean(item.brand), itemName: clean(item.itemName || item.detail), uom: clean(item.uom) || "unit", qtyRequested: amount(item.qtyRequested || item.qty), qtyReceived: 0, location: clean(item.location) || "Outlet", remarks: clean(item.remarks), index };
      }).filter((item) => item.itemName && item.qtyRequested > 0);
      if (!items.length) return json({ ok: false, error: "Add at least one valid item." }, 400);
      const stamp = new Date();
      const prId = `${String(stamp.getUTCFullYear()).slice(-2)}${String(stamp.getUTCMonth() + 1).padStart(2, "0")}${String(stamp.getUTCDate()).padStart(2, "0")}-${String(stamp.getUTCHours()).padStart(2, "0")}${String(stamp.getUTCMinutes()).padStart(2, "0")}-${Math.floor(100 + Math.random() * 900)}`;
      const row = { pr_id: prId, requested_by: requester, department, location: clean(body.location) || clean(items[0].location) || "Outlet", email: clean(body.email), status: "Submitted", designated_reviewer: reviewerFor(department), items, remarks: clean(body.remarks) };
      const { data, error } = await supabase.from("sf_purchase_requests").insert(row).select("id").single();
      if (error) throw error;
      await supabase.from("sf_audit_log").insert({ actor: requester, action: "create", entity_type: "purchase_request", entity_id: data.id, details: { prId, department, itemCount: items.length } });
      return json({ ok: true, message: `Purchase request ${prId} submitted to ${reviewerFor(department)} for review.`, prId });
    }

    if (["reviewPurchase", "approvePurchase", "markOrdered", "deletePurchase"].includes(action)) {
      const requestId = clean(body.requestId);
      const { data: current, error: findError } = await supabase.from("sf_purchase_requests").select("*").eq("id", requestId).single();
      if (findError || !current) return json({ ok: false, error: "Purchase request not found." }, 404);
      if (action === "deletePurchase") {
        const { error } = await supabase.from("sf_purchase_requests").delete().eq("id", requestId);
        if (error) throw error;
        await supabase.from("sf_audit_log").insert({ actor: clean(body.actor) || "Owner", action: "delete", entity_type: "purchase_request", entity_id: requestId, details: { prId: current.pr_id } });
        return json({ ok: true, message: `Purchase request ${current.pr_id} deleted.` });
      }
      if (action === "reviewPurchase") {
        const reviewer = clean(body.reviewer);
        if (reviewer !== current.designated_reviewer) return json({ ok: false, error: `This request must be reviewed by ${current.designated_reviewer}.` }, 403);
        if (current.status !== "Submitted") return json({ ok: false, error: "Only submitted requests can be reviewed." }, 400);
        const { error } = await supabase.from("sf_purchase_requests").update({ status: "Reviewed", reviewed_by: reviewer, reviewed_at: new Date().toISOString(), review_note: clean(body.note), updated_at: new Date().toISOString() }).eq("id", requestId);
        if (error) throw error;
        return json({ ok: true, message: `${current.pr_id} reviewed and sent to the owner for approval.` });
      }
      if (action === "approvePurchase") {
        if (current.status !== "Reviewed") return json({ ok: false, error: "The reviewer must complete review first." }, 400);
        const decision = clean(body.decision) === "Rejected" ? "Rejected" : "Approved";
        const items = Array.isArray(body.items) && body.items.length ? body.items : current.items;
        const { error } = await supabase.from("sf_purchase_requests").update({ status: decision, approved_by: clean(body.actor) || "Owner", approved_at: new Date().toISOString(), approval_note: clean(body.note), items, updated_at: new Date().toISOString() }).eq("id", requestId);
        if (error) throw error;
        return json({ ok: true, message: `${current.pr_id} ${decision.toLowerCase()}.` });
      }
      if (!["Approved", "Ordered"].includes(current.status)) return json({ ok: false, error: "Only approved requests can be marked ordered." }, 400);
      const { error } = await supabase.from("sf_purchase_requests").update({ status: "Ordered", updated_at: new Date().toISOString() }).eq("id", requestId);
      if (error) throw error;
      return json({ ok: true, message: `${current.pr_id} marked as ordered.` });
    }

    if (action === "receivePurchase") {
      const requestId = clean(body.requestId);
      const itemKey = clean(body.itemKey);
      const receiver = clean(body.receiver);
      if (!ALL_STAFF.includes(receiver)) return json({ ok: false, error: "Choose a valid staff member." }, 400);
      const { data: current, error: findError } = await supabase.from("sf_purchase_requests").select("*").eq("id", requestId).single();
      if (findError || !current) return json({ ok: false, error: "Purchase request not found." }, 404);
      if (!["Approved", "Ordered", "Partially Received"].includes(current.status)) return json({ ok: false, error: "This request is not approved for receiving." }, 400);
      const items = (Array.isArray(current.items) ? current.items : []).map((item: Record<string, unknown>) => ({ ...item }));
      const index = items.findIndex((item: Record<string, unknown>) => clean(item.key) === itemKey || (!itemKey && clean(item.sku) === clean(body.sku) && clean(item.itemName) === clean(body.itemName)));
      if (index < 0) return json({ ok: false, error: "Purchase item not found." }, 404);
      const received = amount(body.qtyReceived);
      const remaining = amount(items[index].qtyRequested) - amount(items[index].qtyReceived);
      if (received <= 0 || received > remaining) return json({ ok: false, error: `Receive between 0.01 and ${remaining}.` }, 400);
      const packagePath = await savePhoto(supabase, body.packagePhoto, `${current.pr_id}/package`);
      const invoicePath = await savePhoto(supabase, body.invoicePhoto, `${current.pr_id}/invoice`);
      items[index].qtyReceived = amount(items[index].qtyReceived) + received;
      const complete = items.every((item: Record<string, unknown>) => amount(item.qtyReceived) >= amount(item.qtyRequested));
      const status = complete ? "Received" : "Partially Received";
      const now = new Date().toISOString();
      const { error: updateError } = await supabase.from("sf_purchase_requests").update({ items, status, updated_at: now }).eq("id", requestId);
      if (updateError) throw updateError;
      const location = clean(body.location) || clean(items[index].location) || current.location;
      const expiry = clean(body.expiryDate);
      const itemName = clean(items[index].itemName);
      const { data: receipt, error: receiptError } = await supabase.from("sf_receipts").insert({ purchase_request_id: requestId, pr_id: current.pr_id, item_key: clean(items[index].key), item_name: itemName, receiver, location, quantity: received, uom: clean(items[index].uom) || "unit", expiry_date: expiry, package_photo_path: packagePath, invoice_photo_path: invoicePath, remarks: clean(body.remarks) }).select("id").single();
      if (receiptError) throw receiptError;
      const sku = clean(items[index].sku);
      const { data: stock } = await supabase.from("sf_inventory").select("id,quantity").eq("sku", sku).eq("item_name", itemName).eq("location", location).eq("expiry_date", expiry).maybeSingle();
      if (stock) await supabase.from("sf_inventory").update({ quantity: amount(stock.quantity) + received, received_date: now, updated_at: now }).eq("id", stock.id);
      else await supabase.from("sf_inventory").insert({ type: clean(items[index].type), sku, brand: clean(items[index].brand), item_name: itemName, quantity: received, uom: clean(items[index].uom) || "unit", location, expiry_date: expiry, received_date: now, remarks: `Received from ${current.pr_id}` });
      await supabase.from("sf_audit_log").insert({ actor: receiver, action: "receive", entity_type: "purchase_request", entity_id: requestId, details: { receiptId: receipt.id, itemName, quantity: received, status } });
      return json({ ok: true, message: `${received} ${clean(items[index].uom)} of ${itemName} received. Inventory updated.` });
    }

    if (action === "stockOut") {
      const employee = clean(body.name || body.employee);
      const department = clean(body.department) || departmentFor(employee);
      if (!ALL_STAFF.includes(employee)) return json({ ok: false, error: "Choose a valid staff member." }, 400);
      let query = supabase.from("sf_inventory").select("*");
      if (body.inventoryId) query = query.eq("id", amount(body.inventoryId));
      else query = query.eq("sku", clean(body.sku)).eq("item_name", clean(body.detail || body.itemName)).eq("location", clean(body.location)).eq("expiry_date", clean(body.expDate));
      const { data: stock, error: findError } = await query.limit(1).single();
      if (findError || !stock) return json({ ok: false, error: "Inventory batch not found." }, 404);
      const quantity = amount(body.qty || body.outQty);
      if (quantity <= 0 || quantity > amount(stock.quantity)) return json({ ok: false, error: `Use between 0.01 and ${stock.quantity}.` }, 400);
      const { error: updateError } = await supabase.from("sf_inventory").update({ quantity: amount(stock.quantity) - quantity, updated_at: new Date().toISOString() }).eq("id", stock.id);
      if (updateError) throw updateError;
      const { error: usageError } = await supabase.from("sf_usage_transactions").insert({ inventory_id: stock.id, employee, department, location: stock.location, quantity, uom: stock.uom, reason: clean(body.reason) || "Used", remarks: clean(body.remarks) });
      if (usageError) throw usageError;
      return json({ ok: true, message: `${stock.item_name} usage saved. Remaining stock: ${amount(stock.quantity) - quantity} ${stock.uom}.` });
    }

    if (action === "dailyIssue") {
      const employee = clean(body.name);
      if (!ALL_STAFF.includes(employee)) return json({ ok: false, error: "Choose a valid staff member." }, 400);
      const { error } = await supabase.from("sf_daily_operations").insert({ employee, department: clean(body.department), location: clean(body.location), shift: clean(body.shift), checks: Array.isArray(body.checks) ? body.checks : [], issues: clean(body.issues || body.remarks) });
      if (error) throw error;
      return json({ ok: true, message: "Shift checklist saved." });
    }

    return json({ ok: false, error: "Unsupported action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
