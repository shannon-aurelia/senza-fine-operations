import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://mvfecvoozjwhmppqgued.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_wUwpnh2DxSqdtI6o0JI7sw_n_7ZVgUM";
let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured() {
  return Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);
}

export function getSupabaseBrowserClient() {
  if (!browserClient) {
    browserClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  }
  return browserClient;
}

export function getSupabaseServerClient() {
  return createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
