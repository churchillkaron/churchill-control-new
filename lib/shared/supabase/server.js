import { supabaseAdmin } from "./admin.js";

/**
 * AVANTIQO SERVER SUPABASE LAYER
 * Build-safe: returns the shared lazy admin proxy. Runtime access remains
 * fail-closed when SUPABASE_SERVICE_ROLE_KEY is unavailable.
 */
export function createServerSupabase() {
  return supabaseAdmin;
}
