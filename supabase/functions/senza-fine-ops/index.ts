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

function randomToken(bytes = 32) {
  const value = crypto.getRandomValues(new Uint8Array(bytes));
  return [...value].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(salt), iterations: 150_000 }, key, 256);
  return [...new Uint8Array(bits)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sessionUser(supabase: ReturnType<typeof createClient>, token: string) {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const { data } = await supabase.from("sf_sessions").select("user_id,expires_at,sf_users(*)").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle();
  const relation = data?.sf_users as unknown;
  const user = Array.isArray(relation) ? relation[0] : relation;
  if (!user || !(user as Record<string, unknown>).active) return null;
  return user as Record<string, unknown>;
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
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const body = request.method === "POST" ? await request.json().catch(() => ({})) as Record<string, unknown> : {};
    const action = request.method === "GET" ? "snapshot" : clean(body.action) || "snapshot";

    if (action === "login") {
      const email = clean(body.email).toLowerCase();
      const password = clean(body.password);
      const { data: user } = await supabase.from("sf_users").select("*").eq("email", email).eq("active", true).maybeSingle();
      if (!user?.password_salt || !user.password_hash || await passwordHash(password, user.password_salt) !== user.password_hash) return json({ ok: false, error: "Email or password is incorrect." }, 401);
      const token = randomToken();
      const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
      await supabase.from("sf_sessions").delete().lt("expires_at", new Date().toISOString());
      const { error } = await supabase.from("sf_sessions").insert({ token_hash: await sha256(token), user_id: user.id, expires_at: expiresAt });
      if (error) throw error;
      await supabase.from("sf_users").update({ last_login_at: new Date().toISOString() }).eq("id", user.id);
      return json({ ok: true, token, expiresAt, user: { id: user.id, name: user.name, email: user.email, department: user.department, role: user.role, mustChangePassword: user.must_change_password } });
    }

    const authorization = request.headers.get("authorization") || "";
    const bearerToken = authorization.replace(/^Bearer\\s+/i, "");
    let authProfile: Record<string, unknown> | null = null;
    if (bearerToken) {
      const { data: authData, error: authError } = await supabase.auth.getUser(bearerToken);
      if (authError || !authData.user) return json({ ok: false, error: "Your session is no longer valid." }, 401);
      const { data: profile } = await supabase.from("sf_auth_profiles").select("*").eq("id", authData.user.id).maybeSingle();
      if (!profile?.active) return json({ ok: false, error: "Your Senza Fine account is waiting for Owner approval." }, 403);
      authProfile = profile as Record<string, unknown>;
    }
    const pin = request.headers.get("x-senza-emergency-pin") || "";
    const recoveryOwner = Boolean(pin) && await sha256(pin.trim().toUpperCase()) === PIN_HASH;
    const storedUser = recoveryOwner || authProfile ? null : await sessionUser(supabase, request.headers.get("x-senza-session") || "");
    if (!recoveryOwner && !authProfile && !storedUser) return json({ ok: false, error: "Sign in is required." }, 401);
    const actor = recoveryOwner ? { id: "recovery", name: "Owner", email: "", department: "Owner", role: "owner", must_change_password: false } : (authProfile || storedUser!);
    const isOwner = actor.role === "owner";

    if (action === "logout") {
      const token = request.headers.get("x-senza-session") || "";
      if (token) await supabase.from("sf_sessions").delete().eq("token_hash", await sha256(token));
      return json({ ok: true, message: "Signed out." });
    }

    if (action === "saveUser") {
      if (!isOwner) return json({ ok: false, error: "Only the Owner can manage staff accounts." }, 403);
      const id = clean(body.id);
      const email = clean(body.email).toLowerCase();
      const name = clean(body.name);
      const department = clean(body.department);
      const role = clean(body.role);
      if ((!id && !email) || !name || !["Owner", "Floor", "Kitchen", "Utilities", "Staff"].includes(department) || !["owner", "reviewer", "staff"].includes(role)) {
        return json({ ok: false, error: "Complete the staff name, department, and role." }, 400);
      }
      let lookup = supabase.from("sf_auth_profiles").select("id");
      lookup = id ? lookup.eq("id", id) : lookup.eq("email", email);
      const { data: existing } = await lookup.maybeSingle();
      if (!existing) return json({ ok: false, error: "This employee must create an account first using the same email." }, 404);
      const { error } = await supabase.from("sf_auth_profiles").update({
        name, department, role, active: body.active !== false, updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw error;
      return json({ ok: true, message: `${name}'s access has been updated.` });
    }

    if (action === "changePassword") {
      return json({ ok: false, error: "Use Forgot password on the sign-in screen to change a password securely." }, 400);
    }

    if (action === "snapshot") {
      const [inventoryResult, purchaseResult, usageResult, receiptResult, userResult] = await Promise.all([
        supabase.from("sf_inventory").select("*").order("id"),
        supabase.from("sf_purchase_requests").select("*").order("requested_at", { ascending: false }),
        supabase.from("sf_usage_transactions").select("*").order("created_at", { ascending: false }).limit(2000),
        supabase.from("sf_receipts").select("*").order("created_at", { ascending: false }).limit(2000),
        isOwner ? supabase.from("sf_auth_profiles").select("id,name,email,department,role,active,created_at").order("department").order("name") : Promise.resolve({ data: [], error: null }),
      ]);
      const firstError = inventoryResult.error || purchaseResult.error || usageResult.error || receiptResult.error || userResult.error;
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
      return json({ ok: true, source: "supabase-live", recoveredAt: "2026-08-26", inventory, purchases, usage: usageResult.data || [], receipts: receiptResult.data || [], users: (userResult.data || []).map((user) => ({ ...user, must_change_password: false })), currentUser: { id: actor.id, name: actor.name, email: actor.email, department: actor.department, role: actor.role, mustChangePassword: actor.must_change_password }, names: ALL_STAFF, locs: ["Outlet", "Soho"], reasons: ["Used", "Processed", "Reallocated", "Expired", "Spoiled", "Spilled", "Damaged", "Other"] });
    }

    if (action === "purchaseRequest") {
      const requester = isOwner ? clean(body.requestedBy || body.name) : clean(actor.name);
      const department = isOwner ? departmentFor(requester) : clean(actor.department);
      if (!requester || !reviewerFor(department)) return json({ ok: false, error: "Choose an authorized Floor, Kitchen, or Utilities requester." }, 400);
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
        if (!isOwner) return json({ ok: false, error: "Only the Owner can delete purchase requests." }, 403);
        const { error } = await supabase.from("sf_purchase_requests").delete().eq("id", requestId);
        if (error) throw error;
        await supabase.from("sf_audit_log").insert({ actor: clean(body.actor) || "Owner", action: "delete", entity_type: "purchase_request", entity_id: requestId, details: { prId: current.pr_id } });
        return json({ ok: true, message: `Purchase request ${current.pr_id} deleted.` });
      }
      if (action === "reviewPurchase") {
        const reviewer = isOwner ? clean(body.reviewer) : clean(actor.name);
        if (!isOwner && actor.role !== "reviewer") return json({ ok: false, error: "This account is not assigned as a reviewer." }, 403);
        if (reviewer !== current.designated_reviewer) return json({ ok: false, error: `This request must be reviewed by ${current.designated_reviewer}.` }, 403);
        if (current.status !== "Submitted") return json({ ok: false, error: "Only submitted requests can be reviewed." }, 400);
        const { error } = await supabase.from("sf_purchase_requests").update({ status: "Reviewed", reviewed_by: reviewer, reviewed_at: new Date().toISOString(), review_note: clean(body.note), updated_at: new Date().toISOString() }).eq("id", requestId);
        if (error) throw error;
        return json({ ok: true, message: `${current.pr_id} reviewed and sent to the owner for approval.` });
      }
      if (action === "approvePurchase") {
        if (!isOwner) return json({ ok: false, error: "Only the Owner can approve or reject requests." }, 403);
        if (current.status !== "Reviewed") return json({ ok: false, error: "The reviewer must complete review first." }, 400);
        const decision = clean(body.decision) === "Rejected" ? "Rejected" : "Approved";
        const items = Array.isArray(body.items) && body.items.length ? body.items : current.items;
        const { error } = await supabase.from("sf_purchase_requests").update({ status: decision, approved_by: clean(body.actor) || "Owner", approved_at: new Date().toISOString(), approval_note: clean(body.note), items, updated_at: new Date().toISOString() }).eq("id", requestId);
        if (error) throw error;
        return json({ ok: true, message: `${current.pr_id} ${decision.toLowerCase()}.` });
      }
      if (!isOwner) return json({ ok: false, error: "Only the Owner can mark requests as ordered." }, 403);
      if (!["Approved", "Ordered"].includes(current.status)) return json({ ok: false, error: "Only approved requests can be marked ordered." }, 400);
      const { error } = await supabase.from("sf_purchase_requests").update({ status: "Ordered", updated_at: new Date().toISOString() }).eq("id", requestId);
      if (error) throw error;
      return json({ ok: true, message: `${current.pr_id} marked as ordered.` });
    }

    if (action === "receivePurchase") {
      const requestId = clean(body.requestId);
      const itemKey = clean(body.itemKey);
      const receiver = isOwner ? clean(body.receiver) : clean(actor.name);
      if (!receiver) return json({ ok: false, error: "Choose a valid staff member." }, 400);
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
      const employee = isOwner ? clean(body.name || body.employee) : clean(actor.name);
      const department = isOwner ? clean(body.department) || departmentFor(employee) : clean(actor.department);
      if (!employee) return json({ ok: false, error: "Employee identity is required." }, 400);
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
      const employee = isOwner ? clean(body.name) : clean(actor.name);
      if (!employee) return json({ ok: false, error: "Employee identity is required." }, 400);
      const { error } = await supabase.from("sf_daily_operations").insert({ employee, department: isOwner ? clean(body.department) : clean(actor.department), location: clean(body.location), shift: clean(body.shift), checks: Array.isArray(body.checks) ? body.checks : [], issues: clean(body.issues || body.remarks) });
      if (error) throw error;
      return json({ ok: true, message: "Shift checklist saved." });
    }

    return json({ ok: false, error: "Unsupported action." }, 400);
  } catch (error) {
    console.error(error);
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected server error." }, 500);
  }
});
