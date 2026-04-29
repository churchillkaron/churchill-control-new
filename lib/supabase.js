import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// 🔴 HARD FAIL if missing
if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase env variables");
}

export const supabase = createClient(
  supabaseUrl || "",
  supabaseAnonKey || ""
);

export function getSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error("Missing Supabase server env");
  }

  return createClient(supabaseUrl, serviceKey);
}