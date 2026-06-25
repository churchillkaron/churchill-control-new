import { supabaseAdmin } from "@/lib/shared/supabase/admin";

export async function writeAudit({
  organizationId,
  actor = null,
  result = null,
}) {
  await supabaseAdmin
    .from("audit_logs")
    .insert({
      organization_id: organizationId,
      module: "restaurant",
      action: "OPEN_SESSION",
      reference_id: result?.id || null,
      metadata: {
        actor,
        table_id: result?.table_id || null,
        table_number: result?.table_number || null,
        customer_id: result?.customer_id || null,
        guest_count:
          result?.guest_count ||
          result?.guests ||
          0,
      },
      created_at: new Date().toISOString(),
    });

  return true;
}
