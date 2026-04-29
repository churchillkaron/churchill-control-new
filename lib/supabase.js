import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ✅ FRONTEND CLIENT (used by POS, pages, etc.)
export const supabase = createClient(url, anon);

// ✅ SERVER CLIENT (used by API routes)
export function getSupabase() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing Supabase env");
  }

  return createClient(url, serviceKey);
}