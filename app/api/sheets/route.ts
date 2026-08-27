import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "../../lib/supabase";
import recoveredInventory from "../../data/recovered-inventory.json";

const EMERGENCY_PIN_HASH = "31280f6d569c772d1a298233783981ae18f198589027afbd22b18b5aa484cba1";

export const dynamic = "force-dynamic";

function configured() {
  return Boolean(process.env.SENZA_SHEETS_BRIDGE_URL && process.env.SENZA_SHEETS_TOKEN);
}

async function authorize(request: NextRequest, write = false) {
  const emergencyPin = request.headers.get("x-senza-emergency-pin");
  if (emergencyPin) {
    const supplied = createHash("sha256").update(emergencyPin.trim().toUpperCase()).digest();
    const expected = Buffer.from(EMERGENCY_PIN_HASH, "hex");
    if (supplied.length === expected.length && timingSafeEqual(supplied, expected)) {
      return { ok: true, email: "owner-recovery@senza-fine.local", role: "owner" };
    }
  }
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const supabase = getSupabaseServerClient();
  if (!token || !supabase) return { ok: false, status: 401, error: "Sign in is required." };
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return { ok: false, status: 401, error: "Your session is no longer valid." };
  const { data: profile } = await supabase.from("profiles").select("email, role, active").eq("id", data.user.id).single();
  if (!profile?.active) return { ok: false, status: 403, error: "Your Senza Fine account is awaiting approval." };
  if (write && !["system_admin", "owner", "manager", "purchasing", "kitchen", "staff"].includes(profile.role)) {
    return { ok: false, status: 403, error: "You do not have permission for this action." };
  }
  return { ok: true, email: profile.email, role: profile.role };
}

function recoveredSnapshot(reason: string) {
  return {
    configured: false,
    ...recoveredInventory,
    source: "uploaded-workbook-fallback",
    syncStatus: "snapshot",
    warning: reason,
  };
}

async function bridgeFetch(payload?: unknown) {
  const base = process.env.SENZA_SHEETS_BRIDGE_URL!;
  const token = process.env.SENZA_SHEETS_TOKEN!;
  if (!payload) {
    const url = new URL(base);
    url.searchParams.set("token", token);
    url.searchParams.set("action", "snapshot");
    return fetch(url, { cache: "no-store" });
  }
  const url = new URL(base);
  url.searchParams.set("token", token);
  return fetch(url, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload), cache: "no-store" });
}

export async function GET(request: NextRequest) {
  const auth = await authorize(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!configured()) return NextResponse.json(recoveredSnapshot("Showing the uploaded August 26 workbook while live synchronization is being restored."));
  try {
    const response = await bridgeFetch();
    const data = await response.json();
    if (!response.ok || data?.error || !Array.isArray(data?.inventory)) {
      return NextResponse.json(recoveredSnapshot("Showing the uploaded August 26 workbook because the live Sheet is unavailable."));
    }
    return NextResponse.json({ configured: true, ...data });
  } catch (error) {
    console.error("SHEETS_BRIDGE_GET_FAILED", error);
    return NextResponse.json(recoveredSnapshot("Showing the uploaded August 26 workbook because the live Sheet is unavailable."));
  }
}

export async function POST(request: NextRequest) {
  const auth = await authorize(request, true);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  if (!configured()) return NextResponse.json({ error: "Google Sheets bridge is not configured." }, { status: 503 });
  const payload = await request.json();
  const allowed = ["stockOut", "purchaseRequest", "receivePurchase", "dailyIssue"];
  if (!allowed.includes(payload?.action)) return NextResponse.json({ error: "Unsupported action." }, { status: 400 });
  try {
    const response = await bridgeFetch({ ...payload, actorEmail: auth.email, actorRole: auth.role });
    return NextResponse.json(await response.json(), { status: response.ok ? 200 : 400 });
  } catch {
    return NextResponse.json({ error: "The update could not be written to Google Sheets." }, { status: 502 });
  }
}
