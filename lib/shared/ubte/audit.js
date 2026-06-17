import { createServerSupabase } from "@/lib/shared/supabase/server";

/**
 * UBTE AUDIT PERSISTENCE LAYER
 * Writes execution logs into database
 */

export async function writeAuditLog(entry) {
  try {
    const supabase = createServerSupabase();

    await supabase.from("ubte_audit_logs").insert({
      tenant_id: entry.tenant_id || null,
      action: entry.action,
      stage: entry.stage,
      order_id: entry.order_id || null,
      status: entry.status || "ok",
      duration: entry.duration || 0,
      error: entry.error || null,
      payload: entry.payload || {},
      created_at: new Date().toISOString()
    });

  } catch (err) {
    // never break system flow because of logging failure
    console.error("UBTE AUDIT FAILED:", err.message);
  }
}
