import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function repository({ context, payload }) {
  return supabaseAdmin
    .from("table_sessions")
    .update({
      customer_id: payload.customerId,
      updated_at: new Date().toISOString(),
    })
    .eq("organization_id", context.organization_id)
    .eq("id", payload.sessionId);
}
