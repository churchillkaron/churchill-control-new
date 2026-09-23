import { supabaseAdmin } from "./admin.js";

/**
 * AVANTIQO SERVICE SUPABASE LAYER
 * Build-safe: callers may construct this at module scope without forcing the
 * runtime-only service-role secret to exist during Next.js page collection.
 */
export function getServiceSupabase() {
  return supabaseAdmin;
}
