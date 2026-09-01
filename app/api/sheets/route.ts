import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase";
import recoveredInventory from "../../data/recovered-inventory.json";

const EMERGENCY_PIN_HASH = "31280f6d569c772d1a298233783981ae18f198589027afbd22b18b5aa484cba1";
const OPERATIONS_STORE_URL = "https://mvfecvoozjwhmppqgued.supabase.co/functions/v1/senza-fine-ops";

export const dynamic = "force-dynamic";

async function authorize(request: NextRequest, write = false) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = getSupabaseServerClient();
  if (token && supabase) {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) return { ok: false, status: 401, error: "Your session is no longer valid." };
    const { data: profile } = await supabase.from("sf_auth_profiles").select("email, name, department, role, active").eq("id", data.user.id).single();
    if (!profile?.active) return { ok: false, status: 403, error: "Your Senza Fine account is waiting for Owner approval." };
    if (write && !["owner", "reviewer", "staff"].includes(profile.role)) {
      return { ok: false, status: 403, error: "You do not have permission for this action." };
    }
    return { ok: true, email: profile.email, role: profile.role, profile, token };
  }

  if (request.headers.get("x-senza-session")) return { ok: true, email: "", role: "session" };
  const emergencyPin = request.headers.get("x-senza-emergency-pin");
  if (emergencyPin) {
    const supplied = createHash("sha256").update(emergencyPin.trim().toUpperCase()).digest();
    const expected = Buffer.from(EMERGENCY_PIN_HASH, "hex");
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      return { ok: true, email: "owner-recovery@senza-fine.local", role: "owner" };
    }
  }
  return { ok: false, status: 401, error: "Sign in is required." };
}

function recoveredSnapshot(reason: string) {
  return { configured: false, ...recoveredInventory, source: "uploaded-workbook-fallback", syncStatus: "snapshot", warning: reason };
}

async function operationsFetch(request: NextRequest, payload?: unknown) {
  const authorization = request.headers.get("authorization") || "";
  return fetch(OPERATIONS_STORE_URL, {
    method: payload ? "POST" : "GET",
    headers: {
      ...(authorization ? { authorization } : {}),
      "x-senza-emergency-pin": request.headers.get("x-senza-emergency-pin") || "",
      "x-senza-session": request.headers.get("x-senza-session") || "",
      ...(payload ? { "content-type": "application/json" } : {}),
    },
    body: payload ? JSON.stringify(payload) : undefined,
    cache: "no-store",
  });
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  try {
    const response = await operationsFetch(request);
    const data = await response.json();
    if (response.status === 401 || response.status === 403) return NextResponse.json(data, { status: response.status });
    if (!response.ok || data?.error || !Array.isArray(data?.inventory)) {
      return NextResponse.json(recoveredSnapshot("Showing the August 26 recovery snapshot because the operations database is temporarily unavailable."));
    }
    return NextResponse.json({ configured: true, syncStatus: "live", ...data });
  } catch (error) {
    console.error("OPERATIONS_STORE_GET_FAILED", error);
    return NextResponse.json(recoveredSnapshot("Showing the August 26 recovery snapshot because the operations database is temporarily unavailable."));
  }
}

export async function POST(request: NextRequest) {
  const payload = await request.json();
  if (payload?.action === "login") {
    const response = await operationsFetch(request, payload);
    return NextResponse.json(await response.json(), { status: response.status });
  }
  const auth = await authorize(request, true);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const allowed = ["stockOut", "purchaseRequest", "reviewPurchase", "approvePurchase", "markOrdered", "deletePurchase", "receivePurchase", "dailyIssue", "saveUser", "changePassword", "logout"];
  if (!allowed.includes(payload?.action)) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  try {
    const response = await operationsFetch(request, { ...payload, actorEmail: auth.email, actorRole: auth.role });
    return NextResponse.json(await response.json(), { status: response.status });
  } catch (error) {
    console.error("OPERATIONS_STORE_POST_FAILED", error);
    return NextResponse.json({ error: "The update could not be saved to the operations database." }, { status: 502 });
  }
}
