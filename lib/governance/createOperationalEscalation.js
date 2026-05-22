import { supabaseAdmin }
from "@/lib/shared/supabase/admin";

export default async function createOperationalEscalation({

  tenantId,

  category,

  reason,

  severity = "warning",

  referenceId = null,

  amount = 0,

}) {

  const {
    data,
    error,
  } = await supabaseAdmin
    .from("approval_logs")
    .insert({
      tenant_id:
        tenantId,

      category,

      status:
        "pending",

      requested_by:
        "SYSTEM",

      amount,

      metadata: {
        reason,
        severity,
        referenceId,
      },

      created_at:
        new Date().toISOString(),
    })
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}
